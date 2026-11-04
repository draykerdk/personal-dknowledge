/**
 * A gravação do cabeçalho fractal e dos nós que faltam: releitura, guarda,
 * idempotência, substituição por span e fidelidade byte a byte.
 *
 * O que este teste fixa, e por quê:
 *
 * 1. **o cabeçalho entra** — grupo + título + ligações, com o marcador em cada
 *    nó, e a primeira execução é assertada por três fatos independentes
 *    (`outcome`, `escritas.length`, `texto !== CANVAS`) porque um teste que só
 *    compara o arquivo consigo mesmo passa com a feature desligada (achado da
 *    revisão de 15/09);
 * 2. **rodar de novo não escreve** — o cabeçalho encontrado é byte a byte o que
 *    seria gravado: `nothing`, zero escritas novas, arquivo idêntico;
 * 3. **mudar o estado substitui, não duplica** — um irmão novo entra no mesmo
 *    grupo (mesmo `headerId`), sem um segundo cabeçalho;
 * 4. **o resto do arquivo volta byte a byte** — `edges`, grupo e texto do
 *    operador sobrevivem à substituição, e a indentação do bloco é uniforme;
 * 5. **o guarda de releitura** — conteúdo mudado entre a leitura e a gravação:
 *    aborta, não grava, e a mensagem nomeia a causa medida;
 * 6. **escala que não escreve não escreve nada** — `indefinida` e `sistema`
 *    inclusive, com o motivo em palavras na mensagem.
 *
 * O harness é uma vault em memória: `read`/`write` sobre uma string. É o mesmo
 * desenho do `CanvasSavePorts` da paleta, e é onde as duas leituras acontecem.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('obsidian', () => {
    const dual = function () { return {} as any; };
    const known: Record<string, unknown> = {
        ItemView: class { constructor(public leaf?: any) {} registerEvent() { /* no-op */ } },
        Notice: class { constructor(public message?: string) {} },
        TFile: class {},
        TFolder: class {},
        Platform: { isMobile: false, isDesktopApp: true },
        setIcon: () => undefined,
        MarkdownRenderer: { render: async () => undefined },
        moment: () => ({ format: () => '', subtract: () => ({ format: () => '' }) }),
        debounce: (fn: any) => fn,
        Menu: class {},
        Modal: class {},
        WorkspaceLeaf: class {},
    };
    // `then` NUNCA pode devolver função: um mock "thenable" faz o `await` do
    // vitest resolver o módulo para `{}`, e aí TODO export some — `new Notice(...)`
    // estoura como "No \"Notice\" export is defined on the \"obsidian\" mock",
    // mascarando o erro original (medido em 15/09 por sonda).
    return new Proxy(known, {
        get: (target, key: string) => (key === 'then' ? undefined : (key in target ? target[key] : dual)),
    });
});

import {
    findFractalHeaderSpan,
    planFractalContextForFrame,
    runFractalContextForActiveCanvas,
    runFractalContextForFrame,
} from '../../src/engine/canvasengine/canvasFractal';
import type { CanvasFractalPorts } from '../../src/engine/canvasengine/canvasFractal';
import { findCanvasArraySpan } from '../../src/engine/canvasengine/canvasSplice';
import { canvasIndexOf } from '../../src/engine/missionCanvasIndex';
import { COCKPIT_PATH } from '../../src/engine/canvasTree';
import {
    FRACTAL_HEADER_LABEL,
    FRACTAL_HEADER_MARKER,
    fractalHeaderIdFor,
    fractalHeaderNodeIds,
} from '../../src/engine/canvasFractalContext';
import { CANVAS_MENU_MARKER } from '../../src/engine/canvasMenuCanvas';
import { findCanvasMenuSpan, runCanvasMenuForFrame } from '../../src/engine/canvasengine/canvasMenuWriter';

/* ==========================================================================
   O quadro: uma área, um projeto e um desenho com grupo, nó de texto e aresta
   ========================================================================== */

const AREA_PATH = '100 - AREAS/110 - Funções';
const COCKPIT_AREA = `${AREA_PATH}/Funções.canvas`;
const PROJ_A = `${AREA_PATH}/Proj A/Proj A.canvas`;
const PROJ_B = `${AREA_PATH}/Proj B/Proj B.canvas`;
const PROJ_C = `${AREA_PATH}/Proj C/Proj C.canvas`;
const TAREFA = 'TaskNotes/Tarefas/Peça H.md';

