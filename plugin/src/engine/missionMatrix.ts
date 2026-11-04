/**
 * Motor da Matriz DFM de ação — a triagem num só lugar, pura, sem Obsidian.
 *
 * ## De onde isto veio
 *
 * A regra **já existia pura** em `engine/missionPlan.ts`: `buildPriorityMatrix`
 * classifica cada tarefa em uma das cinco células por `priority` (urgência
 * declarada) × `impacto` (importância), e `MATRIX_CELLS` fixa rótulo, dica e
 * ordem de desenho. Este módulo **não reimplementa** nada disso — reexporta o
 * construtor canônico e publica a camada de leitura que faltava: contagem,
 * ausência declarada, recorte visível e tom. Era essa camada que o painel fazia
 * inline (`panelPlan.ts`) e que o widget de canvas faria de novo; duplicá-la
 * criaria uma segunda verdade sobre a mesma triagem.
 *
 * ## A regra, em uma frase
 *
 * Entra na mesa o que é `next-action` ou `in-progress`, não está arquivado e não
 * é `tarefa_smart`; urgente é `priority == "high"` (ou o alias `urgent`); alto
 * impacto é `impacto >= 7`; **impacto não declarado vira a célula própria
 * `sem-impacto`**, nunca "baixo impacto". Dentro da célula a ordem é vencido →
 * vence hoje → impacto decrescente → título.
 *
 * ## O que este motor recusa a fazer
 *
 * - **Não inventa item para preencher célula.** Célula vazia é informação: ela
 *   diz onde não há nada, e a matriz não fabrica linha para ficar bonita.
 * - **Não converte ausência em zero.** `excluded` é `null` — e não `0` — quando a
 *   leitura parte das células já montadas: ali não há como saber quantas tarefas
 *   foram examinadas, e um zero afirmaria "nada foi descartado".
 * - **Não usa prazo como urgência.** Reclassificar por `due` reescreveria a
 *   decisão que o operador tomou na triagem.
 */
import type { MissionTask } from './missionTypes';
import type { MissionMatrixCell } from './missionPlan';
import { buildPriorityMatrix } from './missionPlan';

export type { MissionMatrixCell };
export { buildPriorityMatrix };

/**
 * Tom de cada célula, na mesma língua de cores do console.
 *
 * Devolve **nome de tom**, não cor: o motor é puro e não conhece CSS. Quem
 * desenha resolve o nome em variável do tema (`tokens.toneColor`).
 */
export type MissionMatrixTone = 'red' | 'purple' | 'orange' | 'muted' | 'yellow';

/**
 * Quantos itens por célula a leitura mostra antes de resumir em "+ N".
 *
 * Era um `6` literal no painel; virou constante para que painel e widget
 * recortem igual — dois limites diferentes fariam as duas telas discordarem
 * sobre a mesma célula.
 */
export const MATRIX_VISIBLE_ITEMS = 6;

/**
 * Critério de **leitura**, não de classificação.
 *
 * Nada aqui move tarefa de célula: a classificação é a regra canônica e mudá-la
 * a partir do widget seria uma segunda triagem. `visibleItems` é o único recorte
 * aceito, e ele é de tela.
 */
export interface MissionMatrixCriteria {
    /** Itens por célula antes do "+ N"; `null` mostra todos. */
    visibleItems?: number | null;
}

/** A matriz como o painel e o widget precisam lê-la. */
export interface MissionMatrixView {
    /** As cinco células canônicas, na ordem de desenho, com os itens dentro. */
    cells: MissionMatrixCell[];
    /** Itens na mesa: a soma das células, contada — nunca inferida. */
    total: number;
    /** Itens com `impacto` não declarado (a célula `sem-impacto`). */
    unclassified: number;
    /**
     * Tarefas examinadas que **não** entraram em célula nenhuma, ou `null`
     * quando a leitura partiu de células já montadas e o número é desconhecido.
     *
     * É `null`, e não `0`, porque "não sei quantas ficaram de fora" e "nenhuma
     * ficou de fora" são afirmações diferentes. O motivo de cada exclusão não é
     * recontado aqui: ele vive no filtro canônico, e recontá-lo seria manter
     * duas cópias da mesma cláusula.
     */
    excluded: number | null;
    /** Nenhum item na mesa. Célula vazia continua sendo desenhada. */
    isEmpty: boolean;
    /** O recorte de leitura em vigor: número, ou `null` para "todos". */
    visibleItems: number | null;
}

