import { describe, expect, it, vi } from 'vitest';
import { openTaskForm } from '../../src/engine/tasknotesBridge';

/**
 * O formulário nativo do TaskNotes aberto pelo ✨ do gesto: o lugar, o tempo e, quando
 * a pessoa digitou na busca, o texto como título (`prePopulatedValues.title`, aceito
 * pelo TaskNotes 4.13). A tarefa salva (`task.created`) é a escolhida.
 */
describe('openTaskForm', () => {
    it('abre com o título digitado, o lugar e o tempo; devolve a tarefa salva', async () => {
        let created: ((payload: any) => void) | null = null;
        const openTaskCreationModal = vi.fn();
        const app: any = {
            plugins: { plugins: { tasknotes: {
                openTaskCreationModal,
                api: { events: { on: vi.fn((_name: string, fn: (payload: any) => void) => { created = fn; return 'ref'; }), off: vi.fn() } },
            } } },
        };
        const pending = openTaskForm(app, { contexts: ['💻 Computador'], timeEstimate: 30, title: '  Ligar para o banco ' });
        expect(openTaskCreationModal).toHaveBeenCalledWith({ contexts: ['💻 Computador'], timeEstimate: 30, title: 'Ligar para o banco' });
        created!({ taskPath: 'TaskNotes/Tasks/Ligar para o banco.md' });
        expect(await pending).toBe('TaskNotes/Tasks/Ligar para o banco.md');
    });

    it('sem texto digitado, o título não vai', () => {
        const openTaskCreationModal = vi.fn();
        const app: any = { plugins: { plugins: { tasknotes: { openTaskCreationModal } } } };
        void openTaskForm(app, { contexts: [], title: '' });
        expect(openTaskCreationModal).toHaveBeenCalledWith({});
    });

    // Decisão de 19/10: a tarefa nova escolhe a SMART antes; o projeto vai sempre explícito,
    // para o TaskNotes (useParentNoteAsProject) não pôr a Day aberta como projeto.
    it('a mãe escolhida vai como projeto; "nenhuma, solta" vai como lista vazia', () => {
        const openTaskCreationModal = vi.fn();
        const app: any = { plugins: { plugins: { tasknotes: { openTaskCreationModal } } } };
        void openTaskForm(app, { projects: ['Publicar o livro (W43)'] });
        expect(openTaskCreationModal).toHaveBeenLastCalledWith({ projects: ['[[Publicar o livro (W43)]]'] });
        void openTaskForm(app, { projects: [] });
        expect(openTaskCreationModal).toHaveBeenLastCalledWith({ projects: [] });
    });
});
