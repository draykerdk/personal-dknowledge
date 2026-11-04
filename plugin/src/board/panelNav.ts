/**
 * A navegação do painel: as duas hierarquias do DFM e o que falta organizar.
 *
 * - **Tempo**: Longo prazo → Trimestre → Semana em foco → Hoje. A semana em foco
 *   mostra a forma de mostrar dela (a função única, `engine/showGrammar.ts`).
 * - **Temporada**: os projetos centrais do trimestre (a lista `temporada` da nota do
 *   trimestre; sem ela, `departamentos_foco`) e, sob cada um, os auxiliares, os
 *   projetos e departamentos que têm a central em `projects` na própria nota
 *   (replanejamento de 25/10/2026).
 * - **Espaço**: Área → projetos (por fase), cada um com o estado do canvas e a
 *   forma de mostrar dele no trimestre (a mesma conta do canvas, `projectProgress`).
 * - **Pendências**: ações sem vínculo (ou com vínculo para nada), SMART sem
 *   projeto, SMART de semanas que já passaram, projetos sem canvas. Cada uma
 *   vira um fluxo no painel — a automação mostra; quem resolve é o operador.
 *
 * Módulo puro.
 */
import type { TaskRecord } from '../tasks/taskRecord';
import { TERMINAL, fold, linkTarget, progressText, projectProgress } from '../project/projectCanvasModel';
import { inGrid, weekGrammar } from '../engine/tarefasNoPeriodo';
import { quarterPeriod } from '../engine/calendario';
import { CLOSED_STAGES } from '../engine/missionPortfolio';
import { ehSemana } from '../engine/periodo';

export interface NavProjectInput {
    name: string;
    area: string;
    /** Fase do portfólio (`2 - Active`…). */
    stage: string;
    canvasExists: boolean;
    /** Pasta é submódulo git: o canvas não é criado ali. */
    submodule: boolean;
    /**
     * As notas que a nota do projeto aponta em `projects` (nomes): a central a que o
     * auxiliar serve. Vazio = projeto próprio.
     */
    serves?: string[];
}

/** Colunas de projeto encerrado: fora da lista do painel (da fonte única, `engine/missionPortfolio.ts`). */
export { CLOSED_STAGES };

export interface NavInput {
    today: string;
    currentWeek: string;
    longTerm: { label: string; canvas: string | null; note: string | null };
    quarter: { id: string; note: string | null };
    focus: { week: string; label: string; note: string | null };
    day: { note: string | null; comando: string | null };
    tasks: TaskRecord[];
    projects: NavProjectInput[];
    /** Nomes válidos como destino de `projects` além de projeto e SMART (ex.: departamentos). */
    otherTargets: string[];
    /** Os projetos centrais do trimestre, na ordem da nota (`temporadaFrom`). */
    temporada?: string[];
    /**
     * A lista de foco do trimestre (`focoDoTrimestre`) quando a nota tem `projetos_foco`:
     * sob cada central aparecem só os auxiliares dela. Ausente ou vazia = todos os que
     * servem à central, como antes de 27/10/2026.
     */
    foco?: string[];
}

/** Uma central da Temporada e os auxiliares que servem a ela. */
export interface TemporadaNav {
    name: string;
    /** A linha do projeto central; `null` se ele não está no portfólio (pasta ou nome mudou). */
    central: ProjectNav | null;
    auxiliares: ProjectNav[];
}

export interface ProjectNav extends NavProjectInput {
    /** A forma de mostrar do projeto no trimestre (a mesma linha do canvas); sem tarefas, "sem tarefas". */
    grammar: string;
    openSmarts: number;
    openActions: number;
    loose: number;
    overdue: number;
}

export interface Orphan { task: TaskRecord; reason: 'sem-vinculo' | 'vinculo-quebrado'; target?: string }

export interface NavModel {
    time: {
        longTerm: NavInput['longTerm'];
        quarter: NavInput['quarter'];
        /** `grammar`: a forma de mostrar da semana em foco (a mesma da célula do trimestre). */
        focus: NavInput['focus'] & { openSmarts: number; openActions: number; grammar: string };
        day: NavInput['day'] & { date: string };
    };
    areas: Array<{ area: string; projects: ProjectNav[] }>;
    /** A Temporada: as centrais, cada uma com os auxiliares; vazio se o trimestre não declara. */
    temporada: TemporadaNav[];
    pending: { orphans: Orphan[]; orphanSmarts: Orphan[]; staleSmarts: TaskRecord[]; missingCanvas: string[] };
}

/**
 * Os departamentos que o trimestre põe na mesa, na ordem da nota: os de
 * `departamentos_foco` e os da Temporada (um departamento pode ser uma das centrais do
 * trimestre). O painel só listava as colunas do portfólio (projetos): o
 * departamento ficava sem linha, sem contagem e sem os botões de canvas.
 */
