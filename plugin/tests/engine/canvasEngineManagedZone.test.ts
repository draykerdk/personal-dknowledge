import { describe, expect, it, vi } from 'vitest';

/**
 * O motor antigo de canvas num canvas com zona gerida (`dfm-pc-*`/`dfm-q*`):
 * - seta que toca tarefa (também arquivada), semana ou dia não vira campo, nem na
 *   adição nem na remoção, e a sincronização reversa não roda;
 * - o formatador não recolore nó gerido, não o converte de texto em arquivo e
 *   não grava `relacoes` na nota dele;
 * - tarefa criada num canvas de semana/trimestre nasce com a `week` e sem
 *   `projects: [[2026-Q4]]`;
 * - a Árvore de Progressão não é regravada com o canvas dela aberto numa aba.
 *
 * Fase 6 (15/10/2026): a tradução antiga de seta de tarefa sai de todo canvas
 * (também do solto), a pergunta de desfazer fica só para nota↔nota, a
 * sincronização reversa não trata tarefa e não grava canvas aberto por
 * `vault.modify`, e o laço de 5 s só formata e monta cartões.
 */
const { notices } = vi.hoisted(() => ({ notices: { count: 0 } }));

vi.mock('obsidian', () => ({
    TFile: class { path = ''; basename = ''; extension = 'md'; },
    TFolder: class {},
    Notice: class { constructor() { notices.count++; } noticeEl = { empty() {}, style: {}, createEl: () => ({ addEventListener() {} }), createDiv: () => ({ createEl: () => ({ addEventListener() {} }) }) }; hide() {} },
    debounce: (fn: any) => fn,
    Modal: class { app: any; constructor(app: any) { this.app = app; } open() {} close() {} },
    App: class {},
}));

import { TFile } from 'obsidian';
import { CanvasEngine } from '../../src/engine/canvasengine/canvasEngine';

function file(path: string): any {
    const f = new (TFile as any)();
    f.path = path;
    f.basename = path.split('/').pop()!.replace(/\.(md|canvas)$/, '');
    f.extension = path.endsWith('.canvas') ? 'canvas' : 'md';
    return f;
}

const SMART = file('TaskNotes/Tasks/Vender 3 cursos (W42).md');
const ACAO = file('TaskNotes/Tasks/Gravar vídeo.md');
const ARQUIVADA = file('TaskNotes/Archive/Postar vídeo.md');
const SEMANA = file('300 - RUNTIME/302 - Daymiss/Week/2026-W42.md');
const DIA = file('300 - RUNTIME/302 - Daymiss/Day/2026-10-14.md');
const NOTA_A = file('Notas/A.md');
const NOTA_B = file('Notas/B.md');
const ALL = [SMART, ACAO, ARQUIVADA, SEMANA, DIA, NOTA_A, NOTA_B];
const FM: Record<string, any> = {
    [SMART.path]: { type: 'tarefa_smart', status: 'next-action' },
    [ACAO.path]: { type: 'task', status: 'next-action' },
    [ARQUIVADA.path]: { type: 'task', status: 'done' },
    [SEMANA.path]: { type: 'weekly_note', week: '2026-W42' },
    [DIA.path]: { type: 'daily_note', week: '2026-W42' },
    [NOTA_A.path]: {},
    [NOTA_B.path]: {},
};

function harness(canvasPath = 'Quarterly/Canvases/2026-Q4.canvas') {
    const canvasFile = file(canvasPath);
    const plugin: any = {
        app: {
            workspace: { layoutReady: true, activeLeaf: null as any, getLeavesOfType: vi.fn(() => []) },
            vault: {
                getAbstractFileByPath: vi.fn((p: string) => ALL.find(f => f.path === p) ?? null),
                getMarkdownFiles: vi.fn(() => []),
                on: vi.fn(),
                modify: vi.fn(),
                create: vi.fn(),
            },
            metadataCache: { getFileCache: vi.fn((f: any) => ({ frontmatter: FM[f.path] ?? {} })) },
            fileManager: { processFrontMatter: vi.fn(async (_f: any, fn: any) => fn({})) },
            plugins: { plugins: {} },
        },
        settings: { canvasFormatOnModify: false, canvasSyncOnModify: true, canvasDeletePromptsEnabled: true, canvasNoteRelationsEnabled: true },
        registerEvent: vi.fn(),
        registerDomEvent: vi.fn(),
    };
    const engine = new CanvasEngine(plugin);
    const batched = vi.spyOn(engine.syncManager, 'applyBatchedUpdates').mockResolvedValue(undefined);
    const reverse = vi.spyOn(engine.syncManager, 'checkAndPromptReverseSync').mockResolvedValue(undefined);
    return { plugin, engine, canvasFile, batched, reverse };
}

