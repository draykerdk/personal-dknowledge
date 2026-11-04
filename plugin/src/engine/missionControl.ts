/**
 * Mission Control — agregador read-only do estado vivo do DFM.
 *
 * Contrato de engenharia desta camada:
 * - **Nada escreve no vault.** A única exceção são as ações explícitas do
 *   operador nos painéis, que reusam os motores já existentes (nunca um write
 *   novo inventado aqui).
 * - **Ausência de dado é ausência de dado** — nunca uma falha inferida. Todo
 *   campo vazio vira o estado `no-data`/`absent`, jamais um zero culpado.
 * - **Núcleo puro e testável.** Toda derivação (buckets, vitais, ciclos,
 *   projetos, telemetria) é função pura exportada; o coletor apenas lê disco e
 *   entrega entrada. Os testes cobrem as funções puras, não o Obsidian.
 *
 * Portal de leitura:
 *   TaskNotes/Tasks/**            -> tarefas (status/prioridade/impacto/projeto)
 *   300 - RUNTIME/302 - Daymiss/  -> notas recorrentes (Day/Week/Quarterly)
 *   100 - AREAS/**                -> ciclo de vida por área (projects/departments)
 *   200 - FUNCTIONS/Protocolos/** -> catálogo de protocolos JSON
 *   <projeto>/*.canvas            -> mapas, árvores de progressão
 *   .dfm-dsh-*                    -> sinal de contexto, ponte e journal do DSH
 */
import { App, TFile, TFolder, moment } from 'obsidian';
import type DFMPlugin from '../main';
import { protocolosDaPonte } from './dshAllowlist';
import { protocolGroup } from './protocolGroups';
import { normalizeLink } from './noteLink';
import { diaNoInicio } from './dia';
// O nome de um link mora na base (noteLink.ts); reexportado para quem o lia daqui.
export { normalizeLink };
import { USO_JANELA_LONGA, usageByProtocol, windowStart, type ProtocolCatalogInput, type ProtocolDefinitionEntry } from './protocolCatalog';
import { PROTOCOLOS_DOMINIO, type DayRead } from './protocolRank';
import { isHighImpact, isTerminalStatus, parseImpactScore, parseMinutes, parseSchedule } from './taskSemantics';
import { Habit, buildGrid, calcGridStats, calcHabitMetrics, habitToday, parseHabit } from './habits';
// Reexportado: `TERMINAL_STATUSES`/`isTerminalStatus` nasceram aqui e continuam
// fazendo parte da superfície pública deste módulo, mas a definição vive em
// `taskSemantics` para não criar ciclo de importação com o plano e o grafo.
export { TERMINAL_STATUSES, isTerminalStatus } from './taskSemantics';
import {
    buildPriorityMatrix,
    buildQuarterRadar,
    buildTimeline,
    buildWeekPlan,
} from './missionPlan';
import { buildMissionGraph } from './missionGraph';
import { DECISION_WEIGHTS_PATH } from './decisionWeights';
import { DayCommitment, comandoDaDay, inheritedCommitment as compromissoDeixado, leftTriggerLabel, tomorrowTriggerValue } from './commitmentLeft';
import { usePanelWeights } from './panelWeights';
import { currentQuarter } from './calendario';
import { quarterReviewOf, withReviewFields, type ReviewCandidate } from './quarterHandoff';
import { focoDoTrimestre } from './temporada';
import {
    actionScore,
    buildIntent,
    classifyWork,
} from './missionIntent';
import {
    MissionPortfolio,
    PROJECT_STAGES,
    PortfolioProject,
    buildPortfolio,
    indexProjectTasks,
    tasksForProject,
} from './missionPortfolio';
// `PROJECT_STAGES` nasceu neste módulo e continua na superfície pública dele —
// o portfólio é quem define a ordem canônica do quadro, e duas listas de colunas
// divergiriam na primeira coluna nova. Reexportar mantém os consumidores antigos.
export { PROJECT_STAGES } from './missionPortfolio';
import type {
    MissionArea,
    MissionCanvas,
    MissionHealth,
    MissionProject,
    MissionTask,
    MissionTree,
    MissionTreeTier,
} from './missionTypes';
import type {
    MissionBucketSpec,
    MissionCycle,
    MissionCycleField,
    MissionCycleKind,
    MissionCycleState,
    MissionHabitRow,
    MissionHabits,
    MissionOperator,
    MissionProtocol,
    MissionSnapshot,
    MissionTaskBoard,
    MissionTaskTotals,
} from './missionSnapshot';
// Os tipos da tarefa, do projeto e do retrato moram na projeção (missionTypes.ts e
// missionSnapshot.ts, o passo `tiposDoSnapshot` da divisão do motor); este módulo os
// reexporta, para quem já os lia daqui.
export type {
    MissionArea,
    MissionBucketSpec,
    MissionCanvas,
    MissionCycle,
    MissionCycleField,
    MissionCycleKind,
    MissionCycleState,
    MissionHabitRow,
    MissionHabits,
    MissionHealth,
    MissionOperator,
    MissionProject,
    MissionProtocol,
    MissionSnapshot,
    MissionTask,
    MissionTaskBoard,
    MissionTaskTotals,
    MissionTree,
    MissionTreeTier,
};

/* ==========================================================================
   Tarefas
   ========================================================================== */

/**
 * Buckets canônicos. Os status espelham o catálogo do TaskNotes e a mesma
 * semântica de cor usada pelo Canvas (ver README do plugin) — o console e o
 * Canvas nunca discordam sobre o que é "próxima ação".
 */
export const MISSION_BUCKETS: ReadonlyArray<MissionBucketSpec> = [
    { id: 'inbox', label: 'Inbox', icon: 'inbox', statuses: ['inbox', 'open', 'todo', 'aberto'], hint: 'capturado, ainda sem destino' },
    { id: 'ready', label: 'Próxima ação', icon: 'zap', statuses: ['next-action'], hint: 'executável agora' },
    { id: 'doing', label: 'Em execução', icon: 'activity', statuses: ['in-progress'], hint: 'trabalho em curso' },
    { id: 'blocked', label: 'Bloqueado', icon: 'octagon-alert', statuses: ['waiting-on', 'blocked', 'bloqueado'], hint: 'depende de terceiro ou de outra peça' },
    { id: 'later', label: 'Algum dia', icon: 'archive', statuses: ['someday'], hint: 'fora do horizonte atual' },
];

function asStringArray(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(item => String(item)).filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
    return [];
}

/**
 * `2026-09-14`, `2026-09-14T09:15:50+07:00` ou vazio → `2026-09-14` ou `''`.
 *
 * O TaskNotes grava `dateCreated` como dia e `dateModified` como dia **ou**
 * timestamp com offset; as duas formas precisam virar o mesmo campo de dia. Data
 * ilegível devolve vazio: ausência de data não vira a data de hoje.
 */
export function dayField(raw: unknown): string {
    return diaNoInicio(String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? ''));
}

