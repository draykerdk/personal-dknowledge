/**
 * Grafo da missão — o plano vivo, tipado e validado.
 *
 * O vault DFM é feito de canvas: 63 arquivos, 481 arestas desenhadas à mão. O
 * que nenhum deles mostra é o **plano em execução** — quais projetos são foco
 * desta semana, quais tarefas foram prometidas para quais dias, onde a intenção
 * não cabe no prazo. `canvasMap` lê o desenho do autor; este módulo desenha o
 * estado vivo, e faz isso com uma regra que o desenho à mão não tem:
 *
 *   **toda ligação tem tipo, e todo tipo tem contrato.**
 *
 * Uma aresta que os dados sustentam mas o contrato não permite não é escondida:
 * ela vira violação declarada, com motivo e severidade. É a diferença entre um
 * diagrama e um instrumento — o diagrama mostra, o instrumento confere.
 *
 * Três regras duras, herdadas do irmão `canvasMap`:
 * 1. **Nada é inventado.** Tarefa sem projeto não ganha um projeto provisório:
 *    ela conta em `looseTasks`. Vínculo declarado que não existe vira violação.
 * 2. **Ausência de dado não é violação.** Não ter `due` não quebra contrato
 *    nenhum; não ter projeto também não. Violação é contradição, não lacuna.
 * 3. **Nenhuma cor aqui.** O módulo entrega semântica (kind, status); a cor é
 *    decisão do tema e mora nos tokens da UI.
 *
 * Escopo: a **semana corrente**. Um grafo com as 74 tarefas do vault não seria
 * um plano, seria o vault de novo.
 */
import { isTerminalStatus } from './taskSemantics';
import { diaNoInicio } from './dia';
import { agendadaForaDaSemana, planejadaDepoisDoPrazo, projetoForaDoFoco } from './conferenciasDoPlano';
import type { MissionCanvas, MissionProject, MissionTask, MissionTree } from './missionTypes';

export type MissionNodeKind =
    | 'trimestre' | 'semana' | 'dia' | 'area' | 'projeto' | 'tarefa' | 'arvore' | 'canvas';

export type MissionEdgeKind =
    | 'contem' | 'foco' | 'executa' | 'agenda' | 'vence' | 'renderiza' | 'aponta';

export interface MissionGraphNode {
    /** Estável e legível: `${kind}:${chave}`. */
    id: string;
    kind: MissionNodeKind;
    label: string;
    /** Linha secundária curta: estado, contagem, caminho. */
    detail: string;
    path: string | null;
    /** Status/estado cru do que o nó representa. */
    status: string;
    /** Número que resume o nó (tarefas abertas, minutos, nós do canvas). */
    metric: number | null;
    /** Faixa de desenho: 0 = topo. */
    layer: number;
}

export interface MissionGraphEdge {
    id: string;
    from: string;
    to: string;
    kind: MissionEdgeKind;
    label: string;
}

/**
 * Ligação que os dados sustentam e o contrato do tipo não permite.
 * `critical` é contradição de dados (agenda fora da semana, prazo antes da
 * intenção); `warning` é decisão a conferir (projeto fora do foco declarado).
 */
export interface MissionGraphViolation {
    id: string;
    kind: MissionEdgeKind;
    from: string;
    to: string;
    reason: string;
    severity: 'warning' | 'critical';
}

export interface MissionGraphLegendEntry {
    kind: MissionEdgeKind;
    label: string;
    from: MissionNodeKind;
    to: MissionNodeKind;
    count: number;
}

export interface MissionGraphInput {
    week: string;
    quarter: string;
    today: string;
    /** Os 7 dias da semana corrente, já resolvidos pelo chamador. */
    days: Array<{ date: string; label: string; weekday: number; isToday: boolean }>;
    /** Nomes de projeto em foco (`projetos_foco` da nota da semana, normalizados). */
    weekFocus: string[];
    projects: MissionProject[];
    tasks: MissionTask[];
    trees: MissionTree[];
    canvases: MissionCanvas[];
}

export interface MissionGraph {
    nodes: MissionGraphNode[];
    edges: MissionGraphEdge[];
    legend: MissionGraphLegendEntry[];
    violations: MissionGraphViolation[];
    /** Nós sem nenhuma aresta. */
    orphans: string[];
    /** Tarefas abertas da semana que não entraram no grafo por falta de ligação. */
    looseTasks: number;
    stats: {
        nodes: number;
        edges: number;
        byKind: Record<MissionNodeKind, number>;
        byEdge: Record<MissionEdgeKind, number>;
    };
}

