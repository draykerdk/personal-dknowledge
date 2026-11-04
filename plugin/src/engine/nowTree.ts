/**
 * A árvore do agora (arquitetura universal 4.2, aprovada em 19/10): onde estou e quanto
 * tempo tenho → as tarefas que cabem → ordenadas pela tabela de pesos, cada uma com a
 * linha do porquê → a escolha é dele.
 *
 * É o mesmo passo `suggest_note` que o ▶️ usa, com três acréscimos: as duas perguntas
 * antes (com o provável já marcado), o filtro por lugar e tempo e a ordem pelos pesos.
 * O filtro "cabe hoje" é o mesmo do "🧭 Aqui e agora" da pauta (`day_context.js`), para
 * a vista rápida e o gesto mostrarem a mesma coisa. Este módulo só calcula.
 */
import { TASK_CONTEXTS } from './taskContexts';
import {
    formatPoints,
    isClosedUnit,
    scoreTask,
    type DecisionContext,
    type TaskRelations,
    type TaskUnit,
    type WeightReason,
    type WeightTable,
} from './decisionWeights';
import type { BlockOutcome, BlockRecord } from './blockLog';
import { leftCommitmentMark } from './commitmentLeft';
import { habitActionTitle, habitNowWeight, type Habit } from './habits';
import { DIA } from './dia';

export const NOW_PLACE_PROMPT = '🧭 Onde estou agora?';
export const NOW_PLACE_INFO = 'O último lugar usado vem primeiro. Fica só o que dá para fazer aqui; a tarefa sem lugar também entra, marcada.';
export const NOW_TIME_PROMPT = '⏳ Quanto tempo tenho?';
export const NOW_TIME_INFO = 'Fica só o que cabe neste tempo; a tarefa sem estimativa também entra, marcada.';
export const NOW_NEW_TASK_LABEL = '✨ Trabalhar numa tarefa nova';

export interface NowTimeOption {
    label: string;
    /** O tamanho do bloco registrado. */
    minutes: number;
    /** O teto do filtro (`null` = sem teto: "2 h ou mais"). */
    cap: number | null;
}

/** As opções de tempo da arquitetura: 15 min, 30 min, 1 h, 2 h ou mais. */
export const NOW_TIME_OPTIONS: ReadonlyArray<NowTimeOption> = [
    { label: '⏱️ 15 min', minutes: 15, cap: 15 },
    { label: '⏱️ 30 min', minutes: 30, cap: 30 },
    { label: '⏱️ 1 h', minutes: 60, cap: 60 },
    { label: '⏱️ 2 h ou mais', minutes: 120, cap: null },
];

/** O que faz: os 6 lugares, com o último usado primeiro (o provável já marcado). */
export function placeOptions(last?: string | null): string[] {
    const all = [...TASK_CONTEXTS] as string[];
    return last && all.includes(last) ? [last, ...all.filter(place => place !== last)] : all;
}

/** O que faz: as opções de tempo, com o último tamanho usado primeiro. */
export function timeOptions(lastMinutes?: number | null): string[] {
    const labels = NOW_TIME_OPTIONS.map(option => option.label);
    const last = NOW_TIME_OPTIONS.find(option => option.minutes === lastMinutes);
    return last ? [last.label, ...labels.filter(label => label !== last.label)] : labels;
}

/** O que faz: a opção de tempo de um rótulo; rótulo fora da lista → `null`. */
export function timeChoiceOf(label: unknown): NowTimeOption | null {
    return NOW_TIME_OPTIONS.find(option => option.label === label) ?? null;
}

/** Fora do agora: algum dia, talvez, esperando (a inbox vai para "📥 a triar"). */
const NOT_NOW = new Set(['someday', 'maybe', 'waiting-on']);

