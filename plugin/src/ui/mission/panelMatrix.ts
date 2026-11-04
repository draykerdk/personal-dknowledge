/**
 * O cartão "Matriz de ação" do painel (página Análise): urgência (`priority`) × impacto das tarefas
 * executáveis, pela leitura do motor (`engine/missionMatrix.ts`).
 *
 * Por quê: a decisão 1 do inventário da aposentadoria (02/11/2026): a Matriz DFM de Ação e a Linha do
 * Tempo do TaskNotes saíram com os canvas da semana, e o cartão da Análise fica (o "monitoramento de
 * detalhes e análise" que ele manteve em 29/10). O resto do antigo painel do plano (a grade da semana, as
 * lacunas, a linha do tempo, o radar e a pressão do plano) saiu em 03/11/2026 com o código aposentado.
 *
 * Nada aqui é escrita: o cartão lê a matriz do snapshot e desenha.
 */
import { applyTone, card, el, emptyState, rowLink } from './primitives';
import { MissionPanelContext, truncate } from './context';
import {
    hiddenMatrixCount,
    matrixCellTone,
    matrixCellWide,
    matrixView,
    visibleMatrixTasks,
} from '../../engine/missionMatrix';
import { MissionTask } from '../../engine/missionControl';
import { priorityToken } from './tokens';

/* ==========================================================================
   Matriz DFM de ação
   ========================================================================== */

export function renderMatrix(host: HTMLElement, ctx: MissionPanelContext): void {
    // A leitura da matriz — total, recorte e tom — vem do motor (`missionMatrix`).
    // O painel desenha; ele não é mais o segundo lugar onde a regra mora.
    const view = matrixView(ctx.snapshot.matrix);
    const cells = view.cells;
    const total = view.total;
    const node = card(host, {
        title: 'Matriz DFM de ação',
        icon: 'layout-grid',
        tone: 'orange',
        subtitle: 'urgência (priority) × impacto — a mesma língua da view do TaskNotes',
        badge: `${total} na mesa`,
    });

    // O "Abrir no TaskNotes" (a vista matriz-dfm.base) saiu com a Matriz DFM de Ação (aposentadoria, fase 2,
    // 02/11/2026; decisão 1 do inventário): o cartão fica na página Análise, sem a porta para a vista.

    if (total === 0) {
        emptyState(node.body,
            'Nenhuma tarefa executável (next-action/in-progress) sem arquivar e fora do tipo SMART. A matriz não inventa item para preencher célula.',
            'layout-grid');
        return;
    }

    const grid = el(node.body, 'div', 'mc-matrix');
    for (const cell of cells) {
        const box = applyTone(el(grid, 'div', `mc-matrix-cell${matrixCellWide(cell) ? ' is-wide' : ''}`), matrixCellTone(cell));
        const boxHead = el(box, 'div', 'mc-matrix-head');
        el(boxHead, 'span', 'mc-matrix-title', cell.label);
        el(boxHead, 'span', 'mc-matrix-count', String(cell.tasks.length));
        el(box, 'div', 'mc-matrix-hint', cell.hint);
        if (cell.tasks.length === 0) {
            el(box, 'div', 'mc-matrix-hint', 'vazio');
            continue;
        }
        const list = el(box, 'div', 'mc-matrix-tasks');
        for (const task of visibleMatrixTasks(cell)) matrixTask(list, task, ctx);
        const hidden = hiddenMatrixCount(cell);
        if (hidden > 0) {
            const more = rowLink(box, {
                classes: ['mc-more'],
                onClick: () => void ctx.focusTasks([], cell.label),
            });
            el(more, 'span', 'mc-row-title', `+ ${hidden} em ${cell.label}`);
        }
    }
}

function matrixTask(parent: HTMLElement, task: MissionTask, ctx: MissionPanelContext): void {
    const row = rowLink(parent, {
        classes: ['mc-matrix-task'],
        onClick: () => void ctx.openPath(task.path),
        title: task.path,
    });
    const priority = priorityToken(task.priority);
    applyTone(el(row, 'span', 'mc-task-dot'), priority.tone);
    el(row, 'span', 'mc-matrix-task-title', truncate(task.title, 46));
    if (task.due) {
        const due = el(row, 'span', 'mc-matrix-task-due', task.due);
        if (task.overdue) due.addClass('is-overdue');
    }
}
