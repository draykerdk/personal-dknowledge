/**
 * A gravação do menu do acervo no canvas: releitura, guarda, idempotência,
 * substituição por span e fidelidade byte a byte.
 *
 * O que este teste fixa, e por quê:
 *
 * 1. **o bloco entra** — título, um nó por grupo e um nó por item, com o
 *    marcador em cada nó, e a primeira execução é assertada por três fatos
 *    independentes (`outcome`, `escritas.length`, `texto !== CANVAS`) porque um
 *    teste que só compara o arquivo consigo mesmo passa com a feature desligada
 *    (achado da revisão de 15/09);
 * 2. **rodar de novo não escreve** — o bloco encontrado é byte a byte o que seria
 *    gravado: `nothing`, zero escritas novas, arquivo idêntico;
 * 3. **mudar o acervo substitui, não duplica** — um protocolo novo entra no mesmo
 *    bloco (mesmo `menuId`), sem um segundo menu;
 * 4. **o resto do arquivo volta byte a byte** — `edges`, grupo, texto do operador
 *    e o **cabeçalho de escala já presente** sobrevivem à substituição, e a
 *    indentação do bloco é uniforme;
 * 5. **o guarda de releitura** — conteúdo mudado entre a leitura e a gravação:
 *    aborta, não grava, e a mensagem nomeia a causa medida;
 * 6. **acervo vazio não desenha menu em branco** — `nothing`, com o vazio dito em
 *    palavras na mensagem.
 *
 * O harness é uma vault em memória: `read`/`write` sobre uma string. É o mesmo
 * desenho do `CanvasFractalPorts` da peça do cabeçalho, e é onde as duas leituras
 * acontecem.
 */
import { describe, expect, it, vi } from 'vitest';

/** Os avisos que o Obsidian mostraria — `Notice` não passa pelas portas. */
const capturado = vi.hoisted(() => ({ notices: [] as string[] }));