/** O que faz: `AAAA-MM-DD` de `20260801` ou `20260801T000000Z`; senão `''`. */
function ruleDay(value: string | undefined): string {
    // Forma própria (não é a `DIA`): o dia sem hífen (`AAAAMMDD`) do começo do valor.
    const m = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function utcOf(day: string): Date {
    return new Date(`${day}T12:00:00Z`);
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * O que faz: a regra de recorrência (RRULE do TaskNotes, ex.
 * `DTSTART:20260801;FREQ=MONTHLY;BYMONTHDAY=1`) cai neste dia? `true`/`false`, ou
 * `null` quando a regra pede o que esta leitura curta não lê (COUNT, BYSETPOS, BYDAY com
 * ordinal, INTERVAL sem DTSTART): quem chama usa o `scheduled` da tarefa.
 * Lê: DTSTART, UNTIL, FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, BYDAY, BYMONTHDAY, BYMONTH.
 * Prova: tests/engine/nowTreeHabits.test.ts ("recorrente").
 */
export function recurrenceOccursOn(rule: string, day: string): boolean | null {
    if (!DIA.test(String(day ?? ''))) return null;
    const parts = new Map<string, string>();
    for (const piece of String(rule ?? '').replace(/^RRULE:/i, '').split(/[;\n]/)) {
        const m = piece.trim().match(/^([A-Za-z]+)[:=](.*)$/);
        if (m) parts.set(m[1].toUpperCase(), m[2].trim().replace(/^RRULE:/i, ''));
    }
    // "DTSTART:…" pode vir colado ao FREQ numa linha só ("DTSTART:20260801;FREQ=…").
    const freq = (parts.get('FREQ') || '').toUpperCase();
    if (!freq || parts.has('COUNT') || parts.has('BYSETPOS')) return null;
    const start = ruleDay(parts.get('DTSTART'));
    const until = ruleDay(parts.get('UNTIL'));
    if (start && day < start) return false;
    if (until && day > until) return false;
    const interval = Math.max(1, Number.parseInt(parts.get('INTERVAL') || '1', 10) || 1);
    if (interval > 1 && !start) return null;
    const date = utcOf(day);
    const startDate = start ? utcOf(start) : null;
    const days = startDate ? Math.round((date.getTime() - startDate.getTime()) / 86400000) : 0;
    const byDay = (parts.get('BYDAY') || '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
    if (byDay.some(code => !WEEKDAY_CODES.includes(code))) return null;
    const byMonthDay = (parts.get('BYMONTHDAY') || '').split(',').map(n => Number.parseInt(n, 10)).filter(n => Number.isFinite(n) && n !== 0);
    const byMonth = (parts.get('BYMONTH') || '').split(',').map(n => Number.parseInt(n, 10)).filter(Number.isFinite);
    const weekday = WEEKDAY_CODES[date.getUTCDay()];
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const monthDayOk = (list: number[]) => list.some(n => (n > 0 ? n : lastDay + 1 + n) === date.getUTCDate());
    if (byMonth.length && !byMonth.includes(date.getUTCMonth() + 1)) return false;
    switch (freq) {
        case 'DAILY':
            if (byDay.length && !byDay.includes(weekday)) return false;
            return days % interval === 0;
        case 'WEEKLY': {
            const codes = byDay.length ? byDay : (startDate ? [WEEKDAY_CODES[startDate.getUTCDay()]] : []);
            if (!codes.length) return null;
            if (!codes.includes(weekday)) return false;
            if (interval === 1) return true;
            const mondayOf = (d: Date) => Math.floor((d.getTime() / 86400000 + 3) / 7);
            return (mondayOf(date) - mondayOf(startDate!)) % interval === 0;
        }
        case 'MONTHLY': {
            if (byDay.length) return null;
            const months = startDate ? (date.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + date.getUTCMonth() - startDate.getUTCMonth() : 0;
            if (months % interval !== 0) return false;
            if (byMonthDay.length) return monthDayOk(byMonthDay);
            return startDate ? startDate.getUTCDate() === date.getUTCDate() : null;
        }
        case 'YEARLY': {
            if (byDay.length) return null;
            if (startDate && (date.getUTCFullYear() - startDate.getUTCFullYear()) % interval !== 0) return false;
            if (byMonthDay.length) return (byMonth.length > 0 || Boolean(startDate)) && monthDayOk(byMonthDay)
                && (byMonth.length > 0 || startDate!.getUTCMonth() === date.getUTCMonth());
            return startDate ? startDate.getUTCMonth() === date.getUTCMonth() && startDate.getUTCDate() === date.getUTCDate() : null;
        }
        default:
            return null;
    }
}

/**
 * O que faz: a recorrente tem uma instância hoje ainda aberta? Hoje = o `scheduled` dela
 * é hoje, ou a regra cai em hoje; aberta = hoje não está em `complete_instances` nem em
 * `skipped_instances`.
 * Por quê: "a instância de hoje de uma TaskNote recorrente, ainda não concluída, volta a
 * ser candidata no gesto" (plano de 22/10, seção 4).
 */
export function recurringInstanceToday(unit: Pick<TaskUnit, 'scheduled' | 'recurrence' | 'completeInstances' | 'skippedInstances'>, hoje: string): boolean {
    if (!hoje) return false;
    if ((unit.completeInstances || []).includes(hoje) || (unit.skippedInstances || []).includes(hoje)) return false;
    if (unit.scheduled === hoje) return true;
    return recurrenceOccursOn(unit.recurrence || '', hoje) === true;
}

/**
 * O que faz: a tarefa cabe hoje? A mesma regra do "🧭 Aqui e agora" da pauta: aberta,
 * fora de algum dia/esperando, não é SMART (a entrega; as ações dela entram), sem
 * `scheduled` nem `week` no futuro e sem bloqueio de tarefa aberta. A recorrente entra
 * só com a instância de hoje ainda aberta (`recurringInstanceToday`); o `scheduled` dela
 * já é o da instância.
 */
export function fitsToday(unit: TaskUnit, ctx: Pick<DecisionContext, 'hoje' | 'semana'>, relations: TaskRelations): boolean {
    if (!unit || isClosedUnit(unit)) return false;
    if (unit.type === 'tarefa_smart') return false;
    if (NOT_NOW.has(unit.status)) return false;
    if (unit.recurring) {
        if (!recurringInstanceToday(unit, ctx.hoje)) return false;
    } else {
        if (ctx.hoje && unit.scheduled && unit.scheduled > ctx.hoje) return false;
        if (ctx.semana && unit.week && unit.week > ctx.semana) return false;
    }
    if (unit.blockedBy.some(name => relations.open.get(name) === true)) return false;
    return true;
}

export interface NowItem {
    path: string;
    name: string;
    pontos: number;
    motivos: WeightReason[];
    /** "sem lugar", "sem estimativa", "🌙 deixada ontem" (ou "🌙 deixada em DD/MM"). */
    marcas: string[];
    /** As 3 primeiras sugestões aparecem em destaque. */
    destaque: boolean;
    grupo: 'sugestao' | 'a_triar';
    /** `habito`: o hábito em treino como candidato (2.29); sem o campo, tarefa. */
    tipo?: 'tarefa' | 'habito';
    /** A ação mínima do hábito, em minutos (a pauta mostra a duração). */
    minutos?: number | null;
}

export interface NowRanking {
    sugestoes: NowItem[];
    /** As da inbox que cabem: à parte, para triar. */
    aTriar: NowItem[];
}

export interface NowFilter {
    /** Onde estou; vazio = qualquer lugar. */
    lugar?: string;
    /** Teto do tempo, em minutos; `null` = sem teto. */
    tempoCap?: number | null;
    /** Nomes que abrem a lista (o compromisso que o 🌙 deixou na última Day que o tem). */
    pinned?: string[];
    /** Quando ele foi deixado ("ontem" ou `DD/MM`, como a pauta diz); sem ele, "ontem". */
    pinnedWhen?: string;
    /** Os hábitos lidos do tracker: os de ação em treino entram como candidatos (2.29). */
    habitos?: Habit[];
}

/** O motivo do hábito na linha do porquê ("🔁 hábito em treino +2"). */
export const HABIT_REASON = '🔁 hábito em treino';
/** O começo do título do hábito na lista ("🔁 Sentar para meditar"). */
export const HABIT_TITLE_PREFIX = '🔁 ';

/**
 * O que faz: os hábitos de ação que cabem agora, como linhas da árvore: filtrados pelo
 * lugar (`contexts`; sem contexto, entra marcado) e pelo tempo (`minutos` até o teto),
 * com o título "🔁 <ação mínima>" e o peso `habito` da tabela (`hoje` ou `meta_semana`).
 * Por quê: "os habitos talvez entrem na logica ali de escolha na hora dependendo no
 * contexto" (2.29, 22/10). A escolha continua dele: o peso só ordena.
 * Prova: tests/engine/nowTreeHabits.test.ts.
 */
export function habitNowItems(habits: Habit[], hoje: string, table: WeightTable, filter: Pick<NowFilter, 'lugar' | 'tempoCap'> = {}): Array<NowItem & { minutes: number | null }> {
    const lugar = filter.lugar ?? '';
    const cap = filter.tempoCap ?? null;
    const out: Array<NowItem & { minutes: number | null }> = [];
    for (const habit of habits || []) {
        const peso = habitNowWeight(habit, hoje);
        if (!peso) continue;
        const contexts = habit.contexts || [];
        if (lugar && contexts.length > 0 && !contexts.includes(lugar)) continue;
        const minutes = habit.minutos ?? null;
        if (cap !== null && minutes !== null && minutes > cap) continue;
        const pontos = table.habito?.[peso] ?? 0;
        const motivos: WeightReason[] = Number.isFinite(pontos) && pontos !== 0 ? [{ chave: 'habito', pontos, texto: HABIT_REASON }] : [];
        out.push({
            path: habit.path,
            name: `${HABIT_TITLE_PREFIX}${habitActionTitle(habit)}`,
            pontos: motivos.length ? pontos : 0,
            motivos,
            // Sem peso na tabela, a linha ainda diz por que está ali.
            marcas: [...(motivos.length ? [] : [HABIT_REASON]), ...(contexts.length === 0 ? ['sem lugar'] : [])],
            destaque: false,
            grupo: 'sugestao',
            tipo: 'habito',
            minutos: minutes,
            minutes,
        });
    }
    return out;
}

/**
 * O que faz: filtra pelo lugar e pelo tempo, pontua pela tabela e ordena.
 * Por quê: a lista serve para ver a que se encaixa melhor para fazer agora (18/10/2026);
 * a tarefa sem contexto e a sem estimativa também entram, marcadas (4.2).
 * Entra → sai: unidades, contexto, tabela, vínculos e filtro → { sugestoes, aTriar }.
 * Ordem: a deixada pelo 🌙 primeiro; depois mais pontos, a mais curta (sem estimativa por
 * último) e o nome. As 3 primeiras sugestões em destaque.
 * Prova: tests/engine/nowTree.test.ts.
 */
export function rankForNow(units: TaskUnit[], ctx: DecisionContext, table: WeightTable, relations: TaskRelations, filter: NowFilter = {}): NowRanking {
    const pinned = filter.pinned ?? [];
    const lugar = filter.lugar ?? '';
    const cap = filter.tempoCap ?? null;
    const items: Array<NowItem & { minutes: number | null; pin: number }> = [];
    for (const unit of units || []) {
        if (!fitsToday(unit, ctx, relations)) continue;
        if (lugar && unit.contexts.length > 0 && !unit.contexts.includes(lugar)) continue;
        if (cap !== null && unit.minutes !== null && unit.minutes > cap) continue;
        const score = scoreTask(unit, ctx, table, relations);
        const marcas: string[] = [];
        const pin = pinned.indexOf(unit.name);
        if (pin >= 0) marcas.push(leftCommitmentMark(filter.pinnedWhen));
        if (unit.contexts.length === 0) marcas.push('sem lugar');
        if (unit.minutes === null) marcas.push('sem estimativa');
        items.push({
            path: unit.path,
            name: unit.name,
            pontos: score.pontos,
            motivos: score.motivos,
            marcas,
            destaque: false,
            grupo: unit.status === 'inbox' ? 'a_triar' : 'sugestao',
            tipo: 'tarefa',
            minutes: unit.minutes,
            pin: pin >= 0 ? pin : Number.POSITIVE_INFINITY,
        });
    }
    // Os hábitos de ação em treino, ao lado das tarefas, pelo mesmo filtro e pelo peso `habito`.
    for (const item of habitNowItems(filter.habitos ?? [], ctx.hoje, table, { lugar, tempoCap: cap })) {
        items.push({ ...item, pin: Number.POSITIVE_INFINITY });
    }
    const order = (a: typeof items[number], b: typeof items[number]) => (a.pin - b.pin || 0)
        || b.pontos - a.pontos
        || (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY)
        || a.name.localeCompare(b.name, 'pt-BR');
    const strip = ({ minutes: _minutes, pin: _pin, ...item }: typeof items[number]): NowItem => item;
    const sugestoes = items.filter(item => item.grupo === 'sugestao').sort(order).map(strip)
        .map((item, index) => ({ ...item, destaque: index < 3 }));
    const aTriar = items.filter(item => item.grupo === 'a_triar').sort(order).map(strip);
    return { sugestoes, aTriar };
}

/**
 * O que faz: a linha do porquê de uma sugestão: os pesos que contaram (do maior para o
 * menor) e as marcas. Ex.: "⏰ vence hoje +3 · ▶️ em andamento +2 · sem estimativa".
 */
export function nowReasonLine(item: Pick<NowItem, 'motivos' | 'marcas'>, maxReasons = 3): string {
    const reasons = (item.motivos || []).slice(0, Math.max(0, maxReasons))
        .map(motivo => `${motivo.texto} ${motivo.pontos > 0 ? '+' : ''}${formatPoints(motivo.pontos)}`);
    return [...(item.marcas || []), ...reasons].join(' · ');
}

/** O que faz: o texto de uma linha da lista (título e nota pequena), testável sem DOM. */
export function nowSuggestionText(item: NowItem): { title: string; note: string } {
    const prefix = item.grupo === 'a_triar' ? '📥 a triar · ' : item.destaque ? '⭐ ' : '';
    const reason = nowReasonLine(item);
    return { title: `${prefix}${item.name}`, note: reason || 'sem peso do plano' };
}

/**
 * O que faz: se o bloco saiu: a tarefa concluída; senão, um 📤 dela (o par que a tem em
 * `blockedBy`) concluído desde o dia do bloco; senão, nada.
 * O bloco de um hábito (`habito: true`, aberto pelo ⚡ Agora num 🔁) saiu quando fechou
 * sem o pomodoro interrompido (`interrompido`): o pomodoro completo, o próximo gesto ou o
 * 🌙. É o "fazer já marca" (2.29): quem escolheu o hábito agora e deixou o bloco correr
 * fez a ação mínima; a marca pode ser tirada no tracker como qualquer outra.
 * Por quê: "se saiu (feito, ou o 📤 registrado)" (4.6).
 */
export function blockOutcomeOf(record: Pick<BlockRecord, 'caminho' | 'tarefa' | 'data' | 'habito'>, units: TaskUnit[], options: { interrompido?: boolean } = {}): BlockOutcome {
    if (record?.habito) return options.interrompido ? 'nada' : 'concluída';
    const list = units || [];
    const task = list.find(unit => unit.path === record.caminho) ?? list.find(unit => unit.name === record.tarefa);
    if (task && (task.status === 'done' || task.status === 'completed')) return 'concluída';
    const released = list.some(unit => unit.peca === 'soltar'
        && (unit.status === 'done' || unit.status === 'completed')
        && unit.blockedBy.includes(record.tarefa)
        && (!unit.completed || !record.data || unit.completed >= record.data));
    return released ? '📤' : 'nada';
}

/**
 * O que faz: das unidades, as SMART abertas de `semana`, a da vez (em andamento) primeiro
 * e depois por nome. Função pura (testável sem Obsidian).
 */
export function smartsDaSemanaDe(units: TaskUnit[], semana: string): string[] {
    const abertas = units.filter(unit => unit.type === 'tarefa_smart' && unit.week === semana && !unit.archived
        && !['done', 'cancelled'].includes(unit.status));
    return abertas
        .sort((a, b) => Number(b.status === 'in-progress') - Number(a.status === 'in-progress') || a.name.localeCompare(b.name, 'pt-BR'))
        .map(unit => unit.name);
}