export function departmentsInFocus<D extends { name: string }>(departments: readonly D[], focusLinks: unknown): D[] {
    const raw = (Array.isArray(focusLinks) ? focusLinks : (focusLinks ? [focusLinks] : []))
        // Texto "[[A]], [[B]]" (o 🧭 Planejar Trimestre antes do `comoLista`): um link de cada vez.
        .flatMap(v => {
            const links = typeof v === 'string' ? v.match(/\[\[[^\[\]]+\]\]/g) : null;
            return links && links.length > 1 ? links : [v];
        });
    const names = raw
        .map(v => String((v as any)?.path ?? v ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0].split('/').pop()!.replace(/\.md$/, '').trim())
        .filter(Boolean);
    const out: D[] = [];
    for (const name of names) {
        const dept = departments.find(d => fold(d.name) === fold(name));
        if (dept && !out.includes(dept)) out.push(dept);
    }
    return out;
}

/**
 * O que faz: onde procurar a nota-índice de um projeto ou departamento, em ordem: o
 * índice conhecido, `<Nome>.md` e, por último, `README.md`.
 * Por quê: a mesma ordem do canvas (`projectCanvasManager.departmentIndex`). A DLT
 * Academy tem os dois, e o README.md é o do repositório, sem frontmatter: lido antes,
 * um departamento com nota própria que aponta uma central sumiria debaixo dela no painel.
 */
export function indexCandidates(folder: string, name: string, index?: string | null): string[] {
    return [index, `${folder}/${name}.md`, `${folder}/README.md`].filter((x): x is string => !!x);
}

const open = (t: TaskRecord) => !TERMINAL.has(t.status);
/** Aberta e na grade (sem "algum dia"): o filtro da semana no canvas e na célula do trimestre. */
const live = (t: TaskRecord) => open(t) && inGrid(t);
const isSmart = (t: TaskRecord) => t.type === 'tarefa_smart';
const STAGE_ORDER = ['2', '3', '4', '5', '6', '1'];

function stageRank(stage: string): number {
    const n = stage.match(/^(\d)/)?.[1] ?? '9';
    const i = STAGE_ORDER.indexOf(n);
    return i === -1 ? 99 : i;
}

