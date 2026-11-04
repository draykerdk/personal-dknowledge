/**
 * A proposta de contexto fractal: o que falta, por escala lida.
 *
 * O que este teste fixa, e por quê:
 *
 * - **as cinco escalas** — `projeto` e `área` puxam contexto; `sistema`,
 *   `tarefas` e `indefinida` **não inventam** nada. `indefinida` é o caso que
 *   mais importa: ela é a ausência de leitura, e propor nó a partir dela seria
 *   declarar a escala que `readFractalScale` justamente não achou;
 * - **dedupe** — alvo que o desenho já referencia não vira segundo nó;
 * - **id determinístico** — o mesmo estado dá o mesmo id, e o id do plano é o
 *   mesmo que `planCanvasFileNodeInsertion` grava (uma fonte, duas leituras);
 * - **o teto de irmãos com o critério escrito** — o corte é contado e dito.
 *
 * O módulo puro importa `canvasRail` (pelo `railNodeIdFor`), que importa o
 * registro de widgets e portanto o pacote `obsidian`. Nenhuma asserção daqui
 * depende dele.
 */
import { describe, expect, it, vi } from 'vitest';

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
    // `then` nunca devolve função: um mock "thenable" faz o `await` do vitest
    // resolver o módulo para `{}` e todo export some (medido em 15/09).
    return new Proxy(known, {
        get: (target, key: string) => (key === 'then' ? undefined : (key in target ? target[key] : dual)),
    });
});

import {
    FRACTAL_CONTEXT_CRITERION,
    FRACTAL_CONTEXT_LIMIT,
    FRACTAL_HEADER_COLOR,
    FRACTAL_HEADER_GAP,
    FRACTAL_HEADER_LABEL,
    FRACTAL_HEADER_MARKER,
    FRACTAL_HEADER_NODE_HEIGHT,
    FRACTAL_HEADER_SKIP,
    FRACTAL_HEADER_WIDTH,
    canvasDrawingOf,
    fractalHeaderBlockHeight,
    fractalHeaderIdFor,
    fractalHeaderNodeIds,
    fractalHeaderTitle,
    fractalNavigationDirection,
    planFractalContext,
    planFractalHeader,
    renderFractalHeaderNodes,
} from '../../src/engine/canvasFractalContext';
import type { FractalReading } from '../../src/engine/missionFractal';
import { readFractalScale } from '../../src/engine/missionFractal';
import { canvasIndexOf } from '../../src/engine/missionCanvasIndex';
import { planCanvasFileNodeInsertion } from '../../src/engine/canvasengine/canvasRailPlan';
import { COCKPIT_PATH } from '../../src/engine/canvasTree';

/* ==========================================================================
   O quadro de mentira: uma área com cockpit e N projetos
   ========================================================================== */

const AREA_PATH = '100 - AREAS/110 - Funções';
const AREA_ID = 'area-funcoes';
const COCKPIT_AREA = `${AREA_PATH}/Funções.canvas`;

function projeto(nome: string) {
    return { name: nome, path: `${AREA_PATH}/${nome}`, index: `${AREA_PATH}/${nome}/000 - INDEX/${nome}.md` };
}

function canvasDe(path: string, folder: string, name: string, mtime: number, system = false) {
    return { path, name, folder, nodes: 3, edges: 1, mtime, system };
}

/** O snapshot com `quantos` projetos na área; nomes A, B, C… */
function snapshotCom(quantos: number) {
    const nomes = ['Proj A', 'Proj B', 'Proj C', 'Proj D', 'Proj E', 'Proj F', 'Proj G', 'Proj H'].slice(0, quantos);
    const projetos = nomes.map(projeto);
    return {
        areas: [{
            id: AREA_ID, name: 'Funções', path: AREA_PATH,
            initiatives: 0, departments: 0, staged: [], canvas: COCKPIT_AREA,
        }],
        portfolio: { columns: [{ projects: projetos }] },
        canvases: [
            canvasDe(COCKPIT_PATH, '300 - RUNTIME/000 - COCKPIT', 'Dk-Fleet-Commander', 10, true),
            canvasDe(COCKPIT_AREA, AREA_PATH, 'Funções', 20),
            ...projetos.map((p, index) => canvasDe(`${p.path}/${p.name}.canvas`, p.path, p.name, 100 + index)),
        ],
        board: { buckets: [] },
    };
}

const PROJ_A = `${AREA_PATH}/Proj A/Proj A.canvas`;
const PROJ_B = `${AREA_PATH}/Proj B/Proj B.canvas`;