/* ==========================================================================
   Contratos por tipo de aresta
   ========================================================================== */

interface EdgeContract {
    kind: MissionEdgeKind;
    label: string;
    from: MissionNodeKind;
    to: MissionNodeKind;
}

/**
 * O contrato, declarado uma vez. `legend` só publica o que o grafo realmente
 * usou — tipo sem aresta não vira linha de legenda dizendo "0", porque uma
 * legenda é a lista do que existe no desenho.
 */
const CONTRACTS: ReadonlyArray<EdgeContract> = [
    { kind: 'contem', label: 'contém', from: 'trimestre', to: 'semana' },
    { kind: 'contem', label: 'contém', from: 'semana', to: 'dia' },
    { kind: 'contem', label: 'contém', from: 'area', to: 'projeto' },
    { kind: 'foco', label: 'foco da semana', from: 'semana', to: 'projeto' },
    { kind: 'executa', label: 'executa', from: 'projeto', to: 'tarefa' },
    { kind: 'agenda', label: 'agenda', from: 'dia', to: 'tarefa' },
    { kind: 'vence', label: 'vence', from: 'dia', to: 'tarefa' },
    { kind: 'renderiza', label: 'renderiza', from: 'projeto', to: 'arvore' },
    { kind: 'aponta', label: 'aponta', from: 'projeto', to: 'canvas' },
];

const LAYERS: Record<MissionNodeKind, number> = {
    trimestre: 0,
    semana: 1,
    dia: 2,
    area: 1,
    projeto: 2,
    tarefa: 3,
    arvore: 3,
    canvas: 3,
};

const EMPTY_KINDS: Record<MissionNodeKind, number> = {
    trimestre: 0, semana: 0, dia: 0, area: 0, projeto: 0, tarefa: 0, arvore: 0, canvas: 0,
};

const EMPTY_EDGES: Record<MissionEdgeKind, number> = {
    contem: 0, foco: 0, executa: 0, agenda: 0, vence: 0, renderiza: 0, aponta: 0,
};

/* ==========================================================================
   Construção
   ========================================================================== */

/** Chave comparável de nome de projeto: `[[X]]`, `X` e `X ` são o mesmo projeto. */
function sameName(a: string, b: string): boolean {
    const clean = (value: string) => String(value ?? '')
        .replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim().toLowerCase();
    return clean(a) === clean(b) && clean(a).length > 0;
}

/** Nome curto de um caminho, sem extensão — é o que cabe no nó. */
function shortPath(path: string): string {
    const base = String(path ?? '').split('/').pop() ?? String(path ?? '');
    return base.replace(/\.(md|canvas)$/, '');
}

/**
 * Só a data (`YYYY-MM-DD`), descartando a hora declarada.
 *
 * Comparar `2026-09-20T09:00` com `2026-09-20` como string dá "maior" — e o
 * grafo acusaria de fora da janela uma tarefa agendada no último dia da semana.
 */
function dayKey(raw: string): string {
    return diaNoInicio(String(raw ?? '').trim());
}

