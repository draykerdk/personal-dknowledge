/*
 * habits.ts — gestão de hábitos nativa do DFM.
 *
 * Substitui a dependência do plugin habit-tracker-21, cujo bundle precisava ser
 * editado à mão para o hábito guiado funcionar (o patch morria a cada update).
 *
 * Princípios que o módulo carrega no código, não só na documentação:
 * - Progresso é CONTAGEM DE EXECUÇÕES. Não existe streak em lugar nenhum daqui.
 * - Ausência de registro é ausência de dado: célula vazia não é falha.
 * - **Marcar atrasado é permitido, e é o uso normal.** O operador registra quando
 *   lembra — às vezes dias depois. Qualquer dia até hoje pode ser marcado e
 *   desmarcado; só o FUTURO é bloqueado ("não há o que registrar ainda"), porque
 *   registrar o que não aconteceu seria inventar dado. A regra anterior ("só o
 *   dia corrente se marca") foi retirada em 14/09/2026: ela nunca esteve no
 *   código e descrevia um rigor que o uso não pedia.
 *
 * Funções puras, testadas em tests/engine/habits.test.ts. O render e a escrita
 * vivem no main.ts, que só orquestra.
 */

import { diaNoTexto } from './dia';

/** A pasta do tracker: uma nota por hábito. */
export const HABIT_TRACKER_FOLDER = '200 - FUNCTIONS/Habits/Tracker';

export interface Habit {
    path: string;
    title: string;
    entries: string[];
    tracking: string;
    protocolId: string | null;
    status: string;
    reviewOn: string | null;
    ativo: boolean;
    /** Texto livre de `frequencia` ("diária, à noite", "semanal; …", "quando estiver em campo"). */
    frequencia?: string;
    /** Quantas vezes por semana (`meta_semanal`, ou "5 por semana" na frequência). */
    metaSemanal?: number | null;
    /** 1 = alta, 2 = média (padrão), 3 = baixa. Ordena o tracker. */
    prioridade?: number;
    /** A que pilar ou projeto do trimestre o hábito serve (`pilar`, ou o link de `projeto`). */
    pilar?: string | null;
    /** Esfera CAOS que o hábito alimenta (`esfera`). */
    esfera?: string | null;
    /** Os lugares onde a ação cabe (`contexts`, os mesmos 6 das tarefas); vazio = não declarado. */
    contexts?: string[];
    /** A ação mínima em minutos (`minutos`); `null` = não declarada (o hábito não é de ação). */
    minutos?: number | null;
    /** As palavras que a leitura do diário procura (`palavras`). */
    palavras?: string[];
}

export interface HabitCell {
    date: string;
    done: boolean;
}

export interface HabitRow {
    path: string;
    title: string;
    protocolId: string | null;
    cells: HabitCell[];
    /** Execuções dentro da janela exibida. Nunca dias consecutivos. */
    execucoes: number;
}

export type ClickResult =
    | { action: 'toggle' }
    | { action: 'protocol'; protocolId: string }
    | { action: 'blocked'; reason: string };

/** Estados que permanecem no vault, mas não são compromisso operacional do dia. */
const ESTADOS_INATIVOS = new Set([
    'ideia', 'planejado', 'planejada', 'proposta',
    'pausada', 'pausado',
    'integrada', 'integrado',
    'abandonada', 'abandonado',
    'arquivada', 'arquivado', 'archived'
]);

/** Aceita "2026-07-20", "2026-07-20T10:00" e wikilink de data. Devolve só o dia. */
function normalizarData(valor: any): string | null {
    const texto = String(valor ?? '').replace(/[[\]]/g, '');
    return diaNoTexto(texto) || null;
}

function nomeDoArquivo(path: string): string {
    const base = path.split('/').pop() ?? path;
    return base.replace(/\.md$/, '');
}

export function parseHabit(path: string, frontmatter: any): Habit {
    const fm = frontmatter ?? {};
    const brutas: any[] = Array.isArray(fm.entries) ? fm.entries : (fm.entries ? [fm.entries] : []);
    const entries: string[] = [...new Set(
        brutas.map(normalizarData).filter((d): d is string => d !== null)
    )].sort();
    const protocolId = typeof fm.protocol_id === 'string' && fm.protocol_id.trim()
        ? fm.protocol_id.trim()
        : null;
    const status = String(fm.status ?? 'em_treino');

    return {
        path,
        title: typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : nomeDoArquivo(path),
        entries,
        tracking: String(fm.tracking ?? (protocolId ? 'protocol' : 'manual')),
        protocolId,
        status,
        reviewOn: normalizarData(fm.revisar_em),
        ativo: !ESTADOS_INATIVOS.has(status.toLowerCase()),
        frequencia: typeof fm.frequencia === 'string' ? fm.frequencia.trim() : '',
        metaSemanal: parseWeeklyTarget(fm.meta_semanal, fm.frequencia),
        prioridade: parsePriority(fm.prioridade),
        pilar: parsePillar(fm.pilar ?? fm.projeto ?? fm.project),
        esfera: typeof fm.esfera === 'string' ? fm.esfera.trim() : null,
        contexts: textList(fm.contexts),
        minutos: parseMinutesField(fm.minutos),
        palavras: textList(fm.palavras)
    };
}

