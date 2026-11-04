/**
 * As regras da caixa de entrada (engine/inboxRules.ts) e as pastas da triagem (missao/hosts/pastas.ts):
 * o filtro da triagem, o nome da nota, o virar tarefa, o Side Quest, os destinos e as pastas mortas.
 *
 * Por quê: estas provas moravam em tests/ui/missionInboxContract.test.ts, com a fábrica de notas e a
 * triagem do painel antigo (ui/mission/panelInbox.ts). O painel saiu em 03/11/2026 com o código
 * aposentado; as regras ficam (a triagem da Missão e o ECH as leem), e as provas vão com elas.
 *
 * É decisão pura (o filtro, o nome, o frontmatter, os destinos), testável sem vault e sem DOM.
 */
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
    class TFile {
        path: string;
        name: string;
        basename: string;
        extension: string;
        parent: any = null;
        stat = { mtime: 0, size: 0 };
        constructor(path: string) {
            this.path = path;
            this.name = path.split('/').pop() ?? path;
            this.extension = this.name.includes('.') ? this.name.split('.').pop() ?? '' : '';
            this.basename = this.extension ? this.name.slice(0, -(this.extension.length + 1)) : this.name;
        }
    }
    class TFolder {
        path: string;
        name: string;
        children: any[] = [];
        parent: any = null;
        constructor(path: string) {
            this.path = path;
            this.name = path.split('/').pop() ?? path;
        }
    }
    return { TFile, TFolder };
});

vi.mock('obsidian', () => ({
    TFile: hoisted.TFile,
    TFolder: hoisted.TFolder,
    Notice: class {},
    Modal: class { contentEl: any = {}; close() { /* noop */ } },
    Setting: class {},
    SuggestModal: class {},
    Plugin: class {},
    Platform: { isMobile: false, isDesktopApp: true },
    setIcon: () => undefined,
    moment: () => ({ format: () => '', subtract: () => ({ format: () => '' }) }),
}));

import {
    DEAD_FOLDERS,
    RESOURCES_FOLDER,
    HISTORY_FOLDER,
    TASKNOTES_FOLDER,
    isDeadFolder,
    isIndexNote,
    isTriageCapture,
    resourceTypes,
    sideQuestFrontMatter,
    captureTaskFrontMatter,
    targetPathFor,
    triageCandidates,
} from '../../src/engine/inboxRules';
import { ensureFolder, resourceTypeFolders } from '../../src/missao/hosts/pastas';

const LIBRARY_FOLDER = `${RESOURCES_FOLDER}/Livros`;

function fakeApp(tree: Record<string, any>) {
    return {
        vault: {
            getAbstractFileByPath: (path: string) => tree[path] ?? null,
            getRoot: () => tree[''] ?? null,
            getFiles: () => Object.values(tree).flatMap((node: any) => (node?.children ?? [])),
        },
    } as any;
}

describe('filtro da triagem', () => {
    const folder = '300 - RUNTIME/001 - INBOX';
    const files = [
        { path: `${folder}/Ata solta.md`, extension: 'md', basename: 'Ata solta' },
        { path: `${folder}/Index_Inbox.md`, extension: 'md', basename: 'Index_Inbox' },
        { path: `${folder}/sub/Index geral.md`, extension: 'md', basename: 'Index geral' },
        { path: `${folder}/Mapa.canvas`, extension: 'canvas', basename: 'Mapa' },
        { path: `${folder}/sem-extensao`, extension: '', basename: 'sem-extensao' },
        { path: `${folder}-espelho/Fora.md`, extension: 'md', basename: 'Fora' },
        { path: '400 - PROJETOS/Outro.md', extension: 'md', basename: 'Outro' },
    ];

    it('pega os .md da pasta, inclusive em subpasta, e deixa índice de fora', () => {
        expect(triageCandidates(files, folder).map(file => file.basename)).toEqual(['Ata solta']);
    });

    it('a régua do índice é a do legado, sem inventar sinônimo', () => {
        expect(isIndexNote('Index_Inbox')).toBe(true);
        expect(isIndexNote('INDEX')).toBe(true);
        expect(isIndexNote('Ata da reunião')).toBe(false);
        // `Índice` é outra palavra: filtrá-la esconderia nota do operador.
        expect(isIndexNote('Índice de preços')).toBe(false);
    });

    it('não confunde uma pasta com prefixo parecido', () => {
        expect(triageCandidates(files, folder).some(file => file.basename === 'Fora')).toBe(false);
    });

    it('só capturas: o AGENTS.md, a fila do Cold Storage e os rascunhos dos protocolos ficam fora', () => {
        const more = [
            ...files,
            { path: `${folder}/AGENTS.md`, extension: 'md', basename: 'AGENTS' },
            { path: `${folder}/Arquivamento sugerido.md`, extension: 'md', basename: 'Arquivamento sugerido' },
            { path: `${folder}/2026-10-19 23-19 - 🌙 Revisão Diária - RASCUNHO.md`, extension: 'md', basename: '2026-10-19 23-19 - 🌙 Revisão Diária - RASCUNHO' },
            { path: `${folder}/Evitação experiencial.md`, extension: 'md', basename: 'Evitação experiencial' },
        ];
        expect(triageCandidates(more, folder).map(file => file.basename)).toEqual(['Ata solta', 'Evitação experiencial']);
        expect(isTriageCapture('AGENTS')).toBe(false);
        expect(isTriageCapture('Rascunho de ideia')).toBe(true);
    });

    it('sem pasta configurada não lista o vault inteiro', () => {
        expect(triageCandidates(files, '')).toEqual([]);
    });
});

