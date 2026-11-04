/**
 * O calendário da semana e do trimestre: as datas de uma semana ISO, a semana de um dia, o
 * trimestre de uma semana (o da quinta-feira dela), as semanas de um trimestre, os rótulos curtos
 * e a semana em foco.
 *
 * Por quê: estas contas moravam nos modelos dos canvas da semana e do trimestre
 * (`temporal/weekBlockModel.ts`, `temporal/quarterCanvasModel.ts`), que se aposentaram em
 * 02/11/2026 (aposentadoria, fase 2; Arquitetura §6, item 1). A Missão, o painel, o canvas de
 * projeto, as setas e o motor seguem lendo-as; por isso mudaram de casa sem mudar o que fazem.
 * A segunda-feira da semana vem de um dono só (`engine/periodo.ts`, `segundaDaSemana`; item 10).
 *
 * Módulo puro: sem Obsidian, sem cofre, sem relógio (quem chama dá o dia de hoje).
 * Prova: tests/engine/calendario.test.ts.
 */
import type { GrammarPeriod } from './showGrammar';
import { diaMais, ehSemana, partesDoTrimestre, segundaDaSemana } from './periodo';

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * O que faz: as 7 datas de uma semana ISO, de segunda a domingo (`2026-W42` → `2026-10-12` … `2026-10-18`).
 * Erro e ataque: semana fora da forma → `[]`.
 */
export function weekDates(week: string): string[] {
    const monday = segundaDaSemana(week);
    if (!monday) return [];
    // Um `Date` só para os sete dias: a Missão chama esta conta em cada nó, e reler o texto a cada dia pesava.
    const start = new Date(`${monday}T00:00:00Z`);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
    });
}

function dayMonth(date: string): { d: number; m: string } {
    const [, m, d] = date.split('-').map(Number);
    return { d, m: MONTHS[m - 1] ?? '' };
}

/** O que faz: o período de uma lista de semanas (as semanas e as 7 datas de cada uma), para a forma de mostrar. */
export function periodOfWeeks(weeks: readonly string[]): GrammarPeriod {
    const list = [...weeks];
    return { weeks: list, dates: list.flatMap(weekDates) };
}

/** O que faz: o período da semana: o horizonte `week` (e o `scheduled` nos 7 dias dela). */
export function weekPeriod(week: string): GrammarPeriod {
    return periodOfWeeks([week]);
}

/** O que faz: o período do dia: o horizonte `scheduled` daquela data. */
export function dayPeriod(date: string): GrammarPeriod {
    return { weeks: [], dates: [date] };
}

/** O que faz: o rótulo curto de um dia (`2026-10-14`, uma quarta → `qua 14`). */
export function dayLabel(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}`;
}

/** O que faz: a semana sem o ano (`2026-W42` → `W42`). */
export function shortWeek(week: string): string {
    return String(week).replace(/^\d{4}-/, '');
}

/**
 * O que faz: a semana ISO de um dia (`2026-09-25` → `2026-W39`): a semana é da quinta-feira dela (ISO 8601).
 * Erro e ataque: o dia tem de vir `AAAA-MM-DD`; quem chama confere.
 */
export function isoWeekOf(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // seg = 0
    d.setUTCDate(d.getUTCDate() - dow + 3); // quinta da semana
    const year = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** O que faz: o trimestre do calendário de um dia (`2026-10-02` → `2026-Q4`). */
export function quarterOf(date: string): string {
    const [y, m] = date.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
}

/**
 * O que faz: o trimestre de uma semana ISO: o da quinta-feira dela (D6). A W40/2026 é do Q4, e a W13/2027
 * (segunda 29/03, quinta 01/04) é do Q2.
 * Erro e ataque: semana inválida → `null`.
 */
export function quarterOfWeek(week: string): string | null {
    const monday = segundaDaSemana(week);
    const thursday = monday ? diaMais(monday, 3) : null;
    return thursday ? quarterOf(thursday) : null;
}

/**
 * O que faz: o trimestre de hoje: o da semana de hoje (D6), não o do calendário. Na virada
 * (29–31/03/2027, W13), o calendário diz Q1, mas a semana é do Q2.
 * Erro e ataque: data inválida → o do calendário.
 */
export function currentQuarter(today: string): string {
    return quarterOfWeek(isoWeekOf(today)) ?? quarterOf(today);
}

/** O que faz: as semanas ISO cuja quinta-feira cai dentro do trimestre: 13 (às vezes 14). Trimestre inválido → `[]`. */
export function quarterWeeks(quarter: string): string[] {
    const p = partesDoTrimestre(quarter);
    if (!p) return [];
    const start = new Date(Date.UTC(p.ano, (p.trimestre - 1) * 3, 1));
    const end = new Date(Date.UTC(p.ano, p.trimestre * 3, 1));
    // Primeira quinta-feira do trimestre.
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7));
    const weeks: string[] = [];
    for (; d < end; d.setUTCDate(d.getUTCDate() + 7)) weeks.push(isoWeekOf(d.toISOString().slice(0, 10)));
    return weeks;
}

/** O que faz: o período do trimestre: as semanas dele e as datas delas. */
export function quarterPeriod(quarter: string): GrammarPeriod {
    return periodOfWeeks(quarterWeeks(quarter));
}

/** Uma nota de semana (`type: weekly_note`), como o leitor das notas de período a encontra. */
export interface WeekNote { week: string; path: string; status: string; quarter?: string }

/** A semana em foco de um trimestre, com o rótulo que diz qual caso é. */
export interface FocusWeek { week: string; path: string | null; label: string }

/**
 * O que faz: a semana em foco: a atual, se já tem nota; senão a última semana do trimestre que ainda está
 * aberta; senão a atual mesmo sem nota. O rótulo diz qual caso é: a tela não finge que a semana atual foi
 * planejada.
 */
export function chooseFocusWeek(quarter: string, today: string, notes: WeekNote[]): FocusWeek {
    const current = isoWeekOf(today);
    const weeks = new Set(quarterWeeks(quarter));
    const byWeek = new Map(notes.filter(n => weeks.has(n.week)).map(n => [n.week, n]));
    const currentNote = byWeek.get(current);
    if (currentNote) return { week: current, path: currentNote.path, label: `Semana ${current}` };
    const open = [...byWeek.values()].filter(n => n.status !== 'closed' && n.week <= current).sort((a, b) => b.week.localeCompare(a.week))[0];
    if (open) return { week: open.week, path: open.path, label: `Semana ${open.week} — ainda aberta; a ${current} não foi planejada` };
    return { week: current, path: null, label: `Semana ${current} — nota da semana não criada` };
}

/**
 * O que faz: a semana que o 🌳 acabou de planejar: a `week` da nota criada; se o cache ainda não a leu, a
 * semana-alvo da rodada (`_target_week`, a do `{{targetweek}}`). O protocolo não tem passo `week` nem
 * `quarter`; o trimestre sai da semana.
 * Erro e ataque: nenhuma das duas é semana → `''`.
 */
export function plannedWeekOf(fm: Record<string, unknown> = {}, variables: Record<string, unknown> | null | undefined = {}): string {
    const fromNote = String(fm?.week ?? '').trim();
    if (ehSemana(fromNote)) return fromNote;
    const target = String(variables?._target_week ?? '').trim();
    return ehSemana(target) ? target : '';
}