/** Recorte em vigor: `undefined` cai no padrão da casa, `null` significa todos. */
function resolveVisibleItems(criteria?: MissionMatrixCriteria): number | null {
    const raw = criteria?.visibleItems;
    if (raw === null) return null;
    if (raw === undefined) return MATRIX_VISIBLE_ITEMS;
    if (!Number.isFinite(raw) || raw < 0) return MATRIX_VISIBLE_ITEMS;
    return Math.floor(raw);
}

/**
 * A matriz a partir das tarefas — o caminho de quem tem o estoque em mãos.
 *
 * A classificação é delegada inteira a `buildPriorityMatrix`: este motor não
 * decide célula, só lê o resultado. `excluded` é a diferença entre o que foi
 * examinado e o que entrou, exata por construção (cada tarefa cai em no máximo
 * uma célula).
 */
export function buildMatrixView(
    tasks: readonly MissionTask[],
    criteria?: MissionMatrixCriteria,
): MissionMatrixView {
    const list = Array.isArray(tasks) ? tasks : [];
    const cells = buildPriorityMatrix([...list]);
    const view = matrixView(cells, criteria);
    return { ...view, excluded: list.length - view.total };
}

/**
 * A matriz a partir das células já montadas — o caminho do painel e do widget,
 * que leem o snapshot em cache e não têm o estoque de tarefas.
 *
 * Não reconstrói nada: se as células não vierem, a leitura é vazia e `isEmpty`
 * diz isso em palavras. O que não se sabe (`excluded`) sai como `null`.
 */
export function matrixView(
    cells: readonly MissionMatrixCell[] | null | undefined,
    criteria?: MissionMatrixCriteria,
): MissionMatrixView {
    const list = (Array.isArray(cells) ? cells : []).filter(cell => !!cell);
    const total = list.reduce((sum, cell) => sum + (Array.isArray(cell.tasks) ? cell.tasks.length : 0), 0);
    const unclassified = list
        .filter(cell => cell.id === 'sem-impacto')
        .reduce((sum, cell) => sum + (Array.isArray(cell.tasks) ? cell.tasks.length : 0), 0);

    return {
        cells: list as MissionMatrixCell[],
        total,
        unclassified,
        excluded: null,
        isEmpty: total === 0,
        visibleItems: resolveVisibleItems(criteria),
    };
}

/** Os itens que a célula mostra, já recortados pelo critério de leitura. */
export function visibleMatrixTasks(
    cell: MissionMatrixCell,
    criteria?: MissionMatrixCriteria,
): MissionTask[] {
    const tasks = Array.isArray(cell?.tasks) ? cell.tasks : [];
    const limit = resolveVisibleItems(criteria);
    return limit === null ? [...tasks] : tasks.slice(0, limit);
}

/** Quantos itens a célula esconde — o número do "+ N", nunca um palpite. */
export function hiddenMatrixCount(
    cell: MissionMatrixCell,
    criteria?: MissionMatrixCriteria,
): number {
    const tasks = Array.isArray(cell?.tasks) ? cell.tasks : [];
    const limit = resolveVisibleItems(criteria);
    if (limit === null) return 0;
    return Math.max(0, tasks.length - limit);
}

/**
 * Tom da célula. A ordem de leitura é a mesma do painel: o que é urgente e
 * importa grita primeiro, e o que só falta classificar fica em amarelo.
 */
export function matrixCellTone(cell: Pick<MissionMatrixCell, 'id'>): MissionMatrixTone {
    switch (cell?.id) {
        case 'agora': return 'red';
        case 'agendar': return 'purple';
        case 'rapido': return 'orange';
        case 'soltar': return 'muted';
        default: return 'yellow';
    }
}

/**
 * A célula ocupa a linha inteira da grade?
 *
 * `sem-impacto` é transversal — ela não é um quadrante da matriz, é a fila de
 * triagem — e por isso atravessa as duas colunas, como na view canônica.
 */
export function matrixCellWide(cell: Pick<MissionMatrixCell, 'id'>): boolean {
    return cell?.id === 'sem-impacto';
}
