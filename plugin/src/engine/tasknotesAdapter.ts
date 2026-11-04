/**
 * Adaptador de status e transições de tarefas para o TaskNotes.
 *
 * Garante alinhamento estrito com os status canônicos configurados no vault
 * (`inbox`, `next-action`, `in-progress`, `done`, `waiting-on`, `someday`, `cancelled`),
 * eliminando escrita de aliases legados como `completed` ou `todo`.
 */

export const TASK_STATUS_DONE = 'done';
export const TASK_STATUS_NEXT_ACTION = 'next-action';
export const TASK_STATUS_IN_PROGRESS = 'in-progress';
export const TASK_STATUS_WAITING_ON = 'waiting-on';
export const TASK_STATUS_INBOX = 'inbox';
export const TASK_STATUS_SOMEDAY = 'someday';
export const TASK_STATUS_CANCELLED = 'cancelled';

export const COMPLETED_STATUSES: ReadonlyArray<string> = [
    TASK_STATUS_DONE,
    TASK_STATUS_CANCELLED,
    'completed',
    'canceled',
];

export const IN_PROGRESS_STATUSES: ReadonlyArray<string> = [
    TASK_STATUS_IN_PROGRESS,
    'doing',
];

export function isTaskInProgress(status: unknown): boolean {
    if (typeof status !== 'string') return false;
    return IN_PROGRESS_STATUSES.includes(status.trim().toLowerCase());
}

/** Detecta se o frontmatter define recorrência no TaskNotes. */
export function isRecurringTask(fm: Record<string, unknown> | null | undefined): boolean {
    if (!fm || typeof fm !== 'object') return false;
    return Boolean(
        fm.recurrence ||
        fm.recurring ||
        fm.recurrence_parent ||
        fm.rrule ||
        (Array.isArray(fm.complete_instances) && fm.complete_instances.length > 0)
    );
}

export interface TaskCompletionOutcome {
    status: 'completed' | 'refused';
    reason?: string;
}

/**
 * Transiciona o frontmatter de uma tarefa para o estado de concluído (`done`).
 * Se a tarefa for recorrente e não autorizada, recusa a alteração direta para
 * proteger a cadeia de instâncias do TaskNotes (Decisão 4).
 */
export function completeTaskFrontmatter(
    fm: Record<string, unknown>,
    todayDateStr: string,
    options?: { allowRecurring?: boolean },
): TaskCompletionOutcome {
    if (isRecurringTask(fm) && !options?.allowRecurring) {
        return {
            status: 'refused',
            reason: 'Tarefa recorrente detectada. Conclusão de recorrência deve ser realizada no TaskNotes para avançar ocorrência.',
        };
    }
    fm.status = TASK_STATUS_DONE;
    fm.completedDate = todayDateStr;
    // O `completed` antigo se aposentou no Passo 0 (0a): a conclusão é só o
    // `completedDate`, o nome do TaskNotes. Não se regrava a chave aposentada.
    delete fm.blockStarted;
    return { status: 'completed' };
}

/**
 * Pausa uma tarefa em andamento, distinguindo `next-action` de `waiting-on`.
 */
export function pauseTaskFrontmatter(
    fm: Record<string, unknown>,
    toStatus: string = TASK_STATUS_NEXT_ACTION,
): void {
    fm.status = toStatus === TASK_STATUS_WAITING_ON ? TASK_STATUS_WAITING_ON : TASK_STATUS_NEXT_ACTION;
    delete fm.blockStarted;
}

/**
 * Reabre uma tarefa concluída ou cancelada, retornando-a para `next-action`.
 * Remove cirurgicamente a data de conclusão sem corromper metadados do autor.
 */
export function reopenTaskFrontmatter(fm: Record<string, unknown>): void {
    fm.status = TASK_STATUS_NEXT_ACTION;
    delete fm.completedDate;
    delete fm.blockStarted;
}