/** Links `http(s)` do corpo. Corpo não lido devolve `undefined` — ausência, não zero. */
function countOutboundLinks(body: unknown): number | undefined {
    if (typeof body !== 'string') return undefined;
    return (body.match(/https?:\/\/[^\s)\]<>"']+/g) ?? []).length;
}

/**
 * Deriva os campos operacionais de uma tarefa a partir do frontmatter cru.
 *
 * `body` é opcional e existe por um motivo só: o link de saída ("link da bio",
 * checkout, página publicada) é evidência de direção externa, e ele mora no
 * corpo. Ausência de corpo não vira zero link — vira ausência de evidência, que
 * o classificador declara em vez de contar contra.
 */
export function toMissionTask(path: string, frontmatter: any, today: string, body?: string): MissionTask {
    const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const status = String(fm.status ?? 'inbox');
    const due = String(fm.due ?? '').slice(0, 10);
    const terminal = isTerminalStatus(status);
    const schedule = parseSchedule(fm.scheduled);
    const task: MissionTask = {
        path,
        title: String(fm.title ?? '').trim() || path.split('/').pop()?.replace(/\.md$/, '') || path,
        status,
        priority: String(fm.priority ?? 'normal'),
        projects: asStringArray(fm.projects ?? fm.projeto ?? fm.Projeto ?? fm.project).map(item => normalizeLink(item)).filter(Boolean),
        week: String(fm.week ?? ''),
        due,
        impact: parseImpactScore(fm.impacto ?? fm.impact),
        overdue: !!due && !terminal && due < today,
        dueToday: !!due && due === today,
        highImpact: isHighImpact(fm.impacto ?? fm.impact),
        scheduled: String(fm.scheduled ?? '').trim(),
        scheduledDate: schedule.date,
        scheduledTime: schedule.time,
        scheduledPast: !!schedule.date && !terminal && schedule.date < today,
        estimate: parseMinutes(fm.timeEstimate ?? fm.time_estimate ?? fm.estimativa),
        contexts: asStringArray(fm.contexts ?? fm.contexto).map(item => String(item).trim()).filter(Boolean),
        type: String(fm.type ?? 'task').trim() || 'task',
        archived: asStringArray(fm.tags).map(tag => String(tag).toLowerCase()).includes('archived') || fm.archived === true,
        blockedBy: asStringArray(fm.blockedBy ?? fm.blocked_by).map(normalizeLink).filter(Boolean),
        // Um nome só para a criação e para a conclusão (Passo 0, 0a, 27/10/2026): os do
        // TaskNotes (`fieldMapping`). O `created` e o `completed` antigos saíram das notas
        // e o task_doctor.py os recusa; ler a reserva traria de volta a segunda fonte.
        createdOn: dayField(fm.dateCreated ?? fm.data_criacao),
        modifiedOn: dayField(fm.dateModified ?? fm.modified ?? fm.updated),
        completedOn: dayField(fm.completedDate),
        deliverable: String(fm.entrega_observavel ?? '').trim(),
        sufficientCriteria: String(fm.criterio_suficiente ?? '').trim(),
        outboundLinks: countOutboundLinks(body),
    };

    const classification = classifyWork(task);
    task.nucleo = classification.nucleo;
    task.nucleoReason = classification.reasons;
    return task;
}

/**
 * Distribui tarefas nos buckets canônicos. Terminal nunca entra em bucket
 * aberto, mas continua contado em `totals.terminal` — o funil precisa fechar.
 * A "algum dia" fica no bucket dela e fora de Abertas, de Vencidas e de Vencem
 * hoje (`totals.someday` a diz à parte): o prazo antigo de uma tarefa adiada
 * não é vencida (proposta do Mission Control, 27/10/2026, item 1: os números batem).
 */
export function buildTaskBoard(tasks: MissionTask[], today: string, focusWeek?: string): MissionTaskBoard {
    const buckets = MISSION_BUCKETS.map(spec => ({ ...spec, tasks: [] as MissionTask[] }));
    const byId = new Map(buckets.map(bucket => [bucket.id, bucket]));
    let terminal = 0;
    let overdue = 0;
    let dueToday = 0;
    let highImpact = 0;
    let withoutProject = 0;
    let focusWeekCount = 0;
    let someday = 0;

    for (const task of tasks) {
        if (isTerminalStatus(task.status)) {
            terminal += 1;
            continue;
        }
        const later = byId.get('later');
        if (later && later.statuses.includes(task.status.toLowerCase())) {
            someday += 1;
            later.tasks.push(task);
            continue;
        }
        if (task.overdue) overdue += 1;
        if (task.dueToday) dueToday += 1;
        if (task.highImpact) highImpact += 1;
        if (task.projects.length === 0) withoutProject += 1;
        if (focusWeek && task.week === focusWeek) focusWeekCount += 1;
        const status = task.status.toLowerCase();
        const bucket = buckets.find(candidate => candidate.statuses.includes(status)) ?? byId.get('inbox');
        (bucket as any).tasks.push(task);
    }

    for (const bucket of buckets) {
        bucket.tasks.sort((a, b) => {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
            if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
            const impact = (b.impact ?? 0) - (a.impact ?? 0);
            if (impact !== 0) return impact;
            return a.title.localeCompare(b.title);
        });
    }

    return {
        buckets,
        totals: {
            open: buckets.reduce((sum, bucket) => sum + (bucket.id === 'later' ? 0 : bucket.tasks.length), 0),
            terminal,
            overdue,
            dueToday,
            highImpact,
            withoutProject,
            focusWeek: focusWeekCount,
            someday,
        },
    };
}

/* ==========================================================================
   Números
   ========================================================================== */

// Os vitais (pontos, nível, C.A.O.S. e os vetores E.C.H. da gamificação) saíram em
// 29/10/2026, com o arquivamento da gamificação: `arquivo/gamificacao/src/engine/missionVitals.ts`.

function numeric(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/* ==========================================================================
   Ciclos — notas recorrentes (Day / Week / Quarterly)
   ========================================================================== */

/**
 * Campos que contam no selo "x/N". Na Day, só o que todo dia comum grava: o ▶️
 * curto (ação e entrega suficiente) e o 🌙 de três campos. `fallback` cobre as
 * Days anteriores ao Q4, que gravavam `tarefa_smart`/`foco`.
 */
const CYCLE_FIELDS: Record<MissionCycleKind, Array<{ key: string; label: string; fallback?: string[] }>> = {
    day: [
        { key: 'acao_comando', label: 'Ação do comando', fallback: ['tarefa_smart'] },
        { key: 'resultado_suficiente', label: 'Suficiente agora', fallback: ['foco'] },
        { key: 'conquistas', label: 'O que ficou no mundo' },
        { key: 'act_resposta', label: 'Agi / evitei' },
        { key: 'gatilho_amanha', label: 'Compromisso de amanhã' },
    ],
    // Os campos que o 🌳 (`planejamento_semanal`, desde 14/10/2026) e o 📅 Revisão
    // Semanal gravam na Week. `criterio_suficiente_semana`, `guardrails_semana` e
    // `rating` saíram dos dois (só as Weeks de antes da W41 os têm): contá-los
    // deixava toda semana nova "incompleta" por campos que ninguém pede mais.
    week: [
        { key: 'foco', label: 'Fio condutor' },
        { key: 'valor_semana', label: 'Valor da semana' },
        { key: 'modo_semana', label: 'Modo' },
        { key: 'frentes_dia', label: 'Frente de cada dia' },
        { key: 'bloco_sagrado', label: 'Bloco Sagrado' },
        { key: 'fato_semana', label: 'Fato da semana' },
        { key: 'padrao_act_adler', label: 'Padrão ACT/Adler' },
        { key: 'ajuste_minimo', label: 'Ajuste mínimo' },
        { key: 'relatorio', label: '📨' },
    ],
    quarter: [
        { key: 'theme', label: 'Tema do trimestre' },
        // A Temporada (25/10/2026): a lista das centrais; sem ela, `departamentos_foco`.
        { key: 'temporada', label: 'Temporada', fallback: ['departamentos_foco'] },
        { key: 'objetivos', label: 'Objetivos' },
        { key: 'licao', label: 'Lição' },
        { key: 'ajuste_minimo', label: 'Ajuste mínimo' },
        { key: 'palavra_resumo', label: 'Palavra-resumo' },
        { key: 'rating', label: 'Rating' },
    ],
};

const CYCLE_LABELS: Record<MissionCycleKind, string> = { day: 'Dia', week: 'Semana', quarter: 'Trimestre' };

/** Telemetria da Day: só o 🔎 Aprofundar grava. Aparece quando há; não entra no selo. */
const DAY_TELEMETRY_FIELDS: Array<{ key: string; label: string }> = [
    { key: 'ech_expansion', label: 'ECH · Expansão' },
    { key: 'ech_complexity', label: 'ECH · Complexidade' },
    { key: 'ech_harmony', label: 'ECH · Harmonia' },
    { key: 'rating', label: 'Gestos do núcleo' },
    { key: 'aprendizados', label: 'Aprendizados' },
];

/** Chaves aceitas como campo inline do Comando do Dia. Allowlist evita falso positivo em código. */
const INLINE_COMMAND_KEYS = new Set(['unica_coisa', 'valor', 'valor_hyadhuad', 'acao_comando', 'tarefa_smart', 'macro_foco']);

/**
 * Lê campos Dataview `chave:: valor` do corpo, restrito à allowlist do Comando
 * do Dia. Blocos de código são removidos: o Dataview também não enxerga campo
 * inline dentro de fence, e os blocos `dfm` das notas usam `chave:` simples.
 */
export function parseInlineFields(text: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const body = String(text ?? '')
        .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
        .replace(/^```[\s\S]*?^```/gm, '');
    for (const line of body.split('\n')) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*::\s*(.+?)\s*$/);
        if (!match) continue;
        const key = match[1].toLowerCase();
        if (!INLINE_COMMAND_KEYS.has(key)) continue;
        const value = match[2].replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
        if (value && !fields[key]) fields[key] = value;
    }
    return fields;
}

function displayValue(raw: unknown): string {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) {
        const items = raw.map(item => displayValue(item)).filter(Boolean);
        return items.join(' · ');
    }
    if (raw instanceof Date) return moment(raw).format('YYYY-MM-DD');
    if (typeof raw === 'object') return '';
    return String(raw).trim();
}

/**
 * Texto que o seletor de nota grava em `{passo}_display` quando o passo é pulado.
 * Mesmo literal de `jsonProtocol.ts` e `suggesters.ts`.
 */
export const SKIPPED_NOTE_PLACEHOLDER = 'Sem conexão contextual';

/**
 * O que o 🌙 grava no `gatilho_amanha` quando a noite fecha sem compromisso (desde
 * 19/10/2026). Mesmo texto do `skipDisplay` do passo em `review_diario.json`.
 */
export const NO_COMMITMENT_TRIGGER = 'sem compromisso agora';

// O valor do `gatilho_amanha` como compromisso (`tomorrowTriggerValue`) mora em `commitmentLeft.ts` (02/11),
// com os mesmos dois textos; reexportado daqui, para quem o lia daqui.
export { tomorrowTriggerValue, leftTriggerLabel };

export function interpretCycle(
    kind: MissionCycleKind,
    input: {
        name: string;
        path: string;
        exists: boolean;
        frontmatter?: Record<string, any> | null;
        body?: string;
        inheritedTrigger?: string;
        inheritedTriggerWhen?: string;
        inheritedTriggerPath?: string;
    },
): MissionCycle {
    const fm = input.frontmatter && typeof input.frontmatter === 'object' ? input.frontmatter : {};
    const spec = CYCLE_FIELDS[kind];
    const firstOf = (keys: string[]) => {
        for (const key of keys) {
            const value = displayValue(fm[key]);
            if (value) return value;
        }
        return '';
    };
    const fields: MissionCycleField[] = spec.map(field => {
        const raw = firstOf([field.key, ...(field.fallback ?? [])]);
        const value = field.key === 'gatilho_amanha' ? tomorrowTriggerValue(raw) : raw;
        return { key: field.key, label: field.label, value, filled: value.length > 0 };
    });
    const filled = fields.filter(field => field.filled).length;
    const rawStatus = String(fm.status ?? '').toLowerCase();
    // A Day não recebe `status` do 🌙 (chave protegida no merge da Day): o dia
    // fechado é o que tem a resposta ACT, que todo 🌙 grava.
    const dayClosed = kind === 'day' && displayValue(fm.act_resposta).length > 0;
    const state: MissionCycleState = !input.exists ? 'absent' : rawStatus === 'closed' || dayClosed ? 'closed' : 'open';
    const inline = parseInlineFields(input.body ?? '');
    const telemetry: MissionCycleField[] = kind !== 'day' ? [] : DAY_TELEMETRY_FIELDS.map(field => {
        const value = displayValue(fm[field.key]);
        return { key: field.key, label: field.label, value, filled: value.length > 0 };
    });

    return {
        kind,
        label: CYCLE_LABELS[kind],
        name: input.name,
        path: input.path,
        link: input.exists ? `[[${input.path.replace(/\.md$/i, '')}]]` : '',
        exists: input.exists,
        state,
        headline: displayValue(fm.foco) || displayValue(fm.theme) || displayValue(fm.direcao),
        value: displayValue(fm.valor ?? fm.valor_semana),
        relation: kind === 'week' ? displayValue(fm.valor_relacao) : '',
        rating: displayValue(fm.rating),
        fields,
        filled,
        total: fields.length,
        // O que o ▶️ gravou (`comandoDaDay`, `commitmentLeft.ts`, 02/11): a mesma leitura que a Missão faz.
        command: comandoDaDay(fm, inline, displayValue),
        telemetry,
        inheritedTrigger: tomorrowTriggerValue(input.inheritedTrigger ?? ''),
        inheritedTriggerWhen: tomorrowTriggerValue(input.inheritedTrigger ?? '') ? String(input.inheritedTriggerWhen ?? '') : '',
        inheritedTriggerPath: tomorrowTriggerValue(input.inheritedTrigger ?? '') ? String(input.inheritedTriggerPath ?? '') : '',
    };
}