describe('nome da nota', () => {

    it('pasta vazia significa raiz do vault', () => {
        expect(targetPathFor('', 'Nota.md')).toBe('Nota.md');
        expect(targetPathFor(LIBRARY_FOLDER, 'Nota.md')).toBe(`${LIBRARY_FOLDER}/Nota.md`);
    });
});

describe('virar tarefa', () => {
    it('a captura vira TaskNote aberta (a próxima): a tag task sem sidequest, o algum dia volta a próxima, o estado vivo fica', () => {
        expect(captureTaskFrontMatter({}, '2026-10-29')).toEqual({ tags: ['task'], status: 'next-action', type: 'task', dateCreated: '2026-10-29' });
        expect(captureTaskFrontMatter({ status: 'someday', tags: ['x'] }).status).toBe('next-action');
        expect(captureTaskFrontMatter({ status: 'in-progress' }).status).toBeUndefined();
        expect(captureTaskFrontMatter({ status: 'inbox' }).status).toBe('next-action');
        expect(captureTaskFrontMatter({ type: 'idea' }, '2026-10-29').type).toBeUndefined();
    });
});

describe('Side Quest', () => {
    it('vira TaskNote "algum dia": as tags task e sidequest entram sem perder o que já estava', () => {
        expect(sideQuestFrontMatter({}, '2026-10-28')).toEqual({ tags: ['task', 'sidequest'], status: 'someday', type: 'task', dateCreated: '2026-10-28' });
        expect(sideQuestFrontMatter({ tags: ['projeto'] }).tags).toEqual(['projeto', 'task', 'sidequest']);
        expect(sideQuestFrontMatter({ tags: 'a, b' }).tags).toEqual(['a', 'b', 'task', 'sidequest']);
        expect(sideQuestFrontMatter({ tags: ['SideQuest', 'Task'] }).tags).toEqual(['SideQuest', 'Task']);
        // Sem o dia, nada de dateCreated; tipo e data que já existem ficam.
        expect(sideQuestFrontMatter({}).dateCreated).toBeUndefined();
        expect(sideQuestFrontMatter({ type: 'idea', dateCreated: '2026-01-01' }, '2026-10-28')).toEqual({ tags: ['task', 'sidequest'], status: 'someday' });
    });

    it('o inbox e o status fora do catálogo viram someday; um estado vivo não é rebaixado', () => {
        expect(sideQuestFrontMatter({ tags: ['x'], status: 'in-progress' }).status).toBeUndefined();
        expect(sideQuestFrontMatter({ status: 'waiting-on' }).status).toBeUndefined();
        expect(sideQuestFrontMatter({ status: 'inbox' }).status).toBe('someday');
        expect(sideQuestFrontMatter({ status: '   ' }).status).toBe('someday');
        expect(sideQuestFrontMatter({ status: 'pendente' }).status).toBe('someday');
    });

    it('é decisão pura: não escreve no frontmatter recebido', () => {
        const frontmatter: Record<string, unknown> = {};
        sideQuestFrontMatter(frontmatter);
        expect(frontmatter.tags).toBeUndefined();
        expect(frontmatter.status).toBeUndefined();
    });
});

describe('destinos da triagem', () => {

    it('Recursos oferece só os tipos que já existem em 500 - RESOURCES', () => {
        expect(resourceTypes(['Livros', 'Artigos', '.oculta', 'Notas Salvas', 'Biblioteca', 'Livros'])).toEqual(['Artigos', 'Livros', 'Notas Salvas']);
        const root = new hoisted.TFolder(RESOURCES_FOLDER);
        root.children.push(new hoisted.TFolder(`${RESOURCES_FOLDER}/Livros`), new hoisted.TFile(`${RESOURCES_FOLDER}/solta.md`), new hoisted.TFolder(`${RESOURCES_FOLDER}/Artigos`));
        expect(resourceTypeFolders(fakeApp({ [RESOURCES_FOLDER]: root }))).toEqual(['Artigos', 'Livros']);
        expect(resourceTypeFolders(fakeApp({}))).toEqual([]);
    });
});

describe('pastas mortas', () => {
    it('nenhuma pasta antiga renasce: o ensureFolder recusa sem criar nada', async () => {
        expect(DEAD_FOLDERS).toEqual(expect.arrayContaining(['500 - RESOURCES/Biblioteca', '900 - HISTORICO', '900 - ARCHIVE/Projetos Finalizados']));
        expect(isDeadFolder('500 - RESOURCES/Knowledge/Human-Architecture/Filosofia')).toBe(true);
        expect(isDeadFolder('900 - ARCHIVE')).toBe(false);
        const createFolder = vi.fn(async () => undefined);
        const app = { vault: { getAbstractFileByPath: () => null, createFolder } } as any;
        for (const dead of ['500 - RESOURCES/Biblioteca', '900 - HISTORICO', '900 - ARCHIVE/Projetos Finalizados/X']) {
            await expect(ensureFolder(app, dead)).rejects.toThrow('nada foi criado');
        }
        expect(createFolder).not.toHaveBeenCalled();
        await ensureFolder(app, 'TaskNotes/Tasks');
        expect(createFolder).toHaveBeenCalledWith('TaskNotes/Tasks');
    });
});