/* ==========================================================================
   As cinco escalas
   ========================================================================== */

describe('a proposta de nós, por escala lida', () => {
    it('projeto: sobe para o cockpit da área e o do sistema, e desce para os irmãos', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const plano = planFractalContext({ canvasPath: PROJ_A, scale: 'projeto', index });

        expect(plano.kind).toBe('plan');
        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_PATH, COCKPIT_AREA, PROJ_B]);
        expect(plano.nodes.map(node => node.role)).toEqual(['sistema', 'area-cockpit', 'projeto-irmao']);
        // Ninguém propõe o canvas aberto para si mesmo.
        expect(plano.nodes.some(node => node.filePath === PROJ_A)).toBe(false);
    });

    it('área: sobe para o sistema e desce para os projetos dela, sem repetir o próprio cockpit', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const plano = planFractalContext({ canvasPath: COCKPIT_AREA, scale: 'area', index });

        expect(plano.kind).toBe('plan');
        // Mais recente primeiro (`mtime` do fixture cresce com o índice): Proj B
        // (101) entra antes de Proj A (100).
        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_PATH, PROJ_B, PROJ_A]);
        expect(plano.nodes.map(node => node.role)).toEqual(['sistema', 'projeto-da-area', 'projeto-da-area']);
        expect(plano.nodes.some(node => node.filePath === COCKPIT_AREA)).toBe(false);
    });

    it('sistema, tarefas e indefinida não propõem nada — a ausência é declarada', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);

        for (const escala of ['sistema', 'tarefas', 'indefinida'] as const) {
            const plano = planFractalContext({
                canvasPath: 'TaskNotes/Tarefas/solta.canvas',
                scale: escala,
                index,
            });
            expect(plano.kind, escala).toBe('skip');
            expect(plano.nodes, escala).toEqual([]);
            expect(plano.reason, escala).toContain('Nada foi escrito.');
        }

        // `indefinida` diz o motivo dela, não um genérico: contexto inventado é
        // exatamente o que ela recusa.
        const indefinida = planFractalContext({ canvasPath: 'x.canvas', scale: 'indefinida', index });
        expect(indefinida.reason).toContain('indefinida');
    });
});

/* ==========================================================================
   Dedupe
   ========================================================================== */

describe('dedupe contra o que o desenho já tem', () => {
    it('não duplica: alvo já presente no desenho entra em `already`, não em `nodes`', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const plano = planFractalContext({
            canvasPath: PROJ_A,
            scale: 'projeto',
            index,
            drawing: { files: [COCKPIT_PATH, PROJ_B], ids: ['n1', 'n2'] },
        });

        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_AREA]);
        expect(plano.already).toEqual([COCKPIT_PATH, PROJ_B]);
    });

    it('o desenho é lido do arquivo: `canvasDrawingOf` vê só nós de arquivo', () => {
        const desenho = canvasDrawingOf({
            nodes: [
                { id: 'g1', type: 'group', label: 'Painel' },
                { id: 't1', type: 'text', text: 'sem arquivo' },
                { id: 'f1', type: 'file', file: 'nota.md' },
                { id: 'f2', type: 'file', file: '  ' },
            ],
        });
        expect(desenho.files).toEqual(['nota.md']);
        expect(desenho.ids).toEqual(['g1', 't1', 'f1', 'f2']);
        expect(canvasDrawingOf(null).files).toEqual([]);
    });

    it('alvo que não existe no vault é descartado com o motivo — nunca nó órfão', () => {
        const index = canvasIndexOf(snapshotCom(1) as any);
        const plano = planFractalContext({
            canvasPath: PROJ_A,
            scale: 'projeto',
            index,
            exists: path => path !== COCKPIT_PATH,
        });

        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_AREA]);
        expect(plano.skipped.some(item => item.path === COCKPIT_PATH && item.reason.includes('órfão'))).toBe(true);
    });
});

/* ==========================================================================
   Ids e teto
   ========================================================================== */