const CANVAS = [
    '{',
    '\t"nodes":[',
    '\t\t{"id":"g1","type":"group","label":"Painel do projeto","x":-700,"y":-500,"width":1600,"height":1000},',
    '\t\t{"id":"n1","type":"text","text":"Proj A — desenho do operador","x":0,"y":0,"width":400,"height":200},',
    '\t\t{"id":"n2","type":"file","file":"TaskNotes/Tarefas/Peça H.md","x":600,"y":0,"width":400,"height":150}',
    '\t],',
    '\t"edges":[',
    '\t\t{"id":"e1","fromNode":"n1","fromSide":"right","toNode":"n2","toSide":"left"}',
    '\t]',
    '}',
    '',
].join('\n');

const CAMINHOS_PADRAO = [COCKPIT_PATH, COCKPIT_AREA, PROJ_A, PROJ_B, TAREFA];

function snapshot(extras: string[] = []) {
    const projetos = [
        { name: 'Proj A', path: `${AREA_PATH}/Proj A` },
        { name: 'Proj B', path: `${AREA_PATH}/Proj B` },
        ...extras.map(nome => ({ name: nome, path: `${AREA_PATH}/${nome}` })),
    ];
    return {
        areas: [{
            id: 'area-funcoes', name: 'Funções', path: AREA_PATH,
            initiatives: 0, departments: 0, staged: [], canvas: COCKPIT_AREA,
        }],
        portfolio: { columns: [{ projects: projetos }] },
        canvases: [
            { path: COCKPIT_PATH, name: 'Dk-Fleet-Commander', folder: '300 - RUNTIME/000 - COCKPIT', nodes: 9, edges: 4, mtime: 10, system: true },
            { path: COCKPIT_AREA, name: 'Funções', folder: AREA_PATH, nodes: 3, edges: 1, mtime: 20, system: false },
            ...projetos.map((p, index) => ({
                path: `${p.path}/${p.name}.canvas`, name: p.name, folder: p.path,
                nodes: 3, edges: 1, mtime: 100 + index, system: false,
            })),
        ],
        board: { buckets: [] as Array<{ id: string; label: string; tasks: any[] }> },
    };
}

/** O quadro com tarefas abertas — o mesmo formato que o snapshot do motor usa. */
function snapshotComTarefas(tarefas: Array<{ path: string; projects: string[]; due?: string }>) {
    const base = snapshot();
    base.board.buckets = [{ id: 'next', label: 'Próximas', tasks: tarefas }];
    return base;
}

/** A vault em memória: `read`/`write` sobre uma string, com o diário das escritas. */
function vaultDeTexto(inicial: string, existentes: ReadonlySet<string> = new Set(CAMINHOS_PADRAO)) {
    const estado = {
        texto: inicial,
        escritas: [] as string[],
        mensagens: [] as string[],
        falhas: [] as string[],
    };
    const ports: CanvasFractalPorts = {
        read: () => Promise.resolve(estado.texto),
        write: next => { estado.escritas.push(next); estado.texto = next; return Promise.resolve(); },
        notice: message => { estado.mensagens.push(message); },
        fail: message => { estado.falhas.push(message); },
        exists: path => existentes.has(path),
    };
    return { estado, ports };
}

const quadro = (raw: string) => ({ canvasPath: PROJ_A, raw, preferred: { x: 0, y: 0 } });

/** Os nós do cabeçalho, na ordem em que estão no arquivo. */
const nosDoCabecalho = (texto: string) =>
    (JSON.parse(texto).nodes as any[]).filter(node => node?.mode === FRACTAL_HEADER_MARKER);

/** Os nós do menu do acervo, na ordem em que estão no arquivo. */
const nosDoMenu = (texto: string) =>
    (JSON.parse(texto).nodes as any[]).filter(node => node?.mode === CANVAS_MENU_MARKER);

/* ==========================================================================
   A primeira execução: o cabeçalho entra
   ========================================================================== */

