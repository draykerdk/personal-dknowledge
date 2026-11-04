import { describe, expect, it } from 'vitest';
import { mountTaskCard, type TaskCardActions } from '../../src/canvas/taskCard';
import { taskCardModel } from '../../src/canvas/taskCardModel';
import type { TaskRecord } from '../../src/tasks/taskRecord';
import { documentoFalso } from '../fixtures/domFalso';

/**
 * O + da SMART no cartão do canvas (D1 do mapa da v0, a pendência 2 da rodada 2): só quando o cofre
 * tem o protocolo da ação nova da SMART; sem ele, o botão some, como o 🤝 sem o gesto.
 */
const SMART: TaskRecord = {
    path: 'TaskNotes/Tasks/Meta.md', basename: 'Meta', title: 'Meta', type: 'tarefa_smart', status: 'in-progress',
    priority: 'normal', projects: [], contexts: [], tags: [], due: '', scheduled: '', week: '', completedDate: '',
    timeEstimate: null, impacto: null, blockedBy: [], recurrence: '',
} as unknown as TaskRecord;

function montar(podeNovaAcao?: () => boolean) {
    const doc = documentoFalso();
    const no = doc.body.appendChild(doc.createElement('div')) as unknown as HTMLElement;
    const nada = () => {};
    const actions: TaskCardActions = {
        complete: async () => true, statusMenu: nada, dateMenu: nada, moreMenu: nada, edit: nada, doNow: nada, postpone: nada,
        newAction: nada, ...(podeNovaAcao ? { podeNovaAcao } : {}),
    };
    mountTaskCard(no, SMART, taskCardModel(SMART, '2026-11-03'), actions);
    return (no as any).querySelectorAll('.is-add').length;
}

describe('o + da SMART no cartão', () => {
    it('com o protocolo (ou sem a leitura), o + aparece; sem o protocolo, some', () => {
        expect(montar()).toBe(1);
        expect(montar(() => true)).toBe(1);
        expect(montar(() => false)).toBe(0);
    });
});