/** Lista de textos de um campo que pode ser item solto, lista ou vazio. */
function textList(valor: any): string[] {
    const bruto = Array.isArray(valor) ? valor : (valor === undefined || valor === null || valor === '' ? [] : [valor]);
    return [...new Set(bruto.map(item => String(item ?? '').trim()).filter(Boolean))];
}

/** `minutos: 20` (ou "20"); fora disso, `null`. */
function parseMinutesField(valor: any): number | null {
    const n = typeof valor === 'number' ? valor : Number.parseInt(String(valor ?? '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 60) : null;
}

/** `meta_semanal: 5`, ou "5 por semana" / "5x/semana" / "5+ por semana" dentro da frequência. */
export function parseWeeklyTarget(meta: any, frequencia: any): number | null {
    const direto = Number.parseInt(String(meta ?? ''), 10);
    if (Number.isFinite(direto) && direto > 0) return Math.min(direto, 21);
    const texto = String(frequencia ?? '').toLowerCase();
    const m = texto.match(/(\d+)\s*\+?\s*(?:x|vezes)?\s*(?:por|\/|na|a)\s*semana/);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return n > 0 ? Math.min(n, 21) : null;
}

/** `alta`/`1` → 1; `baixa`/`3` → 3; o resto, média (2). */
export function parsePriority(valor: any): number {
    const t = String(valor ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t === '1' || t === 'alta' || t === 'high') return 1;
    if (t === '3' || t === 'baixa' || t === 'low') return 3;
    return 2;
}

/** `"[[Projeto Exemplo]]"` → `Projeto Exemplo`; lista usa o primeiro. */
function parsePillar(valor: any): string | null {
    const bruto = Array.isArray(valor) ? valor[0] : valor;
    const texto = String(bruto ?? '').replace(/^\[\[|\]\]$/g, '').split('|').pop()!.split('/').pop()!.trim();
    return texto || null;
}

/** Os `dias` dias terminando em `hoje` (inclusive), do mais antigo para o mais novo. */
export function janela(hoje: string, dias: number): string[] {
    const base = new Date(`${hoje}T12:00:00Z`);
    const saida: string[] = [];
    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() - i);
        saida.push(d.toISOString().slice(0, 10));
    }
    return saida;
}

export function formatarDiaIngles(dateStr: string, hoje: string): {
    date: string;
    weekdayStr: string;
    dayNumStr: string;
    isToday: boolean;
    isWeekend: boolean;
    isFuture: boolean;
} {
    const DIAS_INGLES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const d = new Date(`${dateStr}T12:00:00Z`);
    const dayOfWeek = d.getUTCDay();
    const weekdayStr = DIAS_INGLES[dayOfWeek];
    const dayNumStr = String(d.getUTCDate()).padStart(2, '0');
    const isToday = dateStr === hoje;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFuture = dateStr > hoje;
    return { date: dateStr, weekdayStr, dayNumStr, isToday, isWeekend, isFuture };
}

/**
 * As contagens de um hábito: quantas vezes aconteceu, em quantos dias já vividos da
 * janela (`windowEntries` de `windowDays`, "N de M dias"). Sem taxa nem porcentagem
 * (25/10/2026): o número conta o que aconteceu e não mede a pessoa.
 */
export interface HabitMetrics {
    totalEntries: number;
    windowEntries: number;
    windowDays: number;
    lastExecuted: string | null;
    doneToday: boolean;
}

export function calcHabitMetrics(habit: Habit, hoje: string, windowDays = 30): HabitMetrics {
    const j = janela(hoje, windowDays);
    const pastOrToday = j.filter(d => d <= hoje);
    const windowEntries = habit.entries.filter(e => pastOrToday.includes(e)).length;
    const sortedEntries = [...habit.entries].sort();
    const lastExecuted = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1] : null;

    return {
        totalEntries: habit.entries.length,
        windowEntries,
        windowDays: pastOrToday.length,
        lastExecuted,
        doneToday: habit.entries.includes(hoje)
    };
}