/** Uma vista de canvas ativa com os nós (id → arquivo) e as setas (de → para). */
function activeCanvas(h: ReturnType<typeof harness>, nodes: Array<[string, any]>, edges: Array<[string, string]>) {
    const byId = new Map(nodes.map(([id, f]) => [id, { id, file: f }]));
    const canvas = {
        nodes: byId,
        edges: new Map(edges.map(([a, b], i) => [`e${i}`, { from: { node: byId.get(a) }, to: { node: byId.get(b) } }])),
        getData: () => ({
            nodes: nodes.map(([id, f]) => ({ id, type: 'file', file: f.path })),
            edges: edges.map(([a, b], i) => ({ id: `e${i}`, fromNode: a, toNode: b })),
        }),
        requestSave: vi.fn(),
    };
    h.plugin.app.workspace.activeLeaf = { view: { getViewType: () => 'canvas', file: h.canvasFile, canvas } };
    return canvas;
}

function writtenFields(batched: ReturnType<typeof harness>['batched']): string[] {
    const fields: string[] = [];
    for (const [updates] of batched.mock.calls) {
        for (const [path, up] of (updates as Map<string, any>).entries()) {
            for (const field of Object.keys(up)) fields.push(`${path}:${field}`);
        }
    }
    return fields;
}

describe('motor antigo num canvas com zona gerida', () => {
    it('SMART → ação desenhada não grava blocking/blockedBy', async () => {
        const h = harness();
        activeCanvas(h, [['dfm-qs-zone', null], ['dfm-qs-a', SMART], ['dfm-qs-b', ACAO]], [['dfm-qs-a', 'dfm-qs-b']]);
        notices.count = 0;
        await h.engine.processCanvasFile(h.canvasFile);
        expect(writtenFields(h.batched)).toEqual([]);
        expect(notices.count).toBe(0);
    });

    it('ação → nota da semana não grava projects += [[2026-W42]]; ação → dia e tarefa arquivada também não', async () => {
        const h = harness();
        activeCanvas(h, [['dfm-qs-zone', null], ['a', ACAO], ['w', SEMANA], ['d', DIA], ['x', ARQUIVADA], ['s', SMART]],
            [['a', 'w'], ['d', 'a'], ['x', 's'], ['s', 'x']]);
        await h.engine.processCanvasFile(h.canvasFile);
        expect(writtenFields(h.batched)).toEqual([]);
    });

    it('nota ↔ nota continua oferecendo a relação (o par não envolve tarefa)', async () => {
        const h = harness();
        activeCanvas(h, [['dfm-qs-zone', null], ['n1', NOTA_A], ['n2', NOTA_B]], [['n1', 'n2']]);
        notices.count = 0;
        await h.engine.processCanvasFile(h.canvasFile);
        expect(notices.count).toBe(1);
        // A relação nota↔nota vai para o aviso "Conexão de Notas" (gravada só no clique);
        // o lote das tarefas fica vazio, e nada de tarefa entra nele.
        expect(writtenFields(h.batched)).toEqual([]);
    });

    it('não roda a sincronização reversa num canvas gerido', async () => {
        const h = harness();
        activeCanvas(h, [['dfm-qs-zone', null], ['dfm-qs-a', SMART], ['dfm-qs-b', ACAO]], [['dfm-qs-a', 'dfm-qs-b']]);
        await h.engine.processCanvasFile(h.canvasFile);
        expect(h.reverse).not.toHaveBeenCalled();
    });

    it('seta SMART → ação apagada num canvas gerido não abre pergunta para desfazer campo', async () => {
        const h = harness();
        const canvas = activeCanvas(h, [['dfm-qs-zone', null], ['dfm-qs-a', SMART], ['dfm-qs-b', ACAO]], []);
        h.engine.acceptCanvasState(h.canvasFile.path, {
            nodes: [{ id: 'dfm-qs-a', type: 'file', file: SMART.path }, { id: 'dfm-qs-b', type: 'file', file: ACAO.path }],
            edges: [{ id: 'x', fromNode: 'dfm-qs-a', toNode: 'dfm-qs-b' }],
        });
        expect(canvas.edges.size).toBe(0);
        await expect(h.engine.processCanvasFile(h.canvasFile)).resolves.toBeUndefined();
        expect(h.engine.getPromptingCanvas()).toBeNull();
    });
});

