/**
 * O canvas do projeto como gerente das tarefas do projeto.
 *
 * Contrato do Kernel (006 · Tarefas SMART): a SMART tem `projects: [[Projeto]]`;
 * a ação atômica tem `projects: [[Tarefa SMART mãe]]`. Daqui sai a árvore
 * `Projeto → SMART → atômica` que o canvas desenha.
 *
 * O desenho vive numa **zona gerida** — um grupo do canvas cujos nós têm id
 * `dfm-pc-*`. Só ela é reescrita; tudo fora dela é do operador e fica intacto.
 * Uma tarefa que o operador já pôs no canvas fora da zona não é duplicada.
 *
 * Módulo puro: sem Obsidian. Recebe dados, devolve o próximo JSON do canvas.
 */

import { taskColor, progressLine } from '../canvas/taskColor';
import { operatorEdges } from '../canvas/managedIds';
import type { KeepEdge } from '../canvas/managedIds';
import { dependencyEdges } from '../canvas/taskGraph';
import { grammarCounts, grammarText, workHorizon, type GrammarCounts, type GrammarPeriod } from '../engine/showGrammar';

export interface TaskInfo {
    path: string;
    /** Nome do arquivo sem extensão — é por ele que os wikilinks apontam. */
    basename: string;
    type: string;
    status: string;
    /** Destinos de `projects`, já sem `[[ ]]` nem alias. */
    projects: string[];
    due: string;
    week: string;
    completedDate: string;
    /** Opcionais: nem todo construtor (testes, ponte) os conhece. */
    priority?: string;
    blockedBy?: string[];
}

export interface ProjectInfo {
    name: string;
    /** Pasta do projeto. */
    path: string;
    /** Nota-índice, quando existe. */
    index: string | null;
    /** Departamento (`200 - DEPARTMENTS/`) ou projeto do kanban; sem o campo, projeto. */
    kind?: 'projeto' | 'departamento';
}

export interface SmartColumn {
    smart: TaskInfo;
    /** As ações mostradas na coluna (as concluídas, cortadas às mais recentes). */
    children: TaskInfo[];
    /** Todas as ações da SMART, sem corte: é por elas que a barra e a cor contam. */
    all: TaskInfo[];
}

export interface ProjectTasks {
    /** SMART abertas, cada uma com suas atômicas. */
    open: SmartColumn[];
    /** SMART concluídas ou canceladas — mostradas só como lista. */
    closed: TaskInfo[];
    /**
     * Atômicas abertas sem SMART mãe aberta: ligadas direto ao projeto, ou cuja
     * mãe do projeto foi concluída ou cancelada. Elas contam no "quanto falta";
     * aqui ganham um nó na zona e o menu de religar.
     */
    loose: TaskInfo[];
}

export const TERMINAL = new Set(['done', 'cancelled']);
export const ZONE_PREFIX = 'dfm-pc-';
export const ZONE_GROUP_ID = `${ZONE_PREFIX}zone`;