describe('gerar o contexto fractal do canvas ativo', () => {
    it('grava o cabeçalho no formato do canvas do Obsidian', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);

        // Sem estas três linhas o teste passava com a FEATURE DESLIGADA: sem
        // escrita, as comparações abaixo comparavam o arquivo consigo mesmo
        // (achado da revisão independente, 2026-09-15).
        expect(relatorio.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);

        expect(relatorio.updated).toBe(false);
        expect(relatorio.headerId).toBe(fractalHeaderIdFor(PROJ_A));

        const bloco = planFractalContextForFrame(quadro(CANVAS), snapshot(), path => CAMINHOS_PADRAO.includes(path)).header;
        expect(bloco).not.toBeNull();

        const cabecalho = nosDoCabecalho(estado.texto);
        // Grupo + título + 2 de subir (área, sistema) + 1 de descer (Proj B).
        expect(cabecalho).toHaveLength(5);
        expect(cabecalho.filter(node => node.type === 'group')).toHaveLength(1);
        expect(cabecalho.map(node => node.type)).toEqual(['group', 'text', 'file', 'file', 'file']);
        expect(cabecalho[0].label).toBe(FRACTAL_HEADER_LABEL);
        expect(cabecalho[0].color).toBe('6');
        expect(cabecalho[1].text).toBe(bloco!.title);
        expect(cabecalho.slice(2).map(node => node.file)).toEqual([
            COCKPIT_AREA, COCKPIT_PATH, PROJ_B,
        ]);

        // O id prometido pelo plano é o id que foi para o arquivo — uma fonte só.
        expect(cabecalho.map(node => node.id)).toEqual(fractalHeaderNodeIds(bloco!));

        // A ligação do cabeçalho É a conexão: o alvo não vira um segundo nó solto.
        const arquivo = JSON.parse(estado.texto).nodes as any[];
        for (const caminho of [COCKPIT_PATH, COCKPIT_AREA, PROJ_B]) {
            expect(arquivo.filter(node => node.type === 'file' && node.file === caminho), caminho).toHaveLength(1);
        }
        expect(arquivo.filter(node => node.type === 'file')).toHaveLength(4);

        expect(relatorio.message).toContain('cabeçalho gravado');
        expect(relatorio.message).toContain('trilha sistema → Área → Projeto');
        expect(relatorio.message).toContain('2 ligação(ões) de subir, 1 de descer');
        // O que ficou de fora é declarado, com o motivo em palavras.
        expect(relatorio.message).toContain('Nenhuma tarefa aberta do projeto "Proj A" existe no vault');
    });

    it('a coluna do cabeçalho tem indentação uniforme, a mesma dos nós do arquivo', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);

        const linhas = estado.texto.split('\n').filter(linha => linha.includes(`"mode":"${FRACTAL_HEADER_MARKER}"`));
        expect(linhas).toHaveLength(5);

        const recuos = new Set(linhas.map(linha => (linha.match(/^[ \t]*/) ?? [''])[0]));
        expect(recuos.size).toBe(1);

        const linhaDoOperador = estado.texto.split('\n').find(linha => linha.includes('"id":"n1"'))!;
        expect([...recuos][0]).toBe((linhaDoOperador.match(/^[ \t]*/) ?? [''])[0]);
        expect([...recuos][0]).toBe('\t\t');
    });

    it('a tarefa aberta do projeto vira ligação do cabeçalho, com o prazo mais próximo primeiro', async () => {
        const existentes = new Set([...CAMINHOS_PADRAO, 'TaskNotes/Tarefas/Depois.md']);
        const { estado, ports } = vaultDeTexto(CANVAS, existentes);
        const relatorio = await runFractalContextForFrame(
            quadro(CANVAS),
            snapshotComTarefas([
                { path: TAREFA, projects: ['Proj A'], due: '2026-09-30' },
                { path: 'TaskNotes/Tarefas/Depois.md', projects: ['Proj A'], due: '2026-10-05' },
            ]),
            ports,
        );

        expect(relatorio.outcome).toBe('written');
        const cabecalho = nosDoCabecalho(estado.texto);
        expect(cabecalho).toHaveLength(6);
        expect(cabecalho.slice(2).map(node => node.file)).toEqual([COCKPIT_AREA, COCKPIT_PATH, PROJ_B, TAREFA]);
        // A que não entrou é contada e declarada — nunca ligada em silêncio.
        expect(relatorio.message).toContain('1 tarefa(s) aberta(s) do projeto não foram ligadas');
    });

    it('a escala lida é a que o índice declara, não a que o desenho sugere', () => {
        const lido = planFractalContextForFrame(quadro(CANVAS), snapshot(), path => CAMINHOS_PADRAO.includes(path));
        expect(lido.reading.scale).toBe('projeto');
        expect(lido.reading.trail).toEqual(['Área', 'Projeto']);
        expect(lido.index.entries.length).toBe(4);
        expect(lido.drawing.files).toEqual([TAREFA]);
        expect(lido.header).not.toBeNull();
    });

    it('o comando escreve no canvas ativo — com o snapshot AGUARDADO, não como Promise', async () => {
        const { estado } = vaultDeTexto(CANVAS);
        const engine = {
            plugin: {
                app: {
                    vault: {
                        read: () => Promise.resolve(estado.texto),
                        modify: (_file: any, next: string) => { estado.escritas.push(next); estado.texto = next; },
                        getAbstractFileByPath: (path: string) => (path === PROJ_A || CAMINHOS_PADRAO.includes(path) ? { path } : null),
                    },
                },
                // `MissionControl.build` é `async` (missionControl.ts:1723). Sem o
                // `await` no comando, o quadro entrava como Promise e o índice saía
                // vazio — defeito preexistente, medido em 15/09 por sonda.
                getMissionControl: () => ({ build: () => Promise.resolve(snapshot()) }),
            },
            getCenterCoordinates: () => ({ x: 0, y: 0 }),
        };
        const view = { getViewType: () => 'canvas', file: { path: PROJ_A } };

        const relatorio = await runFractalContextForActiveCanvas(engine, view, {
            exists: path => CAMINHOS_PADRAO.includes(path),
        });

        expect(relatorio).not.toBeNull();
        expect(relatorio!.scale).toBe('projeto');
        expect(relatorio!.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);
        expect(nosDoCabecalho(estado.texto)).toHaveLength(5);
    });

    it('um snapshot não aguardado lê como indefinida — a consequência que o `await` do comando evita', () => {
        // O comando fazia `snapshot = control.build(false)` sem `await`: o quadro
        // entrava como Promise, `canvasIndexOf` devolvia índice vazio e TODO canvas
        // lia `indefinida` — o comando nunca escrevia nada no vault real.
        const plano = planFractalContextForFrame(
            quadro(CANVAS),
            Promise.resolve(snapshot()) as any,
            path => CAMINHOS_PADRAO.includes(path),
        );

        expect(plano.reading.scale).toBe('indefinida');
        expect(plano.header).toBeNull();
        expect(plano.plan.kind).toBe('skip');
    });
});