/**
 * O que faz: o compromisso que o 🌙 deixou para hoje (`inheritedCommitment` de `commitmentLeft.ts`, 02/11),
 * lido com o texto deste painel (`displayValue`); o rótulo dele é `leftTriggerLabel`, de lá também.
 */
export function inheritedCommitment(
    days: Iterable<DayCommitment> | null | undefined,
    today: string,
    taskOf: (name: string) => { path: string; status: string } | null,
): { text: string; when: string; taskPath: string } | null {
    return compromissoDeixado(days, today, taskOf, displayValue);
}

/* ==========================================================================
   Projetos e áreas
   ========================================================================== */

/**
 * Agrega tarefas por projeto. Projetos em foco entram mesmo sem tarefa
 * correspondente: a ausência de execução é um fato operacional relevante.
 */
export function aggregateProjects(tasks: MissionTask[], focusProjects: string[]): MissionProject[] {
    const focus = focusProjects.map(normalizeLink).filter(Boolean);
    const names = new Set<string>(focus);
    for (const task of tasks) {
        if (isTerminalStatus(task.status)) continue;
        for (const project of task.projects) names.add(normalizeLink(project));
    }

    const projects: MissionProject[] = [];
    for (const name of names) {
        if (!name) continue;
        const own = tasks.filter(task => task.projects.some(project => normalizeLink(project) === name));
        let completed = 0;
        let pending = 0;
        let blocked = 0;
        let doing = 0;
        for (const task of own) {
            if (isTerminalStatus(task.status)) { completed += 1; continue; }
            pending += 1;
            if (MISSION_BUCKETS.find(b => b.id === 'blocked')?.statuses.includes(task.status.toLowerCase())) blocked += 1;
            if (task.status.toLowerCase() === 'in-progress') doing += 1;
        }
        const total = own.length;
        projects.push({
            name,
            total,
            completed,
            pending,
            blocked,
            doing,
            progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
            health: projectHealth({ total, completed, pending, blocked }),
            inFocus: focus.includes(name),
            units: own.map(task => ({ status: task.status, week: task.week, scheduled: task.scheduledDate, completedDate: task.completedOn })),
        });
    }

    return projects.sort((a, b) => {
        if (a.inFocus !== b.inFocus) return a.inFocus ? -1 : 1;
        if (a.blocked !== b.blocked) return b.blocked - a.blocked;
        if (a.pending !== b.pending) return b.pending - a.pending;
        return a.name.localeCompare(b.name);
    });
}

export function projectHealth(metrics: { total: number; completed: number; pending: number; blocked: number }): MissionHealth {
    if (metrics.total === 0) return 'no-data';
    if (metrics.pending === 0) return 'completed';
    if (metrics.blocked > 0) return 'at-risk';
    return 'on-track';
}

/** Descobre áreas e o ciclo de vida de cada uma (contagens por estágio). */
export function discoverAreas(app: App): MissionArea[] {
    const root = app.vault.getAbstractFileByPath('100 - AREAS');
    if (!(root instanceof TFolder)) return [];
    const areas: MissionArea[] = [];

    for (const child of root.children) {
        if (!(child instanceof TFolder)) continue;
        const projectsFolder = app.vault.getAbstractFileByPath(`${child.path}/100 - PROJECTS`);
        const departmentsFolder = app.vault.getAbstractFileByPath(`${child.path}/200 - DEPARTMENTS`);
        const staged: Array<{ stage: string; count: number }> = [];

        if (projectsFolder instanceof TFolder) {
            for (const stageFolder of projectsFolder.children) {
                if (!(stageFolder instanceof TFolder)) continue;
                const count = stageFolder.children.filter(item => item instanceof TFolder).length;
                staged.push({ stage: stageFolder.name, count });
            }
        }

        // O mapa vive como `<Nome da área>.canvas`, sem o prefixo numérico da
        // pasta (`02 - Uma área/` → `Uma área.canvas`). Validado no vault real.
        const canvasName = child.name.replace(/^\d+\s*-\s*/, '');
        const canvas = app.vault.getAbstractFileByPath(`${child.path}/${canvasName}.canvas`);
        areas.push({
            id: child.name,
            name: canvasName,
            path: child.path,
            initiatives: (projectsFolder instanceof TFolder ? projectsFolder.children : [])
                .filter(item => item instanceof TFolder)
                .reduce((sum, stage) => sum + (stage as TFolder).children.filter(item => item instanceof TFolder).length, 0),
            departments: departmentsFolder instanceof TFolder
                ? departmentsFolder.children.filter(item => item instanceof TFolder).length
                : 0,
            staged: PROJECT_STAGES.map(stage => ({
                stage: stage.replace(/^\d+\s*-\s*/, ''),
                count: staged.find(entry => entry.stage === stage)?.count ?? 0,
            })),
            canvas: canvas instanceof TFile ? canvas.path : null,
        });
    }

    return areas.sort((a, b) => a.id.localeCompare(b.id));
}

/* ==========================================================================
   Árvores de progressão e Canvas
   ========================================================================== */

/** Conta nós/arestas de um `.canvas` já lido; `null` quando o conteúdo é inválido. */
export function countCanvasNodes(raw: string): { nodes: number; edges: number } | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes.length : 0,
            edges: Array.isArray(parsed.edges) ? parsed.edges.length : 0,
        };
    } catch (_) {
        return null;
    }
}

/* ==========================================================================
   Hábitos — o tracker, lido como o resto do console lê
   ========================================================================== */

/**
 * Monta a leitura do tracker. Função pura: recebe hábitos já interpretados.
 *
 * `today` é parâmetro, nunca `Date.now()` — o teste precisa poder fixar o dia, e
 * uma tela que muda de resultado conforme a hora não é verificável.
 */
export function buildMissionHabits(
    habits: Habit[],
    today: string,
    folder: string,
    windowDays = 24,
): MissionHabits {
    const grid = buildGrid(habits, today, windowDays);
    const stats = calcGridStats(grid, today);
    const ativos = habits.filter(habit => habit.ativo);
    const execucoesSemana = ativos.reduce((total, habit) => total + habitToday(habit, today).semana, 0);

    return {
        folder,
        days: grid.days,
        windowDays,
        rows: grid.rows.map(row => {
            const habit = ativos.find(candidate => candidate.path === row.path);
            const metrics = habit ? calcHabitMetrics(habit, today, windowDays) : null;
            const hoje = habit ? habitToday(habit, today) : null;
            return {
                path: row.path,
                title: row.title,
                protocolId: row.protocolId,
                tracking: habit?.tracking ?? 'manual',
                cells: row.cells,
                execucoes: row.execucoes,
                doneToday: metrics?.doneToday ?? false,
                lastExecuted: metrics?.lastExecuted ?? null,
                // Revisão vencida é lembrete declarado pelo próprio autor do hábito
                // (`revisar_em`), não prazo inventado pelo sistema.
                revisaoVencida: !!habit?.reviewOn && habit.reviewOn < today,
                reviewOn: habit?.reviewOn ?? null,
                cadence: hoje?.cadence ?? 'diaria',
                semana: hoje?.semana ?? 0,
                pendenteHoje: hoje?.pendenteHoje ?? false,
                contaHoje: hoje?.contaHoje ?? false,
                metaSemanal: hoje?.meta ?? null,
                prioridade: habit?.prioridade ?? 2,
                pilar: habit?.pilar ?? null,
            };
        }),
        stats: {
            ativos: stats.totalAtivos,
            concluidosHoje: stats.concluidosHoje,
            execucoesJanela: stats.totalExecucoesJanela,
            execucoesSemana,
            esperadosHoje: ativos.filter(habit => habitToday(habit, today).contaHoje).length,
        },
    };
}

/* ==========================================================================
   Protocolos e DSH
   ========================================================================== */

// O grupo pelo prefixo do id mora num módulo puro, para os modelos do quadro.
export { protocolGroup };

/* ==========================================================================
   Projeção para o operador (DSH)
   ========================================================================== */

/**
 * As seções da projeção, a fonte única: a ponte confere contra esta lista, e a tool nativa do agente
 * (`native-dsh/dfm-vault-bridge/lib/contract.js`) é a cópia vigiada por teste. Os `vitals` saíram em
 * 02/11/2026: vinham da gamificação, arquivada em 29/10, e saíam sempre `null`.
 */
export const MISSION_SECTIONS = [
    'tasks', 'plan', 'habits', 'cycles', 'projects', 'portfolio', 'intent', 'areas', 'trees', 'canvases', 'protocols', 'operator', 'notes',
] as const;

export type MissionSection = typeof MISSION_SECTIONS[number];

export interface MissionProjectionLimits {
    canvases: number;
    protocols: number;
    trees: number;
    projects: number;
    /** Projetos do quadro que a projeção carrega (o quadro inteiro tem ~30). */
    portfolioProjects: number;
    tasksPerBucket: number;
    areas: number;
    planTasksPerDay: number;
    planMatrixPerCell: number;
    planTimeline: number;
    habits: number;
    /** Ações da faixa "Agora" (o pedido é 1–3; o teto existe para o dia em que virar lista). */
    intentActions: number;
    /** Itens por faixa subordinada (fechar ciclos, preparação, talvez). */
    intentBands: number;
    /** Sinais de drift preservados por leitura. */
    intentDrift: number;
}

