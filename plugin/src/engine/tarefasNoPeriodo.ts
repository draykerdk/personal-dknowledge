/**
 * As tarefas num período: a forma de mostrar da semana, do dia e do trimestre, a carga de cada dia contra o
 * Bloco Sagrado (lido do texto livre `bloco_sagrado` da nota da semana) e as peças 📤 que foram ao ar.
 *
 * Por quê: estas contas moravam no modelo do canvas da semana (`temporal/weekBlockModel.ts`) e no do
 * trimestre (`temporal/quarterCanvasModel.ts`), que se aposentaram em 02/11/2026 (aposentadoria, fase 2;
 * Arquitetura §6, item 1). A Missão (a linha e a carga do dia, da semana e do trimestre), as setas do canvas de
 * projeto e o motor seguem lendo-as; por isso mudaram de casa sem mudar o que fazem.
 *
 * Módulo puro: sem Obsidian, sem cofre, sem relógio.
 * Prova: tests/engine/tarefasNoPeriodo.test.ts.
 */
import type { TaskInfo } from '../project/projectCanvasModel';
import { showGrammar, timeHorizon } from './showGrammar';
import { dayLabel, dayPeriod, quarterPeriod, weekDates, weekPeriod } from './calendario';

/**
 * Tarefa com a data agendada (`YYYY-MM-DD` ou vazio), como o `TaskRecord` já traz; `tags` (sem `#`,
 * minúsculas) e `title` também vêm dele.
 */
export interface BlockTask extends TaskInfo {
    scheduled?: string;
    tags?: string[];
    title?: string;
    /** Minutos de `timeEstimate`; sem estimativa é `null` ou ausente, nunca zero. */
    timeEstimate?: number | null;
    /** `ignicao` (🔥) ou `soltar` (📤); outra tarefa: vazio. */
    peca?: string;
}

const DONE = new Set(['done', 'completed', 'complete']);
const status = (t: TaskInfo) => String(t.status ?? '').toLowerCase();
const isSmart = (t: TaskInfo) => t.type === 'tarefa_smart';

/** O que faz: diz se a tarefa conta no período: tudo menos cancelada e "algum dia". */
export const inGrid = (t: TaskInfo): boolean => status(t) !== 'cancelled' && status(t) !== 'someday';

/** O que faz: diz se a tarefa está concluída, pela mesma regra de `inGrid`. */
export const isDone = (t: TaskInfo): boolean => DONE.has(status(t));

/* --------------------------------------------------------- forma de mostrar */

/**
 * O que faz: a forma de mostrar de uma semana (horizonte de tempo), pela função única. `empty` é o texto de
 * ausência ("sem planejamento").
 */
export function weekGrammar(week: string, tasks: readonly BlockTask[], empty = 'sem planejamento') {
    return showGrammar(tasks, timeHorizon(weekPeriod(week)), empty);
}

/** O que faz: a forma de mostrar de um dia (`scheduled` daquela data); sem nada, `shown: false`. */
export function dayGrammar(date: string, tasks: readonly BlockTask[], empty = '') {
    return showGrammar(tasks, timeHorizon(dayPeriod(date)), empty);
}

/** O que faz: a forma de mostrar do trimestre (as semanas dele, horizonte de tempo); sem nada, `shown: false`. */
export function quarterGrammar(quarter: string, tasks: readonly BlockTask[]) {
    return showGrammar(tasks, timeHorizon(quarterPeriod(quarter)), '');
}

/* ------------------------------------------------------------------ carga */

const MAX_DAY_MINUTES = 24 * 60;

/** `8h`, `8h30`, `08:00` → minutos do dia; inválido → `null`. */
function clockMinutes(h: string, m: string | undefined): number | null {
    const hours = Number(h);
    const minutes = m ? Number(m) : 0;
    if (!Number.isInteger(hours) || hours > 24 || minutes > 59) return null;
    return hours * 60 + minutes;
}

/**
 * O que faz: a duração do Bloco Sagrado em minutos, lida do texto livre `bloco_sagrado`
 * da nota da semana. O texto é dele; a leitura é tolerante e não inventa:
 *
 * 1. **Intervalos:** `8h–10h30`, `08:00-10:30`, `8h às 10h`, `das 7h até as 9h`,
 *    `das 7 às 9` → fim − início (passando da meia-noite, soma 24 h). Mais de um
 *    (`8h a 10h e 14h a 15h`) → a soma.
 * 2. **Minutos:** `150 min`, `90min` (o `30min` de `1h30min` não conta aqui).
 * 3. **Por extenso:** `uma hora e meia`, `duas horas`, `meia hora`.
 * 4. **Horas:** `2h`, `2h30`, `2,5 h`, `1h30min`. A marca precedida de "às",
 *    "das", "a partir das", "começando (às)" ou "desde" é o início, em qualquer
 *    ordem (`1h30 a partir das 7h` → 90). Sem essas palavras e com mais de uma
 *    (`7h30 · 2h`), a primeira é o início e a última, a duração.
 *
 * Erro e ataque: sem nenhum desses, ou com resultado fora de 1 min–24 h → `null`: a carga
 * aparece sozinha, sem comparação. Uma hora solta (`7h30`, sem fim nem
 * duração) é lida como duração; só o início (`às 7h`) não tem duração. Para
 * início e duração, escreva os dois (`7h30 · 90 min`) ou o intervalo (`7h30–9h`).
 * Número solto (`90`, `8-10`) não é lido.
 */