/* ==========================================================================
   Idempotência, substituição e fidelidade
   ========================================================================== */

describe('atualizar, nunca duplicar', () => {
    it('rodar duas vezes não escreve nada na segunda — idempotência', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);

        const primeira = await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);
        expect(primeira.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);
        const escritasDaPrimeira = estado.escritas.length;
        const depoisDaPrimeira = estado.texto;

        // A segunda geração lê o arquivo de agora — como o comando faz.
        const segunda = await runFractalContextForFrame(quadro(estado.texto), snapshot(), ports);

        expect(segunda.outcome).toBe('nothing');
        expect(segunda.updated).toBe(false);
        expect(segunda.updatedNodeIds).toEqual([]);
        expect(segunda.added).toEqual([]);
        expect(estado.escritas.length).toBe(escritasDaPrimeira);
        expect(estado.texto).toBe(depoisDaPrimeira);
        expect(segunda.message).toContain('cabeçalho inalterado');
        expect(segunda.message).toContain('nada a escrever');
    });

    it('um irmão novo substitui o cabeçalho no mesmo grupo — sem segundo cabeçalho, sem mexer no resto', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);

        const primeira = await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);
        expect(primeira.outcome).toBe('written');
        expect(estado.texto).not.toBe(CANVAS);
        const antes = estado.texto;
        const spanAntes = findFractalHeaderSpan(antes);
        expect(spanAntes).not.toBeNull();
        expect(nosDoCabecalho(antes)).toHaveLength(5);

        // O operador cria um projeto irmão: o quadro muda, o canvas não.
        const existentes = new Set([...CAMINHOS_PADRAO, PROJ_C]);
        const comIrmao = vaultDeTexto(antes, existentes);
        const segunda = await runFractalContextForFrame(quadro(antes), snapshot(['Proj C']), comIrmao.ports);

        expect(segunda.outcome).toBe('written');
        expect(segunda.updated).toBe(true);
        expect(segunda.headerId).toBe(primeira.headerId);
        expect(segunda.updatedNodeIds).toEqual(fractalHeaderNodeIds(
            planFractalContextForFrame(quadro(antes), snapshot(['Proj C']), path => existentes.has(path)).header!,
        ));

        const depois = comIrmao.estado.texto;
        expect(depois).not.toBe(antes);
        const cabecalho = nosDoCabecalho(depois);
        expect(cabecalho).toHaveLength(6);
        expect(cabecalho.filter(node => node.type === 'group')).toHaveLength(1);
        expect(cabecalho[0].id).toBe(primeira.headerId);
        expect(cabecalho.slice(2).map(node => node.file)).toEqual([COCKPIT_AREA, COCKPIT_PATH, PROJ_C, PROJ_B]);

        // Tudo FORA do bloco do cabeçalho volta byte a byte: arestas, grupo do
        // operador, texto dele e a formatação do arquivo.
        const spanDepois = findFractalHeaderSpan(depois)!;
        expect(depois.slice(0, spanDepois.start)).toBe(antes.slice(0, spanAntes!.start));
        expect(depois.slice(spanDepois.end)).toBe(antes.slice(spanAntes!.end));
        expect(depois).toContain('"text":"Proj A — desenho do operador"');
        expect(depois).toContain('"label":"Painel do projeto"');
        expect(depois).toContain('\t"edges":[');
        expect(depois).toContain('\t\t{"id":"e1","fromNode":"n1","fromSide":"right","toNode":"n2","toSide":"left"}');
        expect(segunda.message).toContain('cabeçalho atualizado');
        expect(segunda.message).toContain('2 ligação(ões) de subir, 2 de descer');
    });

    it('atualizar com um nó depois do bloco: só o span muda, e a vírgula do bloco é reposta', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);

        // O operador põe um nó DEPOIS do cabeçalho: é o caso em que o span engole a
        // vírgula que separa o bloco do resto.
        const antes = estado.texto.replace(
            '\n\t],\n\t"edges":[',
            ',\n\t\t{"id":"n3","type":"text","text":"depois","x":900,"y":0,"width":400,"height":150}\n\t],\n\t"edges":[',
        );
        expect(antes).not.toBe(estado.texto);
        expect(() => JSON.parse(antes)).not.toThrow();
        const spanAntes = findFractalHeaderSpan(antes)!;
        expect(antes[spanAntes.end - 1]).toBe(',');

        const existentes = new Set([...CAMINHOS_PADRAO, PROJ_C]);
        const comIrmao = vaultDeTexto(antes, existentes);
        const relatorio = await runFractalContextForFrame(quadro(antes), snapshot(['Proj C']), comIrmao.ports);

        expect(relatorio.outcome).toBe('written');
        expect(relatorio.updated).toBe(true);
        const depois = comIrmao.estado.texto;
        const spanDepois = findFractalHeaderSpan(depois)!;

        expect(depois.slice(0, spanDepois.start)).toBe(antes.slice(0, spanAntes.start));
        expect(depois.slice(spanDepois.end)).toBe(antes.slice(spanAntes.end));
        expect(depois[spanDepois.end - 1]).toBe(',');
        expect(() => JSON.parse(depois)).not.toThrow();
        const nos = JSON.parse(depois).nodes as any[];
        expect(nos).toHaveLength(10);
        expect(nos.filter(node => node?.mode === FRACTAL_HEADER_MARKER)).toHaveLength(6);
        expect(nos.some(node => node.id === 'n3')).toBe(true);
    });

    it('o bloco é localizado pelo marcador, com a vírgula final no span', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);

        const span = findFractalHeaderSpan(estado.texto)!;
        expect(estado.texto.slice(span.start, span.start + 1)).toBe('{');
        // O cabeçalho é o último bloco do arquivo: não há vírgula depois dele.
        expect(estado.texto[span.end - 1]).toBe('}');
        expect(span.headerId).toBe(fractalHeaderIdFor(PROJ_A));
        expect(Number.isFinite(span.x)).toBe(true);
        expect(Number.isFinite(span.y)).toBe(true);
        expect(span.y).toBe(0);

        // Com um nó DEPOIS do bloco, a vírgula que o separa entra no span — e é ela
        // que a substituição repõe, para o resto do arquivo voltar byte a byte.
        const comVizinho = estado.texto.replace(
            '\n\t],\n\t"edges":[',
            ',\n\t\t{"id":"n3","type":"text","text":"depois","x":900,"y":0,"width":400,"height":150}\n\t],\n\t"edges":[',
        );
        expect(comVizinho).not.toBe(estado.texto);
        expect(() => JSON.parse(comVizinho)).not.toThrow();
        const spanVizinho = findFractalHeaderSpan(comVizinho);
        expect(spanVizinho).not.toBeNull();
        expect(comVizinho[spanVizinho!.end - 1]).toBe(',');
        expect(comVizinho.slice(spanVizinho!.end)).toContain('"id":"n3"');
        // ...e o span começa no `{` do grupo: nada antes dele é tocado.
        expect(comVizinho.slice(0, spanVizinho!.start)).toBe(estado.texto.slice(0, span.start));

        // Um arquivo com espaço antes da vírgula continua legível: o span não a
        // engole, e a substituição (sem vírgula) mantém o JSON válido.
        const comEspaco = estado.texto.replace(
            '\n\t],\n\t"edges":[',
            '\n\t,\n\t\t{"id":"n3","type":"text","text":"depois","x":900,"y":0,"width":400,"height":150}\n\t],\n\t"edges":[',
        );
        const spanEspaco = findFractalHeaderSpan(comEspaco);
        expect(spanEspaco).not.toBeNull();
        expect(comEspaco[spanEspaco!.end - 1]).toBe('}');
        expect(() => JSON.parse(comEspaco)).not.toThrow();
    });
});

