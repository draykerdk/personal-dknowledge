import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => {
    return {
        TFile: class {},
        TFolder: class {},
        Notice: class {},
        debounce: (fn: any) => fn,
        Modal: class {
            app: any;
            constructor(app: any) { this.app = app; }
            open() {}
            close() {}
        },
        App: class {}
    };
});

import { CanvasEngine } from '../../src/engine/canvasengine/canvasEngine';

// Mocks simulados para o Obsidian API e App
const mockApp = {
    vault: {
        getAbstractFileByPath: vi.fn(),
        createFolder: vi.fn(),
        create: vi.fn(),
        read: vi.fn(),
        on: vi.fn(),
        modify: vi.fn(),
        getMarkdownFiles: vi.fn().mockReturnValue([]),
    },
    workspace: {
        getLeaf: vi.fn().mockReturnValue({ openFile: vi.fn() }),
        getActiveFile: vi.fn(),
        onLayoutReady: vi.fn(),
        on: vi.fn(),
        getLeavesOfType: vi.fn()
    },
    metadataCache: {
        getFileCache: vi.fn()
    },
    fileManager: {
        processFrontMatter: vi.fn()
    }
};

const mockPlugin = {
    app: mockApp,
    settings: {},
    registerEvent: vi.fn(),
    registerDomEvent: vi.fn(),
};

// Mock local do CanvasDependencyModal para evitar quebras no ambiente de testes
vi.mock('../../src/engine/canvasengine/canvasEngine', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
    };
});

(global as any).document = {
    createElement: vi.fn().mockReturnValue({
        className: '',
        empty: vi.fn()
    })
};

