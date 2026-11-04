/**
 * O serviço do diário: liga a leitura pura (`diaryReader.ts`) ao vault, ao TaskNotes e
 * ao tracker de hábitos (itens 2.28 e 2.29, plano de 22/10/2026).
 *
 * Liga:
 * - a Day de um dia (`300 - RUNTIME/302 - Daymiss/Day/<dia>.md`) e o modelo da Day (as
 *   linhas de dica não contam como texto da pessoa);
 * - as tarefas e o contexto da decisão (a semana, a SMART da vez), pelo serviço da
 *   árvore do agora;
 * - os hábitos do tracker (`200 - FUNCTIONS/Habits/Tracker`).
 *
 * Regula:
 * - "📖 Pelo diário" (o 🌙, em teste): só oferece; concluir e marcar acontecem com o
 *   toque de quem usa (`applyReading`). A tarefa conclui no dia que está sendo fechado, sem a
 *   janela "Quando terminou?" (`MissionBoard.completeTask` com `when` já dito); o hábito recebe
 *   a marca pelo caminho do próprio motor (`recordDailyHabitEntry`).
 * - O diário escrito conta como fechamento: o hábito "🌒 Fechar o dia" recebe a marca
 *   dos dias cuja Day tem texto escrito pela pessoa, lidos na virada do dia ou na próxima
 *   abertura do plugin (`checkClosings`). O primeiro uso só guarda o dia: não marca
 *   dias passados.
 * Nada aqui decide pela pessoa.
 */
import { App, TFile } from 'obsidian';
import {
    DIARY_HABIT_PREFIX,
    DIARY_TASK_PREFIX,
    diaryHabitMatches,
    diaryHasOwnText,
    diaryOwnLines,
    diaryTaskMatches,
    habitNameOf,
    tomorrowSentences,
} from './diaryReader';
import { isClosedUnit, isoWeekOf, type TaskUnit } from './decisionWeights';
import { HABIT_TRACKER_FOLDER, isActionHabit, parseHabit, type Habit } from './habits';
import { DIA } from './dia';

export const DAY_FOLDER = '300 - RUNTIME/302 - Daymiss/Day';
export const DAY_MODEL_PATH = '200 - FUNCTIONS/Models/Day modelo.md';
export const HABIT_FOLDER = HABIT_TRACKER_FOLDER;
/** O hábito "🌒 Fechar o dia"; o 🌙 (`review_diario.habitTrackerPath`) aponta o mesmo. */
export const CLOSING_HABIT_PATH = `${HABIT_FOLDER}/06 - Fechamento do dia.md`;
/** A chave (deste aparelho) do último dia em que a leitura do fechamento rodou. */
export const CLOSING_STORAGE_KEY = 'dfm-diario-fechamento-ultimo-dia';
/** Quantos dias para trás a leitura do fechamento olha, no máximo. */
export const CLOSING_LOOKBACK_DAYS = 7;

export interface DiaryReading {
    dia: string;
    texto: string;
    tarefas: Array<{ path: string; name: string }>;
    habitos: Array<{ path: string; title: string }>;
}

/**
 * O que faz: quando conclui a tarefa marcada no "📖 Pelo diário": no dia que está sendo
 * fechado. No mesmo dia do relógio, agora (com a hora); a Day de ontem, "ontem"; uma Day
 * mais antiga, "outro dia" (sem hora, o formato de `completionWhen`).
 * Por quê: o 🌙 roda depois da meia-noite na Day de ontem; com a data do relógio, a
 * tarefa que o diário diz feita no domingo ganhava a conclusão de segunda e saía das
 * "feitas" da semana certa.
 * Entra → sai: o dia da Day e o relógio → { choice, date, time }. Dia vazio ou depois do
 * relógio (não há o que concluir no futuro) → agora.
 */
export function diaryCompletionWhen(dia: string, now: { date: string; time: string }): { choice: 'agora' | 'ontem' | 'outro_dia'; date: string; time: string | null } {
    const day = String(dia ?? '').trim();
    if (!DIA.test(day) || day >= now.date) return { choice: 'agora', date: now.date, time: now.time };
    return { choice: day === addDays(now.date, -1) ? 'ontem' : 'outro_dia', date: day, time: null };
}