export function buildNav(input: NavInput): NavModel {
    const tasks = input.tasks;
    const smarts = tasks.filter(isSmart);
    const smartByKey = new Map(smarts.map(s => [fold(s.basename), s]));
    const projectKeys = new Set(input.projects.map(p => fold(p.name)));
    const otherKeys = new Set(input.otherTargets.map(fold));

    // Projeto real de cada tarefa: direto ou pela SMART mãe.
    const projectsOf = (t: TaskRecord): string[] => {
        const out = new Set<string>();
        for (const link of t.projects) {
            const smart = smartByKey.get(fold(link));
            if (smart) smart.projects.forEach(p => out.add(fold(p)));
            else out.add(fold(link));
        }
        return [...out];
    };

    const byProject = new Map<string, ProjectNav>();
    const period = quarterPeriod(input.quarter.id);
    for (const p of input.projects) {
        const grammar = progressText(projectProgress({ name: p.name, index: null }, tasks, period));
        byProject.set(fold(p.name), { ...p, grammar, openSmarts: 0, openActions: 0, loose: 0, overdue: 0 });
    }
    for (const t of tasks.filter(open)) {
        // Projetos em que a ação já tem SMART mãe aberta. Fora deles, ela é "sem SMART"
        // (o mesmo critério da coluna "Direto no projeto" da zona do canvas).
        const withOpenMother = new Set<string>();
        for (const link of t.projects) {
            const smart = smartByKey.get(fold(link));
            if (smart && open(smart)) smart.projects.forEach(p => withOpenMother.add(fold(p)));
        }
        for (const key of projectsOf(t)) {
            const p = byProject.get(key);
            if (!p) continue;
            if (isSmart(t)) p.openSmarts++;
            else {
                p.openActions++;
                if (!withOpenMother.has(key)) p.loose++;
            }
            // Vencida só a que está na grade: "algum dia" com prazo antigo não é atraso
            // de agora (mesma regra de staleSmarts e da semana em foco).
            if (live(t) && t.due && t.due < input.today) p.overdue++;
        }
    }

    // Projeto em Done ou Integration saiu da mesa: não aparece na lista nem cobra canvas.
    // Continua destino válido de vínculo (`projectKeys`), para a tarefa antiga não virar órfã.
    const closed = (p: NavProjectInput) => CLOSED_STAGES.has(p.stage);
    const areas = new Map<string, ProjectNav[]>();
    for (const p of byProject.values()) {
        if (closed(p)) continue;
        if (!areas.has(p.area)) areas.set(p.area, []);
        areas.get(p.area)!.push(p);
    }
    const areaList = [...areas.entries()]
        .map(([area, projects]) => ({
            area,
            projects: projects.sort((a, b) => stageRank(a.stage) - stageRank(b.stage)
                || (b.openActions + b.openSmarts) - (a.openActions + a.openSmarts)
                || a.name.localeCompare(b.name, 'pt-BR')),
        }))
        .sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));

    const orphans: Orphan[] = [];
    for (const t of tasks) {
        if (isSmart(t) || !open(t)) continue;
        // Rotina recorrente (🌳 planejamento, 💰 finanças…) não tem projeto por natureza, e
        // registro que não é tarefa (nota de memória com a tag task) não se liga a projeto:
        // nenhum dos dois é "ação sem vínculo", e o Organizar nunca chegava a zero.
        if (t.recurrence || !['task', 'tarefa_smart'].includes(t.type)) continue;
        if (t.projects.length === 0) { orphans.push({ task: t, reason: 'sem-vinculo' }); continue; }
        const broken = t.projects.find(l => !projectKeys.has(fold(l)) && !smartByKey.has(fold(l)) && !otherKeys.has(fold(l)));
        if (broken && t.projects.every(l => !projectKeys.has(fold(l)) && !smartByKey.has(fold(l)) && !otherKeys.has(fold(l)))) {
            orphans.push({ task: t, reason: 'vinculo-quebrado', target: broken });
        }
    }

    // SMART sem projeto (nenhum, ou só vínculos para nada): fica fora de todo canvas de
    // projeto e do "quanto falta". Acontece ao apagar a seta projeto → SMART, que tira
    // o único projeto dela; sem esta lista ela sumia do painel inteiro.
    const orphanSmarts: Orphan[] = [];
    for (const s of smarts) {
        if (!open(s)) continue;
        if (s.projects.length === 0) { orphanSmarts.push({ task: s, reason: 'sem-vinculo' }); continue; }
        const valid = (l: string) => projectKeys.has(fold(l)) || smartByKey.has(fold(l)) || otherKeys.has(fold(l));
        if (!s.projects.some(valid)) orphanSmarts.push({ task: s, reason: 'vinculo-quebrado', target: s.projects[0] });
    }

    // Mesmo filtro da grade (sem "algum dia"): "Trazer para a semana" numa SMART
    // algum dia só mudava a `week`, e ela sumia daqui sem entrar na grade.
    const staleSmarts = smarts
        .filter(s => live(s) && ehSemana(s.week) && s.week < input.currentWeek)
        .sort((a, b) => a.week.localeCompare(b.week));

    const focusSmarts = smarts.filter(s => live(s) && s.week === input.focus.week);
    const focusKeys = new Set(focusSmarts.map(s => fold(s.basename)));
    const focusActions = tasks.filter(t => !isSmart(t) && live(t) && (t.week === input.focus.week || t.projects.some(l => focusKeys.has(fold(l)))));

    // A Temporada (25/10/2026): cada central com os auxiliares que a apontam em
    // `projects`. Auxiliar encerrado (Done, Integration) não aparece, como na lista.
    const temporada: TemporadaNav[] = [];
    // Um foco só (27/10/2026): com a lista do trimestre, o auxiliar fora dela não aparece.
    const focoKeys = (input.foco ?? []).length ? new Set((input.foco ?? []).map(n => fold(linkTarget(n)))) : null;
    for (const name of input.temporada ?? []) {
        const key = fold(linkTarget(name));
        if (!key || temporada.some(t => fold(linkTarget(t.name)) === key)) continue;
        const auxiliares = [...byProject.values()]
            .filter(p => !closed(p) && fold(p.name) !== key && (p.serves ?? []).some(s => fold(linkTarget(s)) === key)
                && (!focoKeys || focoKeys.has(fold(p.name))))
            .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.name.localeCompare(b.name, 'pt-BR'));
        temporada.push({ name, central: byProject.get(key) ?? null, auxiliares });
    }

    return {
        time: {
            longTerm: input.longTerm,
            quarter: input.quarter,
            focus: {
                ...input.focus,
                openSmarts: focusSmarts.length,
                openActions: focusActions.length,
                grammar: weekGrammar(input.focus.week, tasks, 'sem planejamento').text,
            },
            day: { ...input.day, date: input.today },
        },
        areas: areaList,
        temporada,
        pending: {
            orphans: orphans.sort((a, b) => a.task.title.localeCompare(b.task.title, 'pt-BR')),
            orphanSmarts: orphanSmarts.sort((a, b) => a.task.title.localeCompare(b.task.title, 'pt-BR')),
            staleSmarts,
            missingCanvas: input.projects.filter(p => !p.canvasExists && !p.submodule && !closed(p)).map(p => p.name),
        },
    };
}