describe('o mesmo motor num canvas solto (Fase 6)', () => {
    it('SMART → ação não grava blocking/blockedBy (quem liga a mãe é o observador de setas)', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        activeCanvas(h, [['n1', SMART], ['n2', ACAO]], [['n1', 'n2']]);
        await h.engine.processCanvasFile(h.canvasFile);
        expect(writtenFields(h.batched)).toEqual([]);
    });

    it('ação → semana, ação → dia e tarefa arquivada também não gravam nada pela tradução antiga', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        activeCanvas(h, [['a', ACAO], ['w', SEMANA], ['d', DIA], ['x', ARQUIVADA], ['s', SMART]],
            [['a', 'w'], ['d', 'a'], ['x', 's'], ['s', 'x']]);
        await h.engine.processCanvasFile(h.canvasFile);
        expect(writtenFields(h.batched)).toEqual([]);
    });

    it('a sincronização reversa ainda roda no canvas solto (ela mesma deixa as tarefas de fora)', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        activeCanvas(h, [['n1', NOTA_A], ['n2', NOTA_B]], []);
        await h.engine.processCanvasFile(h.canvasFile);
        expect(h.reverse).toHaveBeenCalled();
    });

    it('seta SMART → ação apagada não abre a pergunta de desfazer', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        activeCanvas(h, [['n1', SMART], ['n2', ACAO]], []);
        h.engine.acceptCanvasState(h.canvasFile.path, {
            nodes: [{ id: 'n1', type: 'file', file: SMART.path }, { id: 'n2', type: 'file', file: ACAO.path }],
            edges: [{ id: 'x', fromNode: 'n1', toNode: 'n2' }],
        });
        await expect(h.engine.processCanvasFile(h.canvasFile)).resolves.toBeUndefined();
        expect(h.engine.getPromptingCanvas()).toBeNull();
    });

    it('seta nota ↔ nota apagada ainda chega à pergunta de desfazer', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        activeCanvas(h, [['n1', NOTA_A], ['n2', NOTA_B]], []);
        h.engine.acceptCanvasState(h.canvasFile.path, {
            nodes: [{ id: 'n1', type: 'file', file: NOTA_A.path }, { id: 'n2', type: 'file', file: NOTA_B.path }],
            edges: [{ id: 'x', fromNode: 'n1', toNode: 'n2' }],
        });
        // O modal é carregado por `require` na hora; no teste, chegar a ele basta.
        const outcome = await (h.engine.processCanvasFile(h.canvasFile) as unknown as Promise<void>).then(() => 'resolveu', (e: Error) => String(e?.message ?? e));
        const reachedPrompt = h.engine.getPromptingCanvas() === h.canvasFile.path || /canvasModals|require/i.test(outcome);
        expect(reachedPrompt).toBe(true);
    });

    it('nota com relacoes para o canvas que nunca esteve nele não abre a pergunta "removeu nota(s)"', async () => {
        const h = harness('Areas/Canvas solto.canvas');
        const solta = file('Notas/Antiga.md');
        FM[solta.path] = { relacoes: ['[[Canvas solto]]'] };
        h.plugin.app.vault.getMarkdownFiles.mockReturnValue([solta]);
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => [...ALL, solta].find(f => f.path === p) ?? null);
        activeCanvas(h, [['n1', NOTA_A]], []);
        h.engine.acceptCanvasState(h.canvasFile.path, { nodes: [{ id: 'n1', type: 'file', file: NOTA_A.path }, { id: 'n2', type: 'file', file: NOTA_B.path }], edges: [] });
        await h.engine.processCanvasFile(h.canvasFile);
        expect(h.engine.getPromptingCanvas()).toBeNull();
        delete FM[solta.path];
    });
});

