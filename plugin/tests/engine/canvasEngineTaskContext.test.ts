import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        TFile: class {
            path = '';
            basename = '';
            extension = 'md';
        },
        TFolder: class {},
        Notice: class {},
        debounce: (fn: any) => fn,
        App: class {},
        Modal: class {
            app: any;
            constructor(app: any) { this.app = app; }
            open() {}
            close() {}
        },
    };
});

import { TFile } from 'obsidian';
import { CanvasEngine } from '../../src/engine/canvasengine/canvasEngine';

function mockPlugin() {
    const processFrontMatterMock = vi.fn(async (file, callback) => {
        const fm = (file as any).frontmatter || {};
        callback(fm);
        (file as any).frontmatter = fm;
    });

    const addProjectMock = vi.fn().mockResolvedValue(undefined);

    const plugin = {
        app: {
            workspace: {
                layoutReady: true,
                activeLeaf: null,
            },
            vault: {
                getAbstractFileByPath: vi.fn((path: string) => {
                    const f = new (TFile as any)();
                    f.path = path;
                    f.basename = path.split('/').pop()?.replace('.md', '') ?? '';
                    f.extension = 'md';
                    (f as any).frontmatter = {};
                    return f;
                }),
                on: vi.fn(),
            },
            fileManager: {
                processFrontMatter: processFrontMatterMock,
            },
            commands: {
                executeCommandById: vi.fn(),
            },
            plugins: {
                plugins: {
                    tasknotes: {
                        openTaskCreationModal: vi.fn(),
                        api: {
                            tasks: {
                                addProject: addProjectMock,
                            },
                        },
                    },
                },
            },
        },
        registerEvent: vi.fn(),
        registerDomEvent: vi.fn(),
        settings: {},
    };

    return { plugin, processFrontMatterMock, addProjectMock };
}

describe('CanvasEngine — A5 / O1 Contextual Task Creation & Interception', () => {
    it('createTaskNote armazena pendingCanvasInsertion com contexto canônico do projeto', async () => {
        const { plugin } = mockPlugin();
        const engine = new CanvasEngine(plugin as any);

        const fakeView = {
            file: { path: 'Area.canvas', basename: 'Area' },
            canvas: {
                nodes: new Map(),
                containerEl: { clientWidth: 1000, clientHeight: 800 },
                zoom: 1,
                x: 0,
                y: 0,
            },
        };

        const context = {
            projectName: 'Projeto Alfa',
            projectPath: '100 - AREAS/Area1/Projeto Alfa',
            canonicalWikilink: '[[100 - AREAS/Area1/Projeto Alfa/Projeto Alfa|Projeto Alfa]]',
        };

        await engine.createTaskNote(fakeView, { x: 120, y: 340 }, context);

        const pending = engine.getPendingCanvasInsertion();
        expect(pending).not.toBeNull();
        expect(pending?.pos).toEqual({ x: 120, y: 340 });
        expect(pending?.context).toEqual(context);
        expect(plugin.app.plugins.plugins.tasknotes.openTaskCreationModal).toHaveBeenCalledTimes(1);
    });

    it('clearPendingInsertion anula pendingCanvasInsertion sem deixar estado contaminado', async () => {
        const { plugin } = mockPlugin();
        const engine = new CanvasEngine(plugin as any);

        await engine.createTaskNote({} as any, { x: 0, y: 0 }, { projectName: 'Cancelado' });
        expect(engine.getPendingCanvasInsertion()).not.toBeNull();

        engine.clearPendingInsertion();
        expect(engine.getPendingCanvasInsertion()).toBeNull();
    });

    it('handleTaskCreatedEvent insere nó no canvas e associa projeto canônico', async () => {
        const { plugin, processFrontMatterMock, addProjectMock } = mockPlugin();
        const engine = new CanvasEngine(plugin as any);

        const createFileNodeMock = vi.fn();
        const fakeView = {
            file: { path: 'Area.canvas', basename: 'Area' },
            canvas: {
                createFileNode: createFileNodeMock,
            },
        };

        const context = {
            projectName: 'Projeto Beta',
            projectPath: '100 - AREAS/Area2/Projeto Beta',
            canonicalWikilink: '[[100 - AREAS/Area2/Projeto Beta/000 - INDEX/Projeto Beta|Projeto Beta]]',
        };

        await engine.createTaskNote(fakeView, { x: 200, y: 400 }, context);

        // Dispara o evento de criação da tarefa no vault
        const taskPath = 'TaskNotes/Tasks/2026-09-16 - Nova Tarefa Beta.md';
        engine.handleTaskCreatedEvent({ taskPath });

        // Verifica inserção do arquivo no canvas
        expect(createFileNodeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                pos: { x: 200, y: 400 },
                size: { width: 400, height: 150 },
            })
        );

        // Verifica que o TaskNotes API addProject foi chamado com o wikilink canônico
        expect(addProjectMock).toHaveBeenCalledWith(taskPath, context.canonicalWikilink);

        // Verifica que o frontmatter foi atualizado defensivamente com o wikilink
        expect(processFrontMatterMock).toHaveBeenCalled();

        // Verifica que a inserção pendente foi consumida
        expect(engine.getPendingCanvasInsertion()).toBeNull();
    });
});