/**
 * Tetos da projeção. O snapshot completo carrega centenas de mapas e todo o
 * catálogo de protocolos; o agente não precisa disso e pagaria caro em contexto.
 * A projeção corta, e **declara o corte** (`truncated`) em vez de mentir por
 * omissão.
 */
export const DEFAULT_PROJECTION_LIMITS: MissionProjectionLimits = {
    canvases: 12,
    protocols: 80,
    trees: 12,
    projects: 20,
    // 40 cabe o vault medido (34 projetos) sem cortar nada; o teto existe para o
    // dia em que não caber — e aí o corte é declarado, não silencioso.
    portfolioProjects: 40,
    tasksPerBucket: 8,
    areas: 12,
    planTasksPerDay: 6,
    planMatrixPerCell: 6,
    planTimeline: 12,
    habits: 20,
    // A superfície de decisão é curta por definição: "Agora" são 1–3 ações e as
    // faixas são leitura de apoio. O teto existe para o agente não receber lista
    // onde o painel mostra decisão.
    intentActions: 3,
    intentBands: 6,
    // São 7 os sinais de drift possíveis: o teto cabe todos, e existe para o dia
    // em que o catálogo crescer — aí o corte é declarado em `truncated`, como todo
    // corte desta projeção. Painel e agente mostram o mesmo número.
    intentDrift: 7,
};

/**
 * Tarefa em forma enxuta para o agente. Os campos de plano (`scheduled`,
 * `estimate_min`, `contexts`) entram porque sem eles o agente lê o estoque e
 * acredita ter lido o plano — era exatamente a lacuna que esta versão fecha.
 */
function compactTask(task: MissionTask): Record<string, any> {
    return {
        title: task.title,
        status: task.status,
        /* `priority` é urgência no DFM: sem ele na projeção o agente lia o prazo
           e não lia a decisão da triagem — a urgência ficava invisível. */
        priority: task.priority,
        type: task.type,
        path: task.path,
        projects: task.projects,
        week: task.week || undefined,
        due: task.due || undefined,
        impact: task.impact ?? undefined,
        overdue: task.overdue || undefined,
        dueToday: task.dueToday || undefined,
        scheduled: task.scheduled || undefined,
        estimate_min: task.estimate ?? undefined,
        contexts: task.contexts.length ? task.contexts : undefined,
        blocked_by: task.blockedBy.length ? task.blockedBy : undefined,
        /* A direção viaja com a tarefa: sem ela o agente lê o estoque e não sabe
           se está diante de trabalho que o mundo cobra ou de preparação interna. */
        nucleo: task.nucleo ?? undefined,
        nucleo_reason: task.nucleoReason?.length ? task.nucleoReason : undefined,
    };
}

/**
 * Projeto do quadro em forma enxuta para o agente.
 *
 * `tasks` viaja sempre, mesmo zerado: `0/0/0` é ausência de tarefa vinculada, e
 * omitir o campo faria o agente ler "sem trabalho" onde o vault só não registrou
 * nada. `index_type` só aparece quando a nota-índice declara `type: iniciativa` —
 * é o P1 do juiz, e `missing_index` nomeia quem não declara.
 */
function compactPortfolioProject(project: PortfolioProject): Record<string, any> {
    return {
        name: project.name,
        area: project.area,
        path: project.path,
        index: project.index ?? undefined,
        index_type: project.hasIndexType ? 'iniciativa' : undefined,
        tree: project.tree ?? undefined,
        tasks: {
            total: project.tasks.total,
            completed: project.tasks.completed,
            blocked: project.tasks.blocked,
        },
    };
}

/**
 * Projeta o snapshot num registro JSON enxuto e estável para o agente.
 * Função pura: nenhum I/O, nenhuma leitura de disco — apenas recorte e
 * normalização do que já foi lido.
 *
 * **Ausência de campo não derruba a consulta.** A projeção é a superfície que o
 * agente alcança por `/v1/mission/query`, e ela já caiu inteira por causa de um
 * sub-objeto ausente num snapshot montado à mão (teste, ponte, versão anterior
 * do coletor). A regra agora é a da casa, aplicada à projeção: seção cuja fonte
 * não existe sai como `null` — ausência **declarada** — e nunca como exceção nem
 * como zero. Zero na projeção do agente é uma afirmação; ausência é o que é.
 */
