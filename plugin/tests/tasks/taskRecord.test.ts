import { describe, expect, it } from 'vitest';
import { isTaskTagged, toTaskRecord } from '../../src/tasks/taskRecord';

describe('toTaskRecord', () => {
    it('lê o frontmatter do TaskNotes nas formas que o vault usa', () => {
        const r = toTaskRecord('T/Gravar.md', 'Gravar', {
            type: 'task', status: 'next-action', priority: 'high',
            projects: ['[[Publicar vídeo (W38)]]', '[[Pasta/Afiliados|A]]'],
            week: '2026-W38', due: '2026-09-17', scheduled: '2026-09-15T09:00',
            contexts: ['💻 Computador'], impacto: 9,
        }, ['#task', '#Afiliados']);
        expect(r).toMatchObject({
            title: 'Gravar', projects: ['Publicar vídeo (W38)', 'Afiliados'], scheduled: '2026-09-15',
            due: '2026-09-17', impacto: 9, tags: ['task', 'afiliados'], contexts: ['💻 Computador'],
        });
    });

    it('ausência é ausência: sem impacto é null, não zero; projeto único em texto vira lista', () => {
        const r = toTaskRecord('T/x.md', 'x', { projects: '[[Livro]]', impacto: '' }, ['#task']);
        expect(r.impacto).toBeNull();
        expect(r.projects).toEqual(['Livro']);
        expect(r.type).toBe('task');
        expect(r.scheduled).toBe('');
    });

    it('a criação é só o dateCreated: o created antigo não é lido (Passo 0, 0a)', () => {
        expect(toTaskRecord('T/x.md', 'x', { dateCreated: '2026-07-08T17:31:09.558+07:00' }, ['#task']).created).toBe('2026-07-08');
        expect(toTaskRecord('T/x.md', 'x', { created: '2026-07-10' }, ['#task']).created).toBe('');
    });

    it('reconhece a tag de tarefa do TaskNotes e só ela', () => {
        expect(isTaskTagged(['#task'])).toBe(true);
        expect(isTaskTagged(['#task/sub'])).toBe(true);
        expect(isTaskTagged(['#tasks', '#tarefa-smart'])).toBe(false);
    });
});