describe('o laço de 5 s só formata (Fase 6)', () => {
    function loopHarness() {
        const h = harness('Areas/Canvas solto.canvas');
        h.plugin.settings.canvasFormatOnModify = true;
        const mount = vi.fn();
        h.plugin.board = { taskCards: { mount }, tasks: { read: () => ({ type: 'task', status: 'next-action', basename: 'Gravar vídeo', projects: [] }), all: () => [] } };
        (globalThis as any).window = (globalThis as any).window ?? { moment: undefined };
        vi.spyOn(h.engine.syncManager, 'addCanvasToProject').mockResolvedValue(undefined);
        vi.spyOn(h.engine.syncManager, 'addCanvasToRelations').mockResolvedValue(undefined);
        const node = { id: 'n1', file: ACAO, x: 0, y: 0, width: 400, height: 150, color: '', setColor: vi.fn(function (this: any, c: string) { this.color = c; }), nodeEl: { classList: { toggle: vi.fn() } } };
        const canvas = { nodes: new Map([[node.id, node]]), edges: new Map(), requestSave: vi.fn() };
        h.plugin.app.workspace.getLeavesOfType.mockReturnValue([{ view: { file: h.canvasFile, canvas } }]);
        return { ...h, mount, node, canvas };
    }

    it('monta o cartão e recolore nas vistas abertas, sem apagar a linha de base do motor', () => {
        const h = loopHarness();
        const state = { nodes: [{ id: 'n1', type: 'file', file: ACAO.path }], edges: [] };
        h.engine.acceptCanvasState(h.canvasFile.path, state);
        const process = vi.spyOn(h.engine, 'processCanvasFile');
        expect(h.engine.formatOpenCanvases()).toBe(1);
        expect(h.mount).toHaveBeenCalledWith(h.node, ACAO);
        expect(h.node.setColor).toHaveBeenCalled();
        expect(h.canvas.requestSave).toHaveBeenCalledTimes(1);
        expect(process).not.toHaveBeenCalled();
        expect((h.engine as any).previousCanvasFiles.get(h.canvasFile.path)).toEqual(new Set([ACAO.path]));
    });

    it('na segunda volta, sem nada a mudar, o cartão continua sendo montado e o canvas não é salvo de novo', () => {
        const h = loopHarness();
        h.engine.formatOpenCanvases();
        h.canvas.requestSave.mockClear();
        h.mount.mockClear();
        expect(h.engine.formatOpenCanvases()).toBe(0);
        expect(h.mount).toHaveBeenCalledTimes(1);
        expect(h.canvas.requestSave).not.toHaveBeenCalled();
    });

    it('o laço não traduz setas nem abre pergunta: só o processamento por mudança faz isso', () => {
        const h = loopHarness();
        h.canvas.edges = new Map([['e', { from: { node: { file: SMART } }, to: { node: { file: ACAO } } }]]) as any;
        h.engine.formatOpenCanvases();
        expect(h.batched).not.toHaveBeenCalled();
        expect(h.reverse).not.toHaveBeenCalled();
        expect(h.engine.getPromptingCanvas()).toBeNull();
    });
});