export function projectMissionSnapshot(
    snapshot: MissionSnapshot,
    sections: string[] = [...MISSION_SECTIONS],
    limitsInput: Partial<MissionProjectionLimits> = {},
): Record<string, any> {
    const limits = { ...DEFAULT_PROJECTION_LIMITS, ...limitsInput };
    const want = new Set(sections);
    /** Lista tolerante: valor ausente ou de tipo errado é lista vazia, nunca exceção. */
    const list = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);
    const out: Record<string, any> = {
        generatedAt: snapshot.generatedAt,
        today: snapshot.today,
        week: snapshot.week,
        quarter: snapshot.quarter,
        vault: snapshot.vaultName,
        pluginVersion: snapshot.pluginVersion,
    };
    const truncated: Record<string, number> = {};

    // Os vitais (pontos, nível, C.A.O.S. e os vetores E.C.H.) eram da gamificação, arquivada em
    // 29/10/2026; a seção saiu da lista em 02/11 (e o snapshot antigo que ainda os traga não os
    // projeta). As contagens do ECH (`nucleo.ech`, `engine/ech.ts`) são outra peça.

    if (want.has('tasks')) {
        const { board } = snapshot;
        out.tasks = {
            totals: board.totals,
            buckets: list(board.buckets).map(bucket => {
                const items = bucket.tasks.slice(0, limits.tasksPerBucket);
                if (bucket.tasks.length > items.length) truncated[`tasks.${bucket.id}`] = bucket.tasks.length;
                return { id: bucket.id, label: bucket.label, count: bucket.tasks.length, tasks: items.map(compactTask) };
            }),
        };
    }

    if (want.has('plan')) {
        const { plan, matrix, timeline, radar } = snapshot;
        out.plan = {
            week: plan.week,
            start: plan.start,
            end: plan.end,
            capacity_minutes: plan.capacityMinutes,
            planned_minutes: plan.plannedMinutes,
            overflow_minutes: plan.overflowMinutes,
            peak_day: plan.peakDay ?? null,
            totals: plan.totals,
            days: list(plan.days).map(day => {
                const items = day.scheduled.slice(0, limits.planTasksPerDay);
                if (day.scheduled.length > items.length) truncated[`plan.${day.date}`] = day.scheduled.length;
                return {
                    date: day.date,
                    label: day.label,
                    is_today: day.isToday || undefined,
                    is_past: day.isPast || undefined,
                    minutes: day.minutes,
                    unestimated: day.unestimated || undefined,
                    due_count: day.due.length || undefined,
                    tasks: items.map(compactTask),
                };
            }),
            gaps: list(plan.gaps).map(gap => ({ id: gap.id, severity: gap.severity, detail: gap.detail })),
            matrix: list(matrix).map(cell => {
                const items = cell.tasks.slice(0, limits.planMatrixPerCell);
                if (cell.tasks.length > items.length) truncated[`plan.matrix.${cell.id}`] = cell.tasks.length;
                return {
                    id: cell.id,
                    label: cell.label,
                    count: cell.tasks.length,
                    tasks: items.map(task => ({ title: task.title, path: task.path, due: task.due || undefined, impact: task.impact ?? undefined })),
                };
            }),
            timeline: list(timeline).slice(0, limits.planTimeline).map(entry => ({
                title: entry.task.title,
                path: entry.task.path,
                start: entry.start || undefined,
                end: entry.end || undefined,
                slack_days: entry.slackDays ?? undefined,
                state: entry.state,
            })),
            radar: list(radar).map(item => ({
                week: item.week,
                state: item.state,
                open_tasks: item.openTasks,
                minutes: item.minutes,
                has_note: item.hasNote,
            })),
        };
        if (timeline.length > limits.planTimeline) truncated.plan_timeline = timeline.length;
    }

    if (want.has('habits')) {
        const { habits } = snapshot;
        const items = list(habits.rows).slice(0, limits.habits);
        if (habits.rows.length > items.length) truncated.habits = habits.rows.length;
        out.habits = {
            folder: habits.folder,
            window_days: habits.windowDays,
            days: habits.days.length,
            stats: habits.stats,
            rows: items.map(row => ({
                title: row.title,
                path: row.path,
                tracking: row.tracking,
                protocol: row.protocolId ?? undefined,
                // Contagem de execuções, nunca sequência: o sistema não mede streak.
                execucoes: row.execucoes,
                done_today: row.doneToday || undefined,
                last_executed: row.lastExecuted ?? undefined,
                revisao_vencida: row.revisaoVencida || undefined,
            })),
            // A série por dia é o que o agente precisa para ver ritmo sem receber
            // a grade inteira (24 dias × N hábitos).
            execucoes_por_dia: list(habits.days)
                .map(date => ({
                    date,
                    done: list(habits.rows).filter(row => list(row.cells).some(cell => cell.date === date && cell.done)).length,
                }))
                .filter(entry => entry.done > 0),
        };
    }

    if (want.has('cycles')) {
        const cycle = (kind: MissionCycleKind) => {
            const value = snapshot.cycles[kind];
            return {
                name: value.name,
                path: value.path,
                state: value.state,
                headline: value.headline || undefined,
                value: value.value || undefined,
                rating: value.rating || undefined,
                fields_filled: value.filled,
                fields_total: value.total,
                missing: value.fields.filter(field => !field.filled).map(field => field.key),
                command: kind === 'day' ? {
                    unica_coisa: value.command.unicaCoisa || undefined,
                    valor: value.command.valor || undefined,
                    acao: value.command.acao || undefined,
                    compromisso: value.command.compromisso || undefined,
                    task_path: value.command.taskPath || undefined,
                } : undefined,
                inherited_trigger: kind === 'day' && value.inheritedTrigger ? value.inheritedTrigger : undefined,
            };
        };
        out.cycles = { day: cycle('day'), week: cycle('week'), quarter: cycle('quarter') };
    }

    if (want.has('projects')) {
        const items = list(snapshot.projects).slice(0, limits.projects);
        if (snapshot.projects.length > items.length) truncated.projects = snapshot.projects.length;
        out.projects = items.map(project => ({
            name: project.name,
            total: project.total,
            completed: project.completed,
            pending: project.pending,
            blocked: project.blocked,
            doing: project.doing,
            progress_percent: project.progressPercent,
            health: project.health,
            in_focus: project.inFocus,
        }));
    }

    if (want.has('portfolio')) {
        const portfolio = snapshot.portfolio;
        // P-1: ausência do quadro é ausência DECLARADA. Antes desta guarda, um
        // snapshot sem `portfolio` derrubava `/v1/mission/query` inteira.
        if (!portfolio || !Array.isArray(portfolio.columns)) {
            out.portfolio = null;
        } else {
            // O teto é UM orçamento para o quadro inteiro, gasto na ordem canônica das
            // colunas. Assim o corte é determinístico (o Backlog é o primeiro a ser
            // cortado) e um único número declara tudo o que ficou fora.
            let budget = Math.max(1, limits.portfolioProjects);
            const columns = portfolio.columns.map(column => {
                const items = column.projects.slice(0, Math.max(0, budget));
                budget -= items.length;
                return {
                    stage: column.stage,
                    label: column.label,
                    count: column.projects.length,
                    projects: items.map(compactPortfolioProject),
                };
            });
            const shown = columns.reduce((sum, column) => sum + column.projects.length, 0);
            if (portfolio.totals.projects > shown) truncated['portfolio.columns'] = portfolio.totals.projects;
            out.portfolio = {
                totals: {
                    projects: portfolio.totals.projects,
                    indexed: portfolio.totals.indexed,
                    with_tree: portfolio.totals.withTree,
                },
                columns,
                // A lista do P1 viaja inteira: é curta por natureza (só projetos sem
                // índice) e é o motivo de a seção existir — cortá-la esconderia
                // exatamente o que o operador precisa corrigir.
                missing_index: list(portfolio.missingIndex).map(project => ({
                    name: project.name,
                    area: project.area,
                    column: project.column,
                    path: project.path,
                    index: project.index ?? undefined,
                })),
                areas: list(portfolio.areas).map(area => ({
                    name: area.name,
                    path: area.path,
                    canvas: area.canvas ?? undefined,
                    projects: area.projects,
                    departments: area.departments,
                })),
                departments: list(portfolio.departments).map(department => ({
                    name: department.name,
                    area: department.area,
                    path: department.path,
                })),
            };
        }
    }

    if (want.has('intent')) {
        const intent = snapshot.intent;
        // Mesma regra do portfólio: sem o motor de intenção a seção sai como
        // ausência declarada, e a consulta do agente continua respondendo.
        if (!intent) {
            out.intent = null;
        } else {
            const actions = list(intent.agora).slice(0, limits.intentActions);
            if (list(intent.agora).length > actions.length) truncated['intent.agora'] = list(intent.agora).length;
            const compactAction = (action: any) => ({
                title: action.task.title,
                path: action.task.path,
                status: action.task.status,
                nucleo: action.nucleo,
                score: action.score,
                // O motivo do score viaja: sem ele o agente repetiria a ordem do
                // console sem poder explicá-la — e a decisão é do operador.
                terms: action.terms,
                reason: action.reason,
                due: action.task.due || undefined,
                impact: action.task.impact ?? undefined,
            });
            out.intent = {
                today: intent.today,
                window: intent.window,
                classification: intent.classification,
                agora: actions.map(compactAction),
                projeto_mais_proximo: intent.projetoMaisProximo ? {
                    project: intent.projetoMaisProximo.project,
                    column: intent.projetoMaisProximo.column,
                    origem: intent.projetoMaisProximo.origem,
                    reason: intent.projetoMaisProximo.reason,
                    alternatives: intent.projetoMaisProximo.alternatives,
                    // O score sai do mesmo lugar que o do painel: um 0 fixo aqui
                    // faria o agente ler "ação sem peso" onde há conta aberta.
                    action: intent.projetoMaisProximo.task ? compactAction({
                        task: intent.projetoMaisProximo.task,
                        nucleo: intent.projetoMaisProximo.task.nucleo ?? 'indeterminado',
                        ...actionScore(intent.projetoMaisProximo.task, intent.today),
                        reason: intent.projetoMaisProximo.reason,
                    }) : null,
                } : null,
                faixas: list(intent.faixas).map(band => {
                    const items = list(band.tasks).slice(0, limits.intentBands);
                    if (list(band.tasks).length > items.length) truncated[`intent.${band.id}`] = list(band.tasks).length;
                    return {
                        id: band.id,
                        label: band.label,
                        hint: band.hint,
                        total: band.total,
                        tasks: items.map(compactAction),
                    };
                }),
                prontos: list(intent.prontos).map(ready => ({
                    project: ready.project,
                    title: ready.task.title,
                    path: ready.task.path,
                    since: ready.since || undefined,
                    internal_after: ready.internalAfter,
                    reason: ready.reason,
                })),
                drift: list(intent.drift).slice(0, limits.intentDrift).map(signal => ({
                    id: signal.id,
                    fact: signal.fact,
                    threshold: signal.threshold,
                    evidence: signal.evidence,
                    question: signal.question,
                })),
                ciclos: intent.ciclos,
                gaps: intent.gaps,
            };
            if (list(intent.drift).length > limits.intentDrift) truncated['intent.drift'] = list(intent.drift).length;
        }
    }

    if (want.has('areas')) {
        const areas = list(snapshot.areas);
        const items = areas.slice(0, limits.areas);
        if (areas.length > items.length) truncated.areas = areas.length;
        out.areas = items.map(area => ({
            name: area.name,
            path: area.path,
            initiatives: area.initiatives,
            departments: area.departments,
            lifecycle: Object.fromEntries(area.staged.map(stage => [stage.stage, stage.count])),
            canvas: area.canvas ?? undefined,
        }));
    }

    if (want.has('trees')) {
        const trees = list(snapshot.trees);
        const items = trees.slice(0, limits.trees);
        if (trees.length > items.length) truncated.trees = trees.length;
        out.trees = items.map(tree => ({
            file: tree.file,
            project: tree.project,
            done: tree.done,
            total: tree.total,
            active: tree.active ? { num: tree.active.num, prefixo: tree.active.prefixo ?? '', nome: tree.active.nome, objetivo: tree.active.objetivo } : null,
            tiers: tree.tiers.map(tier => ({ num: tier.num, prefixo: tier.prefixo ?? '', nome: tier.nome, status: tier.status })),
        }));
    }

    if (want.has('canvases')) {
        const canvases = list(snapshot.canvases);
        const system = canvases.filter(canvas => canvas.system);
        const rest = canvases.filter(canvas => !canvas.system);
        const items = [...system, ...rest].slice(0, limits.canvases);
        if (canvases.length > items.length) truncated.canvases = canvases.length;
        out.canvases = items.map(canvas => ({
            path: canvas.path,
            name: canvas.name,
            nodes: canvas.nodes ?? undefined,
            edges: canvas.edges ?? undefined,
            system: canvas.system || undefined,
        }));
    }

    if (want.has('protocols')) {
        const items = list(snapshot.protocols).slice(0, limits.protocols);
        if (list(snapshot.protocols).length > items.length) truncated.protocols = list(snapshot.protocols).length;
        out.protocols = items.map(protocol => ({
            id: protocol.id,
            name: protocol.name,
            group: protocol.group,
            dsh_enabled: protocol.dshEnabled,
        }));
        out.protocols_dsh_allowlist = snapshot.operator.allowlist;
    }

    if (want.has('operator')) {
        const operator = snapshot.operator;
        out.operator = operator ? {
            online: !!operator.bridge,
            bridge: operator.bridge ?? undefined,
            health: operator.health ?? undefined,
            context_signal: operator.signal ?? undefined,
            context_signal_age_minutes: operator.signalAgeMinutes ?? undefined,
            skills: list(operator.skills).map(skill => ({ id: skill.id, label: skill.label, primary: skill.primary || undefined })),
            recent_audit: list(operator.audit),
        } : null;
    }

    if (want.has('notes')) out.notes = list(snapshot.notes);
    if (Object.keys(truncated).length > 0) {
        out.truncated = truncated;
        out.truncated_hint = 'Listas cortadas por teto de contexto; use /v1/tasks/query para o conjunto completo.';
    }

    return out;
}

/* ==========================================================================
   Coletor
   ========================================================================== */

const SNAPSHOT_TTL_MS = 15_000;
const MAX_CANVAS_READ_BYTES = 512 * 1024;
const MAX_CANVAS_COUNTED = 60;
const AUDIT_TAIL = 8;
/** Pasta canônica do tracker de hábitos; as configurações do plugin podem sobrescrever. */
const HABITS_FOLDER = '200 - FUNCTIONS/Habits/Tracker';
/** Janela do tracker: 24 dias, a mesma dos blocos ```dfm-habits``` das notas. */
const HABIT_WINDOW_DAYS = 24;

function weekKey(date: moment.Moment): string {
    return date.format('GGGG-[W]WW');
}

/**
 * O que faz: o trimestre de uma data pela regra única de período: o da quinta-feira da
 * semana ISO dela (`currentQuarter`). Em 29–31/03/2027 o calendário diz Q1, mas a W13 é
 * do Q2 (proposta de 27/10/2026, 2.4).
 * Prova: tests/engine/trimestrePadrao.test.ts ("o cartão do trimestre").
 */
export function missionQuarterKey(today: string): string {
    return currentQuarter(today);
}

function quarterKey(date: moment.Moment): string {
    return missionQuarterKey(date.format('YYYY-MM-DD'));
}

