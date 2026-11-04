import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    App: class {},
    TFile: class {},
    SuggestModal: class {
        app: any;
        constructor(app: any) { this.app = app; }
        open() {}
        close() { (this as any).onClose?.(); }
        onClose() {}
    },
}));

import { NoteSuggester } from '../../src/ui/suggesters';
import type { NowItem } from '../../src/engine/nowTree';

/**
 * A lista da árvore do agora no seletor de notas: só as tarefas que a árvore
 * devolveu, na ordem dos pesos (com ou sem busca), e "✨ Trabalhar numa tarefa nova"
 * sempre presente, que devolve `newtask`.
 */
const fakeFile = (path: string, mtime = 0) => ({ path, basename: path.split('/').pop()!.replace(/\.md$/, ''), stat: { mtime } });
const item = (name: string, over: Partial<NowItem> = {}): NowItem => ({
    path: `TaskNotes/Tasks/${name}.md`, name, pontos: 0, motivos: [], marcas: [], destaque: false, grupo: 'sugestao', ...over,
});

function suggester(items: NowItem[], chosen: any[] = []) {
    const files = [
        fakeFile('TaskNotes/Tasks/Alfa.md', 9e12), // a mais recente: na ordem comum viria primeiro
        fakeFile('TaskNotes/Tasks/Beta.md'),
        fakeFile('TaskNotes/Tasks/Gama.md'),
        fakeFile('TaskNotes/Tasks/Fora.md'),
    ];
    const app: any = {
        vault: { getMarkdownFiles: () => files },
        workspace: { getActiveFile: () => null },
        metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    };
    return new NoteSuggester(app, { folderFilter: 'TaskNotes/Tasks', allowFreeText: false, nowRanking: { items } }, r => chosen.push(r));
}

describe('NoteSuggester com a árvore do agora', () => {
    const items = [item('Gama', { destaque: true }), item('Beta'), item('Alfa', { grupo: 'a_triar' })];

    it('só as da árvore, na ordem dela; "Fora" não aparece', () => {
        const s = suggester(items);
        const files = s.getSuggestions('').filter((x: any) => x.path).map((x: any) => x.basename);
        expect(files).toEqual(['Gama', 'Beta', 'Alfa']);
        const buscando = s.getSuggestions('a').filter((x: any) => x.path).map((x: any) => x.basename);
        expect(buscando).toEqual(['Gama', 'Beta', 'Alfa']);
    });

    it('"✨ Trabalhar numa tarefa nova" está sempre lá, também com a lista vazia, e devolve newtask', () => {
        const chosen: any[] = [];
        const s = suggester([], chosen);
        const nova = s.getSuggestions('').find((x: any) => x.isNewTask);
        expect(nova.label).toBe('✨ Trabalhar numa tarefa nova');
        s.onChooseSuggestion(nova, {} as any);
        expect(chosen).toEqual([{ status: 'newtask' }]);
    });

    it('com texto digitado que não acha nada, o ✨ (com o texto como título) e o ⬅️ Voltar continuam lá', () => {
        const chosen: any[] = [];
        const files = [fakeFile('TaskNotes/Tasks/Gama.md')];
        const app: any = { vault: { getMarkdownFiles: () => files }, workspace: { getActiveFile: () => null }, metadataCache: { getFileCache: () => ({ frontmatter: {} }) } };
        const s = new NoteSuggester(app, { folderFilter: 'TaskNotes/Tasks', allowFreeText: false, nowRanking: { items: [item('Gama')] } }, r => chosen.push(r), true);
        const list = s.getSuggestions('ligar para o banco');
        expect(list.filter((x: any) => x.path)).toEqual([]);
        expect(list.some((x: any) => x.isBack)).toBe(true);
        const nova = list.find((x: any) => x.isNewTask);
        expect(nova.label).toBe('✨ Trabalhar numa tarefa nova: "ligar para o banco"');
        s.onChooseSuggestion(nova, {} as any);
        expect(chosen).toEqual([{ status: 'newtask', value: 'ligar para o banco' }]);
    });

    it('sem a árvore, o seletor comum não oferece a tarefa nova', () => {
        const app: any = { vault: { getMarkdownFiles: () => [] }, workspace: { getActiveFile: () => null }, metadataCache: { getFileCache: () => ({}) } };
        const s = new NoteSuggester(app, { folderFilter: 'TaskNotes/Tasks' }, () => {});
        expect(s.getSuggestions('').some((x: any) => x.isNewTask)).toBe(false);
    });
});
