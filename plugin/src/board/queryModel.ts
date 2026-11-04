/**
 * O widget de consulta: tarefas do TaskNotes filtradas pelo que o canvas é.
 *
 * O escopo `canvas` usa o que está desenhado — as tarefas que são nós de arquivo
 * do canvas onde o widget mora, mais as ações das SMART que estão ali. Assim um
 * widget colado num canvas de projeto, de trimestre ou num canvas livre mede
 * exatamente aquele desenho.
 *
 * Módulo puro: recebe tarefas e escopo, devolve o que mostrar.
 */
import type { TaskRecord } from '../tasks/taskRecord';
import type { BoardWidgetSpec, QueryGroup } from './boardSpec';
import { fold } from './boardSpec';
import { TERMINAL } from '../project/projectCanvasModel';
import { isHighImpact } from '../engine/taskSemantics';
import { showGrammar, workHorizon, type ShownGrammar } from '../engine/showGrammar';
import { periodOfWeeks } from '../engine/calendario';
import { diaMais, segundaDaSemana } from '../engine/periodo';

export interface GanttRow { task: TaskRecord; start: string; end: string; overdue: boolean }
export interface Gantt { start: string; end: string; today: string; rows: GanttRow[]; undated: number; hidden: number }
export interface MatrixCell { id: 'agora' | 'agendar' | 'rapido' | 'soltar'; label: string; hint: string; items: TaskRecord[]; count: number }
export interface Matrix { cells: MatrixCell[]; unclassified: number }

export interface QueryScope {
    today: string;
    /** Semana ISO de hoje. */
    currentWeek: string;
    /** Arquivos que são nós do canvas do widget; `null` quando o widget não está num canvas. */
    canvasFiles: Set<string> | null;
    /** Projeto do canvas, quando o canvas é de projeto. */
    canvasProject: string | null;
    /** Semana em foco, quando o canvas é de trimestre. */
    focusWeek: string | null;
    /** Semanas do trimestre, quando o canvas é de trimestre (ou do trimestre atual). */
    quarterWeeks: string[];
}

export interface QueryGroupResult { key: string; label: string; items: TaskRecord[]; count: number }

export interface QueryResult {
    /** Descrição curta do recorte, para o cabeçalho ("este canvas · abertas"). */
    scopeLabel: string;
    total: number;
    items: TaskRecord[];
    /**
     * O `progresso` do recorte inteiro na forma de mostrar (a função única), sem
     * porcentagem: no escopo projeto, o horizonte do projeto no trimestre; nos outros,
     * o recorte é o trabalho (a aberta é do plano). Canceladas são neutras.
     */
    progress: ShownGrammar;
    groups: QueryGroupResult[];
    /** Quantas do recorte (já filtrado) em cada status. */
    statusCounts: Array<{ status: string; label: string; count: number }>;
    /** Motivo em palavras quando o escopo não se aplica (ex.: `canvas` fora de canvas). */
    unavailable?: string;
    gantt?: Gantt;
    matrix?: Matrix;
}

const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Linha do tempo: cada tarefa com data vira barra do início (agendada, ou criada)
 * ao prazo. A janela vai de 60 dias atrás a 90 à frente de hoje, no máximo — um
 * projeto antigo não esmaga as barras de agora. Sem data nenhuma, a tarefa é
 * contada como "sem data", não inventada.
 */
export function buildGantt(tasks: TaskRecord[], today: string, limit: number): Gantt {
    const rows: GanttRow[] = [];
    let undated = 0;
    for (const t of tasks) {
        const start = t.scheduled || t.created || t.due;
        const end = t.due || t.scheduled || start;
        if (!start) { undated++; continue; }
        const [a, b] = start <= end ? [start, end] : [end, start];
        rows.push({ task: t, start: a, end: b, overdue: !TERMINAL.has(t.status) && !!t.due && t.due < today });
    }
    rows.sort((x, y) => Number(y.task.type === 'tarefa_smart') - Number(x.task.type === 'tarefa_smart') || x.start.localeCompare(y.start) || x.end.localeCompare(y.end));
    const lo = addDays(today, -60), hi = addDays(today, 90);
    const starts = rows.map(r => r.start), ends = rows.map(r => r.end);
    let start = starts.length ? starts.reduce((m, v) => (v < m ? v : m)) : addDays(today, -7);
    let end = ends.length ? ends.reduce((m, v) => (v > m ? v : m)) : addDays(today, 14);
    if (start < lo) start = lo;
    if (end > hi) end = hi;
    if (end < today) end = today;
    if (start > today) start = today;
    if (end <= start) end = addDays(start, 7);
    return { start, end, today, rows: rows.slice(0, limit), undated, hidden: Math.max(0, rows.length - limit) };
}

const MATRIX: Array<Omit<MatrixCell, 'items' | 'count'>> = [
    { id: 'agora', label: 'Fazer agora', hint: 'urgente e alto impacto' },
    { id: 'agendar', label: 'Agendar bloco', hint: 'importa, sem urgência' },
    { id: 'rapido', label: 'Resolver rápido', hint: 'urgente, baixo impacto' },
    { id: 'soltar', label: 'Soltar ou agrupar', hint: 'nem urgente nem alto impacto' },
];

