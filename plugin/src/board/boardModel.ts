/**
 * Do snapshot do Mission Control ao que cada widget do quadro mostra.
 *
 * Módulo puro: recebe `MissionSnapshot`, devolve objetos simples. Nada é
 * recalculado que o snapshot já saiba (score, progresso, saúde); aqui só se
 * escolhe, ordena e corta. Ausência continua sendo ausência: lista vazia vira
 * frase no renderizador, nunca zero inventado.
 */
import type { MissionSnapshot, MissionTask } from '../engine/missionControl';
import type { BoardTaskFilter, BoardWidgetSpec } from './boardSpec';
import { fold } from './boardSpec';
import { CADENCE_LABEL } from '../engine/habits';
import { progressText } from '../project/projectCanvasModel';
import type { ProjectProgress } from '../project/projectCanvasModel';
import { quarterPeriod } from '../engine/calendario';
import { showGrammar, workHorizon, type GrammarUnit, type ShownGrammar } from '../engine/showGrammar';
import { ehTrimestre } from '../engine/periodo';
import { portaDoPeriodo } from '../missao/estadoTela';
import { PORTAS } from '../missao/frases';
import { idDoProjeto } from '../missao/linhagem';
import { RAMO_DE_PARTIDA } from '../missao/ramoPrincipal';
import type { EstadoDaMissao } from '../missao/view/componente';

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'muted';

export interface TaskItem {
    path: string;
    title: string;
    /** Linha curta de contexto: projeto · prazo. */
    meta: string;
    tone: Tone;
    /** Selo à direita (ex.: "externa", "vence hoje"). */
    badge?: { text: string; tone: Tone };
}

const OPEN_BUCKETS = ['inbox', 'ready', 'doing', 'blocked'];

function bucket(snapshot: MissionSnapshot, id: string): MissionTask[] {
    return snapshot.board?.buckets?.find(b => b.id === id)?.tasks ?? [];
}

function openTasks(snapshot: MissionSnapshot): MissionTask[] {
    return OPEN_BUCKETS.flatMap(id => bucket(snapshot, id));
}

/** `2026-09-24` → `24/09`; hoje e amanhã em palavras. */
export function shortDate(date: string, today: string): string {
    if (!date) return '';
    if (date === today) return 'hoje';
    const t = Date.parse(`${today}T00:00:00Z`);
    const d = Date.parse(`${date}T00:00:00Z`);
    if (Number.isFinite(t) && Number.isFinite(d)) {
        const diff = Math.round((d - t) / 86_400_000);
        if (diff === 1) return 'amanhã';
        if (diff === -1) return 'ontem';
    }
    const [, m, day] = date.split('-');
    return day && m ? `${day}/${m}` : date;
}

function taskTone(task: MissionTask): Tone {
    if (task.overdue) return 'bad';
    if (task.dueToday) return 'warn';
    if (task.status === 'in-progress') return 'accent';
    return 'neutral';
}

export function toTaskItem(task: MissionTask, today: string, opts: { hideProject?: boolean } = {}): TaskItem {
    const parts: string[] = [];
    const project = task.projects?.[0];
    if (project && !opts.hideProject) parts.push(project);
    if (task.due) parts.push(task.overdue ? `venceu ${shortDate(task.due, today)}` : `prazo ${shortDate(task.due, today)}`);
    else if (task.scheduledDate) parts.push(`agendada ${shortDate(task.scheduledDate, today)}`);

    let badge: TaskItem['badge'];
    if (task.overdue) badge = { text: 'vencida', tone: 'bad' };
    else if (task.dueToday) badge = { text: 'hoje', tone: 'warn' };
    else if (task.status === 'in-progress') badge = { text: 'em curso', tone: 'accent' };
    else if (task.status === 'waiting-on' || task.status === 'blocked') badge = { text: 'esperando', tone: 'muted' };

    return { path: task.path, title: task.title, meta: parts.join(' · '), tone: taskTone(task), badge };
}