vi.mock('obsidian', () => {
    const dual = function () { return {} as any; };
    const known: Record<string, unknown> = {
        ItemView: class { constructor(public leaf?: any) {} registerEvent() { /* no-op */ } },
        Notice: class { constructor(public message?: string) { capturado.notices.push(String(message ?? '')); } },
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
    // vitest resolver o módulo para `{}`, e aí TODO export some (medido em 15/09).
    return new Proxy(known, {
        get: (target, key: string) => (key === 'then' ? undefined : (key in target ? target[key] : dual)),
    });
});

import {
    findCanvasMenuSpan,
    runCanvasMenuForActiveCanvas,
    runCanvasMenuForFrame,
} from '../../src/engine/canvasengine/canvasMenuWriter';
import type { CanvasMenuPorts } from '../../src/engine/canvasengine/canvasMenuWriter';
import { runFractalContextForFrame, findFractalHeaderSpan } from '../../src/engine/canvasengine/canvasFractal';
import { buildCanvasMenuTree } from '../../src/engine/canvasengine/canvasMenu';
import type { CanvasMenuEntry, CanvasMenuTree } from '../../src/engine/canvasengine/canvasMenu';
import {
    CANVAS_MENU_MARKER,
    canvasMenuGroupIdFor,
    canvasMenuIdFor,
    canvasMenuNodeIds,
    planCanvasMenu,
    renderCanvasMenuNodes,
} from '../../src/engine/canvasMenuCanvas';
import { COCKPIT_PATH } from '../../src/engine/canvasTree';

/* ==========================================================================
   O quadro: uma área, um projeto e um desenho com grupo, texto e aresta
   ========================================================================== */

const AREA_PATH = '100 - AREAS/110 - Funções';
const COCKPIT_AREA = `${AREA_PATH}/Funções.canvas`;
const PROJ_A = `${AREA_PATH}/Proj A/Proj A.canvas`;
const PROJ_B = `${AREA_PATH}/Proj B/Proj B.canvas`;
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

/* ==========================================================================
   O acervo de mentira, no formato REAL (`{id, label, kind, group}`)
   ========================================================================== */

const roteador = (numero: number): CanvasMenuEntry => ({
    id: `router_${numero}`,
    label: `Router ${numero}`,
    kind: 'protocol',
    group: 'Roteadores',
});

const COMANDO: CanvasMenuEntry = {
    id: 'dfm-system:dfm-canvas-contexto-fractal',
    label: '🧭 Gerar contexto fractal do canvas ativo',
    kind: 'command',
    group: 'Instrumentos ACT',
};

/** 7 roteadores (2 ficam fora do teto) e 1 comando sem destino. */
const acervo = (extras: CanvasMenuEntry[] = []): CanvasMenuTree => buildCanvasMenuTree([
    ...[1, 2, 3, 4, 5, 6, 7].map(roteador),
    COMANDO,
    ...extras,
]);

/* ==========================================================================
   A vault em memória e o quadro
   ========================================================================== */

function vaultDeTexto(inicial: string, existentes: ReadonlySet<string> = new Set(CAMINHOS_PADRAO)) {
    const estado = {
        texto: inicial,
        escritas: [] as string[],
        mensagens: [] as string[],
        falhas: [] as string[],
    };
    const ports: CanvasMenuPorts = {
        read: () => Promise.resolve(estado.texto),
        write: next => { estado.escritas.push(next); estado.texto = next; return Promise.resolve(); },
        notice: message => { estado.mensagens.push(message); },
        fail: message => { estado.falhas.push(message); },
        exists: path => existentes.has(path),
    };
    return { estado, ports };
}

const quadro = (raw: string, tree: CanvasMenuTree = acervo(), preferred: { x: number; y: number } | null = { x: 0, y: 0 }) =>
    ({ canvasPath: PROJ_A, raw, preferred, tree });

/** Os nós do bloco do menu, na ordem em que estão no arquivo. */
const nosDoMenu = (texto: string) =>
    (JSON.parse(texto).nodes as any[]).filter(node => node?.mode === CANVAS_MENU_MARKER);

/* ==========================================================================
   1. A primeira execução: o bloco entra
   ========================================================================== */

describe('gerar o menu do canvas ativo', () => {
    it('grava o bloco do acervo no formato do canvas do Obsidian', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);

        // Sem estas três linhas o teste passava com a FEATURE DESLIGADA: sem
        // escrita, as comparações abaixo comparavam o arquivo consigo mesmo.
        expect(relatorio.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);

        expect(relatorio.updated).toBe(false);
        expect(relatorio.scale).toBe('projeto');
        expect(relatorio.menuId).toBe(canvasMenuIdFor(PROJ_A));
        expect(relatorio.total).toBe(8);
        expect(relatorio.truncated).toBe(2);
        expect(relatorio.groups).toEqual([
            { name: 'Roteadores', items: 5, truncated: 2 },
            { name: 'Instrumentos ACT', items: 1, truncated: 0 },
        ]);

        const bloco = planCanvasMenu({
            canvasPath: PROJ_A, reading: { scale: 'projeto', label: 'Projeto', trail: [], reason: '' } as any,
            tree: acervo(), exists: path => CAMINHOS_PADRAO.includes(path),
        });
        const nos = nosDoMenu(estado.texto);
        // Título + 2 grupos + 6 itens que entraram (5 + 1).
        expect(nos).toHaveLength(9);
        expect(nos.every(node => node.type === 'text')).toBe(true);
        expect(nos[0].text).toBe(bloco.title);
        expect(nos[0].text).toContain('## 📋 Menu do canvas');
        expect(nos[0].text).toContain('**Escala:** Projeto ·');

        // O id prometido pelo plano é o id que foi para o arquivo — uma fonte só.
        expect(nos.map(node => node.id)).toEqual(canvasMenuNodeIds(bloco));
        // Os itens entram com o id que o menu executa.
        expect(nos.map(node => node.text).join('\n')).toContain('protocolo: router_1');
        expect(nos.map(node => node.text).join('\n')).toContain(`comando: ${COMANDO.id}`);

        // A mensagem declara escala, o que entrou por grupo, o corte e o que não
        // pôde virar nó.
        expect(relatorio.message).toContain('escala Projeto');
        expect(relatorio.message).toContain('8 item(ns) no acervo em 2 grupo(s)');
        expect(relatorio.message).toContain('no desenho: Roteadores 5 de 7, Instrumentos ACT 1 de 1');
        expect(relatorio.message).toContain('2 item(ns) ficaram fora do teto de 5 por grupo');
        expect(relatorio.message).toContain('sem arquivo clicável — o menu executa por id');
        expect(relatorio.message).toContain('bloco gravado');
    });

    it('a coluna do menu tem indentação uniforme, a mesma dos nós do arquivo', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);

        const linhas = estado.texto.split('\n').filter(linha => linha.includes(`"mode":"${CANVAS_MENU_MARKER}"`));
        expect(linhas).toHaveLength(9);

        const recuos = new Set(linhas.map(linha => (linha.match(/^[ \t]*/) ?? [''])[0]));
        expect(recuos.size).toBe(1);

        const linhaDoOperador = estado.texto.split('\n').find(linha => linha.includes('"id":"n1"'))!;
        expect([...recuos][0]).toBe((linhaDoOperador.match(/^[ \t]*/) ?? [''])[0]);
        expect([...recuos][0]).toBe('\t\t');
    });

    it('a âncora da primeira inserção é o `preferred` medido, direto, sem busca de posição', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS, acervo(), { x: 120, y: -80 }), snapshot(), ports);

        const primeiro = nosDoMenu(estado.texto)[0];
        expect(primeiro.x).toBe(120);
        expect(primeiro.y).toBe(-80);
        expect(estado.texto).toContain('"y":-80');
    });

    it('sem `preferred`, a âncora é o centro dos nós', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS, acervo(), null), snapshot(), ports);

        // O centro da caixa dos três nós: x de -700 a 1000 (centro 150), y de
        // -500 a 500 (centro 0) — a caixa do grupo manda nas duas dimensões.
        const primeiro = nosDoMenu(estado.texto)[0];
        expect(primeiro.x).toBe(150);
        expect(primeiro.y).toBe(0);
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
                    commands: { commands: { 'dfm-system:open-mission-control': { name: 'Abrir Mission Control' } } },
                },
                manager: { getAll: () => [roteador(1), roteador(2)] },
                // `MissionControl.build` é `async`: sem o `await` no comando, o
                // índice sairia vazio e a escala leria `indefinida`.
                getMissionControl: () => ({ build: () => Promise.resolve(snapshot()) }),
            },
            getCenterCoordinates: () => ({ x: 0, y: 0 }),
        };
        const view = { getViewType: () => 'canvas', file: { path: PROJ_A }, canvas: {} };

        const relatorio = await runCanvasMenuForActiveCanvas(engine, view);

        expect(relatorio).not.toBeNull();
        expect(relatorio!.scale).toBe('projeto');
        expect(relatorio!.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);

        // O acervo vivo, na ordem da coleta (grupo, depois rótulo): 1 comando do
        // registro em "Outros" e 2 protocolos em "Roteadores".
        expect(relatorio!.groups).toEqual([
            { name: 'Outros', items: 1, truncated: 0 },
            { name: 'Roteadores', items: 2, truncated: 0 },
        ]);
        const textos = nosDoMenu(estado.texto).map(node => node.text).join('\n');
        expect(textos).toContain('protocolo: router_1');
        expect(textos).toContain('comando: dfm-system:open-mission-control');
    });

    it('sem canvas ativo o comando não escreve e devolve null', async () => {
        const antes = capturado.notices.length;
        const engine = { plugin: { app: { vault: {} } } };
        const relatorio = await runCanvasMenuForActiveCanvas(engine, { getViewType: () => 'markdown' });

        expect(relatorio).toBeNull();
        // O aviso sai por `Notice` (o comando é despachado sem `await`: uma
        // rejeição silenciosa seria invisível), e ele é medido.
        expect(capturado.notices.slice(antes).join(' ')).toContain('abra um canvas primeiro');
    });
});