describe('ids determinísticos', () => {
    it('o mesmo estado dá o mesmo id, e o id do plano é o que a inserção grava', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const pedido = { canvasPath: PROJ_A, scale: 'projeto' as const, index };
        const primeiro = planFractalContext(pedido);
        const segundo = planFractalContext(pedido);

        expect(primeiro.nodes.map(node => node.nodeId)).toEqual(segundo.nodes.map(node => node.nodeId));
        expect(new Set(primeiro.nodes.map(node => node.nodeId)).size).toBe(primeiro.nodes.length);

        // A inserção textual calcula o id sozinha. Se as duas respostas
        // divergissem, o id do plano seria decorativo — este teste é o que
        // impede isso.
        for (const node of primeiro.nodes) {
            const raw = '{\n\t"nodes":[],\n\t"edges":[]\n}\n';
            const insercao = planCanvasFileNodeInsertion(raw, { filePath: node.filePath, preferred: { x: 0, y: 0 } });
            if (insercao.kind !== 'insert') throw new Error('esperava inserção');
            expect(insercao.nodeId, node.filePath).toBe(node.nodeId);
        }
    });
});

describe('o teto de irmãos, com o critério escrito', () => {
    it('com mais projetos do que o teto, entra os mais recentes e o corte é declarado', () => {
        const index = canvasIndexOf(snapshotCom(8) as any);
        const plano = planFractalContext({ canvasPath: COCKPIT_AREA, scale: 'area', index });

        const projetos = plano.nodes.filter(node => node.role === 'projeto-da-area');
        expect(projetos).toHaveLength(FRACTAL_CONTEXT_LIMIT);
        // mtime crescente no fixture: os cinco primeiros são os mais antigos; o
        // critério é "mais recente primeiro", então o corte tira os mais antigos.
        expect(projetos.map(node => node.filePath)).toEqual([
            `${AREA_PATH}/Proj H/Proj H.canvas`,
            `${AREA_PATH}/Proj G/Proj G.canvas`,
            `${AREA_PATH}/Proj F/Proj F.canvas`,
            `${AREA_PATH}/Proj E/Proj E.canvas`,
            `${AREA_PATH}/Proj D/Proj D.canvas`,
        ]);
        expect(plano.truncated).toBe(3);
        expect(plano.reason).toContain('fora do teto de 5');
    });

    it('o critério é uma frase escrita, e não uma convenção implícita', () => {
        expect(FRACTAL_CONTEXT_CRITERION).toContain('mtime');
        expect(FRACTAL_CONTEXT_CRITERION).toContain('caminho');
        expect(FRACTAL_CONTEXT_CRITERION).toContain(`no máximo ${FRACTAL_CONTEXT_LIMIT}`);
        expect(FRACTAL_CONTEXT_CRITERION).toContain('declarado');
    });

    it('teto zero não escreve projeto nenhum, e diz que ficaram todos de fora', () => {
        const index = canvasIndexOf(snapshotCom(3) as any);
        const plano = planFractalContext({ canvasPath: COCKPIT_AREA, scale: 'area', index, limit: 0 });

        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_PATH]);
        expect(plano.truncated).toBe(3);
    });

    it('canvas fora de qualquer área não puxa cockpit de área nem irmãos — e diz isso', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const plano = planFractalContext({
            canvasPath: 'TaskNotes/Tarefas/Tarefa SMART por convenção.canvas',
            scale: 'area',
            index,
        });

        expect(plano.nodes.map(node => node.filePath)).toEqual([COCKPIT_PATH]);
        expect(plano.reason).toContain('não está na árvore de nenhuma área');
    });
});

/* ==========================================================================
   O cabeçalho de escala
   ========================================================================== */

const LEITURA_PROJETO: FractalReading = {
    scale: 'projeto',
    label: 'Projeto',
    trail: ['Área', 'Projeto'],
    reason: 'Canvas do projeto "Proj A", pela convenção do caminho.',
};

const LEITURA_AREA: FractalReading = {
    scale: 'area',
    label: 'Área',
    trail: ['Área'],
    reason: 'É o cockpit da área "Funções": byAreaCockpit aponta o canvas do topo dela.',
};

