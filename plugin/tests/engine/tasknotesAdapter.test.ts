import { describe, it, expect } from 'vitest';
import {
    TASK_STATUS_DONE,
    TASK_STATUS_NEXT_ACTION,
    TASK_STATUS_IN_PROGRESS,
    TASK_STATUS_WAITING_ON,
    isTaskInProgress,
    isRecurringTask,
    completeTaskFrontmatter,
    pauseTaskFrontmatter,
    reopenTaskFrontmatter,
} from '../../src/engine/tasknotesAdapter';

describe('tasknotesAdapter', () => {

    describe('isTaskInProgress', () => {
        it('reconhece in-progress e doing', () => {
            expect(isTaskInProgress('in-progress')).toBe(true);
            expect(isTaskInProgress('doing')).toBe(true);
            expect(isTaskInProgress('next-action')).toBe(false);
            expect(isTaskInProgress('done')).toBe(false);
        });
    });

    describe('isRecurringTask (A1 extensão)', () => {
        it('reconhece recorrência por recurrence, recurring, recurrence_parent ou complete_instances', () => {
            expect(isRecurringTask({ recurrence: 'daily' })).toBe(true);
            expect(isRecurringTask({ recurring: true })).toBe(true);
            expect(isRecurringTask({ recurrence_parent: 'TaskNotes/Tasks/original.md' })).toBe(true);
            expect(isRecurringTask({ rrule: 'FREQ=DAILY' })).toBe(true);
            expect(isRecurringTask({ complete_instances: ['2026-09-01'] })).toBe(true);
        });

        it('retorna false para tarefas não recorrentes ou vazias', () => {
            expect(isRecurringTask({ title: 'Simples' })).toBe(false);
            expect(isRecurringTask({ recurrence: null, complete_instances: [] })).toBe(false);
            expect(isRecurringTask(null)).toBe(false);
            expect(isRecurringTask(undefined)).toBe(false);
        });
    });

    describe('completeTaskFrontmatter', () => {
        it('grava status: done e completedDate no frontmatter, preservando os demais campos', () => {
            const fm: Record<string, unknown> = {
                title: 'Minha tarefa',
                status: 'in-progress',
                projects: ['[[Projeto Alpha]]'],
            };
            const outcome = completeTaskFrontmatter(fm, '2026-09-16');
            expect(outcome.status).toBe('completed');
            expect(fm.status).toBe(TASK_STATUS_DONE);
            expect(fm.completedDate).toBe('2026-09-16');
            expect(fm.title).toBe('Minha tarefa');
            expect(fm.projects).toEqual(['[[Projeto Alpha]]']);
        });

        it('recusa conclusão de tarefa recorrente sem autorização explícita (Decisão 4)', () => {
            const fm: Record<string, unknown> = {
                title: 'Rotina diária',
                status: 'next-action',
                recurrence: 'daily',
            };
            const outcome = completeTaskFrontmatter(fm, '2026-09-16');
            expect(outcome.status).toBe('refused');
            expect(outcome.reason).toContain('Tarefa recorrente detectada');
            expect(fm.status).toBe('next-action');
            expect(fm.completedDate).toBeUndefined();
        });

        it('permite conclusão de tarefa recorrente quando allowRecurring: true', () => {
            const fm: Record<string, unknown> = {
                title: 'Rotina diária',
                status: 'next-action',
                recurrence: 'daily',
            };
            const outcome = completeTaskFrontmatter(fm, '2026-09-16', { allowRecurring: true });
            expect(outcome.status).toBe('completed');
            expect(fm.status).toBe(TASK_STATUS_DONE);
            expect(fm.completedDate).toBe('2026-09-16');
        });

        it('não regrava a chave aposentada `completed`: a conclusão é só o completedDate (Passo 0, 0a)', () => {
            const fm: Record<string, unknown> = { status: 'next-action' };
            completeTaskFrontmatter(fm, '2026-09-16');
            expect(fm.status).toBe(TASK_STATUS_DONE);
            expect(fm.completedDate).toBe('2026-09-16');
            expect('completed' in fm).toBe(false);
            // Nota antiga que ainda a tenha: o escritor não a toca (quem a tira é o script).
            const antiga: Record<string, unknown> = { status: 'next-action', completed: false };
            completeTaskFrontmatter(antiga, '2026-09-16');
            expect(antiga.completed).toBe(false);
        });
    });

    describe('pauseTaskFrontmatter', () => {
        it('transiciona de volta para next-action por padrão e limpa blockStarted', () => {
            const fm: Record<string, unknown> = { status: 'in-progress', blockStarted: '2026-09-16T10:00:00Z' };
            pauseTaskFrontmatter(fm);
            expect(fm.status).toBe(TASK_STATUS_NEXT_ACTION);
            expect(fm.blockStarted).toBeUndefined();
        });

        it('distingue pausa para waiting-on preservando a intenção de aguardo externo (A1 extensão)', () => {
            const fm: Record<string, unknown> = { status: 'in-progress', blockStarted: '2026-09-16T10:00:00Z' };
            pauseTaskFrontmatter(fm, TASK_STATUS_WAITING_ON);
            expect(fm.status).toBe(TASK_STATUS_WAITING_ON);
            expect(fm.blockStarted).toBeUndefined();
        });
    });

    describe('reopenTaskFrontmatter', () => {
        it('reabre para next-action e remove cirurgicamente o completedDate', () => {
            const fm: Record<string, unknown> = {
                title: 'Tarefa concluída',
                status: 'done',
                completedDate: '2026-09-15',
                priority: 'high',
            };
            reopenTaskFrontmatter(fm);
            expect(fm.status).toBe(TASK_STATUS_NEXT_ACTION);
            expect(fm.completedDate).toBeUndefined();
            expect(fm.title).toBe('Tarefa concluída');
            expect(fm.priority).toBe('high');
        });

        it('ao reabrir, não mexe na chave aposentada `completed` (Passo 0, 0a: quem a tira é o script)', () => {
            const fm: Record<string, unknown> = { status: 'done', completedDate: '2026-09-15', completed: '2026-09-15' };
            reopenTaskFrontmatter(fm);
            expect(fm.completedDate).toBeUndefined();
            expect(fm.completed).toBe('2026-09-15');
        });
    });
});