/* ==========================================================================
   2. Idempotência, substituição e fidelidade
   ========================================================================== */

describe('atualizar, nunca duplicar', () => {
    it('rodar duas vezes não escreve nada na segunda — idempotência', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);

        const primeira = await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);
        expect(primeira.outcome).toBe('written');
        expect(estado.escritas.length).toBeGreaterThanOrEqual(1);
        expect(estado.texto).not.toBe(CANVAS);
        const escritasDaPrimeira = estado.escritas.length;
        const depoisDaPrimeira = estado.texto;

        // A segunda geração lê o arquivo de agora — como o comando faz.
        const segunda = await runCanvasMenuForFrame(quadro(estado.texto), snapshot(), ports);

        expect(segunda.outcome).toBe('nothing');
        expect(segunda.updated).toBe(false);
        // `added` é o que ENTROU no desenho nesta execução: a segunda não entrou
        // nada, e a primeira entrou os 6 itens que couberam no teto.
        expect(primeira.added).toHaveLength(6);
        expect(segunda.added).toEqual([]);
        expect(estado.escritas.length).toBe(escritasDaPrimeira);
        expect(estado.texto).toBe(depoisDaPrimeira);
        expect(segunda.message).toContain('nada a escrever');
        expect(segunda.message).toContain('byte a byte');
    });

    it('um protocolo novo substitui o bloco no mesmo id — sem segundo menu, sem mexer no resto', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);

        const primeira = await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);
        expect(primeira.outcome).toBe('written');
        expect(estado.texto).not.toBe(CANVAS);
        const antes = estado.texto;
        const spanAntes = findCanvasMenuSpan(antes);
        expect(spanAntes).not.toBeNull();
        expect(nosDoMenu(antes)).toHaveLength(9);

        // O operador instala um protocolo novo: o acervo muda, o canvas não.
        const comNovo = vaultDeTexto(antes);
        const segunda = await runCanvasMenuForFrame(
            quadro(antes, acervo([{ id: 'review_semanal', label: 'Review semanal', kind: 'protocol', group: 'Revisões' }])),
            snapshot(),
            comNovo.ports,
        );

        expect(segunda.outcome).toBe('written');
        expect(segunda.updated).toBe(true);
        expect(segunda.menuId).toBe(primeira.menuId);

        const depois = comNovo.estado.texto;
        expect(depois).not.toBe(antes);
        // Um bloco só: um único nó de título com o id do menu.
        expect(nosDoMenu(depois).filter(node => node.id === primeira.menuId)).toHaveLength(1);
        expect(nosDoMenu(depois)).toHaveLength(11);
        expect(nosDoMenu(depois).map(node => node.text).join('\n')).toContain('protocolo: review_semanal');

        // Tudo FORA do bloco volta byte a byte: arestas, grupo, texto do operador
        // e a formatação do arquivo.
        const spanDepois = findCanvasMenuSpan(depois)!;
        expect(depois.slice(0, spanDepois.start)).toBe(antes.slice(0, spanAntes!.start));
        expect(depois.slice(spanDepois.end)).toBe(antes.slice(spanAntes!.end));
        expect(depois).toContain('"text":"Proj A — desenho do operador"');
        expect(depois).toContain('"label":"Painel do projeto"');
        expect(depois).toContain('\t"edges":[');
        expect(depois).toContain('\t\t{"id":"e1","fromNode":"n1","fromSide":"right","toNode":"n2","toSide":"left"}');
        expect(segunda.message).toContain('bloco atualizado');
    });

    it('o cabeçalho de escala já presente não é deslocado, e o menu entra depois dele', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);

        // 1. O cabeçalho de escala entra primeiro, pela peça dele.
        const cabecalho = await runFractalContextForFrame(
            { canvasPath: PROJ_A, raw: CANVAS, preferred: { x: 0, y: 0 } },
            snapshot(),
            ports as any,
        );
        expect(cabecalho.outcome).toBe('written');
        const comCabecalho = estado.texto;
        const spanCabecalho = findFractalHeaderSpan(comCabecalho)!;
        expect(spanCabecalho).not.toBeNull();
        const nosCabecalho = (JSON.parse(comCabecalho).nodes as any[]).filter(node => node?.mode === 'dfm-fractal-header');

        // 2. O menu entra depois — na coluna do cabeçalho, uma folga abaixo dele.
        const relatorio = await runCanvasMenuForFrame(quadro(comCabecalho), snapshot(), ports);
        expect(relatorio.outcome).toBe('written');

        const depois = estado.texto;
        const spanMenu = findCanvasMenuSpan(depois)!;
        const spanCabecalhoDepois = findFractalHeaderSpan(depois)!;

        // O cabeçalho volta byte a byte, e a posição dele não mudou. A ÚNICA
        // diferença possível é a vírgula que separa o cabeçalho do bloco que veio
        // depois dele — sem ela o arquivo deixaria de ser JSON.
        // O único byte que o cabeçalho ganhou é a vírgula separadora, e ela agora
        // faz parte do span dele (é ela que a substituição dele repõe).
        expect(spanCabecalhoDepois.end).toBe(spanCabecalho.end + 1);
        expect(depois[spanCabecalhoDepois.end - 1]).toBe(',');

        const cabecalhoAntes = comCabecalho.slice(spanCabecalho.start, spanCabecalho.end);
        const cabecalhoDepois = depois.slice(spanCabecalhoDepois.start, spanCabecalhoDepois.end);
        expect(cabecalhoDepois.endsWith(',')).toBe(true);
        expect(cabecalhoDepois.replace(/,$/, '')).toBe(cabecalhoAntes);
        expect(() => JSON.parse(depois)).not.toThrow();
        expect(spanCabecalhoDepois.x).toBe(spanCabecalho.x);
        expect(spanCabecalhoDepois.y).toBe(spanCabecalho.y);

        const primeiroDoMenu = nosDoMenu(depois)[0];
        expect(primeiroDoMenu.x).toBe(spanCabecalho.x);
        // A âncora é o FUNDO do cabeçalho — `n × 150 + (n − 1) × 24`, a mesma conta
        // de `fractalHeaderBlockHeight`. Antes era `n × 174` (a altura canônica mais
        // 24): o menu nascia com um vão a mais e a regra divergia da do outro lado
        // (o cabeçalho passou a ancorar abaixo do menu pela altura canônica).
        const alturaDoCabecalho = nosCabecalho.length * 150 + (nosCabecalho.length - 1) * 24;
        expect(primeiroDoMenu.y).toBe(spanCabecalho.y + alturaDoCabecalho);
        // A prova de que a âncora é o FUNDO e não um vão: o menu começa exatamente
        // onde o último nó do cabeçalho termina.
        const ultimoDoCabecalho = nosCabecalho[nosCabecalho.length - 1];
        expect(primeiroDoMenu.y).toBe(ultimoDoCabecalho.y + ultimoDoCabecalho.height);
        // ...e o menu é o ÚLTIMO bloco do arquivo. Antes dele, a ÚNICA diferença
        // é a vírgula que a inserção acrescentou ao último elemento que já
        // existia (o cabeçalho): sem ela o arquivo deixaria de ser JSON.
        // Tudo o que o operador já tinha antes do cabeçalho volta byte a byte.
        expect(depois.slice(0, spanCabecalho.start)).toBe(comCabecalho.slice(0, spanCabecalho.start));
        // Entre o cabeçalho e o menu, o que a inserção acrescentou é a quebra de
        // linha e o recuo do bloco — a vírgula separadora já pertence ao span do
        // cabeçalho (é ela que a substituição dele repõe). Nada mais.
        expect(depois.slice(spanCabecalhoDepois.end, spanMenu.start)).toBe('\n\t\t');
        // Depois do bloco do menu vem exatamente o que vinha depois do cabeçalho
        // antes da inserção: o fecho da lista, as arestas e o fecho do arquivo.
        expect(depois.slice(spanMenu.end)).toBe(comCabecalho.slice(spanCabecalho.end));
        expect(() => JSON.parse(depois)).not.toThrow();
    });

    it('âncora com nó deslocado ou intercalado: o menu ancora no fundo REAL dos nós marcados (Achados E e H)', async () => {
        // Um canvas onde o cabeçalho tem um nó arrastado pelo usuário para y = 800 (height 150 -> fundo 950)
        const cabecalhoComNoDeslocado = JSON.stringify({
            nodes: [
                { id: 'h1', type: 'group', mode: 'dfm-fractal-header', x: 0, y: 0, width: 400, height: 950 },
                { id: 'h2', type: 'text', mode: 'dfm-fractal-header', text: 'Cabeçalho', x: 0, y: 0, width: 400, height: 150 },
                { id: 'h3', type: 'text', mode: 'dfm-fractal-header', text: 'Deslocado', x: 0, y: 800, width: 400, height: 150 },
            ],
            edges: [],
        }, null, '\t');

        const { estado, ports } = vaultDeTexto(cabecalhoComNoDeslocado);
        const relatorio = await runCanvasMenuForFrame(quadro(cabecalhoComNoDeslocado), snapshot(), ports);
        expect(relatorio.outcome).toBe('written');

        const depois = estado.texto;
        const primeiroDoMenu = nosDoMenu(depois)[0];
        // O menu DEVE ancorar no fundo real (800 + 150 = 950), e NUNCA em y = 498 (fórmula cega de 3 nós contíguos)
        expect(primeiroDoMenu.y).toBe(950);
    });

    it('atualizar com um nó depois do bloco: só o span muda, e a vírgula do bloco é reposta', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);

        // O operador põe um nó DEPOIS do menu: é o caso em que o span engole a
        // vírgula que separa o bloco do resto.
        const antes = estado.texto.replace(
            '\n\t],\n\t"edges":[',
            ',\n\t\t{"id":"n3","type":"text","text":"depois","x":900,"y":0,"width":400,"height":150}\n\t],\n\t"edges":[',
        );
        expect(antes).not.toBe(estado.texto);
        expect(() => JSON.parse(antes)).not.toThrow();
        const spanAntes = findCanvasMenuSpan(antes)!;
        expect(antes[spanAntes.end - 1]).toBe(',');

        const comNovo = vaultDeTexto(antes);
        const relatorio = await runCanvasMenuForFrame(
            quadro(antes, acervo([{ id: 'review_semanal', label: 'Review semanal', kind: 'protocol', group: 'Revisões' }])),
            snapshot(),
            comNovo.ports,
        );

        expect(relatorio.outcome).toBe('written');
        expect(relatorio.updated).toBe(true);
        const depois = comNovo.estado.texto;
        const spanDepois = findCanvasMenuSpan(depois)!;

        expect(depois.slice(0, spanDepois.start)).toBe(antes.slice(0, spanAntes.start));
        expect(depois.slice(spanDepois.end)).toBe(antes.slice(spanAntes.end));
        expect(depois[spanDepois.end - 1]).toBe(',');
        expect(() => JSON.parse(depois)).not.toThrow();
        expect((JSON.parse(depois).nodes as any[]).some(node => node.id === 'n3')).toBe(true);
    });

    it('o bloco é localizado pelo marcador, com a vírgula final no span', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);

        const span = findCanvasMenuSpan(estado.texto)!;
        expect(estado.texto.slice(span.start, span.start + 1)).toBe('{');
        // O menu é o último bloco do arquivo: não há vírgula depois dele.
        expect(estado.texto[span.end - 1]).toBe('}');
        expect(span.menuId).toBe(canvasMenuIdFor(PROJ_A));
        expect(Number.isFinite(span.x)).toBe(true);
        expect(Number.isFinite(span.y)).toBe(true);
        expect(span.y).toBe(0);
    });
});