/** Mais urgente primeiro: vencida, hoje, em curso, impacto, prazo. */
function byUrgency(a: MissionTask, b: MissionTask): number {
    const rank = (t: MissionTask) => (t.overdue ? 0 : t.dueToday ? 1 : t.status === 'in-progress' ? 2 : 3);
    return rank(a) - rank(b)
        || (b.impact ?? -1) - (a.impact ?? -1)
        || (a.due || '9999').localeCompare(b.due || '9999')
        || a.title.localeCompare(b.title);
}

function basenameOf(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

/**
 * SMART → projetos dela. Pelo contrato do Kernel a ação atômica aponta para a
 * SMART mãe (`projects: [[SMART]]`), não para o projeto; é este mapa que leva a
 * ação ao projeto certo.
 */
function smartOwners(snapshot: MissionSnapshot): Map<string, string[]> {
    const owners = new Map<string, string[]>();
    for (const task of openTasks(snapshot)) {
        if (task.type !== 'tarefa_smart') continue;
        owners.set(fold(basenameOf(task.path)), (task.projects ?? []).map(fold));
        if (task.title) owners.set(fold(task.title), (task.projects ?? []).map(fold));
    }
    return owners;
}

function matchesProject(task: MissionTask, project: string, owners?: Map<string, string[]>): boolean {
    const target = fold(project);
    return (task.projects ?? []).some(name => fold(name) === target || (owners?.get(fold(name)) ?? []).includes(target));
}

/* ---------------------------------------------------------------- números */

export interface Stat { label: string; value: string; tone: Tone; hint?: string; /** A linha de baixo do número ("+26 algum dia"). */ sub?: string }

export function numbersModel(snapshot: MissionSnapshot): Stat[] {
    const totals = snapshot.board?.totals;
    const habits = snapshot.habits?.stats;
    const stat = (label: string, value: number | undefined, tone: Tone, hint?: string): Stat => ({
        label,
        value: Number.isFinite(value) ? String(value) : '—',
        tone: Number.isFinite(value) ? tone : 'muted',
        hint,
    });
    return [
        // A "algum dia" fica fora de Abertas e de Vencidas, dita à parte (27/10, os números batem).
        { ...stat('Abertas', totals?.open, 'neutral'), ...(totals?.someday ? { sub: `+${totals.someday} algum dia` } : {}) },
        stat('Vencidas', totals?.overdue, totals?.overdue ? 'bad' : 'good'),
        stat('Vencem hoje', totals?.dueToday, totals?.dueToday ? 'warn' : 'neutral'),
        stat('Em execução', bucket(snapshot, 'doing').length, 'accent'),
        stat('Esperando', bucket(snapshot, 'blocked').length, 'muted'),
        habitsStat(habits),
    ];
}

/**
 * "Hábitos hoje": a contagem dos feitos hoje, nunca fração (a regra de 25/10: o hábito é
 * contagem de execuções). O que a cadência espera hoje vai só na dica.
 */
function habitsStat(habits: MissionSnapshot['habits']['stats'] | undefined): Stat {
    if (!habits || habits.ativos === 0) return { label: 'Hábitos hoje', value: '—', tone: 'muted', hint: 'nenhum hábito ativo' };
    const expected = habits.esperadosHoje ?? habits.ativos;
    if (expected === 0) return { label: 'Hábitos hoje', value: '—', tone: 'muted', hint: 'nenhum esperado hoje' };
    return {
        label: 'Hábitos hoje',
        value: String(habits.concluidosHoje),
        tone: habits.concluidosHoje >= expected ? 'good' : 'neutral',
        hint: `${habits.ativos} ativos; ${expected} esperados hoje pela frequência`,
    };
}

/* ----------------------------------------------------------------- matriz */

export interface MatrixQuadrant { id: string; label: string; hint: string; tone: Tone; count: number; items: TaskItem[] }

const QUADRANT_TONE: Record<string, Tone> = { agora: 'bad', agendar: 'accent', rapido: 'warn', soltar: 'muted' };

export function matrixModel(snapshot: MissionSnapshot, perCell: number): { quadrants: MatrixQuadrant[]; unclassified: number } {
    const cells = snapshot.matrix ?? [];
    const quadrants = ['agora', 'agendar', 'rapido', 'soltar'].map(id => {
        const cell = cells.find(c => c.id === id);
        const tasks = [...(cell?.tasks ?? [])].sort(byUrgency);
        return {
            id,
            label: cell?.label ?? id,
            hint: cell?.hint ?? '',
            tone: QUADRANT_TONE[id],
            count: tasks.length,
            items: tasks.slice(0, perCell).map(t => toTaskItem(t, snapshot.today)),
        };
    });
    const unclassified = cells.find(c => c.id === 'sem-impacto')?.tasks.length ?? 0;
    return { quadrants, unclassified };
}

/* ---------------------------------------------------------------- projeto */

/**
 * O que o gerente do canvas de projeto sabe do projeto: o "quanto falta" pela
 * mesma conta do trimestre e do cabeçalho da zona (`projectProgress`, sobre a
 * lista inteira, inclusive as arquivadas) e o canvas, quando existe.
 */
export interface ProjectFactsInput {
    name: string;
    progress: ProjectProgress;
    canvas: string | null;
    index: string | null;
}

export interface ProjectModel {
    name: string;
    found: boolean;
    /** Nota-índice, quando o portfólio conhece. */
    indexPath: string | null;
    /** Canvas do projeto, quando existe: o título do widget leva até ele. */
    canvasPath: string | null;
    /**
     * A forma de mostrar do projeto, pela função única: com `facts`, `progressText` (a mesma
     * linha do trimestre); sem eles, as tarefas do snapshot no mesmo horizonte
     * (`missionProjectGrammar`). Sem porcentagem (a forma de mostrar, 16/10 e 22/10).
     */
    progressText: string;
    stage: string;
    area: string;
    total: number;
    completed: number;
    doing: number;
    blocked: number;
    health: string;
    items: TaskItem[];
    remaining: number;
}

const HEALTH_LABEL: Record<string, string> = {
    'on-track': 'em dia', 'at-risk': 'em risco', overdue: 'atrasado', completed: 'concluído', 'no-data': 'sem tarefas',
};

export function healthLabel(health: string): string {
    return HEALTH_LABEL[health] ?? health;
}

/**
 * O que faz: a forma de mostrar de um projeto do snapshot (as tarefas dele, `units`),
 * pela função única, no horizonte do projeto: o de trabalho com o período do trimestre
 * (a aberta é do plano; a feita conta só no trimestre), o mesmo do canvas e do painel.
 * Por quê: os cartões do painel e os widgets mostravam "concluídas/total" e porcentagem;
 * desde 16/10 a regra é contagem, nunca porcentagem, e desde 22/10 toda linha de
 * contagem passa por `engine/showGrammar.ts`.
 * Entra → sai: projeto (ou nada), trimestre `AAAA-Qn` e o texto de ausência → `ShownGrammar`.
 * Erro e ataque: sem `units` (construtor à mão) é ausência, não zero; trimestre ilegível
 * conta sem janela de tempo, em vez de esconder as feitas.
 * Prova: tests/board/board.test.ts ("forma de mostrar dos projetos").
 */
export function missionProjectGrammar(project: { units?: readonly GrammarUnit[] } | null | undefined, quarter: string | null | undefined, empty: string): ShownGrammar {
    const period = ehTrimestre(String(quarter ?? '')) ? quarterPeriod(String(quarter)) : null;
    return showGrammar(project?.units ?? [], workHorizon(period), empty);
}

/**
 * O widget `projeto`. Com `facts` (o gerente do canvas de projeto), os números
 * são os de `projectProgress`: SMART e ações, a lista inteira, sem canceladas —
 * os mesmos do trimestre e do topo da zona do projeto (Fase 5 do plano do
 * canvas). Sem `facts`, fica a soma antiga do snapshot (`aggregateProjects`).
 */
export function projectModel(snapshot: MissionSnapshot, name: string, limit: number, facts: ProjectFactsInput | null = null): ProjectModel {
    const target = fold(name);
    const agg = (snapshot.projects ?? []).find(p => fold(p.name) === target);
    const folio = (snapshot.portfolio?.columns ?? []).flatMap(c => c.projects).find(p => fold(p.name) === target);
    const owners = smartOwners(snapshot);
    const open = openTasks(snapshot).filter(t => matchesProject(t, name, owners)).sort(byUrgency);
    const p = facts?.progress ?? null;
    const total = p ? p.smartTotal + p.actionTotal : agg?.total ?? 0;
    const completed = p ? p.smartDone + p.actionDone : agg?.completed ?? 0;
    return {
        name: facts?.name ?? agg?.name ?? folio?.name ?? name,
        found: Boolean(agg || folio || facts),
        indexPath: folio?.index ?? facts?.index ?? null,
        canvasPath: facts?.canvas ?? null,
        progressText: p ? progressText(p) : missionProjectGrammar(agg, snapshot.quarter, 'sem tarefas ligadas').text,
        stage: folio?.column?.replace(/^\d+\s*-\s*/, '') ?? '',
        area: folio?.area ?? '',
        total,
        completed,
        doing: agg?.doing ?? 0,
        blocked: agg?.blocked ?? 0,
        health: agg?.health ?? 'no-data',
        items: open.slice(0, limit).map(t => toTaskItem(t, snapshot.today, { hideProject: true })),
        remaining: Math.max(0, open.length - limit),
    };
}

/** Nomes de projeto conhecidos, para o seletor. */
export function projectNames(snapshot: MissionSnapshot): string[] {
    const names = new Map<string, string>();
    const smarts = smartOwners(snapshot);
    for (const p of snapshot.projects ?? []) if (!smarts.has(fold(p.name))) names.set(fold(p.name), p.name);
    for (const col of snapshot.portfolio?.columns ?? []) for (const p of col.projects) if (!names.has(fold(p.name))) names.set(fold(p.name), p.name);
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* --------------------------------------------------------------- projetos */

/** `grammar`: a linha da forma de mostrar do projeto (`missionProjectGrammar`), no lugar da barra de porcentagem. */
export interface ProjectRow { name: string; grammar: string; open: number; total: number; health: string; tone: Tone; inFocus: boolean; indexPath: string | null }

const HEALTH_TONE: Record<string, Tone> = { 'on-track': 'good', 'at-risk': 'warn', overdue: 'bad', completed: 'muted', 'no-data': 'muted' };

export function projectsModel(snapshot: MissionSnapshot, limit: number): { rows: ProjectRow[]; hidden: number } {
    const folio = (snapshot.portfolio?.columns ?? []).flatMap(c => c.projects);
    const smarts = smartOwners(snapshot);
    const rows = (snapshot.projects ?? [])
        // Nome de SMART não é projeto: é o vínculo das ações atômicas com a SMART mãe.
        .filter(p => !smarts.has(fold(p.name)))
        .filter(p => p.health !== 'completed' && (p.total > 0 || p.inFocus))
        .map(p => ({
            name: p.name,
            grammar: missionProjectGrammar(p, snapshot.quarter, 'sem tarefas ligadas').text,
            open: p.pending + p.doing + p.blocked,
            total: p.total,
            health: p.health,
            tone: HEALTH_TONE[p.health] ?? 'neutral',
            inFocus: p.inFocus,
            indexPath: folio.find(f => fold(f.name) === fold(p.name))?.index ?? null,
        }))
        .sort((a, b) => Number(b.inFocus) - Number(a.inFocus) || b.open - a.open || a.name.localeCompare(b.name));
    return { rows: rows.slice(0, limit), hidden: Math.max(0, rows.length - limit) };
}

/* ---------------------------------------------------------------- hábitos */

export interface HabitRow {
    path: string;
    title: string;
    cells: Array<{ date: string; done: boolean; isToday: boolean }>;
    doneToday: boolean;
    count: number;
    /** `manual`, `protocol` (guiado) ou `automatico`. */
    tracking: string;
    /** "diária", "dias úteis", "semanal", "quando acontece". */
    cadence: string;
    /** Execuções de segunda até hoje. */
    week: number;
    /** Hoje se espera o registro e ele ainda não veio. */
    pending: boolean;
    /** `revisar_em` já passou: data declarada, ou `null`. */
    reviewDue: string | null;
    /** Vezes por semana pedidas (semanal), ou `null`. */
    target: number | null;
    /** 1 alta, 2 média, 3 baixa. */
    priority: number;
    /** Pilar ou projeto a que serve. */
    pillar: string | null;
}

export interface HabitsModel {
    rows: HabitRow[];
    hidden: number;
    folder: string;
    doneToday: number;
    expectedToday: number;
    reviewsDue: number;
}

export function habitsModel(snapshot: MissionSnapshot, limit: number, days = 14): HabitsModel {
    const src = snapshot.habits;
    const rows = (src?.rows ?? []).map(row => {
        const cells = row.cells.slice(-days).map(c => ({ ...c, isToday: c.date === snapshot.today }));
        return {
            path: row.path,
            title: row.title,
            cells,
            doneToday: row.doneToday,
            count: cells.filter(c => c.done).length,
            tracking: row.tracking ?? 'manual',
            cadence: CADENCE_LABEL[row.cadence ?? 'diaria'] ?? 'diária',
            week: row.semana ?? 0,
            pending: row.pendenteHoje ?? false,
            reviewDue: row.revisaoVencida ? (row.reviewOn ?? '') : null,
            target: row.metaSemanal ?? null,
            priority: row.prioridade ?? 2,
            pillar: row.pilar ?? null,
        };
    });
    // Prioridade declarada primeiro; dentro dela, o que pede gesto hoje; depois a
    // ordem do tracker (sort estável).
    const ordered = rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => a.row.priority - b.row.priority || Number(b.row.pending) - Number(a.row.pending) || a.index - b.index)
        .map(x => x.row);
    return {
        rows: ordered.slice(0, limit),
        hidden: Math.max(0, ordered.length - limit),
        folder: src?.folder ?? '',
        doneToday: rows.filter(r => r.doneToday).length,
        expectedToday: src?.stats?.esperadosHoje ?? rows.length,
        reviewsDue: rows.filter(r => r.reviewDue !== null).length,
    };
}

/* ---------------------------------------------------------------- tarefas */

export const FILTER_TITLES: Record<BoardTaskFilter, string> = {
    abertas: 'Tarefas abertas',
    vencidas: 'Vencidas',
    hoje: 'Para hoje',
    execucao: 'Em execução',
    bloqueadas: 'Esperando',
    inbox: 'Inbox',
    proximas: 'Próximas ações',
};

export const FILTER_EMPTY: Record<BoardTaskFilter, string> = {
    abertas: 'Nenhuma tarefa aberta.',
    vencidas: 'Nada vencido.',
    hoje: 'Nada agendado ou vencendo hoje.',
    execucao: 'Nada em execução agora.',
    bloqueadas: 'Nada esperando terceiros.',
    inbox: 'Inbox vazia.',
    proximas: 'Nenhuma próxima ação definida.',
};

export function tasksModel(snapshot: MissionSnapshot, spec: Pick<BoardWidgetSpec, 'filtro' | 'projeto' | 'limite'>): { items: TaskItem[]; total: number } {
    const filtro = spec.filtro ?? 'proximas';
    let tasks: MissionTask[];
    switch (filtro) {
        case 'vencidas': tasks = openTasks(snapshot).filter(t => t.overdue); break;
        case 'hoje': tasks = openTasks(snapshot).filter(t => t.dueToday || t.scheduledDate === snapshot.today); break;
        case 'execucao': tasks = bucket(snapshot, 'doing'); break;
        case 'bloqueadas': tasks = bucket(snapshot, 'blocked'); break;
        case 'inbox': tasks = bucket(snapshot, 'inbox'); break;
        case 'proximas': tasks = bucket(snapshot, 'ready'); break;
        default: tasks = openTasks(snapshot);
    }
    if (spec.projeto) {
        const owners = smartOwners(snapshot);
        tasks = tasks.filter(t => matchesProject(t, spec.projeto!, owners));
    }
    const sorted = [...tasks].sort(byUrgency);
    return {
        items: sorted.slice(0, spec.limite).map(t => toTaskItem(t, snapshot.today, { hideProject: Boolean(spec.projeto) })),
        total: sorted.length,
    };
}

/* ------------------------------------------------------------ o atalho da Missão (item 8 do roteiro) */

/** O que o lugar do bloco `tipo: missao` sabe de si: o projeto do canvas de projeto e o nome do arquivo (sem extensão). */
export interface ContextoDoAtalho {
    /** O projeto do canvas de projeto onde o bloco mora (`projectForCanvas`); `null` = não é canvas de projeto. */
    projeto?: string | null;
    /** O nome do canvas ou da nota (a Week e a nota do trimestre se chamam pelo período). */
    nome?: string | null;
}

/** O atalho: o texto do botão, a frase de para onde ele leva e o estado em que a Missão abre (`null` = como estava). */
export interface AtalhoDaMissao { rotulo: string; texto: string; estado: EstadoDaMissao | null }

/**
 * O que faz: para onde o bloco `tipo: missao` de um canvas (ou de uma nota) leva: no canvas de projeto,
 * a Missão com o zoom no projeto (o ramo dele, onde se planeja); no canvas ou na nota de um período (a
 * Week, a nota do trimestre, os canvas arquivados de período), a Missão naquele período, pela mesma porta
 * dos comandos (`portaDoPeriodo`); nos outros, a Missão no ramo pedido (`ramo_principal`), ou como estava.
 * Por quê: a Missão no canvas é só um atalho para um ramo ou uma escala (Arquitetura e
 * Roteiro, §4); o item 8 do roteiro. O widget só dizia de onde abrir a Missão (o inventário da
 * aposentadoria, 3.6).
 * Entra → sai: o bloco lido e o contexto do lugar → o rótulo, a frase e o estado (o mesmo `openMissao`
 * das portas).
 * Erro e ataque: o projeto vale antes do nome (o canvas de projeto não se chama pelo período); o nome
 * que só contém um período (uma TaskNote com a semana no título) não é de período; o ramo de partida
 * não vai no estado (a aba fica no dela).
 * Prova: tests/board/missaoAtalho.test.ts.
 */
export function atalhoDaMissao(spec: Pick<BoardWidgetSpec, 'ramoPrincipal'>, ctx: ContextoDoAtalho = {}): AtalhoDaMissao {
    const ramoPrincipal = spec.ramoPrincipal && spec.ramoPrincipal !== RAMO_DE_PARTIDA ? spec.ramoPrincipal : null;
    const base = { abrirTudo: false, aberto: null, onde: null, ...(ramoPrincipal ? { ramoPrincipal } : {}) };
    const projeto = String(ctx.projeto ?? '').trim();
    if (projeto) {
        const id = idDoProjeto(projeto);
        return { rotulo: PORTAS.atalho.projeto(projeto), texto: PORTAS.atalho.doProjeto, estado: { ...base, escala: 'semana', foco: '', selecionado: id, zoom: id } };
    }
    const porta = portaDoPeriodo(ctx.nome);
    if (porta) return { rotulo: PORTAS.atalho.periodo(porta.foco), texto: PORTAS.atalho.doPeriodo, estado: { ...base, escala: porta.escala, foco: porta.foco, selecionado: porta.selecionado } };
    if (ramoPrincipal) return { rotulo: PORTAS.atalho.ramo(ramoPrincipal), texto: PORTAS.atalho.doRamo, estado: { ...base, escala: 'semana', foco: '', selecionado: null } };
    return { rotulo: PORTAS.atalho.missao, texto: PORTAS.atalho.daMissao, estado: null };
}