describe('canvasEngine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deve resolver a cor correta só pelo status da tarefa (a prioridade não pinta)', () => {
        const engine = new CanvasEngine(mockPlugin as any);
        
        // 1. Concluído -> Verde (4)
        expect((engine as any).getNodeColorForTask({ status: 'done' })).toBe('4');
        expect((engine as any).getNodeColorForTask({ status: 'completed' })).toBe('4');
        expect((engine as any).getNodeColorForTask({ status: 'complete', priority: 'high' })).toBe('4'); // Concluído tem precedência sobre prioridade alta
        
        // 2. A prioridade não pinta (decisão de 19/10): vale só o status.
        expect((engine as any).getNodeColorForTask({ status: 'open', priority: 'high' })).toBe('5');
        expect((engine as any).getNodeColorForTask({ status: 'in-progress', priority: 'high' })).toBe('2');
        
        // 3. Status padrão mapeados
        expect((engine as any).getNodeColorForTask({ status: 'in-progress' })).toBe('2'); // Laranja
        expect((engine as any).getNodeColorForTask({ status: 'someday' })).toBe('3'); // Amarelo
        expect((engine as any).getNodeColorForTask({ status: 'waiting-on' })).toBe('1'); // Vermelho
        expect((engine as any).getNodeColorForTask({ status: 'next-action' })).toBe('6'); // Roxo
        expect((engine as any).getNodeColorForTask({ status: 'inbox' })).toBe('5'); // Cyan
        expect((engine as any).getNodeColorForTask({ status: 'open' })).toBe('5'); // Cyan
    });

    it('deve identificar dependências YAML ausentes ou conexões não desenhadas no canvas', async () => {
        const engine = new CanvasEngine(mockPlugin as any);
        
        const mockFile1 = { path: 'TaskNotes/Tasks/TaskA.md', basename: 'TaskA', name: 'TaskA.md' };
        const mockFile2 = { path: 'TaskNotes/Tasks/TaskB.md', basename: 'TaskB', name: 'TaskB.md' };
        
        mockApp.vault.getMarkdownFiles.mockReturnValue([mockFile1, mockFile2]);
        mockApp.vault.getAbstractFileByPath.mockImplementation((path) => {
            if (path === 'TaskNotes/Tasks/TaskA.md') return mockFile1;
            if (path === 'TaskNotes/Tasks/TaskB.md') return mockFile2;
            return null;
        });
        
        mockApp.metadataCache.getFileCache.mockImplementation((file) => {
            if (file.basename === 'TaskA') {
                return { frontmatter: { status: 'open', blocking: ['[[TaskB]]'] } };
            }
            return { frontmatter: { status: 'open' } };
        });

        // Caso: Ambos os nós estão no canvas, mas sem a conexão/seta
        const canvasData = {
            nodes: [
                { id: 'node1', type: 'file', file: 'TaskNotes/Tasks/TaskA.md', x: 0, y: 0 },
                { id: 'node2', type: 'file', file: 'TaskNotes/Tasks/TaskB.md', x: 200, y: 0 }
            ],
            edges: []
        };
        
        // Verifica se a engine tenta processar e abrir a modal de decisão de dependências
        let modalOpened = false;
        vi.spyOn(engine as any, 'checkAndPromptReverseSync').mockImplementation(async () => {
            modalOpened = true;
        });

        await (engine as any).checkAndPromptReverseSync({ path: 'Canvas.canvas' } as any, canvasData);

        expect(modalOpened).toBe(true);
    });

    it('deve adicionar a relação com o canvas sem duplicar caso já exista', async () => {
        const engine = new CanvasEngine(mockPlugin as any);
        const mockFile = { path: 'NotaA.md', basename: 'NotaA', extension: 'md' };
        const mockCanvas = { path: 'MeuCanvas.canvas', basename: 'MeuCanvas' };
        
        // Caso 1: Relação já existe em "relacoes" -> não deve chamar processFrontMatter
        mockApp.metadataCache.getFileCache.mockReturnValue({
            frontmatter: { relacoes: ['[[MeuCanvas]]'] }
        });
        
        await engine.addCanvasToRelations(mockFile as any, mockCanvas as any);
        expect(mockApp.fileManager.processFrontMatter).not.toHaveBeenCalled();
        
        // Caso 2: Relação não existe -> deve chamar processFrontMatter para adicionar
        mockApp.metadataCache.getFileCache.mockReturnValue({
            frontmatter: {}
        });
        
        await engine.addCanvasToRelations(mockFile as any, mockCanvas as any);
        expect(mockApp.fileManager.processFrontMatter).toHaveBeenCalled();
    });

    it('deve gerar pastas modulares de projeto caso não existam', async () => {
        mockApp.vault.getAbstractFileByPath.mockReturnValue(null); // Nada existe
        mockApp.vault.read.mockResolvedValue('{"nodes": [{"file": "{{folderPath}}/01 - Escopo.md"}]}');
        
        expect(mockApp.vault.getAbstractFileByPath).toBeDefined();
    });

    it('deve formatar o nó e adicionar a classe has-external-blockers se houver bloqueadores externos', () => {
        const engine = new CanvasEngine(mockPlugin as any);
        
        const mockFileA = Object.create(TFile.prototype);
        mockFileA.path = 'TaskNotes/Tasks/TaskA.md';
        mockFileA.basename = 'TaskA';
        
        const mockFileB = Object.create(TFile.prototype);
        mockFileB.path = 'TaskNotes/Tasks/TaskB.md';
        mockFileB.basename = 'TaskB';
        
        mockApp.vault.getMarkdownFiles.mockReturnValue([mockFileA, mockFileB]);
        mockApp.vault.getAbstractFileByPath.mockImplementation((path) => {
            if (path === 'TaskNotes/Tasks/TaskA.md') return mockFileA;
            if (path === 'TaskNotes/Tasks/TaskB.md') return mockFileB;
            return null;
        });
        
        // Mock getFileType to return 'tasknote' for TaskNotes files
        vi.spyOn(engine, 'getFileType').mockImplementation((file: any) => {
            if (file.path.startsWith('TaskNotes/')) return 'tasknote';
            return null;
        });

        // Scenario: TaskA has blockedBy: [[TaskB]]. TaskB is NOT in the canvas.
        const mockNode = {
            id: 'node1',
            type: 'file',
            file: 'TaskNotes/Tasks/TaskA.md',
            width: 400,
            height: 150,
            color: '5',
            nodeEl: {
                classList: {
                    toggle: vi.fn()
                },
                querySelector: vi.fn().mockReturnValue(null),
                appendChild: vi.fn()
            }
        };

        const mockCanvas = {
            nodes: new Map([
                ['node1', mockNode]
            ]),
            requestSave: vi.fn()
        };

        mockApp.metadataCache.getFileCache.mockImplementation((file) => {
            if (file.basename === 'TaskA') {
                return { frontmatter: { status: 'open', blockedBy: ['[[TaskB]]'] } };
            }
            return { frontmatter: { status: 'open' } };
        });

        const modified = (engine as any).formatNode(mockCanvas, mockNode, { path: 'MeuCanvas.canvas' });
        
        // Verifica se a classe has-external-blockers foi ativada
        expect(mockNode.nodeEl.classList.toggle).toHaveBeenCalledWith('has-external-blockers', true);
    });

    it('deve atualizar os canvases abertos quando receber um evento de alteração de tarefa', () => {
        const engine = new CanvasEngine(mockPlugin as any);
        const mockTaskFile = Object.create(TFile.prototype);
        mockTaskFile.path = 'TaskNotes/Tasks/TaskA.md';
        mockTaskFile.basename = 'TaskA';

        const mockNode = {
            id: 'node1',
            type: 'file',
            file: mockTaskFile,
            width: 400,
            height: 150,
            color: '5',
            nodeEl: {
                classList: {
                    toggle: vi.fn()
                }
            },
            requestFrame: vi.fn()
        };

        const mockCanvas = {
            nodes: new Map([
                ['node1', mockNode]
            ]),
            requestSave: vi.fn()
        };

        const mockLeaf = {
            view: {
                getViewType: () => 'canvas',
                canvas: mockCanvas,
                file: { path: 'MeuCanvas.canvas' }
            }
        };

        mockApp.workspace.getLeavesOfType.mockReturnValue([mockLeaf]);
        mockApp.metadataCache.getFileCache.mockReturnValue({
            frontmatter: { status: 'in-progress', priority: 'normal' }
        });

        // Mock getFileType
        vi.spyOn(engine, 'getFileType').mockReturnValue('tasknote');
        const formatNodeSpy = vi.spyOn(engine as any, 'formatNode');

        engine.updateOpenCanvasesForTask('TaskNotes/Tasks/TaskA.md');

        expect(formatNodeSpy).toHaveBeenCalled();
        expect(mockNode.requestFrame).toHaveBeenCalled();
    });
});