export function parseBlockMinutes(raw: unknown): number | null {
    const text = String(Array.isArray(raw) ? raw.join(' ') : raw ?? '').toLowerCase();
    if (!text.trim()) return null;
    const ok = (n: number | null) => (n !== null && Number.isFinite(n) && n > 0 && n <= MAX_DAY_MINUTES ? Math.round(n) : null);

    // "das 7h até as 9h" e "das 7 às 9": o separador por extenso também vale, e com ele
    // a hora sem "h" é hora (com hífen, "8-10" segue ambíguo). Dois blocos no dia somam.
    const RANGE = /(\d{1,2})(?:(?::|h)(\d{2})?)?\s*(-|–|—|até\s+[àa]s|até|às|as|a)\s*(\d{1,2})(?:(?::|h)(\d{2})?)?(?!\d)(?!\s*min)/g;
    let ranged = 0;
    for (const range of text.matchAll(RANGE)) {
        if (!(/[h:]/.test(range[0]) || /^(até|às|as)/.test(range[3]))) continue;
        const start = clockMinutes(range[1], range[2]);
        const end = clockMinutes(range[4], range[5]);
        if (start === null || end === null || end === start) continue;
        // Virada da meia-noite ("23h-1h") é faixa; "7h – 2h" daria 19 h: é início e
        // duração, e segue para as marcas de hora abaixo.
        const span = end > start ? end - start : end + MAX_DAY_MINUTES - start;
        if (end < start && span > MAX_DAY_MINUTES / 2) continue;
        ranged += span;
    }
    if (ranged > 0) return ok(ranged);

    // Horas e minutos separados: "1h 30min", "1h e 30min", "2 horas e 30 minutos".
    // Sem isto, o "30min" valia sozinho e o bloco virava meia hora.
    const hoursAndMinutes = text.match(/(?<![\d:])(\d+)\s*h(?:oras?)?\s*(?:e\s+)?(\d{1,2})\s*min/);
    if (hoursAndMinutes) return ok(Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]));
    // "1 hora e meia", "2h e meia": a meia hora depois de hora em número.
    const hoursAndHalf = text.match(/(?<![\d:])(\d+)\s*h(?:oras?)?\s+e\s+meia/);
    if (hoursAndHalf) return ok(Number(hoursAndHalf[1]) * 60 + 30);

    const minutes = text.match(/(?<![h\d])(\d+)\s*min/);
    if (minutes) return ok(Number(minutes[1]));

    const words: Record<string, number> = { uma: 1, duas: 2, 'três': 3, tres: 3, quatro: 4 };
    const spelled = text.match(/(uma|duas|tr[êe]s|quatro)\s+horas?(\s+e\s+meia)?/);
    if (spelled) return ok(words[spelled[1]] * 60 + (spelled[2] ? 30 : 0));
    if (/meia\s+hora/.test(text)) return ok(30);

    // Marcas de hora. A precedida de "às/das/a partir das/começando/desde" é o início;
    // sem essas palavras, a primeira é o início (como no exemplo do passo) e a última,
    // a duração. "1h30 a partir das 7h" dava 7 h de bloco.
    const marks = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2})(?!\d))?/g)];
    const isStart = (index: number) => /(?:^|[\s(,·;])(?:[àa]s|das|desde(?:\s+[àa]s)?|a\s+partir\s+d[ae]s?|come[çc]a(?:ndo)?(?:\s+[àa]s)?)\s*$/.test(text.slice(0, index));
    const durations = marks.filter(m => !isStart(m.index ?? 0));
    const hours = durations[durations.length - 1];
    if (hours) return ok(Number(hours[1].replace(',', '.')) * 60 + (hours[2] ? Number(hours[2]) : 0));
    return null;
}

/** O que faz: minutos em palavras curtas (`25` → `25 min`; `150` → `2,5 h`; `120` → `2 h`). */
export function hoursText(minutes: number): string {
    if (minutes > 0 && minutes < 60) return `${minutes} min`;
    const h = Math.round((minutes / 60) * 10) / 10;
    return `${String(h).replace('.', ',')} h`;
}

/** A carga de um dia: os minutos estimados, as ações e as sem estimativa. */
export interface DayLoad { date: string; minutes: number; actions: number; noEstimate: number }