/** As contagens da grade: feitos hoje, ativos e execuções na janela. Sem taxa de adesão (25/10/2026). */
export interface GridStats {
    concluidosHoje: number;
    totalAtivos: number;
    totalExecucoesJanela: number;
}

export function calcGridStats(grid: { days: string[]; rows: HabitRow[] }, hoje: string): GridStats {
    const totalAtivos = grid.rows.length;
    const concluidosHoje = grid.rows.filter(r => r.cells.some(c => c.date === hoje && c.done)).length;
    const totalExecucoesJanela = grid.rows.reduce((acc, r) => acc + r.execucoes, 0);

    return {
        concluidosHoje,
        totalAtivos,
        totalExecucoesJanela,
    };
}

export function buildGrid(habits: Habit[], hoje: string, dias: number): { days: string[]; rows: HabitRow[] } {
    const days = janela(hoje, dias);
    const rows = habits
        .filter(h => h.ativo)
        .map(h => {
            const cells = days.map(date => ({ date, done: h.entries.includes(date) }));
            return {
                path: h.path,
                title: h.title,
                protocolId: h.protocolId,
                cells,
                execucoes: cells.filter(c => c.done).length
            };
        });
    return { days, rows };
}

export function resolveClick(habit: Habit, date: string, hoje: string): ClickResult {
    if (date > hoje) {
        return { action: 'blocked', reason: 'Dia futuro: não há o que registrar ainda.' };
    }
    if (habit.tracking === 'automatico') {
        return { action: 'blocked', reason: 'Este hábito é registrado automaticamente pelo DFM.' };
    }
    if (!habit.protocolId) {
        return { action: 'toggle' };
    }
    if (date === hoje && !habit.entries.includes(date)) {
        return { action: 'protocol', protocolId: habit.protocolId };
    }
    return { action: 'toggle' };
}

/** Marca ou desmarca um dia, devolvendo a lista ordenada e sem repetição. */
export function toggleEntry(entries: any[], date: string): string[] {
    const atuais = new Set(
        (Array.isArray(entries) ? entries : [])
            .map(normalizarData)
            .filter((d): d is string => d !== null)
    );
    if (atuais.has(date)) atuais.delete(date);
    else atuais.add(date);
    return [...atuais].sort();
}

/* ==========================================================================
   Cadência — o que o hábito espera de hoje
   ========================================================================== */

/**
 * O ritmo declarado em `frequencia`, que é texto livre na nota do hábito.
 *
 * - `diaria`: espera-se o registro todo dia;
 * - `dias-uteis`: de segunda a sexta;
 * - `semanal`: uma vez na semana, qualquer dia;
 * - `ocasiao`: acontece quando a situação aparece ("toda vez que", "quando
 *   estiver em campo"). Nunca fica pendente: não há o que esperar de um dia.
 *
 * Sem `frequencia`, vale `diaria` — era o que o tracker assumia para todos.
 */
export type HabitCadence = 'diaria' | 'dias-uteis' | 'semanal' | 'ocasiao';

export const CADENCE_LABEL: Record<HabitCadence, string> = {
    diaria: 'diária',
    'dias-uteis': 'dias úteis',
    semanal: 'semanal',
    ocasiao: 'quando acontece',
};