describe('formatador num nó gerido', () => {
    function formatterHarness() {
        const h = harness();
        const relations = vi.spyOn(h.engine.syncManager, 'addCanvasToProject').mockResolvedValue(undefined);
        const noteRelations = vi.spyOn(h.engine.syncManager, 'addCanvasToRelations').mockResolvedValue(undefined);
        h.plugin.board = { tasks: { read: () => ({ type: 'task', status: 'done', basename: 'Gravar vídeo', projects: [] }), all: () => [] } };
        (globalThis as any).window = (globalThis as any).window ?? { moment: undefined };
        return { ...h, relations, noteRelations };
    }

    const node = (id: string, f: any, extra: Record<string, unknown> = {}) => ({
        id, file: f, x: 0, y: 0, width: 380, height: 112, color: '6', setColor: vi.fn(), ...extra,
    });

    it('não recolore, não redimensiona e não grava relacoes', () => {
        const h = formatterHarness();
        const n = node('dfm-qs-abc', ACAO);
        const canvas = { nodes: new Map([[n.id, n]]), removeNode: vi.fn(), createFileNode: vi.fn() };
        const modified = h.engine.formatNode(canvas, n, h.canvasFile);
        expect(modified).toBe(false);
        expect(n.setColor).not.toHaveBeenCalled();
        expect(n.color).toBe('6');
        expect(h.relations).not.toHaveBeenCalled();
    });

    it('nota comum num nó gerido também não ganha relacoes', () => {
        const h = formatterHarness();
        const n = node('dfm-qs-day', DIA);
        h.engine.formatNode({ nodes: new Map([[n.id, n]]) }, n, h.canvasFile);
        const n2 = node('dfm-qs-nota', NOTA_A);
        h.engine.formatNode({ nodes: new Map([[n2.id, n2]]) }, n2, h.canvasFile);
        expect(h.noteRelations).not.toHaveBeenCalled();
        expect(h.relations).not.toHaveBeenCalled();
    });

    it('texto "[[tarefa]]" num nó gerido não vira nó de arquivo', () => {
        const h = formatterHarness();
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === 'Gravar vídeo' || p === 'Gravar vídeo.md' ? ACAO : null));
        const n = { id: 'dfm-qs-label', text: '[[Gravar vídeo]]', x: 0, y: 0, width: 300, height: 60 };
        const canvas = { nodes: new Map([[n.id, n]]), removeNode: vi.fn(), createFileNode: vi.fn() };
        h.engine.formatNode(canvas, n, h.canvasFile);
        expect(canvas.removeNode).not.toHaveBeenCalled();
        expect(canvas.createFileNode).not.toHaveBeenCalled();
    });

    it('tarefa posta fora da zona num canvas gerido é recolorida, mas não ganha relacoes: [[2026-Q4]]', () => {
        const h = formatterHarness();
        const n = node('meu-no', ACAO, { width: 400, height: 150 });
        const zona = node('dfm-qs-zone', null);
        h.engine.formatNode({ nodes: new Map([[zona.id, zona], [n.id, n]]) }, n, h.canvasFile);
        expect(n.setColor).toHaveBeenCalled();
        expect(h.relations).not.toHaveBeenCalled();
    });

    it('texto "[[tarefa]]" fora da zona num canvas gerido vira nó de arquivo, sem relacoes', () => {
        const h = formatterHarness();
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === 'Gravar vídeo' || p === 'Gravar vídeo.md' ? ACAO : null));
        const n = { id: 'meu-texto', text: '[[Gravar vídeo]]', x: 0, y: 0, width: 300, height: 60 };
        const zona = { id: 'dfm-qs-zone' };
        const canvas = { nodes: new Map<string, any>([[zona.id, zona], [n.id, n]]), removeNode: vi.fn(), createFileNode: vi.fn() };
        h.engine.formatNode(canvas, n, h.canvasFile);
        expect(canvas.createFileNode).toHaveBeenCalled();
        expect(h.relations).not.toHaveBeenCalled();
    });

    it('controle: o mesmo nó num canvas solto é recolorido e ganha relacoes', () => {
        const h = formatterHarness();
        const solto = file('Areas/Canvas solto.canvas');
        const n = node('meu-no', ACAO, { width: 400, height: 150 });
        h.engine.formatNode({ nodes: new Map([[n.id, n]]) }, n, solto);
        expect(n.setColor).toHaveBeenCalled();
        expect(h.relations).toHaveBeenCalled();
    });
});

// A tarefa criada num canvas de semana ou de trimestre (com a `week` dele) saiu em 03/11/2026 com os canvas
// da semana e do trimestre (código aposentado); fica o canvas solto.
describe('tarefa criada num canvas', () => {
    function creationHarness(canvasPath: string) {
        const h = harness(canvasPath);
        const created = file('TaskNotes/Tasks/Nova.md');
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === created.path ? created : null));
        const fm: Record<string, any> = {};
        h.plugin.app.fileManager.processFrontMatter = vi.fn(async (_f: any, fn: any) => fn(fm));
        const addProject = vi.fn().mockResolvedValue(undefined);
        h.plugin.app.plugins.plugins.tasknotes = { openTaskCreationModal: vi.fn(), api: { tasks: { addProject } } };
        const view = { file: h.canvasFile, canvas: { createFileNode: vi.fn(), nodes: new Map(), x: 0, y: 0, zoom: 1, containerEl: { clientWidth: 800, clientHeight: 600 } } };
        return { ...h, created, fm, addProject, view };
    }

    it('controle: num canvas solto o comportamento antigo segue (nó e projeto pelo nome do canvas)', async () => {
        const h = creationHarness('Areas/Pesquisa.canvas');
        await h.engine.createTaskNote(h.view, { x: 10, y: 10 });
        h.engine.handleTaskCreatedEvent({ taskPath: h.created.path });
        await Promise.resolve();
        expect(h.view.canvas.createFileNode).toHaveBeenCalled();
        expect(h.addProject).toHaveBeenCalledWith(h.created.path, '[[Pesquisa]]');
        expect(h.fm.projects).toEqual(['[[Pesquisa]]']);
    });
});