/** A mesma regra da matriz canônica: só o que está na mesa; urgência = prioridade alta. */
export function buildMatrix(tasks: TaskRecord[], limit: number): Matrix {
    const cells: MatrixCell[] = MATRIX.map(c => ({ ...c, items: [], count: 0 }));
    let unclassified = 0;
    for (const t of tasks) {
        if (t.type === 'tarefa_smart' || !['next-action', 'in-progress'].includes(t.status)) continue;
        if (t.impacto === null) { unclassified++; continue; }
        const urgent = ['high', 'urgent'].includes(t.priority.toLowerCase());
        const id = isHighImpact(t.impacto) ? (urgent ? 'agora' : 'agendar') : (urgent ? 'rapido' : 'soltar');
        const cell = cells.find(c => c.id === id)!;
        cell.count++;
        if (cell.items.length < limit) cell.items.push(t);
    }
    return { cells, unclassified };
}

const STATUS_ORDER = ['inbox', 'next-action', 'in-progress', 'waiting-on', 'someday', 'done', 'cancelled'];
export const STATUS_LABEL: Record<string, string> = {
    inbox: 'Inbox', 'next-action': 'Próxima ação', 'in-progress': 'Em execução', 'waiting-on': 'Esperando',
    someday: 'Algum dia', done: 'Concluída', cancelled: 'Cancelada', '': 'Sem status',
};

const isSmart = (t: TaskRecord) => t.type === 'tarefa_smart';

/** Nome da SMART → projetos dela (a ação aponta para a SMART, não para o projeto). */
function smartOwners(tasks: TaskRecord[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const t of tasks) if (isSmart(t)) map.set(fold(t.basename), t.projects);
    return map;
}

/** Projetos reais de uma tarefa: os diretos e os da SMART mãe. */
export function projectsOf(task: TaskRecord, owners: Map<string, string[]>): string[] {
    const out: string[] = [];
    for (const link of task.projects) {
        const viaSmart = owners.get(fold(link));
        if (viaSmart) out.push(...viaSmart);
        else out.push(link);
    }
    return [...new Set(out)];
}

/** A segunda e o domingo da semana; a segunda-feira tem um dono só (`engine/periodo.ts`, item 10 do roteiro). */
function weekRange(week: string): { start: string; end: string } | null {
    const start = segundaDaSemana(week);
    const end = start ? diaMais(start, 6) : null;
    return start && end ? { start, end } : null;
}

function byUrgency(today: string) {
    return (a: TaskRecord, b: TaskRecord) => {
        const rank = (t: TaskRecord) => TERMINAL.has(t.status) ? 5
            : t.due && t.due < today ? 0 : t.due === today || t.scheduled === today ? 1 : t.status === 'in-progress' ? 2 : 3;
        return rank(a) - rank(b)
            || (b.impacto ?? -1) - (a.impacto ?? -1)
            || (a.due || '9999').localeCompare(b.due || '9999')
            || a.title.localeCompare(b.title, 'pt-BR');
    };
}

function statusFilter(spec: BoardWidgetSpec): (t: TaskRecord) => boolean {
    // Kanban sem filtro mostra o fluxo inteiro, menos as canceladas (que não são fluxo).
    if (!spec.status && (spec.mostrar === 'kanban' || spec.mostrar === 'gantt')) return t => t.status !== 'cancelled';
    const raw = fold(spec.status ?? (spec.mostrar === 'progresso' || spec.mostrar === 'kanban' ? 'todas' : 'abertas'));
    if (raw === 'todas') return () => true;
    if (raw === 'abertas') return t => !TERMINAL.has(t.status);
    if (raw === 'concluidas') return t => t.status === 'done';
    const wanted = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
    return t => wanted.has(fold(t.status));
}

function groupKey(task: TaskRecord, by: QueryGroup, owners: Map<string, string[]>): string[] {
    switch (by) {
        case 'status': return [task.status];
        case 'semana': return [task.week || ''];
        case 'contexto': return task.contexts.length ? task.contexts : [''];
        case 'projeto': { const p = projectsOf(task, owners); return p.length ? p : ['']; }
    }
}

function groupLabel(key: string, by: QueryGroup): string {
    if (by === 'status') return STATUS_LABEL[key] ?? key;
    if (!key) return by === 'semana' ? 'Sem semana' : by === 'contexto' ? 'Sem contexto' : 'Sem projeto';
    return key;
}

/** O texto de ausência do `progresso`: ausência não é zero. */
const NO_PROGRESS = 'nenhuma tarefa no recorte';