function semAcento(texto: string): string {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseCadence(frequencia: string | undefined | null, metaSemanal?: number | null): HabitCadence {
    const t = semAcento(String(frequencia ?? ''));
    // Meta semanal declarada manda: "5 por semana" é semanal, mesmo que diga "quando".
    if (metaSemanal && metaSemanal > 0) return 'semanal';
    if (!t.trim()) return 'diaria';
    if (/\b(toda vez|sempre que|quando)\b/.test(t)) return 'ocasiao';
    if (/semana|semanal/.test(t)) return 'semanal';
    if (/dias? uteis/.test(t)) return 'dias-uteis';
    return 'diaria';
}

/** Segunda-feira da semana ISO de `dia` (AAAA-MM-DD). */
export function inicioDaSemana(dia: string): string {
    const d = new Date(`${dia}T12:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
}

export interface HabitToday {
    cadence: HabitCadence;
    /** Vezes por semana que o hábito pede (1 no semanal simples; null fora do semanal). */
    meta: number | null;
    /** Execuções de segunda até hoje. */
    semana: number;
    feitoHoje: boolean;
    /** Hoje se espera um registro deste hábito (e ele ainda não veio). */
    pendenteHoje: boolean;
    /** Hoje conta no denominador de "hábitos hoje": pendente ou já feito. */
    contaHoje: boolean;
}

/**
 * O estado de hoje segundo a cadência. Ausência continua sendo ausência: o
 * semanal sem registro na segunda está "ainda nesta semana", não atrasado.
 */
export function habitToday(habit: Habit, hoje: string): HabitToday {
    const cadence = parseCadence(habit.frequencia, habit.metaSemanal);
    const meta = cadence === 'semanal' ? (habit.metaSemanal ?? 1) : null;
    const segunda = inicioDaSemana(hoje);
    const semana = habit.entries.filter(e => e >= segunda && e <= hoje).length;
    const feitoHoje = habit.entries.includes(hoje);
    const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
    const util = diaSemana >= 1 && diaSemana <= 5;
    let esperado: boolean;
    switch (cadence) {
        case 'diaria': esperado = true; break;
        case 'dias-uteis': esperado = util; break;
        // Semanal: esperado até a meta da semana ser atingida.
        case 'semanal': esperado = semana < (meta ?? 1) || feitoHoje; break;
        default: esperado = false;
    }
    return {
        cadence,
        meta,
        semana,
        feitoHoje,
        pendenteHoje: esperado && !feitoHoje,
        contaHoje: esperado || feitoHoje,
    };
}

/* ==========================================================================
   Revisão — o lembrete que o autor deixou em `revisar_em`
   ========================================================================== */

export type HabitReviewChoice =
    | { kind: 'continuar'; semanas: number }
    | { kind: 'integrado' }
    | { kind: 'pausado' };

function somarDias(dia: string, dias: number): string {
    const d = new Date(`${dia}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/**
 * O que a decisão da revisão grava no frontmatter. Só `status` e
 * `revisar_em`; `entries` nunca é tocado. Integrado e pausado saem do tracker
 * ativo (ver `ESTADOS_INATIVOS`) e continuam no vault.
 */
export function reviewPatch(choice: HabitReviewChoice, hoje: string): { status: string; revisar_em?: string } {
    if (choice.kind === 'continuar') return { status: 'em_treino', revisar_em: somarDias(hoje, choice.semanas * 7) };
    return { status: choice.kind };
}

/* ==========================================================================
   O hábito na escolha da hora (2.29, plano de 22/10/2026)
   ========================================================================== */

/**
 * O que faz: o hábito é de ação e está em treino? Ação = declara a ação mínima
 * (`minutos`); em treino = `status: em_treino`; fora os automáticos (o DFM os marca).
 * Por quê: "os de intenção (celular, IA) e os automáticos (ACT, pomodoro, Comando do
 * Dia, fechar o dia) ficam fora da escolha" (plano, seção 4). Quem diz que o hábito é
 * de ação é a nota dele: os campos `contexts`, `minutos` e `palavras`.
 */
export function isActionHabit(habit: Habit): boolean {
    return Boolean(habit) && habit.ativo && habit.status === 'em_treino'
        && habit.tracking !== 'automatico' && habit.minutos !== null && habit.minutos !== undefined;
}

/** O peso que o hábito pede hoje: `hoje` (falta a marca de hoje) ou `meta_semana` (abaixo da meta). */
export type HabitNowWeight = 'hoje' | 'meta_semana';

/**
 * O que faz: o hábito de ação entra como candidato agora? Sai o peso dele, ou `null`.
 * - Com a marca de hoje: não entra.
 * - Com `meta_semanal` (cadência semanal): entra enquanto a semana não chegou à meta,
 *   com o peso `meta_semana`.
 * - Os outros: entram enquanto falta a marca de hoje, com o peso `hoje`.
 * Ausência de marca não é falta: só diz que ele cabe como escolha.
 * Prova: tests/engine/habitsNow.test.ts.
 */
export function habitNowWeight(habit: Habit, hoje: string): HabitNowWeight | null {
    if (!isActionHabit(habit)) return null;
    const estado = habitToday(habit, hoje);
    if (estado.feitoHoje) return null;
    if (estado.cadence === 'semanal') return estado.semana < (estado.meta ?? 1) ? 'meta_semana' : null;
    return 'hoje';
}

/** O que faz: o título do hábito sem o emoji do começo ("🧘 Sentar para meditar" → "Sentar para meditar"). */
export function habitActionTitle(habit: Pick<Habit, 'title'>): string {
    const titulo = String(habit?.title ?? '').trim();
    const semEmoji = titulo.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, '').trim();
    return semEmoji || titulo;
}