/* ==========================================================================
   O guarda e as escalas que não escrevem
   ========================================================================== */

describe('o guarda de releitura', () => {
    it('conteúdo mudado entre a leitura e a gravação: aborta, não grava, e diz a causa', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        // Alguém editou o canvas depois que o comando leu o arquivo.
        const editado = CANVAS.replace('Proj A — desenho do operador', 'Proj A — editado por fora');
        const portsCorridos: CanvasFractalPorts = { ...ports, read: () => Promise.resolve(editado) };

        const relatorio = await runFractalContextForFrame(quadro(CANVAS), snapshot(), portsCorridos);

        expect(relatorio.outcome).toBe('aborted');
        expect(relatorio.added).toEqual([]);
        expect(relatorio.updated).toBe(false);
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(CANVAS);
        // A mensagem diz o que foi MEDIDO (o conteúdo mudou entre a leitura e a
        // gravação) e não atribui autoria: quem reescreveu pode ser o Obsidian
        // normalizando o arquivo depois do nosso `modify`.
        expect(relatorio.message).toContain('mudou entre a leitura e a gravação');
        expect(estado.falhas.join(' ')).toContain('escrita do cabeçalho abortada');
    });

    it('o id do cabeçalho já ocupado por outro nó: recusa medida, nada é gravado', async () => {
        const colisao = CANVAS.replace('"id":"n1"', `"id":"${fractalHeaderIdFor(PROJ_A)}"`);
        const { estado, ports } = vaultDeTexto(colisao);

        const relatorio = await runFractalContextForFrame(quadro(colisao), snapshot(), ports);

        expect(relatorio.outcome).toBe('refused');
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(colisao);
        expect(relatorio.message).toContain('já pertence a um nó deste canvas que não carrega o marcador');
    });

    it('nós marcados sem o grupo: recusa e a mensagem diz o que MEDIU, não uma causa inventada', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);
        const grupoId = fractalHeaderIdFor(PROJ_A);
        expect(estado.texto).toContain(`"id":"${grupoId}"`);

        // O operador apaga SÓ o grupo do cabeçalho e deixa os nós marcados.
        const semGrupo = estado.texto.split('\n').filter(linha => !linha.includes(`"id":"${grupoId}"`)).join('\n');
        expect(semGrupo).not.toBe(estado.texto);
        expect(semGrupo).not.toContain(`"id":"${grupoId}"`);
        expect(semGrupo).toContain(FRACTAL_HEADER_MARKER);
        expect(() => JSON.parse(semGrupo)).not.toThrow();

        const { estado: segundo, ports: portasSegundas } = vaultDeTexto(semGrupo);
        const relatorio = await runFractalContextForFrame(quadro(semGrupo), snapshot(), portasSegundas);

        // Sem grupo localizável, inserir de novo criaria o SEGUNDO cabeçalho.
        expect(relatorio.outcome).toBe('refused');
        expect(segundo.escritas).toHaveLength(0);
        expect(segundo.texto).toBe(semGrupo);

        // A mensagem declara o que foi MEDIDO: quantos nós carregam o marcador e
        // quais ids são. Antes ela dizia "o desenho já tem um cabeçalho (id X) que
        // o texto cru não deixa localizar" — X podia ser o título ou uma ligação, e
        // "não deixa localizar" nomeava causa que ninguém mediu (revisão de 15/09).
        const marcadosNoTexto = (semGrupo.match(new RegExp(`"mode":"${FRACTAL_HEADER_MARKER}"`, 'g')) ?? []).length;
        expect(marcadosNoTexto).toBeGreaterThan(0);
        expect(relatorio.message).toContain(`o desenho tem ${marcadosNoTexto} nó(s) com o marcador`);
        expect(relatorio.message).toContain('e nenhum grupo marcado');
        // "Quais ids são" também é medição, e não pode ser decorativa: a lista
        // inteira dos ids marcados tem de estar na mensagem (achado da revisão
        // independente: sem esta asserção, tirar `(${lista})` da mensagem deixava
        // a suíte verde — a metade "quais ids" não era defendida).
        const idsMarcados = (JSON.parse(semGrupo).nodes as any[])
            .filter(node => node?.mode === FRACTAL_HEADER_MARKER)
            .map(node => String(node.id));
        expect(idsMarcados).toHaveLength(marcadosNoTexto);
        for (const id of idsMarcados) {
            expect(relatorio.message).toContain(`"${id}"`);
        }
        // A causa inventada saiu da mensagem.
        expect(relatorio.message).not.toContain('não deixa localizar');
        expect(estado.falhas.concat(segundo.falhas).join(' ')).toContain('nenhum grupo marcado');
    });
});