/**
 * O que faz: o frontmatter que o cartão do trimestre lê: o da nota do trimestre com a
 * lição, o ajuste mínimo, a palavra e a nota da revisão daquele trimestre por cima
 * (`withReviewFields`). A revisão é a fonte única dessas respostas (4.4).
 * Prova: tests/engine/trimestrePadrao.test.ts ("o cartão do trimestre").
 */
export function quarterCardFrontmatter(
    quarter: string,
    quarterFm: Record<string, unknown> | null | undefined,
    candidates: readonly ReviewCandidate[],
): Record<string, unknown> {
    const review = quarterReviewOf(candidates, quarter);
    return withReviewFields(quarterFm, review?.frontmatter ?? null);
}

/**
 * Lê o estado vivo e devolve o snapshot. Cache de 15 s evita reler o vault a
 * cada re-render; `invalidate()` é chamado nas ações que mudam o estado.
 */
export class MissionControl {
    private cached: MissionSnapshot | null = null;
    private cachedAt = 0;

    constructor(private readonly plugin: DFMPlugin) {}

    invalidate(): void {
        this.cached = null;
        this.cachedAt = 0;
    }

    /**
     * O snapshot já construído, sem esperar.
     *
     * Existe para as superfícies **síncronas**: o formatador de canvas roda por nó
     * e não pode aguardar uma leitura de vault por nó. Quem chama `peek()` e
     * recebe `null` deve pedir `build()` e repintar depois — `peek()` **nunca** lê
     * o vault, e respeita o mesmo TTL do `build`, para que um quadro velho não seja
     * apresentado como estado atual.
     */
    peek(): MissionSnapshot | null {
        if (!this.cached) return null;
        if (Date.now() - this.cachedAt >= SNAPSHOT_TTL_MS) return null;
        return this.cached;
    }

    async build(force = false): Promise<MissionSnapshot> {
        const now = Date.now();
        if (!force && this.cached && now - this.cachedAt < SNAPSHOT_TTL_MS) return this.cached;
        const snapshot = await this.collect();
        this.cached = snapshot;
        this.cachedAt = now;
        return snapshot;
    }

    private async readJson(adapter: any, path: string): Promise<any | null> {
        try {
            if (typeof adapter?.read !== 'function') return null;
            if (typeof adapter.exists === 'function' && !await adapter.exists(path)) return null;
            return JSON.parse(await adapter.read(path));
        } catch (_) {
            return null;
        }
    }

    private async readText(adapter: any, path: string): Promise<string | null> {
        try {
            if (typeof adapter?.read !== 'function') return null;
            if (typeof adapter.exists === 'function' && !await adapter.exists(path)) return null;
            return await adapter.read(path);
        } catch (_) {
            return null;
        }
    }

    /** Frontmatter de um caminho, ou `{}` quando a nota não existe/está no cache. */
    private frontmatterOf(path: string): Record<string, any> {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return {};
        return this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    }