describe('Árvore de Progressão com o canvas aberto', () => {
    const tree: any = { tiers: [], file: { parent: { path: 'P/Venda' } }, projectLink: 'Venda' };
    const arvore = 'P/Venda/Venda — Árvore.canvas';

    it('não regrava o canvas aberto numa aba; registra e sai', async () => {
        const h = harness();
        const existing = file(arvore);
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === arvore ? existing : null));
        h.plugin.app.workspace.getLeavesOfType.mockReturnValue([{ view: { file: { path: arvore } } }]);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await h.engine.syncManager.generateArvoreCanvas(tree);
        expect(h.plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(h.plugin.app.vault.create).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('controle: com a aba fechada, regrava', async () => {
        const h = harness();
        const existing = file(arvore);
        h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => (p === arvore ? existing : null));
        await h.engine.syncManager.generateArvoreCanvas(tree);
        expect(h.plugin.app.vault.modify).toHaveBeenCalledTimes(1);
    });
});

describe('perguntas de desfazer no canvas solto', () => {
    /** Modal falso: guarda a mensagem e os retornos; quem responde é o teste. */
    function modalSpy(h: ReturnType<typeof harness>) {
        const opened: Array<{ message: string; onConfirm: () => any; onCancel: () => any }> = [];
        class FakeConfirm {
            constructor(_app: any, public message: string, public onConfirm: () => any, public onCancel: () => any) {}
            open() { opened.push(this); }
        }
        vi.spyOn(h.engine as any, 'loadConfirmModal').mockReturnValue(FakeConfirm);
        return opened;
    }

    it('seta e nota removidas juntas: cada pergunta abre uma vez só, a da seta e depois a da nota', async () => {
        vi.useFakeTimers();
        try {
            const h = harness('Areas/Canvas solto.canvas');
            const saiu = file('Notas/Saiu.md');
            FM[saiu.path] = { relacoes: ['[[Canvas solto]]'] };
            h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => [...ALL, saiu].find(f => f.path === p) ?? null);
            const opened = modalSpy(h);
            activeCanvas(h, [['n1', NOTA_A], ['n2', NOTA_B]], []);
            h.engine.acceptCanvasState(h.canvasFile.path, {
                nodes: [
                    { id: 'n1', type: 'file', file: NOTA_A.path },
                    { id: 'n2', type: 'file', file: NOTA_B.path },
                    { id: 'n3', type: 'file', file: saiu.path },
                ],
                edges: [{ id: 'x', fromNode: 'n1', toNode: 'n2' }],
            });
            await h.engine.processCanvasFile(h.canvasFile);
            expect(opened.map(m => m.message)).toEqual([expect.stringMatching(/removeu 1 conexões de seta/)]);

            await opened[0].onCancel();
            await vi.advanceTimersByTimeAsync(400);
            expect(opened.map(m => m.message)).toEqual([
                expect.stringMatching(/removeu 1 conexões de seta/),
                expect.stringMatching(/removeu 1 nota\(s\) do Canvas/),
            ]);

            await opened[1].onConfirm();
            await vi.advanceTimersByTimeAsync(1000);
            expect(opened).toHaveLength(2);
            expect(h.engine.getPromptingCanvas()).toBeNull();
            delete FM[saiu.path];
        } finally {
            vi.useRealTimers();
        }
    });

    it('responder "sim" à pergunta da seta também não a reabre', async () => {
        vi.useFakeTimers();
        try {
            const h = harness('Areas/Canvas solto.canvas');
            const saiu = file('Notas/Saiu.md');
            FM[saiu.path] = { relacoes: ['[[Canvas solto]]'] };
            h.plugin.app.vault.getAbstractFileByPath.mockImplementation((p: string) => [...ALL, saiu].find(f => f.path === p) ?? null);
            const opened = modalSpy(h);
            activeCanvas(h, [['n1', NOTA_A], ['n2', NOTA_B]], []);
            h.engine.acceptCanvasState(h.canvasFile.path, {
                nodes: [
                    { id: 'n1', type: 'file', file: NOTA_A.path },
                    { id: 'n2', type: 'file', file: NOTA_B.path },
                    { id: 'n3', type: 'file', file: saiu.path },
                ],
                edges: [{ id: 'x', fromNode: 'n1', toNode: 'n2' }],
            });
            await h.engine.processCanvasFile(h.canvasFile);
            await opened[0].onConfirm();
            await vi.advanceTimersByTimeAsync(400);
            await opened[1]?.onCancel();
            await vi.advanceTimersByTimeAsync(1000);
            expect(opened.map(m => /seta/.test(m.message) ? 'seta' : 'nota')).toEqual(['seta', 'nota']);
            delete FM[saiu.path];
        } finally {
            vi.useRealTimers();
        }
    });
});