/** O que faz: soma dias a `AAAA-MM-DD` (em UTC, sem fuso). */
export function addDays(day: string, days: number): string {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * O que faz: os dias que a leitura do fechamento confere: do último dia lido até ontem,
 * no máximo `CLOSING_LOOKBACK_DAYS`. Sem último dia (primeiro uso), nenhum: o primeiro
 * uso só guarda o dia, e os dias passados não são marcados de uma vez.
 * Prova: tests/engine/diaryService.test.ts.
 */
export function closingDaysToCheck(last: string | null | undefined, today: string): string[] {
    if (!DIA.test(String(last ?? '')) || !DIA.test(today)) return [];
    if (String(last) >= today) return [];
    const first = String(last) < addDays(today, -CLOSING_LOOKBACK_DAYS) ? addDays(today, -CLOSING_LOOKBACK_DAYS) : String(last);
    const out: string[] = [];
    for (let day = first; day < today; day = addDays(day, 1)) out.push(day);
    return out;
}

/**
 * O que faz: as tarefas que o "📖 Pelo diário" pode oferecer: abertas, não SMART, não
 * recorrentes (a instância se conclui pelo TaskNotes), da semana do dia, agendadas para o
 * dia ou da SMART da vez.
 */
export function diaryTaskPool(units: TaskUnit[], dia: string, smartsDaVez: string[], linhagem?: Map<string, string[]>): TaskUnit[] {
    const semana = isoWeekOf(dia);
    const smarts = new Set(smartsDaVez || []);
    return (units || []).filter(unit => !isClosedUnit(unit)
        && !unit.path.startsWith('TaskNotes/Archive/')
        && unit.type !== 'tarefa_smart'
        && !unit.recurring
        && (unit.week === semana || unit.scheduled === dia
            || [...unit.projects, ...(linhagem?.get(unit.name) ?? [])].some(name => smarts.has(name))));
}

/** O que faz: os hábitos que o "📖 Pelo diário" pode oferecer: de ação, em treino, sem a marca do dia. */
export function diaryHabitPool(habits: Habit[], dia: string): Habit[] {
    return (habits || []).filter(habit => isActionHabit(habit) && !habit.entries.includes(dia));
}

/** O que faz: os rótulos do passo e o que cada um marca. */
export function diaryOptions(reading: Pick<DiaryReading, 'tarefas' | 'habitos'>): Array<{ label: string; tipo: 'tarefa' | 'habito'; path: string }> {
    return [
        ...reading.tarefas.map(task => ({ label: `${DIARY_TASK_PREFIX}${task.name}`, tipo: 'tarefa' as const, path: task.path })),
        ...reading.habitos.map(habit => ({ label: `${DIARY_HABIT_PREFIX}${habit.title}`, tipo: 'habito' as const, path: habit.path })),
    ];
}

export class DiaryService {
    app: App;
    plugin: any;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    /** As linhas do modelo da Day (as dicas não contam como texto da pessoa). Sem o modelo, nenhuma. */
    async templateLines(): Promise<string[]> {
        try {
            return String(await this.app.vault.adapter.read(DAY_MODEL_PATH)).split('\n');
        } catch (e) {
            return [];
        }
    }

    /** O texto da Day de um dia, ou `null` se ela não existe. */
    async dayContent(dia: string): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(`${DAY_FOLDER}/${dia}.md`);
        return file instanceof TFile ? await this.app.vault.read(file) : null;
    }

    /** As linhas que ele escreveu no diário de um dia (sem a Day, nenhuma). */
    async ownLines(dia: string): Promise<string[]> {
        const content = await this.dayContent(dia);
        return content === null ? [] : diaryOwnLines(content, await this.templateLines());
    }

    /**
     * O que faz: "📝 Do diário de ontem": as frases sobre o dia seguinte da última Day
     * antes de `hoje` que existir. Só lê. Devolve o dia dela e as frases.
     */
    async tomorrowFrom(hoje: string): Promise<{ dia: string | null; frases: string[] }> {
        const days = this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(`${DAY_FOLDER}/`) && DIA.test(file.basename) && file.basename < hoje)
            .map(file => file.basename)
            .sort();
        const dia = days[days.length - 1] ?? null;
        if (!dia) return { dia: null, frases: [] };
        return { dia, frases: tomorrowSentences(await this.ownLines(dia)) };
    }

    /** Os hábitos do tracker, lidos do frontmatter. */
    habits(): Habit[] {
        return this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(`${HABIT_FOLDER}/`))
            .map(file => parseHabit(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter));
    }

    /**
     * O que faz: "📖 Pelo diário": o que o diário do dia cita, para marcar com um toque.
     * Só lê. Sem texto, ou sem nada citado, as listas vêm vazias (o passo não aparece).
     */
    async reading(dia: string): Promise<DiaryReading> {
        const lines = await this.ownLines(dia);
        const texto = lines.join('\n');
        if (!texto.trim()) return { dia, texto, tarefas: [], habitos: [] };
        const tree = this.plugin?.nowTree;
        const units: TaskUnit[] = typeof tree?.taskUnits === 'function' ? tree.taskUnits() : [];
        let smartsDaVez: string[] = [];
        let linhagem: Map<string, string[]> | undefined;
        if (typeof tree?.decisionContext === 'function') {
            try {
                const ctx = await tree.decisionContext(units, { hoje: dia });
                smartsDaVez = ctx.smartsDaVez || [];
                linhagem = ctx.linhagem;
            } catch (e) {
                smartsDaVez = [];
            }
        }
        const tarefas = diaryTaskMatches(texto, diaryTaskPool(units, dia, smartsDaVez, linhagem))
            .map(unit => ({ path: unit.path, name: unit.name }));
        const habitos = diaryHabitMatches(texto, diaryHabitPool(this.habits(), dia).map(habit => ({
            path: habit.path, title: habit.title, nome: habitNameOf(habit.path), palavras: habit.palavras || [],
        }))).map(habit => ({ path: habit.path, title: habit.title }));
        return { dia, texto, tarefas, habitos };
    }

    /**
     * O que faz: aplica o que ele marcou no "📖 Pelo diário": a tarefa conclui no dia que
     * está sendo fechado (`diaryCompletionWhen`, sem a janela "Quando terminou?"); o
     * hábito recebe a marca do dia. Devolve quantas de cada deram certo. Não lança: o que
     * falhar fica como estava.
     */
    async applyReading(selected: Array<{ tipo: 'tarefa' | 'habito'; path: string }>, dia: string, now: { date: string; time: string }): Promise<{ tarefas: number; habitos: number }> {
        let tarefas = 0;
        let habitos = 0;
        for (const item of selected || []) {
            try {
                if (item.tipo === 'tarefa') {
                    const ok = await this.plugin?.board?.completeTask?.(item.path, { when: diaryCompletionWhen(dia, now) });
                    if (ok) tarefas++;
                } else if (item.tipo === 'habito') {
                    const ok = await this.plugin?.habitLog?.recordDailyHabitEntry?.(item.path, dia);
                    if (ok) habitos++;
                }
            } catch (e) {
                console.error(`DFM 📖 Pelo diário: não marcou ${item.path}`, e);
            }
        }
        return { tarefas, habitos };
    }

    /** O hábito "🌒 Fechar o dia": o do 🌙 (`habitTrackerPath`), ou o caminho de sempre. */
    closingHabitPath(): string {
        const configured = this.plugin?.manager?.doPapel?.('fechar_dia')?.def?.habitTrackerPath;
        return typeof configured === 'string' && configured.trim() ? configured.trim() : CLOSING_HABIT_PATH;
    }

    /**
     * O que faz: o diário escrito conta como fechamento. Para cada dia desde a última
     * leitura até ontem (`closingDaysToCheck`), a Day com texto escrito por ele marca o
     * "🌒 Fechar o dia" desse dia (a marca do 🌙 concluído continua). Guarda o dia de hoje
     * como lido. Devolve os dias marcados. Não lança.
     */
    async checkClosings(today: string): Promise<string[]> {
        const marked: string[] = [];
        try {
            const last = this.readLast();
            const days = closingDaysToCheck(last, today);
            if (days.length) {
                const model = await this.templateLines();
                const path = this.closingHabitPath();
                for (const dia of days) {
                    const content = await this.dayContent(dia);
                    if (content === null || !diaryHasOwnText(content, model)) continue;
                    if (await this.plugin?.habitLog?.recordDailyHabitEntry?.(path, dia)) marked.push(dia);
                }
            }
            if (!last || last < today) this.writeLast(today);
        } catch (e) {
            console.error('DFM: a leitura do diário como fechamento falhou:', e);
        }
        return marked;
    }

    private readLast(): string | null {
        try {
            const value = (this.app as any).loadLocalStorage?.(CLOSING_STORAGE_KEY);
            return typeof value === 'string' && value ? value : null;
        } catch (e) {
            return null;
        }
    }

    private writeLast(day: string): void {
        try { (this.app as any).saveLocalStorage?.(CLOSING_STORAGE_KEY, day); } catch (e) { /* sem armazenamento: lê de novo na próxima */ }
    }
}

/** O que faz: o aviso depois do "📖 Pelo diário" (só o que foi feito; o zerado não aparece). */
export function diaryNoticeText(done: { tarefas: number; habitos: number }): string {
    const parts: string[] = [];
    if (done.tarefas) parts.push(`${done.tarefas} ${done.tarefas === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`);
    if (done.habitos) parts.push(`${done.habitos} ${done.habitos === 1 ? 'hábito marcado' : 'hábitos marcados'}`);
    return parts.length ? `📖 Pelo diário: ${parts.join(' · ')}.` : '📖 Pelo diário: nada foi marcado.';
}

/** O que faz: as opções marcadas no passo (a lista do modal ou, sem ela, o texto "A, B"). */
export function chosenDiaryLabels(result: { value?: unknown; values?: unknown }, labels: string[]): string[] {
    if (Array.isArray(result?.values)) return labels.filter(label => (result.values as unknown[]).includes(label));
    const joined = `, ${String(result?.value ?? '')}, `;
    return labels.filter(label => joined.includes(`, ${label}, `));
}
