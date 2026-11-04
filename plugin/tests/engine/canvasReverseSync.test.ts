import { describe, expect, it, vi } from 'vitest';

/**
 * Sincronização reversa (vínculo nos metadados sem seta no canvas), Fase 6 do
 * plano do canvas (15/10/2026):
 * - tarefa não entra, nem como origem nem como destino: a relação de tarefa é da
 *   seta (`canvas/edgeLinks.ts`), e o "Importar ausentes" voltava em ciclo para
 *   `blocking`/`blockedBy`/`projects`;
 * - nota↔nota continua (`relatesTo`);
 * - com o canvas aberto, a gravação vai pela vista (`applyCanvasPlan`), nunca
 *   por `vault.modify`.
 */
const { modals, notices } = vi.hoisted(() => ({ modals: [] as any[], notices: [] as string[] }));

vi.mock('obsidian', () => ({
    TFile: class { path = ''; basename = ''; extension = 'md'; },
    TFolder: class {},
    Notice: class {
        noticeEl = { empty() {}, style: {}, createEl: () => ({ addEventListener() {} }), addEventListener() {} };
        constructor(text?: string) { notices.push(String(text ?? '')); }
        hide() {}
    },
    debounce: (fn: any) => fn,
    Modal: class { app: any; constructor(app: any) { this.app = app; } open() {} close() {} },
    App: class {},
    Platform: { isMobile: false },
    Keymap: { isModEvent: () => false },
}));

