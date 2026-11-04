import { describe, expect, it } from 'vitest';
import { notasCandidatas, type FiltroDasCandidatas } from '../../src/engine/noteCandidates';

/**
 * A filtragem das candidatas do seletor de notas, fora do modal (P11 da Missão, §5.3, 2): o
 * modal (`NoteSuggester.getCandidateFiles`) e a gaveta do formulário filtram pela mesma função.
 */
type Nota = { path: string };
const FM: Record<string, Record<string, any>> = {
    'TaskNotes/Tasks/a.md': { type: 'tasknote', status: 'next-action', contexts: ['💻 Computador'] },
    'TaskNotes/Tasks/b.md': { type: 'tarefa_smart', status: 'next-action' },
    'TaskNotes/Tasks/c.md': { type: 'tasknote', archived: true },
    'TaskNotes/Tasks/d.md': { type: 'tasknote', status: 'archived' },
    'TaskNotes/Archive/e.md': { type: 'tasknote' },
    'Projetos/Archive.md': { type: 'iniciativa' },
    'Outra/f.md': { type: 'tasknote' },
    'Sem/g.md': {},
};
const notas: Nota[] = Object.keys(FM).map(path => ({ path }));
const fm = (n: Nota) => (Object.keys(FM[n.path]).length ? FM[n.path] : undefined);
const base: FiltroDasCandidatas<Nota> = { agora: null, habitoDoAgora: () => false, excludeArchive: true, folderFilter: '', allowAnyNote: false, propertyFilter: null };
const caminhos = (l: Nota[]) => l.map(n => n.path);

describe('notasCandidatas', () => {
    it('sem filtro de arquivo, todas, na ordem em que chegaram; a lista de entrada não muda', () => {
        const antes = [...notas];
        expect(caminhos(notasCandidatas(notas, { ...base, excludeArchive: false }, fm))).toEqual(Object.keys(FM));
        expect(notas).toEqual(antes);
    });

    it('o arquivo sai pela pasta (com a barra dos dois lados) e pelo campo; "Archive" no nome fica', () => {
        expect(caminhos(notasCandidatas(notas, base, fm))).toEqual(['TaskNotes/Tasks/a.md', 'TaskNotes/Tasks/b.md', 'Projetos/Archive.md', 'Outra/f.md', 'Sem/g.md']);
    });

    it('a pasta filtra pelo prefixo, salvo `allowAnyNote`', () => {
        expect(caminhos(notasCandidatas(notas, { ...base, folderFilter: 'TaskNotes/Tasks' }, fm))).toEqual(['TaskNotes/Tasks/a.md', 'TaskNotes/Tasks/b.md']);
        expect(notasCandidatas(notas, { ...base, folderFilter: 'TaskNotes/Tasks', allowAnyNote: true }, fm)).toHaveLength(5);
    });

    it('as propriedades: todas juntas; o valor ausente pede só a chave; a lista aceita qualquer um; `negate` inverte', () => {
        const so = (propertyFilter: any) => caminhos(notasCandidatas(notas, { ...base, propertyFilter }, fm));
        expect(so({ key: 'type', value: 'tarefa_smart', negate: true })).toEqual(['TaskNotes/Tasks/a.md', 'Projetos/Archive.md', 'Outra/f.md', 'Sem/g.md']);
        expect(so([{ key: 'type', value: 'tasknote' }, { key: 'status' }])).toEqual(['TaskNotes/Tasks/a.md']);
        expect(so({ key: 'type', value: ['iniciativa', 'tarefa_smart'] })).toEqual(['TaskNotes/Tasks/b.md', 'Projetos/Archive.md']);
        expect(so({ key: 'contexts', value: '💻 Computador' })).toEqual(['TaskNotes/Tasks/a.md']);
        expect(so({ key: 'contexts', value: ['📱 Celular', '💻 Computador'] })).toEqual(['TaskNotes/Tasks/a.md']);
    });

    it('a árvore do agora: só o que cabe, e os hábitos no fim, sem pasta nem propriedade', () => {
        const habito = { path: '200 - FUNCTIONS/Habits/Tracker/Correr.md' };
        const agora = new Map([['Outra/f.md', 0], [habito.path, 1], ['TaskNotes/Tasks/a.md', 2]]);
        const r = notasCandidatas([habito, ...notas], {
            ...base, agora, habitoDoAgora: n => n.path === habito.path, folderFilter: 'TaskNotes/Tasks', propertyFilter: { key: 'type', value: 'tasknote' },
        }, fm);
        expect(caminhos(r)).toEqual(['TaskNotes/Tasks/a.md', habito.path]);
    });
});