describe('o cabeçalho de escala, por escala lida', () => {
    it('projeto: título byte a byte, e as ligações vêm subir (área → sistema) antes de descer', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({ canvasPath: PROJ_A, reading: LEITURA_PROJETO, index });

        expect(bloco).not.toBeNull();
        expect(bloco!.title).toBe(
            '## 🧭 Cabeçalho fractal\n'
            + '**Escala:** Projeto · **Trilha:** sistema → Área → Projeto\n'
            + LEITURA_PROJETO.reason,
        );
        expect(bloco!.trail).toEqual(['Área', 'Projeto']);
        expect(bloco!.links.map(link => [link.direction, link.filePath])).toEqual([
            ['subir', COCKPIT_AREA],
            ['subir', COCKPIT_PATH],
            ['descer', PROJ_B],
        ]);
        expect(bloco!.links.map(link => fractalNavigationDirection(link))).toEqual([
            'subir',
            'subir',
            'lateral',
        ]);
        expect(bloco!.links.map(link => link.role)).toEqual(['area-cockpit', 'sistema', 'projeto-irmao']);
        expect(bloco!.headerId).toBe(fractalHeaderIdFor(PROJ_A));
        // Sem tarefa aberta no quadro, nenhuma ligação de tarefa — e o motivo dito.
        expect(bloco!.links.some(link => link.role === 'tarefas')).toBe(false);
        expect(bloco!.skipped.map(item => item.reason).join(' '))
            .toContain('Nenhuma tarefa aberta do projeto "Proj A" existe no vault');
    });

    it('área: sobe para o sistema, desce para os projetos dela e não liga tarefas', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({ canvasPath: COCKPIT_AREA, reading: LEITURA_AREA, index })!;

        expect(bloco.title).toBe(
            '## 🧭 Cabeçalho fractal\n**Escala:** Área · **Trilha:** sistema → Área\n' + LEITURA_AREA.reason,
        );
        // Mais recente primeiro (`mtime` do fixture cresce com o índice).
        expect(bloco.links.map(link => [link.direction, link.filePath])).toEqual([
            ['subir', COCKPIT_PATH],
            ['descer', PROJ_B],
            ['descer', PROJ_A],
        ]);
        expect(bloco.skipped.map(item => item.reason).join(' ')).toContain('Escala de área não liga tarefas');
    });

    it('escala indefinida: nenhum cabeçalho gerado', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const leitura: FractalReading = { scale: 'indefinida', label: 'indefinida', trail: [], reason: 'motivo' };
        expect(planFractalHeader({ canvasPath: PROJ_A, reading: leitura, index })).toBeNull();
        expect(FRACTAL_HEADER_SKIP.indefinida).toContain('o cabeçalho declara justamente a escala que a leitura não achou');
    });

    it('escala sistema: cockpit oferece descida para até 5 áreas e contagem de adicionais (A4)', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const leitura: FractalReading = { scale: 'sistema', label: 'sistema', trail: ['sistema'], reason: 'cockpit do sistema' };
        const bloco = planFractalHeader({ canvasPath: COCKPIT_PATH, reading: leitura, index, limit: 5 })!;
        expect(bloco).not.toBeNull();
        expect(bloco.scale).toBe('sistema');
        const descidas = bloco.links.filter(l => l.direction === 'descer');
        expect(descidas.length).toBeGreaterThan(0);
        expect(descidas.every(l => l.role === 'area-cockpit')).toBe(true);
    });

    it('escala tarefas: oferece retorno ao projeto pai identificado (A4)', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const leitura: FractalReading = { scale: 'tarefas', label: 'tarefas', trail: ['sistema', 'Área', 'Projeto', 'tarefas'], reason: 'canvas de tarefas' };
        const bloco = planFractalHeader({
            canvasPath: 'TaskNotes/Tarefas/tarefa-1.canvas',
            reading: leitura,
            index,
            taskProject: 'Proj A',
        })!;
        expect(bloco).not.toBeNull();
        expect(bloco.scale).toBe('tarefas');
        const retorno = bloco.links.find(l => l.direction === 'retorno');
        expect(retorno).toBeDefined();
        expect(retorno?.filePath).toBe(PROJ_A);
        expect(retorno?.label).toContain('Retornar ao Projeto Proj A');
    });

    it('o título sai da leitura real: escala, trilha e a evidência que decidiu', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const leitura = readFractalScale({ canvasPath: PROJ_A, contents: { tasks: 0, projects: [] }, index });

        expect(leitura.scale).toBe('projeto');
        expect(fractalHeaderTitle(leitura)).toBe(
            '## 🧭 Cabeçalho fractal\n**Escala:** Projeto · **Trilha:** sistema → Área → Projeto\n' + leitura.reason,
        );
    });

    it('a tarefa de prazo mais próximo vira ligação; as demais são contadas e declaradas', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({
            canvasPath: PROJ_A,
            reading: LEITURA_PROJETO,
            index,
            tasks: [
                { path: 'TaskNotes/Tarefas/sem-prazo.md', project: 'Proj A' },
                { path: 'TaskNotes/Tarefas/depois.md', project: 'Proj A', due: '2026-09-30' },
                { path: 'TaskNotes/Tarefas/antes.md', project: 'Proj A', due: '2026-09-16T09:00:00+07:00' },
                { path: 'TaskNotes/Tarefas/outro-projeto.md', project: 'Proj Z', due: '2026-01-01' },
            ],
            exists: () => true,
        })!;

        const tarefa = bloco.links.filter(link => link.role === 'tarefas');
        expect(tarefa).toHaveLength(1);
        expect(tarefa[0].filePath).toBe('TaskNotes/Tarefas/antes.md');
        expect(tarefa[0].direction).toBe('descer');
        expect(tarefa[0].label).toBe('Tarefas do projeto (3 aberta(s))');
        expect(bloco.links[bloco.links.length - 1]).toBe(tarefa[0]);
        expect(bloco.skipped.map(item => item.reason).join(' '))
            .toContain('2 tarefa(s) aberta(s) do projeto não foram ligadas');
    });

    it('tarefa sem projeto declarado é descartada e não contamina o projeto (A2)', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({
            canvasPath: PROJ_A,
            reading: LEITURA_PROJETO,
            index,
            tasks: [
                { path: 'TaskNotes/Tarefas/orfã-sem-projeto.md', due: '2026-09-10' },
                { path: 'TaskNotes/Tarefas/projeto-a.md', project: 'Proj A', due: '2026-09-20' },
            ],
            exists: () => true,
        })!;

        const tarefa = bloco.links.filter(link => link.role === 'tarefas');
        expect(tarefa).toHaveLength(1);
        expect(tarefa[0].filePath).toBe('TaskNotes/Tarefas/projeto-a.md');
        expect(tarefa[0].label).toBe('Tarefas do projeto (1 aberta(s))');
    });

    it('tarefa compartilhada com múltiplos projetos entra em cada um dos projetos legítimos (A2)', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const blocoA = planFractalHeader({
            canvasPath: PROJ_A,
            reading: LEITURA_PROJETO,
            index,
            tasks: [
                { path: 'TaskNotes/Tarefas/compartilhada.md', projects: ['Proj A', 'Proj B'], due: '2026-09-20' },
            ],
            exists: () => true,
        })!;
        const tarefaA = blocoA.links.filter(link => link.role === 'tarefas');
        expect(tarefaA).toHaveLength(1);
        expect(tarefaA[0].filePath).toBe('TaskNotes/Tarefas/compartilhada.md');

        const blocoB = planFractalHeader({
            canvasPath: PROJ_B,
            reading: LEITURA_PROJETO,
            index,
            tasks: [
                { path: 'TaskNotes/Tarefas/compartilhada.md', projects: ['Proj A', 'Proj B'], due: '2026-09-20' },
            ],
            exists: () => true,
        })!;
        const tarefaB = blocoB.links.filter(link => link.role === 'tarefas');
        expect(tarefaB).toHaveLength(1);
        expect(tarefaB[0].filePath).toBe('TaskNotes/Tarefas/compartilhada.md');
    });

    it('sem tarefa existente no vault: nenhuma ligação de tarefa, e o motivo é dito', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({
            canvasPath: PROJ_A,
            reading: LEITURA_PROJETO,
            index,
            tasks: [{ path: 'TaskNotes/Tarefas/fantasma.md', project: 'Proj A', due: '2026-09-16' }],
            exists: path => path !== 'TaskNotes/Tarefas/fantasma.md',
        })!;

        expect(bloco.links.some(link => link.role === 'tarefas')).toBe(false);
        expect(bloco.skipped.map(item => item.reason).join(' '))
            .toContain('Nenhuma tarefa aberta do projeto "Proj A" existe no vault');
    });

    it('área sem cockpit é declarada: não se sobe para lugar nenhum', () => {
        const semCockpit = snapshotCom(2);
        semCockpit.canvases = semCockpit.canvases.filter(canvas => canvas.path !== COCKPIT_AREA);
        const index = canvasIndexOf(semCockpit as any);
        const leitura = readFractalScale({ canvasPath: PROJ_A, contents: { tasks: 0, projects: [] }, index });
        expect(leitura.scale).toBe('projeto');

        const bloco = planFractalHeader({ canvasPath: PROJ_A, reading: leitura, index })!;
        expect(bloco.links.map(link => link.filePath)).not.toContain(COCKPIT_AREA);
        expect(bloco.skipped.map(item => item.reason).join(' '))
            .toContain('não tem canvas de topo (cockpit) no índice');
    });

    it('alvo que não existe no vault não vira ligação — o motivo é o mesmo do plano dos nós', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({
            canvasPath: PROJ_A,
            reading: LEITURA_PROJETO,
            index,
            exists: path => path !== COCKPIT_PATH,
        })!;

        expect(bloco.links.map(link => link.filePath)).toEqual([COCKPIT_AREA, PROJ_B]);
        expect(bloco.skipped.some(item => item.path === COCKPIT_PATH && item.reason.includes('órfão'))).toBe(true);
    });
});