describe('escalas que não escrevem', () => {
    it('indefinida não inventa contexto: nada é gravado e o motivo é dito em palavras', async () => {
        const solto = '{\n\t"nodes":[\n\t\t{"id":"n1","type":"text","text":"canvas avulso","x":0,"y":0,"width":400,"height":200}\n\t],\n\t"edges":[]\n}\n';
        const { estado, ports } = vaultDeTexto(solto);

        const relatorio = await runFractalContextForFrame(
            { canvasPath: 'TaskNotes/Tarefas/solta.canvas', raw: solto, preferred: { x: 0, y: 0 } },
            snapshot(),
            ports,
        );

        expect(relatorio.scale).toBe('indefinida');
        expect(relatorio.outcome).toBe('nothing');
        expect(relatorio.headerId).toBeNull();
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(solto);
        // Não basta dizer "indefinida": o motivo inteiro vai para a mensagem.
        expect(relatorio.message).toContain('Não foi possível determinar a escala');
        expect(relatorio.message).toContain('o cabeçalho declara justamente a escala que a leitura não achou');
    });

    it('escala de sistema escreve cabeçalho fractal com links de área (O6/A4)', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runFractalContextForFrame(
            { canvasPath: COCKPIT_PATH, raw: CANVAS, preferred: null },
            snapshot(),
            ports,
        );

        expect(relatorio.scale).toBe('sistema');
        expect(relatorio.outcome).toBe('written');
        expect(relatorio.headerId).not.toBeNull();
        expect(estado.escritas).toHaveLength(1);
    });

    it('escala de tarefas escreve cabeçalho fractal com retorno ao projeto (O6/A4)', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runFractalContextForFrame(
            { canvasPath: 'TaskNotes/Tarefas/quadro.canvas', raw: CANVAS, preferred: null },
            snapshotComTarefas([{ path: TAREFA, projects: ['Proj A'] }]),
            ports,
        );

        expect(relatorio.scale).toBe('tarefas');
        expect(relatorio.outcome).toBe('written');
        expect(estado.escritas).toHaveLength(1);
    });
});