    /** As notas que podem ser revisão trimestral (`quarterReviewOf` escolhe a do trimestre). */
    private reviewCandidates(): ReviewCandidate[] {
        const app = this.plugin.app;
        return app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith('400 - MEMORY/') || / - Review$/.test(f.basename))
            .map(f => ({ path: f.path, basename: f.basename, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? null }));
    }

    private cycleContext(date: moment.Moment) {
        return {
            day: `300 - RUNTIME/302 - Daymiss/Day/${date.format('YYYY-MM-DD')}.md`,
            week: `300 - RUNTIME/302 - Daymiss/Week/${weekKey(date)}.md`,
            quarter: `300 - RUNTIME/302 - Daymiss/Quarterly/${quarterKey(date)}.md`,
        };
    }

    /**
     * O que faz: o compromisso deixado para hoje (inheritedCommitment) a partir das Days
     * da pasta da Day de hoje, lidas do cache de metadados, e das TaskNotes pelo nome.
     */
    private leftCommitment(dayPath: string, today: string): { text: string; when: string; taskPath: string } | null {
        const app = this.plugin.app;
        const folderPath = dayPath.split('/').slice(0, -1).join('/');
        const folder = app.vault.getAbstractFileByPath(folderPath);
        const days: DayCommitment[] = [];
        for (const child of folder instanceof TFolder ? folder.children : []) {
            if (!(child instanceof TFile) || child.extension !== 'md') continue;
            days.push({ name: child.basename, value: app.metadataCache.getFileCache(child)?.frontmatter?.gatilho_amanha });
        }
        return inheritedCommitment(days, today, name => {
            const file = app.metadataCache.getFirstLinkpathDest(name, dayPath);
            if (!(file instanceof TFile) || !file.path.startsWith('TaskNotes/')) return null;
            return { path: file.path, status: String(app.metadataCache.getFileCache(file)?.frontmatter?.status ?? '') };
        });
    }

    private resolveCycle(kind: MissionCycleKind, path: string, date: moment.Moment, left?: { text: string; when: string; taskPath: string } | null): Promise<MissionCycle> {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        const name = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
        if (!(file instanceof TFile)) {
            return Promise.resolve(interpretCycle(kind, { name, path, exists: false, frontmatter: null, body: '' }));
        }
        const leftInput = left ? { inheritedTrigger: left.text, inheritedTriggerWhen: left.when, inheritedTriggerPath: left.taskPath } : {};
        // `cachedRead` usa o cache do metadataCache: leitura barata para um painel
        // que re-renderiza; o frontmatter já está em memória de qualquer forma.
        return this.plugin.app.vault.cachedRead(file).then(body => {
            const own = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
            // O trimestre lê as respostas de fechamento da revisão dele (fonte única).
            const frontmatter = kind === 'quarter' ? quarterCardFrontmatter(name, own, this.reviewCandidates()) : own;
            return interpretCycle(kind, { name, path, exists: true, frontmatter, body, ...leftInput });
        }).catch(() => interpretCycle(kind, { name, path, exists: true, frontmatter: null, body: '', ...leftInput }));
    }

    /**
     * Lê as tarefas do vault.
     *
     * O corpo entra na leitura por um motivo declarado: o **link de saída**
     * ("link da bio", página publicada, checkout) é evidência de direção externa,
     * e ele mora no corpo, não no frontmatter. `cachedRead` usa o cache do
     * Obsidian — 74 notas por snapshot, com TTL de 15 s. Corpo ilegível não vira
     * zero link: vira ausência de evidência, que o classificador declara.
     */
    private async collectTasks(today: string): Promise<MissionTask[]> {
        const tasks: MissionTask[] = [];
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith('TaskNotes/Tasks/')) continue;
            const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
            let body: string | undefined;
            try {
                body = await this.plugin.app.vault.cachedRead(file);
            } catch (_) {
                body = undefined;
            }
            tasks.push(toMissionTask(file.path, frontmatter, today, body));
        }
        return tasks;
    }

    /**
     * Semanas que existem como nota no vault.
     *
     * O radar do trimestre desenha 13 colunas; sem esta lista ele não saberia
     * distinguir "semana futura" de "semana sem nota". A ausência é dado, e o
     * painel precisa poder dizer qual dos dois é.
     */
    /**
     * Lê o tracker de hábitos.
     *
     * O motor de hábitos é puro (`engine/habits.ts`); aqui só se lê o
     * frontmatter das notas da pasta e se entrega a lista interpretada.
     *
     * A pasta é a canônica (`HABITS_FOLDER`). Blocos ```dfm-habits``` dentro das
     * notas aceitam `path:` por bloco, mas isso é configuração da nota, não do
     * plugin: não existe ajuste global de pasta de hábitos, e inventar um aqui
     * faria o console ler uma pasta que ninguém configurou.
     */
    private collectHabits(today: string): MissionHabits {
        const folder = HABITS_FOLDER;
        const habits: Habit[] = [];
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith(`${folder}/`)) continue;
            // Nota sem frontmatter NÃO é descartada: a matriz nativa a mostra
            // (`parseHabit(path, undefined)` devolve hábito ativo em treino), e
            // pular aqui faria o console contar menos hábitos que a nota onde o
            // tracker vive. `parseHabit` já trata ausência.
            const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
            habits.push(parseHabit(file.path, frontmatter));
        }
        habits.sort((a, b) => a.path.localeCompare(b.path));
        return buildMissionHabits(habits, today, folder, HABIT_WINDOW_DAYS);
    }

    private weekNotes(): string[] {
        const folder = this.plugin.app.vault.getAbstractFileByPath('300 - RUNTIME/302 - Daymiss/Week');
        if (!(folder instanceof TFolder)) return [];
        return folder.children
            .filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
            .map(child => child.basename);
    }

    private async collectTrees(): Promise<MissionTree[]> {
        const engine = this.plugin.progressionEngine;
        if (!engine) return [];
        const trees: MissionTree[] = [];
        for (const file of engine.discoverTrees()) {
            try {
                const text = await this.plugin.app.vault.cachedRead(file);
                const tree = engine.parseTree(file, text);
                engine.evaluate(tree);
                trees.push({
                    file: file.path,
                    project: tree.projectLink ?? '',
                    tiers: tree.tiers.map(tier => ({
                        num: tier.num,
                        prefixo: tier.prefixo ?? '',
                        nome: tier.nome,
                        status: tier.status,
                        objetivo: tier.objetivo,
                    })),
                    active: tree.tiers.filter(tier => tier.status === 'ativo')
                        .map(tier => ({ num: tier.num, prefixo: tier.prefixo ?? '', nome: tier.nome, status: tier.status as 'ativo', objetivo: tier.objetivo }))[0] ?? null,
                    done: tree.tiers.filter(tier => tier.status === 'done').length,
                    total: tree.tiers.length,
                });
            } catch (_) {
                // Árvore ilegível não derruba o painel; a nota continua listada no vault.
            }
        }
        return trees.sort((a, b) => b.total - a.total);
    }

    private async collectCanvases(): Promise<MissionCanvas[]> {
        const files = this.plugin.app.vault.getFiles().filter(file => file.extension === 'canvas');
        const sorted = files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        const canvases: MissionCanvas[] = [];
        let counted = 0;

        for (const file of sorted) {
            const folder = file.parent?.path ?? '';
            const system = folder.startsWith('000 - KERNEL') || folder.startsWith('500 - RESOURCES/Dashboards') || folder.startsWith('300 - RUNTIME/000 - COCKPIT') || file.path === '300 - RUNTIME/000 - COCKPIT/Dk-Fleet-Commander.canvas';
            let nodes: number | null = null;
            let edges: number | null = null;
            if (counted < MAX_CANVAS_COUNTED && file.stat.size <= MAX_CANVAS_READ_BYTES) {
                counted += 1;
                try {
                    const parsed = countCanvasNodes(await this.plugin.app.vault.cachedRead(file));
                    if (parsed) { nodes = parsed.nodes; edges = parsed.edges; }
                } catch (_) {
                    // Canvas ilegível: fica sem contagem, nunca com contagem inventada.
                }
            }
            canvases.push({ path: file.path, name: file.basename, folder, nodes, edges, mtime: file.stat.mtime, system });
        }
        return canvases;
    }

    /* ------------------------------------------------------------------
       Portfólio — o ciclo de vida dos projetos
       ------------------------------------------------------------------ */

    /**
     * Nota-índice do projeto, na MESMA ordem do juiz P1 e do script de ativação:
     * `README.md`, depois `<nome da pasta>.md`.
     *
     * O `type` vem do metadataCache, nunca de uma leitura de arquivo inteiro: o
     * console re-renderiza a cada evento do vault, e ler dezenas de notas por
     * render seria pagar caro pelo mesmo frontmatter que o Obsidian já mantém em
     * memória.
     */
    private portfolioIndex(project: TFolder): { index: string | null; hasIndexType: boolean; declaredNext: string } {
        for (const candidate of [`${project.path}/README.md`, `${project.path}/${project.name}.md`]) {
            const file = this.plugin.app.vault.getAbstractFileByPath(candidate);
            if (!(file instanceof TFile)) continue;
            const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
            const type = String(frontmatter.type ?? '');
            // D3: o override é OPCIONAL. Sem ele a próxima ação é derivada; com
            // ele, o painel exibe a origem `declared` e nunca apresenta inferência
            // como declaração.
            return {
                index: candidate,
                hasIndexType: type === 'iniciativa',
                declaredNext: this.resolveTaskPath(frontmatter.proxima_acao_real),
            };
        }
        return { index: null, hasIndexType: false, declaredNext: '' };
    }

    /**
     * `proxima_acao_real: "[[Tarefa]]"` ou um caminho cru → caminho de nota, ou `''`.
     *
     * Aceita as duas formas porque as duas são naturais no vault, e devolve vazio
     * quando não resolve — campo que aponta para lugar nenhum não vira uma ação
     * inventada, e sim ausência declarada.
     */
    private resolveTaskPath(raw: unknown): string {
        const value = normalizeLink(Array.isArray(raw) ? raw[0] : raw);
        if (!value) return '';
        if (value.startsWith('TaskNotes/')) {
            return this.plugin.app.vault.getAbstractFileByPath(value) instanceof TFile ? value : '';
        }
        const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(value, '');
        return resolved?.path ?? '';
    }

    /** Doc `type: arvore_progressao` na própria pasta do projeto (D1: o doc é a fonte). */
    private portfolioTree(project: TFolder): string | null {
        const trees = project.children
            .filter((child): child is TFile => child instanceof TFile && child.extension === 'md')
            .filter(child => String(this.plugin.app.metadataCache.getFileCache(child)?.frontmatter?.type ?? '') === 'arvore_progressao')
            .map(child => child.path)
            .sort();
        return trees[0] ?? null;
    }

    /**
     * Varre o kanban de projetos de todas as áreas.
     *
     * A varredura tem exatamente a forma que o script de ativação usa
     * (`100 - AREAS/<área>/100 - PROJECTS/<coluna>/<projeto>`), e isso é
     * deliberado: se o painel lesse uma estrutura e o comando movesse outra, o
     * quadro mostraria um projeto que o script não encontra — ou esconderia um
     * que ele move.
     *
     * As áreas vêm de `discoverAreas` (mesma varredura que a aba de áreas já
     * paga); aqui só se lê o que ela não devolve: o nome de cada departamento.
     */
    private collectPortfolio(
        tasksByProject: Map<string, PortfolioProject['tasks']>,
        areas: MissionArea[],
    ): { portfolio: MissionPortfolio; declaredNext: Record<string, string> } {
        const app = this.plugin.app;
        const projects: PortfolioProject[] = [];
        const departments: Array<{ name: string; area: string; path: string }> = [];
        const declaredNext: Record<string, string> = {};
        const root = app.vault.getAbstractFileByPath('100 - AREAS');
        if (!(root instanceof TFolder)) return { portfolio: buildPortfolio([], areas, []), declaredNext };

        for (const areaFolder of root.children) {
            if (!(areaFolder instanceof TFolder)) continue;
            const area = areaFolder.name.replace(/^\d+\s*-\s*/, '');

            const projectsRoot = app.vault.getAbstractFileByPath(`${areaFolder.path}/100 - PROJECTS`);
            if (projectsRoot instanceof TFolder) {
                for (const columnFolder of projectsRoot.children) {
                    if (!(columnFolder instanceof TFolder)) continue;
                    for (const projectFolder of columnFolder.children) {
                        if (!(projectFolder instanceof TFolder)) continue;
                        const { index, hasIndexType, declaredNext: declared } = this.portfolioIndex(projectFolder);
                        if (declared) declaredNext[projectFolder.name] = declared;
                        projects.push({
                            name: projectFolder.name,
                            path: projectFolder.path,
                            area,
                            column: columnFolder.name,
                            index,
                            hasIndexType,
                            tree: this.portfolioTree(projectFolder),
                            tasks: tasksForProject(tasksByProject, projectFolder.name),
                        });
                    }
                }
            }

            // Departamento é PASTA: o `README.md` que algumas áreas mantêm solto
            // na pasta não é uma fundação, e contá-lo inflaria o número que a
            // aba de áreas mostra.
            const departmentsRoot = app.vault.getAbstractFileByPath(`${areaFolder.path}/200 - DEPARTMENTS`);
            if (departmentsRoot instanceof TFolder) {
                for (const child of departmentsRoot.children) {
                    if (!(child instanceof TFolder)) continue;
                    departments.push({ name: child.name, area, path: child.path });
                }
            }
        }

        return { portfolio: buildPortfolio(projects, areas, departments), declaredNext };
    }

    private collectProtocols(): MissionProtocol[] {
        const manager = this.plugin.manager;
        if (!manager) return [];
        const ponte = protocolosDaPonte(manager.tabelaDosPapeis?.());
        return manager.getAll()
            .map((protocol: any) => ({
                id: String(protocol.id),
                name: String(protocol.name ?? protocol.id),
                icon: String(protocol.icon ?? 'star'),
                group: protocolGroup(String(protocol.id)),
                dshEnabled: ponte.has(String(protocol.id)),
            }))
            .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    }

    /** O uso já contado, pela assinatura das Days e dos rótulos (a conta só refaz quando eles mudam). */
    private usageCache: { key: string; usage: Record<string, string[]> } | null = null;

    /**
     * O que faz: o catálogo de protocolos para a página "Protocolos": as definições do
     * registro com o arquivo de cada uma, as falhas da carga, o uso nos últimos 30 dias
     * (pela regra do 🧭), o modelo de pesos do domínio `protocolos` e as exceções de
     * cobertura do juiz. Só lê.
     * Erro e ataque: sem Day lida, o uso é `null` (sem leitura); modelo ilegível, as paradas
     * ficam na ordem do JSON.
     */
    private async collectProtocolCatalog(today: string): Promise<ProtocolCatalogInput | null> {
        const manager: any = this.plugin.manager;
        if (!manager?.getAll) return null;
        const defs: ProtocolDefinitionEntry[] = manager.getAll().map((protocol: any) => ({
            id: String(protocol.id),
            path: manager.sources?.get?.(String(protocol.id)) ?? null,
            def: protocol.def,
        }));
        const resolveDef = (id: string) => manager.get?.(id)?.def ?? null;
        const desde = windowStart(today, USO_JANELA_LONGA);
        const nucleo: any = (this.plugin as any).nucleo;
        let days: DayRead[] = [];
        try { days = desde && nucleo?.daysBetween ? await nucleo.daysBetween(desde, today) : []; } catch (_) { days = []; }
        let usage: Record<string, string[]> | null = null;
        if (days.length) {
            const key = [
                today,
                days.map(day => `${day.date}:${day.text.length}`).join(','),
                defs.map(entry => `${entry.id}:${entry.def?.name ?? ''}:${entry.def?.dailyLedgerLabel ?? ''}:${entry.def?.logMode ?? ''}:${entry.def?.redirect ?? ''}`).join('|'),
            ].join('#');
            if (this.usageCache?.key !== key) this.usageCache = { key, usage: usageByProtocol(defs, days, resolveDef) };
            usage = this.usageCache.usage;
        }
        let rank: ProtocolCatalogInput['rank'] = null;
        try {
            const load = nucleo?.loadDomain ? await nucleo.loadDomain(PROTOCOLOS_DOMINIO) : null;
            if (load?.modelo) rank = { modelo: load.modelo.escolher, tabela: load.tabela ?? {} };
        } catch (_) { rank = null; }
        // O nível da reputação de cada protocolo, citado nas paradas como o 🧭 cita; o grau desempata a ordem (02/11).
        if (rank && nucleo?.niveisDaReputacao) {
            try { rank.niveis = (await nucleo.niveisDaReputacao(defs.map(entry => entry.id), today)) || {}; } catch (_) { /* sem o nível, a parada não cita */ }
        }
        if (rank && nucleo?.grausDaReputacao) {
            try { rank.graus = (await nucleo.grausDaReputacao(defs.map(entry => entry.id), today)) || {}; } catch (_) { /* sem o grau, a ordem dos pesos */ }
        }
        const exceptions = await this.readJson(this.plugin.app.vault.adapter, '200 - FUNCTIONS/Scripts/judges_exceptions.json');
        const coverage = exceptions?.audit_protocols?.router_coverage?.protocol_ids;
        const coverageExceptions: Record<string, string> = {};
        if (coverage && typeof coverage === 'object') {
            for (const [id, reason] of Object.entries(coverage)) if (typeof reason === 'string') coverageExceptions[id] = reason;
        }
        return {
            today,
            defs,
            failures: Array.isArray(manager.failures) ? manager.failures.map((f: any) => ({ path: String(f.path), error: String(f.error) })) : [],
            usage,
            daysRead: days.length,
            window: { desde, ate: today },
            rank,
            coverageExceptions,
            central: manager.tabelaDosPapeis?.().perguntar_a_situacao ?? null,
        };
    }

    private async collectOperator(protocols: MissionProtocol[]): Promise<MissionOperator> {
        const adapter = (this.plugin.app.vault.adapter as any);
        const signal = await this.readJson(adapter, '.dfm-dsh-context.json');
        const descriptor = await this.readJson(adapter, '.dfm-dsh-operator.json');
        const ageMs = signal?.ts ? Date.now() - Date.parse(String(signal.ts)) : null;

        let health: MissionOperator['health'] = null;
        if (descriptor && this.plugin.dshOperatorBridge) {
            try {
                const result: any = await this.plugin.dshOperatorBridge.dispatch('/v1/health', {});
                health = {
                    ok: true,
                    taskNotesVersion: result?.taskNotesVersion ?? null,
                    capabilities: Array.isArray(result?.capabilities) ? result.capabilities.map(String) : [],
                };
            } catch (error: any) {
                health = { ok: false, taskNotesVersion: null, capabilities: [], error: String(error?.message ?? error) };
            }
        }

        const auditRaw = await this.readText(adapter, '.dfm-dsh-operator-audit.jsonl');
        const audit = (auditRaw ?? '')
            .split('\n')
            .filter(line => line.trim())
            .slice(-AUDIT_TAIL)
            .map(line => {
                try {
                    const entry = JSON.parse(line);
                    return {
                        ts: String(entry.ts ?? ''),
                        action: String(entry.action ?? ''),
                        target: String(entry.target ?? ''),
                        ok: entry.ok !== false,
                        errorCode: entry.errorCode ? String(entry.errorCode) : undefined,
                    };
                } catch (_) {
                    return null;
                }
            })
            .filter(Boolean) as MissionOperator['audit'];

        const skillsModule = await import('./dshSkills').catch(() => null);
        const skills = (skillsModule?.DFM_DSH_SKILLS ?? []).map(skill => ({
            id: skill.id,
            label: skill.label,
            description: skill.description,
            primary: skill.primary === true,
        }));

        return {
            signal: signal && signal.path ? { path: String(signal.path), title: String(signal.title ?? ''), ts: String(signal.ts ?? '') } : null,
            signalAgeMinutes: Number.isFinite(ageMs as number) ? Math.round((ageMs as number) / 60000) : null,
            bridge: descriptor
                ? {
                    port: Number(descriptor.port) || 0,
                    vault: String(descriptor.vault ?? ''),
                    version: String(descriptor.dfmSystemVersion ?? ''),
                    startedAt: String(descriptor.startedAt ?? ''),
                }
                : null,
            health,
            audit: audit.reverse(),
            skills,
            allowlist: protocols.filter(protocol => protocol.dshEnabled).map(protocol => protocol.id)
                .concat([...protocolosDaPonte(this.plugin.manager?.tabelaDosPapeis?.())].filter(id => !protocols.some(protocol => protocol.id === id)).map(String)),
        };
    }

    private async collect(): Promise<MissionSnapshot> {
        const app = this.plugin.app;
        const now = moment();
        const today = now.format('YYYY-MM-DD');
        const paths = this.cycleContext(now);

        // O compromisso que o 🌙 deixou vem da última Day que o tiver, como na pauta:
        // depois de um dia sem Day, o de ontem não existe e a promessa continua viva.
        const left = this.leftCommitment(paths.day, today);

        // Os pesos do painel (a direção, a faixa Agora e o projeto mais perto) vêm da
        // tabela única, lida a cada atualização: ajustar o arquivo vale na próxima.
        // Precisa vir antes das tarefas, que já saem classificadas pela direção.
        const panelWeights = usePanelWeights(await this.readJson(app.vault.adapter, DECISION_WEIGHTS_PATH), DECISION_WEIGHTS_PATH);

        const tasks = await this.collectTasks(today);
        const currentWeek = weekKey(now);
        const currentQuarter = quarterKey(now);
        const board = buildTaskBoard(tasks, today, currentWeek);
        // O plano é derivado das MESMAS tarefas que o funil usa: duas leituras do
        // mesmo vault não podem discordar sobre quantas estão agendadas.
        const plan = buildWeekPlan(tasks, currentWeek, today);
        const habits = this.collectHabits(today);
        const matrix = buildPriorityMatrix(tasks);
        const timeline = buildTimeline(tasks, today);
        const radar = buildQuarterRadar(tasks, currentQuarter, today, this.weekNotes());
        const protocols = this.collectProtocols();
        const [dayCycle, weekCycle, quarterCycle, trees, canvases, operator, protocolCatalog] = await Promise.all([
            this.resolveCycle('day', paths.day, now, left),
            this.resolveCycle('week', paths.week, now),
            this.resolveCycle('quarter', paths.quarter, now),
            this.collectTrees(),
            this.collectCanvases(),
            this.collectOperator(protocols),
            this.collectProtocolCatalog(today).catch(error => {
                console.error('DFM Mission Control: o catálogo de protocolos não foi lido', error);
                return null;
            }),
        ]);

        // A Day escolhe o valor dela; sem escolha, o da semana entra rotulado como
        // contexto (mesma regra da pauta da Day), nunca como resposta do dia.
        if (!dayCycle.command.valor && weekCycle.value) dayCycle.command.valor = `${weekCycle.value} (da semana)`;

        // Os projetos em foco são a lista do trimestre (`focoDoTrimestre`: as centrais e o
        // `projetos_foco` dele), a mesma do 🌳, do painel e do canvas (proposta de 27/10, 4.3).
        // Trimestre sem lista: o `projetos_foco` da semana, como antes.
        const quarterFocus = focoDoTrimestre(this.frontmatterOf(paths.quarter));
        const weekFocus = quarterFocus.length
            ? quarterFocus
            : asStringArray(this.frontmatterOf(paths.week).projetos_foco).map(normalizeLink).filter(Boolean);

        const notes: string[] = [];
        if (panelWeights.problemas.length) {
            notes.push(`Tabela de pesos do painel: ${panelWeights.problemas.join(', ')} vale 0 até ser corrigido em ${DECISION_WEIGHTS_PATH}.`);
        }
        if (!this.plugin.progressionEngine) notes.push('Motor de progressão indisponível: as árvores não foram avaliadas.');
        if (!operator.bridge) notes.push('Ponte operacional do DSH offline: o Obsidian Desktop não está servindo o gateway 3082.');
        else if (operator.health && operator.health.ok === false) notes.push(`Ponte operacional respondeu com erro: ${operator.health.error}`);
        if (operator.signal && (operator.signalAgeMinutes ?? 0) > 15) notes.push('O sinal de contexto do DSH está obsoleto (> 15 min): nenhuma nota em foco.');
        if (tasks.length === 0) notes.push('Nenhuma tarefa em TaskNotes/Tasks — ausência de dado, não ausência de trabalho.');

        const projects = aggregateProjects(tasks, weekFocus);
        // As áreas são resolvidas uma vez só: a aba de áreas, o resumo do
        // portfólio e o casamento por área leem a mesma varredura.
        const areas = discoverAreas(app);
        // O cruzamento é por NOME de projeto (o que o TaskNotes grava e o que o
        // script de ativação procura): a pasta muda de coluna, o nome não.
        const { portfolio, declaredNext } = this.collectPortfolio(indexProjectTasks(projects), areas);
        if (portfolio.totals.projects === 0) {
            notes.push('Nenhum projeto lido em 100 - AREAS/*/100 - PROJECTS — ausência de dado, não ausência de trabalho.');
        }
        // A direção do esforço lê a mesma camada de projeto do quadro (D3): o
        // portfólio é quem sabe onde cada projeto está no ciclo de vida, e a
        // "próxima ação real" é atributo de projeto, não de tarefa solta.
        const intent = buildIntent({
            tasks,
            projects: portfolio.columns.flatMap(column => column.projects),
            today,
            weekFocus,
            declaredNext,
        });
        if (intent.classification.externo === 0 && tasks.length > 0) {
            notes.push('Nenhuma tarefa aberta classificada como externa: ou o vault não declara contexto, ou o esforço é todo interno — as duas leituras estão no painel.');
        }
        // O grafo é montado depois do plano: os sete dias vêm do plano já
        // resolvido, e não de uma segunda aritmética de semana que poderia
        // discordar dele sobre onde a semana começa.
        const graph = buildMissionGraph({
            week: currentWeek,
            quarter: currentQuarter,
            today,
            days: plan.days.map(day => ({
                date: day.date,
                label: day.label,
                weekday: day.weekday,
                isToday: day.isToday,
            })),
            weekFocus,
            projects,
            tasks,
            trees,
            canvases,
        });
        if (graph.looseTasks > 0) {
            notes.push(`${graph.looseTasks} tarefa(s) aberta(s) da semana sem projeto nem agendamento: elas não têm ligação no grafo.`);
        }

        return {
            generatedAt: new Date().toISOString(),
            today,
            week: weekCycle.name,
            quarter: quarterCycle.name,
            vaultName: app.vault.getName(),
            pluginVersion: this.plugin.manifest.version,
            board,
            plan,
            matrix,
            timeline,
            radar,
            graph,
            habits,
            cycles: { day: dayCycle, week: weekCycle, quarter: quarterCycle },
            projects,
            portfolio,
            intent,
            areas,
            trees,
            canvases,
            protocols,
            protocolCatalog,
            operator,
            notes,
        };
    }
}
