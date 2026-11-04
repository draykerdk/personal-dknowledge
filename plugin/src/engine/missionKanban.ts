/**
 * Kanban de tarefas — o modelo puro (sem `obsidian`, sem DOM, sem escrita).
 *
 * Este módulo responde três perguntas e mais nenhuma: **em que coluna cada
 * tarefa aparece**, **qual coluna está sob o ponteiro** e **qual corpo de
 * escrita um drop produz**. Quem desenha é o painel; quem grava é a ponte
 * sancionada (`/v1/tasks/update`). Aqui não há `fetch`, nem frontmatter, nem
 * segunda leitura do vault — só a regra, isolada para poder ser provada.
 *
 * Duas regras foram tomadas do código que já existe, não inventadas aqui:
 *
 * 1. **Status ausente ou desconhecido vai para `inbox`.** É o que o funil do
 *    console já faz (`buildTaskBoard`: `buckets.find(...) ?? byId.get('inbox')`)
 *    e é o único destino que a escrita aceita — `validateTaskUpdate` só conhece
 *    os 5 status abertos do TaskNotes, então uma 6ª coluna "sem status" seria um
 *    lugar para onde não existe gravação possível.
 * 2. **Estado final (`done`/`cancelled`) não é coluna deste quadro.** O funil
 *    também o deixa de fora (`isTerminalStatus`) e ele é contado na linha de
 *    rodapé: sai da tela, não do relatório.
 *
 * Divergência **declarada**, não escondida: o funil tolera apelidos de status
 * (`open`, `todo`, `aberto`, `blocked`, `bloqueado`) e mostra o cartão no balde da
 * coluna equivalente. Aqui eles caem no acolhimento com a marca de não
 * classificado, porque `validateTaskUpdate` só aceita os 5 status canônicos — uma
 * coluna de apelido seria um destino para o qual não existe gravação. O cartão
 * continua visível, marcado, no quadro.
 */
import type { MissionTask } from './missionTypes';
import { isTerminalStatus } from './taskSemantics';

/**
 * As 5 colunas de status aberto do TaskNotes, na ordem canônica do DFM.
 *
 * A ordem é a do funil: o que foi capturado, o que está pronto, o que está em
 * curso, o que espera terceiro e o que ficou para depois.
 */
export const KANBAN_STATUSES = ['inbox', 'next-action', 'in-progress', 'waiting-on', 'someday'] as const;

export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

/**
 * Coluna de acolhimento de status ausente ou fora dos 5.
 *
 * `inbox` e não uma coluna nova: o funil do console já coloca ali a tarefa não
 * classificada, e `inbox` é status legal para escrita — o cartão que chegou sem
 * status pode sair do acolhimento por um gesto, em vez de ficar preso.
 */
export const KANBAN_FALLBACK_STATUS: KanbanStatus = 'inbox';

/**
 * A rota sancionada de escrita.
 *
 * Literal de propósito: é a mesma string do `switch` de `DshOperatorCore.dispatch`
 * e o teste a compara com o validador real, não com uma cópia da regra.
 */
export const KANBAN_UPDATE_ROUTE = '/v1/tasks/update';

/** Status é um dos 5? Tolera caixa e espaço — o TaskNotes grava minúsculo, a mão humana não. */
export function isKanbanStatus(value: unknown): value is KanbanStatus {
    return typeof value === 'string' && (KANBAN_STATUSES as readonly string[]).includes(value.trim().toLowerCase());
}

/** Coluna declarada de um status cru: os 5 válidos, ou o acolhimento. Nunca some. */
export function kanbanColumnStatus(status: unknown): KanbanStatus {
    const key = String(status ?? '').trim().toLowerCase();
    return isKanbanStatus(key) ? key : KANBAN_FALLBACK_STATUS;
}

/** Um cartão do quadro. `unclassified` é a marca de que o status declarado não era um dos 5. */
export interface KanbanCard {
    /** A tarefa como o motor a leu. O painel pode sobrepor o status durante a escrita otimista. */
    task: MissionTask;
    unclassified: boolean;
}

export interface KanbanColumn {
    status: KanbanStatus;
    cards: KanbanCard[];
    /** Contagem derivada de `cards` numa passada só — número não se recalcula em dois lugares. */
    count: number;
    /** Quantos cartões desta coluna chegaram sem status reconhecido. */
    unclassified: number;
}

export interface KanbanBoard {
    columns: KanbanColumn[];
    /** Cartões desenhados no quadro. */
    total: number;
    /** Cartões no acolhimento por status ausente ou desconhecido. */
    unclassified: number;
    /** Tarefas em estado final: fora das 5 colunas, declaradas no rodapé. */
    terminal: number;
    /** Caminhos repetidos na entrada: contados, e o cartão aparece **uma** vez. */
    duplicates: number;
}