export function buildMissionGraph(input: MissionGraphInput): MissionGraph {
    const nodes: MissionGraphNode[] = [];
    const edges: MissionGraphEdge[] = [];
    const violations: MissionGraphViolation[] = [];
    const nodeIds = new Set<string>();
    const edgeKeys = new Set<string>();
    const weekStart = input.days[0]?.date ?? '';
    const weekEnd = input.days[input.days.length - 1]?.date ?? '';
    const inWeek = (date: string) => !!date && !!weekStart && date >= weekStart && date <= weekEnd;

    const addNode = (
        kind: MissionNodeKind,
        key: string,
        node: Omit<MissionGraphNode, 'id' | 'kind' | 'layer'>,
    ): string => {
        const id = `${kind}:${key}`;
        if (nodeIds.has(id)) return id;
        nodeIds.add(id);
        nodes.push({ id, kind, layer: LAYERS[kind], ...node });
        return id;
    };

    const addEdge = (
        kind: MissionEdgeKind,
        from: string,
        to: string,
        label: string,
    ): void => {
        if (!nodeIds.has(from) || !nodeIds.has(to)) return;
        const id = `${from}->${to}#${kind}`;
        if (edgeKeys.has(id)) return;
        edgeKeys.add(id);
        edges.push({ id, from, to, kind, label });
    };

    const violate = (
        kind: MissionEdgeKind,
        from: string,
        to: string,
        reason: string,
        severity: MissionGraphViolation['severity'],
    ): void => {
        violations.push({ id: `${from}->${to}#${kind}#violation`, kind, from, to, reason, severity });
    };

    /* ---- Camada 0-2: trimestre, semana e os sete dias ---- */

    const quarterId = addNode('trimestre', input.quarter, {
        label: input.quarter,
        detail: 'trimestre corrente',
        path: null,
        status: 'open',
        metric: null,
    });
    const weekId = addNode('semana', input.week, {
        label: input.week,
        detail: `${input.days.length} dia(s) · ${input.weekFocus.length} projeto(s) em foco`,
        path: `300 - RUNTIME/302 - Daymiss/Week/${input.week}.md`,
        status: 'open',
        metric: input.weekFocus.length,
    });
    addEdge('contem', quarterId, weekId, 'contém');

    const dayIdByDate = new Map<string, string>();
    for (const day of input.days) {
        const id = addNode('dia', day.date, {
            label: day.label,
            detail: day.date,
            path: `300 - RUNTIME/302 - Daymiss/Day/${day.date}.md`,
            status: day.isToday ? 'today' : day.date < input.today ? 'past' : 'future',
            metric: null,
        });
        dayIdByDate.set(day.date, id);
        addEdge('contem', weekId, id, 'contém');
    }

    /* ---- Projetos: em foco declarado, ou com tarefa aberta da semana ---- */

    const focusNames = input.weekFocus.map(name => name.trim()).filter(Boolean);
    const openWeekTasks = input.tasks.filter(task =>
        !isTerminalStatus(task.status) && !task.archived && task.week === input.week);

    const projectNames = new Set<string>();
    for (const name of focusNames) projectNames.add(name);
    for (const task of openWeekTasks) for (const project of task.projects) projectNames.add(project);

    const projectByName = new Map<string, MissionProject>();
    for (const project of input.projects) projectByName.set(project.name.toLowerCase(), project);

    const projectIdByName = new Map<string, string>();
    for (const name of projectNames) {
        const project = projectByName.get(name.toLowerCase());
        // A conferência do foco mora em conferenciasDoPlano (02/11): a Missão lê a mesma.
        const isFocus = !projetoForaDoFoco(name, focusNames);
        const id = addNode('projeto', name, {
            label: name,
            detail: project
                ? `${project.completed}/${project.total} · ${project.health}`
                : 'sem dado agregado neste snapshot',
            // O snapshot agrega projeto por tarefa e não carrega o caminho da nota
            // índice; a UI abre por wikilink `[[nome]]`. Nó sem caminho é estado
            // declarado, não link quebrado.
            path: null,
            status: project?.health ?? 'no-data',
            metric: project ? project.total - project.completed : null,
        });
        projectIdByName.set(name.toLowerCase(), id);

        if (isFocus) {
            addEdge('foco', weekId, id, 'foco da semana');
        } else {
            // O projeto tem trabalho aberto nesta semana e não está declarado no
            // foco: não é erro de dado, é decisão a conferir na triagem.
            violate('foco', weekId, id,
                `O projeto "${name}" tem tarefa aberta na semana mas não está em projetos_foco. Ou ele entra no foco, ou a tarefa não é desta semana.`,
                'warning');
        }
    }

    /* ---- Área não entra: o snapshot não sabe a qual área cada projeto pertence.

       `MissionProject` é agregado a partir das tarefas (nome, totais, saúde) e não
       carrega pasta nem área. Ligar projeto a área aqui exigiria inventar o
       vínculo — e um grafo que inventa relação é pior que um grafo menor. A
       ausência está declarada na interface, não escondida. */

    /* ---- Tarefas da semana, com agenda e prazo ---- */

    let looseTasks = 0;
    for (const task of openWeekTasks) {
        // Data normalizada antes de comparar. `toMissionTask` já recorta a hora,
        // mas o grafo é chamado por outras portas (ponte, agente, teste) e uma
        // data crua `2026-09-20T09:00` seria MAIOR que `2026-09-20` na comparação
        // de string — e o painel acusaria "agendada fora da janela" uma tarefa
        // que está dentro dela. Acusação falsa é pior que omissão.
        const scheduledDate = dayKey(task.scheduledDate);
        const dueDate = dayKey(task.due);
        const scheduledOutOfWeek = agendadaForaDaSemana(scheduledDate, weekStart, weekEnd);
        const taskId = addNode('tarefa', task.path, {
            label: task.title,
            detail: [
                task.scheduledTime || (scheduledDate || 'sem agenda'),
                task.estimate === null ? 'sem estimativa' : `${task.estimate} min`,
            ].join(' · '),
            path: task.path,
            status: task.status,
            metric: task.estimate,
        });

        let linked = false;
        for (const project of task.projects) {
            const projectId = projectIdByName.get(project.toLowerCase());
            if (projectId) {
                addEdge('executa', projectId, taskId, 'executa');
                linked = true;
            }
        }

        if (inWeek(scheduledDate)) {
            const dayId = dayIdByDate.get(scheduledDate);
            if (dayId) {
                addEdge('agenda', dayId, taskId, 'agenda');
                linked = true;
            }
        } else if (scheduledOutOfWeek) {
            // A tarefa declara `week` desta semana e uma agenda fora dela: uma das
            // duas está errada, e quem decide qual é o operador.
            violate('agenda', weekId, taskId,
                `Agendada para ${scheduledDate}, fora da janela ${weekStart}–${weekEnd} da semana ${input.week}.`,
                'critical');
            linked = true;
        }

        if (inWeek(dueDate)) {
            const dayId = dayIdByDate.get(dueDate);
            if (dayId) {
                addEdge('vence', dayId, taskId, 'vence');
                linked = true;
            }
        }

        if (planejadaDepoisDoPrazo(scheduledDate, dueDate)) {
            violate('agenda', taskId, taskId,
                `A intenção (${scheduledDate}) está depois do prazo (${dueDate}).`,
                'critical');
        }

        if (!linked) looseTasks += 1;
    }

    /* ---- Árvores de progressão e canvases dos projetos presentes ---- */

    for (const name of projectNames) {
        const projectId = projectIdByName.get(name.toLowerCase());
        if (!projectId) continue;

        const tree = input.trees.find(candidate => sameName(candidate.project, name));
        if (tree) {
            const treeId = addNode('arvore', tree.file, {
                label: shortPath(tree.file),
                detail: `${tree.done}/${tree.total} níveis`,
                path: tree.file,
                status: tree.active ? 'ativo' : 'done',
                metric: tree.done,
            });
            addEdge('renderiza', projectId, treeId, 'renderiza');
        }

        const canvas = input.canvases.find(candidate => sameName(candidate.name, name));
        if (canvas) {
            const canvasId = addNode('canvas', canvas.path, {
                label: canvas.name,
                detail: canvas.nodes === null ? 'canvas ilegível' : `${canvas.nodes} nós`,
                path: canvas.path,
                status: canvas.system ? 'sistema' : 'projeto',
                metric: canvas.nodes,
            });
            addEdge('aponta', projectId, canvasId, 'aponta');
        }
    }

    /* ---- Resumo ---- */

    const byKind = { ...EMPTY_KINDS };
    for (const node of nodes) byKind[node.kind] += 1;
    const byEdge = { ...EMPTY_EDGES };
    for (const edge of edges) byEdge[edge.kind] += 1;

    const degree = new Map<string, number>();
    for (const node of nodes) degree.set(node.id, 0);
    for (const edge of edges) {
        if (edge.from !== edge.to) {
            degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
            degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
        }
    }
    // Violações contam como incidência: um nó denunciado não é órfão — ele está
    // ligado por uma ligação recusada, e esconder isso apagaria o aviso.
    for (const violation of violations) {
        degree.set(violation.from, (degree.get(violation.from) ?? 0) + 1);
        degree.set(violation.to, (degree.get(violation.to) ?? 0) + 1);
    }
    const orphans = nodes.filter(node => (degree.get(node.id) ?? 0) === 0).map(node => node.id);

    const kindOf = new Map(nodes.map(node => [node.id, node.kind]));
    const legend = CONTRACTS
        .map(contract => ({
            kind: contract.kind,
            label: contract.label,
            from: contract.from,
            to: contract.to,
            // Conta o **par** do contrato, não o tipo solto: `contem` liga
            // trimestre→semana e semana→dia, e somar por tipo faria as duas
            // linhas exibirem o mesmo total — legenda que mente sobre o desenho.
            count: edges.filter(edge =>
                edge.kind === contract.kind
                && kindOf.get(edge.from) === contract.from
                && kindOf.get(edge.to) === contract.to).length,
        }))
        .filter(entry => entry.count > 0);

    return {
        nodes,
        edges,
        legend,
        violations,
        orphans,
        looseTasks,
        stats: { nodes: nodes.length, edges: edges.length, byKind, byEdge },
    };
}
