/**
 * Quais botões do DFM entram na barra de seleção do canvas — módulo puro.
 *
 * A barra nativa (lixeira, cor, zoom, alinhar) aparece sobre o que está
 * selecionado; o DFM acrescenta ali o que faz sentido para aquela seleção.
 * Concluir com um clique vale só para ação atômica: fechar uma SMART é decisão
 * da revisão, como no cartão de tarefa.
 */
export type SelectedKind = 'acao' | 'smart' | 'widget' | 'outro';

export interface SelectedItem {
    kind: SelectedKind;
    /** Status do TaskNotes, quando é tarefa. */
    status?: string;
}

export type SelectionAction =
    | 'concluir'
    | 'reabrir'
    | 'agendar'
    | 'editar'
    | 'nova-acao'
    | 'tarefa-menu'
    | 'widget'
    | 'grade';

const TERMINAL = new Set(['done', 'cancelled']);

/**
 * O que faz: os botões do DFM para a seleção do canvas, na ordem da barra.
 * Por quê: cada botão só entra quando faz sentido para o que está selecionado; o "Nova ação desta
 * SMART" só quando o cofre tem o protocolo da tarefa da SMART (D1 do mapa da v0: sem protocolo, o
 * botão some, sem aviso).
 * Entra → sai: os itens selecionados e se a nova ação tem protocolo (sem dizer, tem) → os botões.
 * Prova: tests/board/canvasToolbarModel.test.ts.
 */
export function selectionActions(items: SelectedItem[], comNovaAcao = true): SelectionAction[] {
    const out: SelectionAction[] = [];
    if (!items.length) return out;
    const single = items.length === 1 ? items[0] : null;
    const allTasks = items.every(i => i.kind === 'acao' || i.kind === 'smart');

    if (allTasks) {
        const actions = items.filter(i => i.kind === 'acao');
        const openActions = actions.filter(i => !TERMINAL.has(i.status ?? ''));
        if (openActions.length) out.push('concluir');
        else if (actions.length && actions.every(i => i.status === 'done')) out.push('reabrir');
        if (items.some(i => !TERMINAL.has(i.status ?? ''))) out.push('agendar');
        if (single) out.push('editar');
        if (comNovaAcao && single?.kind === 'smart' && !TERMINAL.has(single.status ?? '')) out.push('nova-acao');
        out.push('tarefa-menu');
    }
    if (single?.kind === 'widget') out.push('widget');
    if (items.length >= 2) out.push('grade');
    return out;
}