export function evaluateQuery(spec: BoardWidgetSpec, all: TaskRecord[], scope: QueryScope): QueryResult {
    const owners = smartOwners(all);
    const escopo = spec.escopo ?? 'canvas';
    const empty = (reason: string): QueryResult => ({ scopeLabel: escopo, total: 0, items: [], progress: showGrammar([], workHorizon(null), NO_PROGRESS), groups: [], statusCounts: [], unavailable: reason });
    let pool: TaskRecord[];
    let scopeLabel: string;

    const week = !spec.semana || fold(spec.semana) === 'atual' ? (scope.focusWeek ?? scope.currentWeek) : spec.semana;

    switch (escopo) {
        case 'canvas': {
            if (!scope.canvasFiles) return empty('Este widget mede um canvas; aqui não há canvas. Use escopo projeto, semana, trimestre ou vault.');
            const files = scope.canvasFiles;
            const smartsHere = new Set(all.filter(t => isSmart(t) && files.has(t.path)).map(t => fold(t.basename)));
            pool = all.filter(t => files.has(t.path) || (!isSmart(t) && t.projects.some(p => smartsHere.has(fold(p)))));
            scopeLabel = 'este canvas';
            break;
        }
        case 'projeto': {
            const name = spec.projeto ?? scope.canvasProject;
            if (!name) return empty('Diga qual projeto (`projeto: Nome`) ou ponha o widget no canvas de um projeto.');
            pool = all.filter(t => projectsOf(t, owners).some(p => fold(p) === fold(name)));
            scopeLabel = name;
            break;
        }
        case 'semana':
            pool = all.filter(t => t.week === week);
            scopeLabel = week;
            break;
        case 'trimestre': {
            const weeks = new Set(scope.quarterWeeks);
            pool = all.filter(t => weeks.has(t.week));
            scopeLabel = 'trimestre';
            break;
        }
        default:
            pool = all;
            scopeLabel = 'vault';
    }

    if (spec.projeto && escopo !== 'projeto') pool = pool.filter(t => projectsOf(t, owners).some(p => fold(p) === fold(spec.projeto!)));
    if (spec.semana && escopo !== 'semana') pool = pool.filter(t => t.week === week);
    if (spec.tarefas === 'smart') pool = pool.filter(isSmart);
    if (spec.tarefas === 'acoes') pool = pool.filter(t => !isSmart(t));
    if (spec.contexto) pool = pool.filter(t => t.contexts.some(c => fold(c).includes(fold(spec.contexto!))));
    if (spec.tag) {
        const tag = fold(spec.tag.replace(/^#/, ''));
        pool = pool.filter(t => t.tags.some(x => fold(x) === tag || fold(x).startsWith(`${tag}/`)));
    }
    if (spec.prazo) {
        const today = scope.today;
        const range = weekRange(scope.currentWeek);
        const open = (t: TaskRecord) => !TERMINAL.has(t.status);
        pool = pool.filter(t => {
            switch (spec.prazo) {
                case 'vencidas': return open(t) && !!t.due && t.due < today;
                case 'hoje': return open(t) && (t.due === today || t.scheduled === today);
                case 'semana': return open(t) && !!range && !!t.due && t.due >= range.start && t.due <= range.end;
                case 'sem-prazo': return open(t) && !t.due;
                default: return true;
            }
        });
    }

    // Progresso mede a base inteira do recorte; os demais modos respeitam o filtro de status.
    // O projeto conta no trimestre, como a linha dele no canvas e no painel.
    const period = escopo === 'projeto' && scope.quarterWeeks.length ? periodOfWeeks(scope.quarterWeeks) : null;
    const progress = showGrammar(pool, workHorizon(period), NO_PROGRESS);
    const filtered = pool.filter(statusFilter(spec)).sort(byUrgency(scope.today));

    let groups: QueryGroupResult[] = [];
    const by: QueryGroup | null = spec.mostrar === 'kanban' ? 'status' : spec.mostrar === 'grupos' ? spec.agrupar ?? 'status' : null;
    if (by) {
        const map = new Map<string, TaskRecord[]>();
        for (const t of filtered) for (const key of groupKey(t, by, owners)) {
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(t);
        }
        const order = (k: string) => by === 'status' ? (STATUS_ORDER.indexOf(k) + 1 || 99) : by === 'semana' ? -Number(k.replace(/\D/g, '') || 0) : 0;
        groups = [...map.entries()]
            .map(([key, items]) => ({ key, label: groupLabel(key, by), items: items.slice(0, spec.limite), count: items.length }))
            .sort((a, b) => order(a.key) - order(b.key) || b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
    }

    const counts = new Map<string, number>();
    for (const t of filtered) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    const statusCounts = [...counts.entries()]
        .map(([status, count]) => ({ status, label: STATUS_LABEL[status] ?? status, count }))
        .sort((a, b) => (STATUS_ORDER.indexOf(a.status) + 1 || 99) - (STATUS_ORDER.indexOf(b.status) + 1 || 99));

    const result: QueryResult = { scopeLabel, total: filtered.length, items: filtered.slice(0, spec.limite), progress, groups, statusCounts };
    if (spec.mostrar === 'gantt') result.gantt = buildGantt(filtered, scope.today, spec.limite);
    if (spec.mostrar === 'matriz') result.matrix = buildMatrix(filtered, spec.limite);
    return result;
}