/**
 * Agrupa as tarefas nas 5 colunas canônicas, com contagem.
 *
 * A ordem de entrada é preservada dentro de cada coluna: é a ordem que o motor
 * do console já estabeleceu (vencidas primeiro, depois hoje, depois impacto).
 * Reordenar aqui criaria duas verdades sobre a mesma lista.
 *
 * Nenhuma tarefa some: a de status ausente/desconhecido cai no acolhimento e a
 * de estado final sai do quadro **contada**. Caminho repetido (dois buckets, duas
 * leituras) vira um cartão só — e a repetição é declarada.
 */
export function buildKanbanBoard(tasks: readonly MissionTask[]): KanbanBoard {
    const columns: KanbanColumn[] = KANBAN_STATUSES.map(status => ({ status, cards: [], count: 0, unclassified: 0 }));
    const byStatus = new Map<KanbanStatus, KanbanColumn>(columns.map(column => [column.status, column]));
    const seen = new Set<string>();
    let terminal = 0;
    let duplicates = 0;
    let unclassified = 0;

    for (const task of tasks) {
        const path = String(task?.path ?? '').trim();
        if (path && seen.has(path)) {
            duplicates += 1;
            continue;
        }
        if (path) seen.add(path);

        const declared = String(task?.status ?? '').trim();
        if (isTerminalStatus(declared)) {
            terminal += 1;
            continue;
        }

        const status = kanbanColumnStatus(declared);
        const column = byStatus.get(status) as KanbanColumn;
        const card: KanbanCard = { task, unclassified: !isKanbanStatus(declared) };
        if (card.unclassified) {
            unclassified += 1;
            column.unclassified += 1;
        }
        column.cards.push(card);
    }

    for (const column of columns) column.count = column.cards.length;

    return { columns, total: columns.reduce((sum, column) => sum + column.count, 0), unclassified, terminal, duplicates };
}

/** Faixa horizontal de uma lane, na ordem canônica das colunas. */
export interface KanbanColumnRect {
    left: number;
    right: number;
}

/**
 * Índice da coluna sob a coordenada horizontal `x`, pela geometria real das lanes.
 *
 * Mesma regra de `indexAtPoint` (dragdrop.ts): contenção na faixa `[left, right)`
 * com trava nas pontas — o vão entre duas lanes resolve para a SEGUINTE e o
 * arrasto nunca aponta para um índice inexistente. Coordenada não finita devolve
 * `-1` (nada acontece), em vez de virar "última coluna" por acidente.
 */
export function columnIndexAtPoint(columns: ReadonlyArray<KanbanColumnRect>, x: number): number {
    if (columns.length === 0) return -1;
    if (!Number.isFinite(x)) return -1;
    if (x < columns[0].left) return 0;
    for (let i = 0; i < columns.length; i++) {
        if (x < columns[i].right) return i;
    }
    return columns.length - 1;
}

/** O que um drop produz: a rota e o corpo exato da escrita sancionada. */
export interface KanbanDropPlan {
    route: string;
    body: { path: string; status: KanbanStatus };
}

/**
 * Corpo da escrita de um drop — ou `null` quando não há o que escrever.
 *
 * `null` é contrato, não preguiça: soltar o cartão na **mesma coluna visível** não
 * é movimento, então não há escrita. Isso inclui o cartão sem status solto no
 * acolhimento — ele já está onde aparece, e gravar `status: inbox` ali seria uma
 * classificação que o operador não pediu.
 *
 * O corpo tem **só** `path` e `status`: é o que `validateTaskUpdate` aceita sem
 * inventar campo, e é o payload que o teste entrega ao validador real.
 */
export function planKanbanDrop(task: { path: string; status: string }, target: KanbanStatus): KanbanDropPlan | null {
    const path = String(task?.path ?? '').trim();
    if (!path) return null;
    if (kanbanColumnStatus(task?.status) === target) return null;
    return { route: KANBAN_UPDATE_ROUTE, body: { path, status: target } };
}

/** O drop resolvido pela coordenada: alvo por índice e, então, o plano de escrita. */
export function planKanbanDropAt(
    task: { path: string; status: string },
    columns: ReadonlyArray<KanbanColumnRect>,
    x: number,
): KanbanDropPlan | null {
    const index = columnIndexAtPoint(columns, x);
    if (index < 0) return null;
    return planKanbanDrop(task, KANBAN_STATUSES[index]);
}