const estimateOf = (t: BlockTask): number | null => {
    const n = Number(t.timeEstimate);
    return t.timeEstimate !== null && t.timeEstimate !== undefined && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * O que faz: a carga de um dia: as ações (SMART não) com `scheduled` nele, abertas e concluídas; canceladas e
 * "algum dia" não entram. Sem estimativa conta em `noEstimate`, nunca como zero escondido.
 */
export function dayLoad(date: string, tasks: readonly BlockTask[]): DayLoad {
    const list = tasks.filter(t => !isSmart(t) && inGrid(t) && t.scheduled === date);
    const known = list.map(estimateOf);
    return {
        date,
        minutes: known.reduce<number>((sum, n) => sum + (n ?? 0), 0),
        actions: list.length,
        noEstimate: known.filter(n => n === null).length,
    };
}

/** O que faz: diz se o dia passa do bloco. Sem duração legível, nunca. */
export function overCapacity(load: DayLoad, capacity: number | null): boolean {
    return capacity !== null && load.minutes > capacity;
}

/** O que faz: `⏱ 1,5 h de 2,5 h` (ou só `⏱ 1,5 h` sem bloco legível) e, na linha de baixo, `+N sem estimativa`. */
export function loadText(load: DayLoad, capacity: number | null): string {
    const head = `⏱ ${hoursText(load.minutes)}${capacity !== null ? ` de ${hoursText(capacity)}` : ''}${overCapacity(load, capacity) ? ' · passa do bloco' : ''}`;
    return load.noEstimate ? `${head}\n+${load.noEstimate} sem estimativa` : head;
}

/**
 * O que faz: a linha de resumo da semana: "planejado X h · bloco Y h/dia", com os dias acima do bloco.
 * Erro e ataque: sem duração legível, diz a ausência em palavras, nunca um número inventado.
 */
export function weekLoadSummary(week: string, tasks: readonly BlockTask[], blocoSagrado: unknown, hasWeekNote = true): string {
    const loads = weekDates(week).map(date => dayLoad(date, tasks));
    const capacity = parseBlockMinutes(blocoSagrado);
    const minutes = loads.reduce((sum, l) => sum + l.minutes, 0);
    const noEstimate = loads.reduce((sum, l) => sum + l.noEstimate, 0);
    const raw = String(blocoSagrado ?? '').trim();
    const bloco = capacity !== null
        ? `bloco ${hoursText(capacity)}/dia`
        : raw ? `bloco sem duração legível ("${raw.length > 40 ? `${raw.slice(0, 39)}…` : raw}")`
        : hasWeekNote ? 'bloco sem duração na nota da semana' : 'bloco: nota da semana não criada';
    const over = loads.filter(l => overCapacity(l, capacity)).map(l => dayLabel(l.date));
    const parts = [`planejado ${hoursText(minutes)}${noEstimate ? ` (+${noEstimate} sem estimativa)` : ''}`, bloco];
    if (over.length) parts.push(`acima do bloco: ${over.join(', ')}`);
    return `**⏱ Carga** · ${parts.join(' · ')}`;
}

/**
 * O que faz: o complemento do aviso da seta dia → ação: " · o dia passa de Y h (X h agendadas)" quando, com a
 * ação já no dia, a carga passa do Bloco Sagrado. Só avisa; nada é desfeito.
 * Erro e ataque: sem duração legível, ou dentro dela → `''`.
 */
export function dayOverText(date: string, tasks: readonly BlockTask[], blocoSagrado: unknown, moved?: BlockTask): string {
    const others = moved ? tasks.filter(t => t.path !== moved.path) : [...tasks];
    const all = moved ? [...others, { ...moved, scheduled: date }] : others;
    const capacity = parseBlockMinutes(blocoSagrado);
    const load = dayLoad(date, all);
    return capacity !== null && overCapacity(load, capacity) ? ` · o dia passa de ${hoursText(capacity)} (${hoursText(load.minutes)} agendadas)` : '';
}

/* --------------------------------------------------------------- no ar (📤) */

/**
 * O que faz: as peças 📤 concluídas na semana: `completedDate` dentro dela; sem a data, vale a `week` da tarefa.
 */
export function releasedInWeek(week: string, tasks: readonly BlockTask[]): BlockTask[] {
    const dates = new Set(weekDates(week));
    return tasks.filter(t => t.peca === 'soltar' && isDone(t) && (t.completedDate ? dates.has(t.completedDate) : t.week === week));
}

/**
 * O que faz: as peças 📤 concluídas num dia (`completedDate` nele): o "no ar" do nó do dia na Missão (P9).
 * Erro e ataque: sem a data de conclusão, a peça não cai em dia nenhum (conta só na semana, pela `week`).
 */
export function releasedOnDay(date: string, tasks: readonly BlockTask[]): BlockTask[] {
    return tasks.filter(t => t.peca === 'soltar' && isDone(t) && t.completedDate === date);
}