/* ==========================================================================
   O quadro com tarefas: o cabeçalho também liga o nível de baixo
   ========================================================================== */

/* ==========================================================================
   A ordem inversa: o cabeçalho depois do MENU
   ==========================================================================
   O revisor independente mediu (2026-09-15) que, com o menu gerado ANTES, os dois
   blocos nasciam em (0,0) e ficavam sobrepostos — a âncora só cobria a ordem
   cabeçalho → menu. Este teste fixa o conserto: em qualquer ordem, o segundo
   bloco nasce no FUNDO do primeiro, e os dois nunca se sobrepõem.
   ========================================================================== */

describe('cabeçalho e menu no mesmo canvas, em qualquer ordem', () => {
    it('menu primeiro: o cabeçalho nasce abaixo do menu, sem sobrepor', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const tree = {
            groups: [
                {
                    group: 'Roteadores',
                    entries: [COCKPIT_PATH, COCKPIT_AREA, PROJ_B].map((caminho, indice) => ({
                        id: `router_${indice}`, label: `Router ${indice}`, kind: 'protocol' as const, filePath: caminho,
                    })),
                },
                { group: 'Instrumentos ACT', entries: [{ id: 'dfm-system:x', label: 'Um comando', kind: 'command' as const }] },
            ],
            total: 4,
            empty: false,
        };

        // 1. O MENU entra primeiro.
        const menu = await runCanvasMenuForFrame(
            { canvasPath: PROJ_A, raw: CANVAS, preferred: { x: 0, y: 0 }, tree },
            snapshot(),
            ports as any,
        );
        expect(menu.outcome).toBe('written');
        const spanMenu = findCanvasMenuSpan(estado.texto)!;
        const nosMenu = nosDoMenu(estado.texto);
        const fundoDoMenu = nosMenu[nosMenu.length - 1].y + nosMenu[nosMenu.length - 1].height;

        // 2. O CABEÇALHO entra depois — e tem de nascer abaixo do menu.
        const cabecalho = await runFractalContextForFrame(quadro(estado.texto), snapshot(), ports);
        expect(cabecalho.outcome).toBe('written');

        const texto = estado.texto;
        const spanCabecalho = findFractalHeaderSpan(texto)!;
        const nosCabecalho = nosDoCabecalho(texto);

        // A âncora é o fundo do menu: mesma coluna, y = fundo.
        expect(spanCabecalho.x).toBe(spanMenu.x);
        expect(spanCabecalho.y).toBe(fundoDoMenu);

        // A prova de não-sobreposição, com números medidos: o primeiro nó do
        // cabeçalho começa onde o último do menu termina, e nenhum nó do cabeçalho
        // invade a faixa do menu.
        const primeiroDoCabecalho = nosCabecalho[0];
        expect(primeiroDoCabecalho.y).toBeGreaterThanOrEqual(fundoDoMenu);
        for (const no of nosCabecalho) {
            expect(no.y).toBeGreaterThanOrEqual(fundoDoMenu);
        }

        // O menu continua intacto e o arquivo continua válido.
        expect(findCanvasMenuSpan(texto)).not.toBeNull();
        expect(() => JSON.parse(texto)).not.toThrow();
        expect(texto).toContain('"id":"e1"');
        expect(texto).toContain('Proj A — desenho do operador');

        // E rodar de novo não escreve nada (idempotência preservada nos dois blocos).
        const escritasAntes = estado.escritas.length;
        const denovo = await runFractalContextForFrame(quadro(texto), snapshot(), ports);
        expect(denovo.outcome).toBe('nothing');
        expect(estado.escritas.length).toBe(escritasAntes);
    });

    it('cabeçalho primeiro: o menu nasce no fundo do cabeçalho (o vão de 24px saiu)', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const tree = { groups: [{ group: 'Roteadores', entries: [{ id: 'router_1', label: 'Router 1', kind: 'protocol' as const, filePath: COCKPIT_AREA }] }], total: 1, empty: false };

        const cabecalho = await runFractalContextForFrame(quadro(CANVAS), snapshot(), ports);
        expect(cabecalho.outcome).toBe('written');
        const nosCabecalho = nosDoCabecalho(estado.texto);
        const ultimo = nosCabecalho[nosCabecalho.length - 1];

        const menu = await runCanvasMenuForFrame(
            { canvasPath: PROJ_A, raw: estado.texto, preferred: { x: 0, y: 0 }, tree },
            snapshot(),
            ports as any,
        );
        expect(menu.outcome).toBe('written');

        const primeiroDoMenu = nosDoMenu(estado.texto)[0];
        // Fundo do cabeçalho, não "fundo + 24": a mesma conta nos dois sentidos.
        expect(primeiroDoMenu.y).toBe(ultimo.y + ultimo.height);
        expect(primeiroDoMenu.y).toBeGreaterThanOrEqual(ultimo.y + ultimo.height);
    });

    it('menu com nó deslocado ou intercalado: cabeçalho ancora no fundo REAL dos nós marcados (Achados E e H)', async () => {
        // Um canvas onde o menu tem um nó arrastado pelo usuário para y = 800 (height 150 -> fundo 950)
        const menuComNoDeslocado = JSON.stringify({
            nodes: [
                { id: 'm1', type: 'group', mode: 'dfm-canvas-menu', x: 0, y: 0, width: 400, height: 950 },
                { id: 'm2', type: 'text', mode: 'dfm-canvas-menu', text: 'Menu', x: 0, y: 0, width: 400, height: 150 },
                { id: 'm3', type: 'text', mode: 'dfm-canvas-menu', text: 'Deslocado', x: 0, y: 800, width: 400, height: 150 },
            ],
            edges: [],
        }, null, '	');

        const { estado, ports } = vaultDeTexto(menuComNoDeslocado);
        const relatorio = await runFractalContextForFrame(quadro(menuComNoDeslocado), snapshot(), ports);
        expect(relatorio.outcome).toBe('written');

        const primeiroDoCabecalho = nosDoCabecalho(estado.texto)[0];
        // O cabeçalho DEVE ancorar no fundo real (800 + 150 = 950), e NUNCA em y = 498
        expect(primeiroDoCabecalho.y).toBe(950);
    });

    it('o comando do contexto fractal continua registrado em main.ts', () => {
        const MAIN = join(__dirname, '..', '..', 'src', 'main.ts');
        const fonte = readFileSync(MAIN, 'utf-8');
        expect(fonte).toContain("id: 'dfm-canvas-contexto-fractal'");
        expect(fonte).toContain('runFractalContextForActiveCanvas(this.canvasEngine, activeView)');
    });
});