vi.mock('../../src/engine/canvasengine/canvasModals', () => ({
    ConfirmModal: class { constructor(..._args: any[]) {} open() {} },
    CanvasDependencyModal: class {
        constructor(_app: any, public message: string, public options: Array<{ label: string; callback: () => any }>) { modals.push(this); }
        open() {}
    },
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

const CANVAS = file('Areas/Canvas solto.canvas');
const SMART = file('TaskNotes/Tasks/Vender 3 cursos (W42).md');
const ACAO = file('TaskNotes/Tasks/Gravar vídeo.md');
const ACAO_FORA = file('TaskNotes/Tasks/Editar vídeo.md');
const NOTA_A = file('Notas/A.md');
const NOTA_B = file('Notas/B.md');
const NOTA_C = file('Notas/C.md');
const ALL = [CANVAS, SMART, ACAO, ACAO_FORA, NOTA_A, NOTA_B, NOTA_C];
const FM: Record<string, any> = {
    [SMART.path]: { type: 'tarefa_smart', status: 'next-action', blocking: ['[[Gravar vídeo]]', '[[Editar vídeo]]'] },
    [ACAO.path]: { type: 'task', status: 'next-action', projects: ['[[Vender 3 cursos (W42)]]'], blockedBy: ['[[Vender 3 cursos (W42)]]'] },
    [ACAO_FORA.path]: { type: 'task', status: 'next-action' },
    [NOTA_A.path]: { relatesTo: ['[[B]]', '[[C]]'] },
    [NOTA_B.path]: {},
    [NOTA_C.path]: {},
};

function harness(opts: { openView?: boolean } = {}) {
    modals.length = 0;
    notices.length = 0;
    const plugin: any = {
        app: {
            workspace: { layoutReady: true, activeLeaf: null, getLeavesOfType: vi.fn(() => []) },
            vault: {
                getAbstractFileByPath: vi.fn((p: string) => ALL.find(f => f.path === p) ?? null),
                getMarkdownFiles: vi.fn(() => ALL.filter(f => f.extension === 'md')),
                on: vi.fn(),
                modify: vi.fn(),
                read: vi.fn(async () => JSON.stringify(disk)),
                process: vi.fn(async (_f: any, fn: (raw: string) => string) => { disk = JSON.parse(fn(JSON.stringify(disk))); }),
            },
            metadataCache: { getFileCache: vi.fn((f: any) => ({ frontmatter: FM[f.path] ?? {} })) },
            fileManager: { processFrontMatter: vi.fn() },
            plugins: { plugins: {} },
        },
        settings: { canvasFormatOnModify: false, canvasSyncOnModify: true, canvasDeletePromptsEnabled: true, canvasNoteRelationsEnabled: true },
        registerEvent: vi.fn(),
        registerDomEvent: vi.fn(),
    };
    let disk: any = { nodes: [], edges: [] };
    const engine = new CanvasEngine(plugin);
    let live: any = null;
    const canvas: any = {
        nodes: new Map(),
        getData: () => JSON.parse(JSON.stringify(live)),
        setData: vi.fn((d: any) => { live = JSON.parse(JSON.stringify(d)); }),
        requestSave: vi.fn(),
        canvasEl: { classList: { contains: () => false } },
    };
    const setCanvas = (data: any) => {
        disk = JSON.parse(JSON.stringify(data));
        live = JSON.parse(JSON.stringify(data));
        canvas.nodes = new Map(data.nodes.map((n: any) => [n.id, n]));
        if (opts.openView) plugin.app.workspace.getLeavesOfType.mockReturnValue([{ view: { file: CANVAS, canvas } }]);
    };
    return { plugin, engine, canvas, setCanvas, getDisk: () => disk, getLive: () => live };
}

const node = (id: string, f: any, x = 0) => ({ id, type: 'file', file: f.path, x, y: 0, width: 400, height: 150 });

describe('sincronização reversa (Fase 6)', () => {
    it('canvas só com tarefas (blocking, blockedBy, projects nos metadados): nada a pedir', async () => {
        const h = harness();
        const data = { nodes: [node('s', SMART), node('a', ACAO, 500)], edges: [] };
        h.setCanvas(data);
        await h.engine.checkAndPromptReverseSync(CANVAS, data, true);
        expect(modals).toHaveLength(0);
        expect(notices).toContain('✅ Nenhuma inconsistência de dependências encontrada no Canvas!');
        expect(h.engine.getPromptingCanvas()).toBeNull();
    });

    it('nota que aponta tarefa, ou tarefa que aponta nota: também não', async () => {
        const h = harness();
        FM[NOTA_B.path] = { relatesTo: ['[[Gravar vídeo]]'] };
        const data = { nodes: [node('b', NOTA_B), node('a', ACAO, 500)], edges: [] };
        h.setCanvas(data);
        await h.engine.checkAndPromptReverseSync(CANVAS, data, true);
        FM[NOTA_B.path] = {};
        expect(modals).toHaveLength(0);
    });

    it('nota ↔ nota continua: oferece a seta que falta e o nó ausente', async () => {
        const h = harness();
        const data = { nodes: [node('na', NOTA_A), node('nb', NOTA_B, 500)], edges: [] };
        h.setCanvas(data);
        await h.engine.checkAndPromptReverseSync(CANVAS, data, true);
        expect(modals).toHaveLength(1);
        expect(modals[0].message).toMatch(/1 conexões.*1 tarefas dependentes/);
    });

    it('canvas aberto: a resposta grava pela vista (setData), nunca por vault.modify', async () => {
        const h = harness({ openView: true });
        const data = { nodes: [node('na', NOTA_A), node('nb', NOTA_B, 500)], edges: [] };
        h.setCanvas(data);
        await h.engine.checkAndPromptReverseSync(CANVAS, data, true);
        await modals[0].options.find((o: any) => /Importar ausentes/.test(o.label)).callback();
        expect(h.plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(h.plugin.app.vault.process).not.toHaveBeenCalled();
        expect(h.canvas.setData).toHaveBeenCalledTimes(1);
        expect(h.canvas.requestSave).toHaveBeenCalled();
        const live = h.getLive();
        expect(live.nodes.map((n: any) => n.file)).toEqual([NOTA_A.path, NOTA_B.path, NOTA_C.path]);
        expect(live.edges.map((e: any) => `${e.fromNode}>${e.toNode}`)).toContain('na>nb');
        expect(h.engine.getPromptingCanvas()).toBeNull();
    });

    it('canvas fechado: grava pelo arquivo (vault.process), não por vault.modify', async () => {
        const h = harness();
        const data = { nodes: [node('na', NOTA_A), node('nb', NOTA_B, 500)], edges: [] };
        h.setCanvas(data);
        await h.engine.checkAndPromptReverseSync(CANVAS, data, true);
        await modals[0].options.find((o: any) => /Apenas conectar/.test(o.label)).callback();
        expect(h.plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(h.plugin.app.vault.process).toHaveBeenCalledTimes(1);
        expect(h.getDisk().edges.map((e: any) => `${e.fromNode}>${e.toNode}`)).toEqual(['na>nb']);
    });
});
