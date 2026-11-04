import { describe, expect, it, vi } from 'vitest';

/**
 * No iPhone o canvas só lê (arquitetura universal 4.7; a trava do celular de 14/10).
 * O laço de 5 s do motor (`formatOpenCanvases`) e o caminho do `modify` gravavam o
 * canvas solto aberto no celular: recoloriam e redimensionavam os nós, trocavam o nó
 * de texto `[[tarefa]]` por um nó de arquivo e gravavam `relacoes` nas notas. Aqui,
 * com `Platform.isMobile`, só o cartão é montado, e nada é regravado. Falha sem a guarda.
 */
const { state } = vi.hoisted(() => ({ state: { notices: 0 } }));

vi.mock('obsidian', () => ({
    TFile: class { path = ''; basename = ''; extension = 'md'; },
    TFolder: class {},
    Notice: class { constructor() { state.notices++; } noticeEl = { empty() {}, style: {}, createEl: () => ({ addEventListener() {} }), createDiv: () => ({ createEl: () => ({ addEventListener() {} }) }) }; hide() {} },
    debounce: (fn: any) => fn,
    Modal: class { open() {} close() {} },
    App: class {},
    Platform: { isMobile: true },
    Keymap: {},
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

const TAREFA = file('TaskNotes/Tasks/Gravar vídeo.md');
const NOTA_A = file('Notas/A.md');
const NOTA_B = file('Notas/B.md');
const ALL = [TAREFA, NOTA_A, NOTA_B];
const FM: Record<string, any> = { [TAREFA.path]: { type: 'task', status: 'in-progress', priority: 'high' }, [NOTA_A.path]: {}, [NOTA_B.path]: {} };

function harness() {
    const canvasFile = file('Projetos/Solto.canvas');
    const mount = vi.fn();
    const plugin: any = {
        app: {
            workspace: { layoutReady: true, activeLeaf: null as any, getLeavesOfType: vi.fn(() => [] as any[]) },
            vault: {
                getAbstractFileByPath: vi.fn((p: string) => ALL.find(f => f.path === p) ?? null),
                getMarkdownFiles: vi.fn(() => ALL),
                on: vi.fn(),
            },
            metadataCache: { getFileCache: vi.fn((f: any) => ({ frontmatter: FM[f.path] ?? {} })) },
            fileManager: { processFrontMatter: vi.fn(async () => undefined) },
            plugins: { plugins: {} },
        },
        settings: { canvasFormatOnModify: true, canvasSyncOnModify: true, canvasDeletePromptsEnabled: true, canvasNoteRelationsEnabled: true },
        board: { taskCards: { mount } },
        registerEvent: vi.fn(),
        registerDomEvent: vi.fn(),
    };
    const engine = new CanvasEngine(plugin);
    const relations = vi.spyOn(engine.syncManager, 'addCanvasToProject').mockResolvedValue(undefined as any);
    const noteRelations = vi.spyOn(engine.syncManager, 'addCanvasToRelations').mockResolvedValue(undefined as any);
    const batched = vi.spyOn(engine.syncManager, 'applyBatchedUpdates').mockResolvedValue(undefined);
    return { plugin, engine, canvasFile, mount, relations, noteRelations, batched };
}

function canvasWith(nodes: any[], edges: Array<[string, string]> = []) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    return {
        nodes: byId,
        edges: new Map(edges.map(([a, b], i) => [`e${i}`, { from: { node: byId.get(a) }, to: { node: byId.get(b) } }])),
        requestSave: vi.fn(),
        removeNode: vi.fn(),
        createFileNode: vi.fn(),
        getData: () => ({ nodes: [], edges: [] }),
    };
}

describe('no celular, o motor de canvas só lê', () => {
    it('o laço de 5 s monta o cartão e não recolore, não redimensiona, não converte nem grava', () => {
        const h = harness();
        const taskNode = { id: 'n1', file: TAREFA, nodeEl: { classList: { toggle: vi.fn() } }, color: '', width: 250, height: 60, x: 0, y: 0, setColor: vi.fn(), moveAndResize: vi.fn() };
        const textNode = { id: 'n2', text: '[[Gravar vídeo]]', x: 0, y: 200 };
        const noteNode = { id: 'n3', file: NOTA_A, x: 0, y: 400 };
        const canvas = canvasWith([taskNode, textNode, noteNode]);
        h.plugin.app.workspace.getLeavesOfType = vi.fn(() => [{ view: { canvas, file: h.canvasFile } }]);

        expect(h.engine.formatOpenCanvases()).toBe(0);
        expect(canvas.requestSave).not.toHaveBeenCalled();
        expect(taskNode.setColor).not.toHaveBeenCalled();
        expect(taskNode.moveAndResize).not.toHaveBeenCalled();
        expect(canvas.removeNode).not.toHaveBeenCalled();
        expect(canvas.createFileNode).not.toHaveBeenCalled();
        expect(h.relations).not.toHaveBeenCalled();
        expect(h.noteRelations).not.toHaveBeenCalled();
        expect(h.mount).toHaveBeenCalledWith(taskNode, TAREFA);
    });

    it('o modify do canvas no celular: seta nova não vira campo, nenhuma pergunta abre, nada é regravado', async () => {
        const h = harness();
        const a = { id: 'a', file: NOTA_A };
        const b = { id: 'b', file: NOTA_B };
        const canvas = canvasWith([a, b], [['a', 'b']]);
        h.plugin.app.workspace.activeLeaf = { view: { getViewType: () => 'canvas', file: h.canvasFile, canvas } };
        state.notices = 0;
        await h.engine.processCanvasFile(h.canvasFile);
        expect(state.notices).toBe(0);
        expect(h.batched).not.toHaveBeenCalled();
        expect(canvas.requestSave).not.toHaveBeenCalled();
        expect(h.noteRelations).not.toHaveBeenCalled();
    });
});