export function fold(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** `[[Pasta/Nota|alias]]` → `Nota`. */
export function linkTarget(raw: unknown): string {
    const value = String(raw ?? '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0];
    return value.slice(value.lastIndexOf('/') + 1).replace(/\.md$/, '').trim();
}

/** Nomes pelos quais as tarefas apontam o projeto: o nome e a nota-índice (menos `README`). */
export function projectKeys(project: Pick<ProjectInfo, 'name' | 'index'>): Set<string> {
    const keys = new Set([fold(project.name)]);
    if (project.index) {
        const base = project.index.slice(project.index.lastIndexOf('/') + 1).replace(/\.md$/, '');
        if (base.toLowerCase() !== 'readme') keys.add(fold(base));
    }
    return keys;
}

function isSmart(task: TaskInfo): boolean {
    return task.type === 'tarefa_smart';
}

/**
 * As ações de uma SMART: toda tarefa que não é SMART e aponta para ela em
 * `projects`, de qualquer status. Uma regra só para a zona do projeto, o bloco
 * da semana e o cartão; a ação com duas mães conta nas duas.
 */
export function smartChildren<T extends Pick<TaskInfo, 'type' | 'projects'>>(smart: Pick<TaskInfo, 'basename'>, tasks: readonly T[]): T[] {
    const key = fold(smart.basename);
    return tasks.filter(t => t.type !== 'tarefa_smart' && (t.projects ?? []).some(p => fold(p) === key));
}

/**
 * A ação tem alguma SMART mãe aberta, em qualquer projeto? É a regra do menu
 * fora de canvas de projeto; dentro dele vale `hasOpenMotherIn` (só as mães do
 * projeto). `smarts`: as SMART do vault pela chave `fold(basename)`.
 */
export function hasOpenMother(task: Pick<TaskInfo, 'projects'>, smarts: ReadonlyMap<string, Pick<TaskInfo, 'status'>>): boolean {
    return task.projects.some(p => {
        const smart = smarts.get(fold(p));
        return !!smart && !TERMINAL.has(smart.status);
    });
}

/**
 * A ação tem SMART mãe aberta **neste projeto** (`keys`: `projectKeys` dele)?
 * O mesmo critério da coluna "Direto no projeto" (`collectProjectTasks`) e do
 * "N sem SMART" do painel: a mãe aberta de outro projeto não conta aqui.
 */
export function hasOpenMotherIn(
    task: Pick<TaskInfo, 'projects'>,
    smarts: ReadonlyMap<string, Pick<TaskInfo, 'status' | 'projects'>>,
    keys: Iterable<string>,
): boolean {
    const project = new Set([...keys].map(fold));
    return task.projects.some(p => {
        const smart = smarts.get(fold(p));
        return !!smart && !TERMINAL.has(smart.status) && smart.projects.some(k => project.has(fold(k)));
    });
}

/** Os projetos que a ação toca: o vínculo direto e os projetos de cada SMART mãe (aberta ou encerrada). */
function projectsTouched(task: Pick<TaskInfo, 'projects'>, smarts: ReadonlyMap<string, Pick<TaskInfo, 'projects'>>): Set<string> {
    const keys = new Set<string>();
    for (const link of task.projects) {
        const smart = smarts.get(fold(link));
        if (smart) smart.projects.forEach(p => keys.add(fold(p)));
        else keys.add(fold(link));
    }
    return keys;
}

/**
 * O menu do nó oferece "Ligar a uma SMART…" para esta ação aberta?
 * Num canvas de projeto (`keys` do projeto) e com a ação tocando o projeto, a
 * regra é a da zona: sem mãe aberta **neste** projeto (`hasOpenMotherIn`). Fora
 * de canvas de projeto, ou com a ação de outro projeto, a regra é global: sem
 * nenhuma mãe aberta (`hasOpenMother`).
 */
export function offersLinkToSmart(
    task: Pick<TaskInfo, 'projects'>,
    smarts: ReadonlyMap<string, Pick<TaskInfo, 'status' | 'projects'>>,
    keys?: Iterable<string> | null,
): boolean {
    if (keys) {
        const project = new Set([...keys].map(fold));
        const touched = projectsTouched(task, smarts);
        if ([...project].some(k => touched.has(k))) return !hasOpenMotherIn(task, smarts, project);
    }
    return !hasOpenMother(task, smarts);
}

/**
 * As SMART abertas que podem ser mãe da ação: as do projeto dela, direto ou
 * pela mãe (aberta ou encerrada). Ordem por nome, para o seletor; com
 * `prefer` (os `projectKeys` do canvas de onde veio o pedido), as SMART desse
 * projeto vêm primeiro.
 */
export function smartOptionsFor(task: Pick<TaskInfo, 'projects'>, tasks: readonly TaskInfo[], prefer?: Iterable<string> | null): TaskInfo[] {
    const smarts = new Map(tasks.filter(isSmart).map(s => [fold(s.basename), s]));
    const keys = projectsTouched(task, smarts);
    const first = new Set([...(prefer ?? [])].map(fold));
    const rank = (s: TaskInfo) => (s.projects.some(p => first.has(fold(p))) ? 0 : 1);
    return tasks.filter(s => isSmart(s) && !TERMINAL.has(s.status) && s.projects.some(p => keys.has(fold(p))))
        .sort((a, b) => rank(a) - rank(b) || a.basename.localeCompare(b.basename, 'pt-BR'));
}

/** Aberta primeiro; depois prazo mais próximo; depois nome. */
function byWork(a: TaskInfo, b: TaskInfo): number {
    return Number(TERMINAL.has(a.status)) - Number(TERMINAL.has(b.status))
        || (a.status === 'in-progress' ? 0 : 1) - (b.status === 'in-progress' ? 0 : 1)
        || (a.due || '9999').localeCompare(b.due || '9999')
        || a.basename.localeCompare(b.basename, 'pt-BR');
}

/** Monta a árvore do projeto a partir das tarefas do vault. */
export function collectProjectTasks(project: ProjectInfo, tasks: TaskInfo[], opts: { doneChildren?: number } = {}): ProjectTasks {
    const keys = projectKeys(project);
    const ofProject = (t: TaskInfo) => t.projects.some(p => keys.has(fold(p)));

    const smarts = tasks.filter(t => isSmart(t) && ofProject(t));
    const smartByKey = new Map(smarts.map(s => [fold(s.basename), s]));
    const children = new Map<string, TaskInfo[]>(smarts.map(s => [s.path, []]));
    const loose: TaskInfo[] = [];

    for (const task of tasks) {
        if (isSmart(task)) continue;
        const mothers = task.projects.map(p => smartByKey.get(fold(p))).filter((s): s is TaskInfo => !!s);
        const openMother = mothers.find(s => !TERMINAL.has(s.status));
        if (openMother) children.get(openMother.path)!.push(task);
        // Mãe encerrada com a ação ainda aberta: a ação conta no "quanto falta"
        // (`projectProgress`), então fica visível em "Direto no projeto".
        else if ((mothers.length > 0 || ofProject(task)) && !TERMINAL.has(task.status)) loose.push(task);
    }

    const doneChildren = opts.doneChildren ?? 3;
    const trim = (list: TaskInfo[]) => {
        const open = list.filter(t => !TERMINAL.has(t.status)).sort(byWork);
        const done = list.filter(t => TERMINAL.has(t.status))
            .sort((a, b) => (b.completedDate || '').localeCompare(a.completedDate || ''))
            .slice(0, doneChildren);
        return [...open, ...done];
    };

    return {
        open: smarts.filter(s => !TERMINAL.has(s.status))
            .sort((a, b) => (b.week || '').localeCompare(a.week || '') || byWork(a, b))
            .map(smart => ({ smart, children: trim(children.get(smart.path)!), all: smartChildren(smart, tasks) })),
        closed: smarts.filter(s => TERMINAL.has(s.status))
            .sort((a, b) => (b.completedDate || b.week || '').localeCompare(a.completedDate || a.week || '')),
        loose: loose.sort(byWork),
    };
}

/* ------------------------------------------------------------ progresso */

export interface ProjectProgress {
    smartDone: number;
    smartTotal: number;
    actionDone: number;
    actionTotal: number;
    /** SMART e ações que ainda não foram concluídas. */
    open: number;
    /**
     * A forma de mostrar do projeto (`engine/showGrammar.ts`): as SMART e as ações dele,
     * no horizonte de trabalho; com o período do trimestre, as feitas contam só nele.
     */
    grammar: GrammarCounts;
}

const DONE_STATUS = new Set(['done', 'completed', 'complete']);

/**
 * As unidades de um projeto (a conta do trimestre, da zona, do cartão e do painel):
 * as SMART do projeto e as ações ligadas a ele, direto ou por uma SMART dele (aberta ou
 * encerrada), cada uma uma vez só. As canceladas ficam de fora: cancelar não é concluir
 * nem é trabalho que falta.
 */
export function projectUnits<T extends TaskInfo>(project: Pick<ProjectInfo, 'name' | 'index'> & { keys?: Iterable<string> }, tasks: readonly T[]): { smarts: T[]; actions: T[] } {
    const keys = project.keys ? new Set([...project.keys].map(fold)) : projectKeys(project);
    const live = tasks.filter(t => String(t.status).toLowerCase() !== 'cancelled');
    const smartKeys = new Set(tasks.filter(t => isSmart(t) && t.projects.some(p => keys.has(fold(p)))).map(s => fold(s.basename)));
    const smarts = live.filter(t => isSmart(t) && t.projects.some(p => keys.has(fold(p))));
    const actions = live.filter(t => !isSmart(t) && t.projects.some(p => keys.has(fold(p)) || smartKeys.has(fold(p))));
    return { smarts, actions };
}

/**
 * "Quanto falta" de um projeto — uma conta só, para o trimestre, a zona, o cartão e o painel.
 *
 * Conta a lista inteira (sem o corte de exibição de `collectProjectTasks`) e
 * deixa as canceladas de fora: cancelar não é concluir nem é trabalho que falta.
 * Ação conta pela SMART mãe do projeto ou pelo vínculo direto, uma vez só.
 * `period`: as semanas e as datas do trimestre; a forma de mostrar conta as feitas só
 * nele (sem período, todas). As abertas contam sempre: são o que falta.
 */
export function projectProgress(project: Pick<ProjectInfo, 'name' | 'index'> & { keys?: Iterable<string> }, tasks: TaskInfo[], period: GrammarPeriod | null = null): ProjectProgress {
    const { smarts, actions } = projectUnits(project, tasks);
    const done = (list: TaskInfo[]) => list.filter(t => DONE_STATUS.has(String(t.status).toLowerCase())).length;
    const p = { smartDone: done(smarts), smartTotal: smarts.length, actionDone: done(actions), actionTotal: actions.length };
    return {
        ...p,
        open: (p.smartTotal - p.smartDone) + (p.actionTotal - p.actionDone),
        grammar: grammarCounts([...smarts, ...actions], workHorizon(period)),
    };
}

/**
 * A linha do projeto na forma de mostrar, pela função única:
 * "5 feitas · 5/12 do plano · faltam 7 · +2 fora do plano · +13 algum dia".
 * Sem nenhuma tarefa, "sem tarefas" (ausência não é zero).
 */
export function progressText(p: Pick<ProjectProgress, 'grammar'>): string {
    return grammarText(p.grammar, 'sem tarefas');
}

/* ------------------------------------------------------------ canvas JSON */

export interface CanvasNode {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    file?: string;
    text?: string;
    label?: string;
    color?: string;
    [key: string]: unknown;
}
export interface CanvasEdge { id: string; fromNode: string; toNode: string; fromSide?: string; toSide?: string; [key: string]: unknown }
export interface CanvasData { nodes: CanvasNode[]; edges: CanvasEdge[]; [key: string]: unknown }

export const LAYOUT = {
    pad: 40,
    header: 60,
    colWidth: 380,
    colGap: 60,
    smartHeight: 170,
    taskHeight: 112,
    rowGap: 24,
    gapBelowContent: 240,
    progressHeight: 56,
    /** O cabeçalho do projeto, no topo da zona. */
    headHeight: 160,
};

/** Id do cabeçalho gerido do projeto, no topo da zona. */
export const PROJECT_HEAD_ID = `${ZONE_PREFIX}proj`;

/** Id estável por caminho: a mesma tarefa mantém o mesmo nó entre sincronizações. */
export function nodeIdFor(path: string): string {
    let h = 5381;
    for (let i = 0; i < path.length; i++) h = ((h << 5) + h + path.charCodeAt(i)) >>> 0;
    return `${ZONE_PREFIX}${h.toString(36)}`;
}

export function isManaged(id: string): boolean {
    return id.startsWith(ZONE_PREFIX);
}

export interface PlanResult {
    data: CanvasData;
    stats: { smarts: number; tasks: number; loose: number; skipped: number };
}

/** Um destino de navegação: o rótulo e o caminho completo, ou `null` quando não existe (fica só o texto). */
export interface NavRef { label: string; path: string | null }

/** O que o cabeçalho do projeto mostra: o progresso e o caminho de volta. */
export interface ProjectHeader {
    /** `projectProgress` do projeto, sobre a lista inteira de tarefas do vault (com o período do trimestre atual). */
    progress: ProjectProgress;
    /** O trimestre (canvas do trimestre, ou a nota). */
    quarter?: NavRef | null;
    /** A semana em foco (canvas da semana, ou a nota). */
    week?: NavRef | null;
    /** A área (o canvas do topo da área). */
    area?: NavRef | null;
}

const navLink = (ref: NavRef) => (ref.path ? `[[${ref.path}|${ref.label}]]` : ref.label);

/**
 * O texto do nó `dfm-pc-proj`: o nome (com link para a nota-índice), a forma de
 * mostrar do projeto (a mesma do trimestre e do painel, por `progressText`) e
 * "↑ 2026-Q4 · W42 · Uma área".
 * Link só para o que existe; o resto fica em texto.
 */
export function projectHeaderText(project: Pick<ProjectInfo, 'name' | 'index'>, header: ProjectHeader): string {
    const title = project.index ? `[[${project.index}|${project.name}]]` : project.name;
    const nav = [header.quarter, header.week, header.area].filter((r): r is NavRef => !!r && !!r.label).map(navLink);
    return [`### ${title}`, progressText(header.progress), ...(nav.length ? [`↑ ${nav.join(' · ')}`] : [])].join('\n');
}

/**
 * O próximo canvas: tudo o que não é da zona fica como está; a zona é refeita.
 *
 * A zona fica onde já estava (o operador pode arrastar o grupo inteiro). Na
 * primeira vez, entra abaixo de todo o conteúdo existente.
 */
export interface PlanOptions {
    /** Com a data de hoje a zona pinta pela regra de `taskColor`; sem ela, preserva a cor que havia. */
    today?: string;
    /** A seta do operador que toca a zona é anotação e fica? Sem isso, sai (desenho de antes da Fase 3). */
    keepEdge?: KeepEdge<CanvasEdge, CanvasNode>;
    /** Cabeçalho `dfm-pc-proj` no topo da zona, com setas projeto → SMART (Fase 5). Sem ele, a zona começa nas SMART. */
    header?: ProjectHeader;
}

export function planProjectCanvas(current: CanvasData, project: ProjectInfo, tree: ProjectTasks, opts: PlanOptions = {}): PlanResult {
    const nodes = (current.nodes ?? []).filter(n => !isManaged(n.id));

    // Tarefas que o operador pôs fora da zona continuam lá, e não entram de novo.
    const outside = new Set(nodes.filter(n => n.type === 'file' && n.file).map(n => n.file as string));
    const oldZone = (current.nodes ?? []).find(n => n.id === ZONE_GROUP_ID);
    // A cor é do formatador de canvas (só o status; a prioridade não pinta): a zona só preserva a que já havia.
    const oldColor = new Map((current.nodes ?? []).filter(n => isManaged(n.id) && n.color).map(n => [n.id, n.color as string]));

    let origin: { x: number; y: number };
    if (oldZone) origin = { x: oldZone.x, y: oldZone.y };
    else if (nodes.length) {
        origin = {
            x: Math.min(...nodes.map(n => n.x)),
            y: Math.max(...nodes.map(n => n.y + n.height)) + LAYOUT.gapBelowContent,
        };
    } else origin = { x: 0, y: 0 };

    const L = LAYOUT;
    const zoneNodes: CanvasNode[] = [];
    const zoneEdges: CanvasEdge[] = [];
    const stats = { smarts: 0, tasks: 0, loose: 0, skipped: 0 };
    let top = origin.y + L.pad + L.header;
    let rowWidth = 0;
    // O cabeçalho do projeto abre a zona, à esquerda. A fileira de widgets ao lado dele (o progresso, a linha
    // do tempo e a matriz) deixou de ser gerada em 02/11/2026 (aposentadoria, fase 2; decisão 3 do inventário):
    // o progresso está no cartão do projeto na Missão, e a linha do tempo e a matriz saíram com os canvas da
    // semana. Os nós `dfm-pc-w-*` que sobraram são da zona e saem na próxima sincronização.
    let headId: string | null = null;
    if (opts.header) {
        const height = L.headHeight;
        zoneNodes.push({ id: PROJECT_HEAD_ID, type: 'text', x: origin.x + L.pad, y: top, width: L.colWidth, height, text: projectHeaderText(project, opts.header) });
        headId = PROJECT_HEAD_ID;
        rowWidth = L.colWidth;
        top += height + L.colGap;
    }
    const placed = new Map<string, string>();
    // A barra e a cor da SMART contam todas as ações dela; o corte é só de exibição.
    const childrenOf = new Map(tree.open.map(c => [c.smart.path, c.all ?? c.children]));
    let col = 0;
    let bottom = top;

    const fileNode = (task: TaskInfo, x: number, y: number, height: number): CanvasNode => {
        const node: CanvasNode = { id: nodeIdFor(task.path), type: 'file', file: task.path, x, y, width: L.colWidth, height };
        const color = opts.today
            ? taskColor(task, opts.today, { children: childrenOf.get(task.path) })
            : oldColor.get(node.id);
        if (color) node.color = color;
        placed.set(fold(task.basename), node.id);
        return node;
    };

    const column = (title: string | null, head: TaskInfo | null, items: TaskInfo[]) => {
        const x = origin.x + L.pad + col * (L.colWidth + L.colGap);
        let y = top;
        let smartId: string | null = null;
        if (title !== null) {
            zoneNodes.push({ id: `${ZONE_PREFIX}col-${col}`, type: 'text', x, y, width: L.colWidth, height: L.smartHeight, text: title });
            y += L.smartHeight + L.rowGap;
        } else if (head) {
            if (outside.has(head.path)) stats.skipped++;
            else {
                const node = fileNode(head, x, y, L.smartHeight);
                zoneNodes.push(node);
                smartId = node.id;
                stats.smarts++;
                // Seta projeto → SMART: o vínculo `projects: [[Projeto]]` da SMART, desenhado.
                if (headId) zoneEdges.push({ id: `${ZONE_PREFIX}ep-${node.id.slice(ZONE_PREFIX.length)}`, fromNode: headId, fromSide: 'bottom', toNode: node.id, toSide: 'top' });
            }
            y += L.smartHeight + L.rowGap;
            if (opts.today) {
                // O avanço da SMART numa linha, logo abaixo dela, sobre todas as ações dela.
                zoneNodes.push({ id: `${ZONE_PREFIX}p-${nodeIdFor(head.path).slice(ZONE_PREFIX.length)}`, type: 'text', x, y, width: L.colWidth, height: L.progressHeight, text: progressLine(childrenOf.get(head.path) ?? items, opts.today, head.due) });
                y += L.progressHeight + L.rowGap;
            }
        }
        for (const task of items) {
            if (outside.has(task.path)) { stats.skipped++; continue; }
            const node = fileNode(task, x, y, L.taskHeight);
            zoneNodes.push(node);
            // Seta SMART → atômica: a mesma direção que o motor desenha a partir
            // de `projects`, para a sincronização reversa não pedir outra.
            if (smartId) zoneEdges.push({ id: `${node.id}-e`, fromNode: smartId, fromSide: 'bottom', toNode: node.id, toSide: 'top' });
            y += L.taskHeight + L.rowGap;
            if (head) stats.tasks++; else stats.loose++;
        }
        bottom = Math.max(bottom, y);
        col++;
    };

    for (const { smart, children } of tree.open) column(null, smart, children);
    if (tree.loose.length) {
        column('### Direto no projeto\nAções sem SMART mãe aberta (soltas, ou com a mãe concluída ou cancelada). Ligue cada uma a uma SMART pelo clique-direito.', null, tree.loose);
    }
    if (tree.open.length === 0 && tree.loose.length === 0) {
        const x = origin.x + L.pad;
        zoneNodes.push({
            id: `${ZONE_PREFIX}empty`, type: 'text', x, y: top, width: L.colWidth, height: L.smartHeight,
            text: '### Nenhuma SMART aberta\nClique-direito na área vazia → **Nova tarefa SMART neste projeto**.',
        });
        bottom = top + L.smartHeight + L.rowGap;
        col = 1;
    }
    if (tree.closed.length) {
        const x = origin.x + L.pad + col * (L.colWidth + L.colGap);
        // Cancelar não conta como conclusão (Fase 7): a cancelada aparece marcada.
        const list = tree.closed.slice(0, 12).map(t => `- [[${t.basename}]]${t.status === 'cancelled' ? ' · cancelada' : ''}`).join('\n');
        const more = tree.closed.length > 12 ? `\n\n+ ${tree.closed.length - 12} anteriores` : '';
        const height = Math.min(520, 80 + Math.min(tree.closed.length, 12) * 28);
        zoneNodes.push({ id: `${ZONE_PREFIX}closed`, type: 'text', x, y: top, width: L.colWidth, height, text: `### SMART encerradas\n${list}${more}` });
        bottom = Math.max(bottom, top + height + L.rowGap);
        col++;
    }

    zoneEdges.push(...dependencyEdges(placed, [...tree.open.flatMap(c => [c.smart, ...c.children]), ...tree.loose], ZONE_PREFIX));

    const width = Math.max(L.pad * 2 + Math.max(1, col) * L.colWidth + Math.max(0, col - 1) * L.colGap, L.pad * 2 + rowWidth);
    const height = bottom - origin.y + L.pad - L.rowGap;
    const zone: CanvasNode = {
        id: ZONE_GROUP_ID, type: 'group', x: origin.x, y: origin.y, width, height,
        label: `⚙️ Execução — ${project.name} (sincronizado pelo DFM)`,
    };

    // Grupo antes dos filhos: o canvas desenha na ordem, e o grupo fica atrás.
    const next = [...nodes, zone, ...zoneNodes];
    // Seta do operador fora da zona fica, até uma órfã (limpar o canvas dele não é
    // trabalho desta sincronização); a que toca a zona fica se é anotação e as duas
    // pontas continuam (Fase 3); a com sentido de dado vira a seta gerida.
    const edges = operatorEdges(current.edges ?? [], next, isManaged, opts.keepEdge);
    return {
        data: { ...current, nodes: next, edges: [...edges, ...zoneEdges] },
        stats,
    };
}

/* -------------------------------------------------- repositórios aninhados */

/** Caminhos (`path = …`) declarados num `.gitmodules`. */
export function gitmodulePaths(raw: string): string[] {
    return String(raw ?? '').split(/\r?\n/)
        .map(line => line.match(/^\s*path\s*=\s*(.+?)\s*$/)?.[1] ?? '')
        .filter(Boolean)
        .map(path => path.replace(/\/+$/, ''));
}

/**
 * O caminho fica dentro de algum repositório git aninhado (submódulo, ou pasta
 * com `.git` própria)? Canvas ali é de outro repositório: sincronizar a zona
 * sujaria o trabalho de outra pessoa (caso de um projeto entregue a outra pessoa, 05/10/2026). A
 * regra mora no resolvedor do caminho do canvas (`projectCanvasPath.ts`).
 */
export { insideNestedRepo } from './projectCanvasPath';

/** O canvas de um projeto novo: título, índice, widget do projeto — a zona vem da sincronização. */
export function newProjectCanvas(project: ProjectInfo): CanvasData {
    const nodes: CanvasNode[] = [
        { id: 'project-title', type: 'text', x: 0, y: 0, width: 820, height: 100, text: `# ${project.name}` },
        { id: 'project-widget', type: 'text', x: 440, y: 140, width: 380, height: 380, text: '```dfm-widget\ntipo: projeto\nprojeto: ' + project.name + '\n```' },
    ];
    if (project.index) nodes.push({ id: 'project-index', type: 'file', x: 0, y: 140, width: 400, height: 380, file: project.index });
    return { nodes, edges: [] };
}

/** Mesmo conteúdo? Evita regravar o canvas (e disparar o motor) sem necessidade. */
export function sameCanvas(a: CanvasData, b: CanvasData): boolean {
    const stable = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(stable);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.keys(value as object).sort()
                .filter(k => (value as any)[k] !== undefined)
                .map(k => [k, stable((value as any)[k])]));
        }
        return value;
    };
    const norm = (d: CanvasData) => JSON.stringify(stable({
        nodes: [...(d.nodes ?? [])].sort((x, y) => x.id.localeCompare(y.id)),
        edges: [...(d.edges ?? [])].sort((x, y) => x.id.localeCompare(y.id)),
    }));
    return norm(a) === norm(b);
}