describe('o cabeçalho: ids determinísticos e render', () => {
    it('duas chamadas iguais dão o mesmo bloco, byte a byte', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const pedido = { canvasPath: PROJ_A, reading: LEITURA_PROJETO, index };
        const primeiro = planFractalHeader(pedido)!;
        const segundo = planFractalHeader(pedido)!;

        expect(JSON.stringify(segundo)).toBe(JSON.stringify(primeiro));
        const ids = fractalHeaderNodeIds(primeiro);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('o cabeçalho já no desenho não desloca os ids: o mesmo id, sem sufixo', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({ canvasPath: PROJ_A, reading: LEITURA_PROJETO, index })!;
        const linhas = renderFractalHeaderNodes(bloco, {
            x: 0, y: 0, width: FRACTAL_HEADER_WIDTH, height: fractalHeaderBlockHeight(bloco),
        });
        const desenho = canvasDrawingOf({ nodes: linhas.map(linha => JSON.parse(linha)) });
        expect(desenho.headerIds).toEqual(fractalHeaderNodeIds(bloco));

        const denovo = planFractalHeader({ canvasPath: PROJ_A, reading: LEITURA_PROJETO, index, drawing: desenho })!;
        expect(denovo.headerId).toBe(bloco.headerId);
        expect(denovo.links.map(link => link.nodeId)).toEqual(bloco.links.map(link => link.nodeId));
        expect(JSON.stringify(denovo)).toBe(JSON.stringify(bloco));
    });

    it('o render: uma linha por nó, título primeiro, coluna 400×150 e o marcador em cada nó', () => {
        const index = canvasIndexOf(snapshotCom(2) as any);
        const bloco = planFractalHeader({ canvasPath: PROJ_A, reading: LEITURA_PROJETO, index })!;
        const geometria = { x: 120, y: -80, width: FRACTAL_HEADER_WIDTH, height: fractalHeaderBlockHeight(bloco) };
        const linhas = renderFractalHeaderNodes(bloco, geometria);

        expect(linhas).toHaveLength(2 + bloco.links.length);
        const nos = linhas.map(linha => JSON.parse(linha));
        expect(nos.map(no => no.type)).toEqual(['group', 'text', 'file', 'file', 'file']);
        expect(nos.map(no => no.id)).toEqual(fractalHeaderNodeIds(bloco));
        for (const linha of linhas) expect(linha).toContain(`"mode":"${FRACTAL_HEADER_MARKER}"`);

        // Uma coluna: o grupo é o primeiro da coluna, alinhado à âncora, e os nós
        // descem de 174 em 174 a partir dela.
        expect(nos.map(no => no.x)).toEqual([120, 120, 120, 120, 120]);
        expect(nos.map(no => no.y)).toEqual([-80, 94, 268, 442, 616]);
        expect(nos[0].height).toBe(fractalHeaderBlockHeight(bloco));
        // A moldura cobre a COLUNA INTEIRA — grupo, título e as 3 ligações:
        // 5 nós, 5 × 150 + 4 × 24. Contar o grupo de fora deixava a moldura 174 px
        // curta e o último nó ficava fora dela (achado da revisão independente,
        // 2026-09-15: 672 contra 846).
        expect(nos[0].height).toBe(5 * FRACTAL_HEADER_NODE_HEIGHT + 4 * FRACTAL_HEADER_GAP);
        // ...e a prova geométrica: o fundo da MOLDURA é o fundo do último nó.
        const ultimo = nos[nos.length - 1];
        expect(nos[0].y + nos[0].height).toBe(ultimo.y + ultimo.height);
        for (const no of nos) {
            expect(no.width).toBe(FRACTAL_HEADER_WIDTH);
            if (no.type !== 'group') expect(no.height).toBe(FRACTAL_HEADER_NODE_HEIGHT);
        }
        expect(nos[0].label).toBe(FRACTAL_HEADER_LABEL);
        expect(nos[0].color).toBe(FRACTAL_HEADER_COLOR);
        expect(nos[1].text).toBe(bloco.title);
        expect(nos.slice(2).map(no => no.file)).toEqual(bloco.links.map(link => link.filePath));
    });
});
