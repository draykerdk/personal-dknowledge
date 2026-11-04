/**
 * O grafo de tarefas na zona gerida do canvas de projeto: as setas de dependência.
 * Módulo puro. (A fileira de widgets, `widgetRow`, saiu em 03/11/2026 com os canvas
 * da semana e do trimestre, os últimos que a geravam.)
 */
import type { CanvasEdge } from '../project/projectCanvasModel';
import { fold } from '../board/boardSpec';

export interface GraphTask { basename: string; status: string; blockedBy?: string[]; type?: string }

const OPEN = (s: string) => !['done', 'cancelled'].includes(String(s).toLowerCase());

/**
 * Seta bloqueadora → bloqueada para cada `blockedBy` cujas duas pontas estão na
 * zona. É a direção do observador de setas (`edgeLinks.ts`): tarefa → tarefa do
 * mesmo nível grava só `blockedBy` na de destino (o motor antigo não grava mais
 * `blocking`), então a seta que o operador desenha e a que o plano desenha dizem
 * o mesmo. Bloqueio ainda aberto sai vermelho.
 *
 * Só entre tarefas do mesmo nível (SMART ↔ SMART, ação ↔ ação), como na tabela
 * da decisão 1: a seta SMART ↔ ação é lida como "SMART mãe", então uma vermelha
 * entre níveis não desligava o `blockedBy` ao ser apagada e voltava na próxima
 * sincronização. O bloqueio entre níveis segue no frontmatter, sem seta.
 */
export function dependencyEdges(placed: Map<string, string>, tasks: GraphTask[], prefix: string): CanvasEdge[] {
    const byName = new Map(tasks.map(t => [fold(t.basename), t]));
    const edges: CanvasEdge[] = [];
    for (const task of tasks) {
        const to = placed.get(fold(task.basename));
        if (!to) continue;
        for (const name of task.blockedBy ?? []) {
            const from = placed.get(fold(name));
            if (!from || from === to) continue;
            const blocker = byName.get(fold(name));
            if (blocker && (blocker.type === 'tarefa_smart') !== (task.type === 'tarefa_smart')) continue;
            const edge: CanvasEdge = { id: `${prefix}d-${from}-${to}`, fromNode: from, fromSide: 'right', toNode: to, toSide: 'left', label: 'bloqueia' };
            if (blocker && OPEN(blocker.status)) edge.color = '1';
            edges.push(edge);
        }
    }
    return edges;
}