/* ==========================================================================
   3. O guarda e os desfechos que não gravam
   ========================================================================== */

describe('o guarda de releitura', () => {
    it('conteúdo mudado entre a leitura e a gravação: aborta, não grava, e diz a causa', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        // Alguém editou o canvas depois que o comando leu o arquivo.
        const editado = CANVAS.replace('Proj A — desenho do operador', 'Proj A — editado');
        const portsCorridos: CanvasMenuPorts = { ...ports, read: () => Promise.resolve(editado) };

        const relatorio = await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), portsCorridos);

        expect(relatorio.outcome).toBe('aborted');
        expect(relatorio.added).toEqual([]);
        expect(relatorio.updated).toBe(false);
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(CANVAS);
        // A mensagem diz o que foi MEDIDO (o conteúdo mudou entre a leitura e a
        // gravação) e não atribui autoria a ninguém.
        expect(relatorio.message).toContain('mudou entre a leitura e a gravação');
        expect(relatorio.message).not.toContain('alterado por fora');
        expect(estado.falhas.join(' ')).toContain('escrita do menu abortada');
    });

    it('o id canônico do bloco já ocupado por outro nó: recusa medida, nada é gravado', async () => {
        const colisao = CANVAS.replace('"id":"n1"', `"id":"${canvasMenuIdFor(PROJ_A)}"`);
        const { estado, ports } = vaultDeTexto(colisao);

        const relatorio = await runCanvasMenuForFrame(quadro(colisao), snapshot(), ports);

        // O plano desviaria do id tomado somando um sufixo; a gravação NÃO segue
        // por esse caminho — o id canônico ocupado é recusa, como no cabeçalho.
        expect(relatorio.outcome).toBe('refused');
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(colisao);
        expect(relatorio.message).toContain(canvasMenuIdFor(PROJ_A));
        expect(relatorio.message).toContain('já pertence a um nó deste canvas que não carrega o marcador');
    });

    it('o id de um grupo já ocupado por outro nó: recusa medida, nada é gravado', async () => {
        const idDeGrupo = canvasMenuGroupIdFor(canvasMenuIdFor(PROJ_A), 'Roteadores');
        const colisao = CANVAS.replace('"id":"n1"', `"id":"${idDeGrupo}"`);
        const { estado, ports } = vaultDeTexto(colisao);

        const relatorio = await runCanvasMenuForFrame(quadro(colisao), snapshot(), ports);

        expect(relatorio.outcome).toBe('refused');
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(colisao);
        expect(relatorio.message).toContain(idDeGrupo);
    });

    it('nós marcados sem o nó de título: recusa e a mensagem diz o que MEDIU', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports);

        // O operador troca os nós do menu por grupos marcados: o bloco deixa de
        // ter o primeiro nó de texto (o título) e não pode mais ser localizado.
        const semTitulo = estado.texto.split('\n').map(linha =>
            linha.includes(`"mode":"${CANVAS_MENU_MARKER}"`)
                ? linha.replace('"type":"text"', '"type":"group"')
                : linha,
        ).join('\n');
        expect(semTitulo).not.toBe(estado.texto);
        expect(semTitulo).toContain(`"mode":"${CANVAS_MENU_MARKER}"`);
        expect(() => JSON.parse(semTitulo)).not.toThrow();

        const { estado: segundo, ports: portasSegundas } = vaultDeTexto(semTitulo);
        const relatorio = await runCanvasMenuForFrame(quadro(semTitulo), snapshot(), portasSegundas);

        // Sem o título localizável, inserir de novo criaria o SEGUNDO menu.
        expect(relatorio.outcome).toBe('refused');
        expect(segundo.escritas).toHaveLength(0);
        expect(segundo.texto).toBe(semTitulo);

        const marcadosNoTexto = (semTitulo.match(new RegExp(`"mode":"${CANVAS_MENU_MARKER}"`, 'g')) ?? []).length;
        expect(relatorio.message).toContain(`o desenho tem ${marcadosNoTexto} nó(s) com o marcador`);
        expect(relatorio.message).toContain('e nenhum nó de título marcado');
        const idsMarcados = nosDoMenu(semTitulo).map(node => String(node.id));
        for (const id of idsMarcados) expect(relatorio.message).toContain(`"${id}"`);
        // O diagnóstico diz a MESMA causa medida que a mensagem — "nenhum nó de
        // título marcado", e não "nenhum grupo marcado", que era o texto do
        // cabeçalho de escala (achado da revisão independente, 2026-09-15).
        expect(segundo.falhas.join(' ')).toContain('nenhum nó de título marcado');
        expect(segundo.falhas.join(' ')).not.toContain('nenhum grupo marcado');
    });

    it('acervo vazio: nada é gravado e o vazio é dito em palavras', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runCanvasMenuForFrame(
            quadro(CANVAS, buildCanvasMenuTree([])),
            snapshot(),
            ports,
        );

        expect(relatorio.outcome).toBe('nothing');
        expect(relatorio.total).toBe(0);
        expect(relatorio.menuId).toBe(canvasMenuIdFor(PROJ_A));
        expect(estado.escritas).toHaveLength(0);
        expect(estado.texto).toBe(CANVAS);
        expect(relatorio.message).toContain('acervo vazio');
        expect(relatorio.message).toContain('nenhum protocolo ou comando do DFM foi encontrado');
        expect(estado.texto).not.toContain(CANVAS_MENU_MARKER);
    });

    it('o teto efetivo da execução é o declarado na mensagem', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        const relatorio = await runCanvasMenuForFrame(quadro(CANVAS), snapshot(), ports, 2);

        expect(relatorio.outcome).toBe('written');
        expect(relatorio.groups[0]).toEqual({ name: 'Roteadores', items: 2, truncated: 5 });
        expect(relatorio.message).toContain('5 item(ns) ficaram fora do teto de 2 por grupo');
        expect(estado.texto).not.toBe(CANVAS);
    });
});

/* ==========================================================================
   4. O bloco renderizado é o mesmo que o plano promete
   ========================================================================== */

describe('o desenho gravado', () => {
    it('as linhas do arquivo são as do renderizador, com a geometria da âncora', async () => {
        const { estado, ports } = vaultDeTexto(CANVAS);
        await runCanvasMenuForFrame(quadro(CANVAS, acervo(), { x: 30, y: 40 }), snapshot(), ports);

        const bloco = planCanvasMenu({
            canvasPath: PROJ_A,
            reading: { scale: 'projeto', label: 'Projeto', trail: [], reason: '' } as any,
            tree: acervo(),
        });
        const esperadas = renderCanvasMenuNodes(bloco, { x: 30, y: 40, width: 400, height: 0 });
        const linhas = estado.texto.split('\n')
            .filter(linha => linha.includes(`"mode":"${CANVAS_MENU_MARKER}"`))
            .map(linha => linha.trim().replace(/,$/, ''));

        expect(linhas).toEqual(esperadas);
    });
});
