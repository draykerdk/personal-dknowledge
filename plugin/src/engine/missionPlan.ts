/**
 * Plano — a metade do Mission Control que lê **intenção declarada**, não estoque.
 *
 * O console já sabia ler o estoque (status, prazo, impacto): o que existe. Não
 * sabia ler o plano: o que foi prometido para quando. `scheduled` e
 * `timeEstimate` eram lidos e descartados, então a pergunta que decide a semana
 * — "isso cabe?" — não tinha número nenhum para responder.
 *
 * Regras duras desta camada:
 *
 * 1. **Só tarefa aberta entra no plano.** Concluída é fato, não plano: continua
 *    contando no funil do quadro, nunca na carga da semana.
 * 2. **Ausência não é zero.** Tarefa sem `estimate` não soma 0 min — entra em
 *    `unestimated`, porque um zero silencioso encolheria a semana e faria o
 *    plano parecer mais leve do que ele é. Sem `scheduledDate` ela é
 *    `unscheduled`, nunca "hoje".
 * 3. **Nada é inventado.** Nenhum gap nasce de suspeita: cada um é consequência
 *    direta de um número do próprio relatório e nunca aparece com contagem 0.
 * 4. **Urgência ≠ importância.** No DFM `priority` é urgência operacional e
 *    `impacto` é importância estratégica (ver `taskSemantics`). A matriz cruza
 *    os dois eixos separadamente; impacto ausente tem quadrante próprio.
 * 5. **Puro e determinístico.** Sem I/O, sem `obsidian`, sem `Date.now()`:
 *    `today` é sempre parâmetro. Mesma entrada, mesma saída.
 *
 * Escopo dos sinais, declarado para não confundir as duas leituras:
 * - gaps de **propriedade da tarefa** (`scheduledPast`, `overdue`) valem para o
 *   vault inteiro — a intenção vencida é da tarefa, não da janela impressa;
 * - gaps de **comparação com a janela** (carga do dia, semana sem intenção,
 *   agendada fora da semana) valem para a semana pedida — comparar o vault
 *   contra uma janela que não é dele produziria aviso permanente e vazio.
 *
 * Calendário: semana ISO e trimestre saem de aritmética de `Date` em UTC. O
 * motor puro não carrega `moment`, e o fuso do operador não pode mudar em qual
 * segunda uma semana começa.
 */
import { isTerminalStatus } from './taskSemantics';
import type { MissionTask } from './missionTypes';
import { isHighImpact, parseImpactScore, parseMinutes, parseSchedule } from './taskSemantics';
import { DAY_MS, daysBetween, isoDay, parseDay, shiftDay } from './missionCalendar';
import { partesDoTrimestre } from './periodo';
import { agendadaForaDaSemana, diasUteisVazios } from './conferenciasDoPlano';

/* ==========================================================================
   Calendário ISO — Date em UTC, sem dependências
   ========================================================================== */

/** Índice 0 = segunda ... 6 = domingo, para casar com `weekday` 1–7 do contrato. */
const SHORT_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** 1 = segunda ... 7 = domingo. O `|| 7` troca o domingo-zero do JS pelo fim da semana ISO. */
function weekdayOf(date: Date): number {
    return date.getUTCDay() || 7;
}

/** Segunda da semana 1 de um ano ISO. O dia 4 de janeiro está sempre na semana 1. */
function mondayOfWeekOne(year: number): Date {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return shiftDay(jan4, 1 - weekdayOf(jan4));
}

/** 52 ou 53: a distância entre as segundas da semana 1 de dois anos consecutivos. */
function isoWeeksInYear(year: number): number {
    const span = (mondayOfWeekOne(year + 1).getTime() - mondayOfWeekOne(year).getTime()) / DAY_MS;
    return Math.round(span / 7);
}

/**
 * Fronteiras ISO da semana `YYYY-Wnn` calculadas sem moment (aritmética de Date
 * em UTC). Devolve `null` quando a semana não existe — inclusive `W53` em ano
 * de 52 semanas, que é o erro que um `+1 semana` cego cometeria em silêncio.
 */
export function weekBounds(week: string): { start: string; end: string } | null {
    // Forma própria (não é a `SEMANA`): aceita a semana com um dígito (`2026-W5`), digitada, e confere o número pelo ano.
    const match = String(week ?? '').trim().match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const number = Number(match[2]);
    if (number < 1 || number > isoWeeksInYear(year)) return null;
    const monday = shiftDay(mondayOfWeekOne(year), (number - 1) * 7);
    return { start: isoDay(monday), end: isoDay(shiftDay(monday, 6)) };
}

/**
 * Semana ISO (`YYYY-Wnn`) de uma data `YYYY-MM-DD`.
 *
 * Quem define ano e número é a **quinta** da semana: é a convenção ISO, e é o
 * que faz `2025-12-29` pertencer a `2026-W01` em vez de fechar 2025 no lugar
 * errado. Data ilegível devolve `''` — não uma semana qualquer.
 */
export function weekOf(date: string): string {
    const day = parseDay(date);
    if (!day) return '';
    const thursday = shiftDay(day, 4 - weekdayOf(day));
    const year = thursday.getUTCFullYear();
    const yearStart = Date.UTC(year, 0, 1);
    const number = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
    return `${year}-W${String(number).padStart(2, '0')}`;
}

/** Segunda da semana seguinte. Só é chamada com semana legível. */
function nextWeek(week: string): string {
    const bounds = weekBounds(week);
    const monday = bounds ? parseDay(bounds.start) : null;
    if (!monday) return '';
    return weekOf(isoDay(shiftDay(monday, 7)));
}

/** `2026-09-14` -> `14/09`, para caber em detalhe de gap e rótulo de dia. */
function shortDate(date: string): string {
    return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function dayLabel(date: Date): string {
    const iso = isoDay(date);
    return `${SHORT_WEEKDAYS[weekdayOf(date) - 1]} ${shortDate(iso)}`;
}

/** Concordância mínima para o detalhe do gap não sair como "1 tarefas". */
function plural(value: number, one: string, many: string): string {
    return `${value} ${value === 1 ? one : many}`;
}

/* ==========================================================================
   Plano da semana
   ========================================================================== */

/** Capacidade de foco declarada por dia. Acima disso o dia não é plano, é fila. */
export const DEFAULT_DAY_CAPACITY_MINUTES = 300;

export interface MissionPlanDay {
    date: string;
    label: string;
    /** 1 = segunda ... 7 = domingo. */
    weekday: number;
    isToday: boolean;
    isPast: boolean;
    /** Abertas com `scheduledDate` neste dia — a intenção declarada. */
    scheduled: MissionTask[];
    /** Abertas com `due` neste dia — o compromisso. Pode coincidir com `scheduled`. */
    due: MissionTask[];
    /** Soma de `estimate` das agendadas do dia. Sem estimativa não soma nada. */
    minutes: number;
    /** Quantas agendadas do dia não têm `estimate`: a carga real é maior que `minutes`. */
    unestimated: number;
}

export interface MissionPlanGap {
    id: string;
    label: string;
    severity: 'info' | 'warning' | 'critical';
    detail: string;
}

export interface MissionPlanContextLoad {
    context: string;
    count: number;
    minutes: number;
}

export interface MissionPlanWeek {
    week: string;
    start: string;
    end: string;
    /** Sempre 7 — a semana ilegível é a única exceção e devolve plano vazio. */
    days: MissionPlanDay[];
    /** Por dia, não para a semana. */
    capacityMinutes: number;
    plannedMinutes: number;
    /** Soma, por dia, do que passou da capacidade. */
    overflowMinutes: number;
    peakDay: { date: string; minutes: number } | null;
    totals: {
        /** Abertas com `week === week`. */
        open: number;
        /** Abertas com `scheduledDate` dentro de [start, end]. */
        scheduled: number;
        /**
         * Abertas com `due` dentro de [start, end] — **de qualquer semana**.
         *
         * O nome carrega o escopo de propósito: este número e `open` medem
         * populações diferentes (aqui, "o prazo cai nesta janela", venha a tarefa
         * da semana que vier) e ficam lado a lado na tela. Chamado de
         * `dueThisWeek`, convidava a ser lido como se fosse o mesmo conjunto de
         * `open` — e o operador ficaria com dois números que não fecham entre si.
         */
        dueInWindow: number;
        /** Abertas da semana sem `scheduledDate`. */
        unscheduled: number;
        /** Abertas da semana sem `estimate`. */
        unestimated: number;
        /**
         * Abertas **da semana** agendadas fora de [start, end]: a tarefa foi
         * declarada para esta semana e a agenda marca outro período.
         *
         * Contar aqui o vault inteiro daria um número grande e constante (toda
         * tarefa de toda outra semana), um aviso que ninguém lê — o que ele
         * precisa responder é "alguma tarefa desta semana escorregou de janela?".
         */
        scheduledOutsideWeek: number;
        /** Abertas da semana sem projeto. */
        withoutProject: number;
        /** Abertas da semana por status, do maior para o menor. */
        byStatus: Record<string, number>;
        /** Contextos das abertas da semana, do mais carregado para o menos. */
        byContext: MissionPlanContextLoad[];
    };
    gaps: MissionPlanGap[];
}

/**
 * Data do plano de uma tarefa.
 *
 * O coletor já entrega `scheduledDate`, mas montar uma tarefa à mão (teste,
 * ponte, agente) pode deixar só o `scheduled` cru. Passar pelo mesmo parser do
 * coletor custa um regex e evita que a tarefa suma do dia por diferença de
 * forma — nunca que ela apareça num dia que não foi declarado.
 */
function planSchedule(task: MissionTask): { date: string; time: string } {
    const date = String(task.scheduledDate ?? '');
    if (date) return { date, time: String(task.scheduledTime ?? '') };
    return parseSchedule(task.scheduled);
}

/**
 * Minutos estimados, ou `null` quando o autor não estimou.
 *
 * O campo já vem resolvido por `parseMinutes` no coletor. Repassar pelo mesmo
 * parser é barato e garante duas coisas: estimativa textual que chegue por
 * outra rota não vira lixo numérico, e `0` não é estimativa — é declaração
 * vazia, e declaração vazia não encolhe carga.
 */
function estimateOf(task: MissionTask): number | null {
    return parseMinutes(task.estimate);
}

function isUnestimated(task: MissionTask): boolean {
    return estimateOf(task) === null;
}

function sumEstimates(tasks: MissionTask[]): number {
    return tasks.reduce((sum, task) => sum + (estimateOf(task) ?? 0), 0);
}

/** Meia-noite UTC de um dia já validado. */
function dayAt(date: string): Date {
    return parseDay(date) as Date;
}

/**
 * Plano vazio para semana ilegível.
 *
 * `week` fora de `YYYY-Wnn` (ou `W53` inexistente) não tem janela: devolver sete
 * dias a partir de um chute seria inventar a semana. Zero em tudo, nenhum gap —
 * a ausência da janela já é a resposta, e um gap aqui culparia os dados por um
 * erro de chamada.
 */
function emptyWeekPlan(week: string, capacityMinutes: number): MissionPlanWeek {
    return {
        week,
        start: '',
        end: '',
        days: [],
        capacityMinutes,
        plannedMinutes: 0,
        overflowMinutes: 0,
        peakDay: null,
        totals: {
            open: 0,
            scheduled: 0,
            dueInWindow: 0,
            unscheduled: 0,
            unestimated: 0,
            scheduledOutsideWeek: 0,
            withoutProject: 0,
            byStatus: {},
            byContext: [],
        },
        gaps: [],
    };
}

/** Contagem por status, do maior para o menor — a ordem não pode depender da ordem de entrada. */
function countByStatus(tasks: MissionTask[]): Record<string, number> {
    const counts = new Map<string, number>();
    for (const task of tasks) {
        const status = String(task.status ?? '').trim().toLowerCase();
        counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])));
}

/**
 * Carga por contexto. Tarefa com dois contextos conta nos dois: o contexto é
 * onde ela será executada, e ignorar o segundo esconderia metade da demanda.
 *
 * `minutes` soma só o que foi estimado; `count` mantém as sem estimativa
 * visíveis. Sem isso um contexto cheio de tarefas não estimadas apareceria como
 * "0 min", que é exatamente a mentira que esta camada existe para não contar.
 */
function contextLoad(tasks: MissionTask[]): MissionPlanContextLoad[] {
    const load = new Map<string, MissionPlanContextLoad>();
    for (const task of tasks) {
        for (const raw of task.contexts) {
            const context = String(raw ?? '').trim();
            if (!context) continue;
            const entry = load.get(context) ?? { context, count: 0, minutes: 0 };
            entry.count += 1;
            entry.minutes += estimateOf(task) ?? 0;
            load.set(context, entry);
        }
    }
    return [...load.values()].sort((a, b) => (b.minutes - a.minutes) || (b.count - a.count) || a.context.localeCompare(b.context));
}

/** Ordem de execução do dia: hora declarada primeiro, sem hora no topo, impacto desempata. */
function compareScheduled(a: MissionTask, b: MissionTask): number {
    const left = planSchedule(a);
    const right = planSchedule(b);
    if (left.time !== right.time) {
        if (!left.time) return -1;
        if (!right.time) return 1;
        return left.time < right.time ? -1 : 1;
    }
    const impact = (parseImpactScore(b.impact) ?? 0) - (parseImpactScore(a.impact) ?? 0);
    if (impact !== 0) return impact;
    return a.title.localeCompare(b.title);
}

/** Ordem do compromisso do dia: vencido, depois impacto, depois título. */
function compareDue(a: MissionTask, b: MissionTask): number {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
    const impact = (parseImpactScore(b.impact) ?? 0) - (parseImpactScore(a.impact) ?? 0);
    if (impact !== 0) return impact;
    return a.title.localeCompare(b.title);
}

/**
 * Monta o plano da semana: dias, carga, totais e os gaps que os números
 * sustentam.
 *
 * `capacityMinutes` não positivo cai no padrão em vez de zerar: uma capacidade
 * zero faria todo dia aparecer sobrecarregado, trocando um parâmetro inválido
 * por um diagnóstico falso.
 */
export function buildWeekPlan(
    tasks: MissionTask[],
    week: string,
    today: string,
    capacityMinutes: number = DEFAULT_DAY_CAPACITY_MINUTES,
): MissionPlanWeek {
    const capacity = Number.isFinite(capacityMinutes) && capacityMinutes > 0
        ? Math.round(capacityMinutes)
        : DEFAULT_DAY_CAPACITY_MINUTES;

    const bounds = weekBounds(week);
    if (!bounds) return emptyWeekPlan(week, capacity);

    const open = tasks.filter(task => !isTerminalStatus(task.status));
    const inWindow = (date: string) => !!date && date >= bounds.start && date <= bounds.end;
    const weekTasks = open.filter(task => task.week === week);

    const days: MissionPlanDay[] = [];
    for (let offset = 0; offset < 7; offset++) {
        const date = isoDay(shiftDay(dayAt(bounds.start), offset));
        const dayDate = dayAt(date);
        const scheduled = open.filter(task => planSchedule(task).date === date).sort(compareScheduled);
        const due = open.filter(task => String(task.due ?? '').slice(0, 10) === date).sort(compareDue);
        days.push({
            date,
            label: dayLabel(dayDate),
            weekday: weekdayOf(dayDate),
            isToday: date === today,
            // Sem `today` legível nada é declarado passado: a ausência não vira acusação.
            isPast: !!today && date < today,
            scheduled,
            due,
            minutes: sumEstimates(scheduled),
            unestimated: scheduled.filter(isUnestimated).length,
        });
    }

    const plannedMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
    const overflowMinutes = days.reduce((sum, day) => sum + Math.max(0, day.minutes - capacity), 0);
    const overloaded = days.filter(day => day.minutes > capacity);
    // Pico só existe se alguém estimou algo; um pico de 0 min seria um dado inventado.
    const peak = days.reduce<MissionPlanDay | null>(
        (best, day) => (day.minutes > 0 && (!best || day.minutes > best.minutes) ? day : best),
        null,
    );

    const totals = {
        open: weekTasks.length,
        scheduled: open.filter(task => inWindow(planSchedule(task).date)).length,
        dueInWindow: open.filter(task => inWindow(String(task.due ?? '').slice(0, 10))).length,
        unscheduled: weekTasks.filter(task => !planSchedule(task).date).length,
        unestimated: weekTasks.filter(isUnestimated).length,
        scheduledOutsideWeek: weekTasks.filter(task => agendadaForaDaSemana(planSchedule(task).date, bounds.start, bounds.end)).length,
        withoutProject: weekTasks.filter(task => task.projects.length === 0).length,
        byStatus: countByStatus(weekTasks),
        byContext: contextLoad(weekTasks),
    };

    const gaps: MissionPlanGap[] = [];
    // Ids estáveis e ordem fixa: a UI pode reordenar, o teste pode travar, e um
    // gap novo entra aqui sem renomear os antigos.
    const pastIntentions = open.filter(task => task.scheduledPast);
    if (pastIntentions.length > 0) {
        gaps.push({
            id: 'intencao-vencida',
            label: 'Intenção vencida',
            severity: 'warning',
            detail: `${plural(pastIntentions.length, 'tarefa agendada para um dia que já passou', 'tarefas agendadas para dias que já passaram')} e ainda aberta${pastIntentions.length === 1 ? '' : 's'}`,
        });
    }
    if (totals.scheduled === 0) {
        gaps.push({
            id: 'semana-sem-intencao',
            label: 'Semana sem intenção',
            severity: 'warning',
            detail: `Nenhuma tarefa agendada entre ${shortDate(bounds.start)} e ${shortDate(bounds.end)} — a semana não tem plano declarado`,
        });
    }
    if (totals.scheduledOutsideWeek > 0) {
        gaps.push({
            id: 'agendada-fora-da-semana',
            label: 'Agendada fora da semana',
            severity: 'warning',
            detail: `${plural(totals.scheduledOutsideWeek, 'tarefa desta semana está agendada', 'tarefas desta semana estão agendadas')} fora de ${shortDate(bounds.start)} a ${shortDate(bounds.end)}`,
        });
    }
    if (overloaded.length > 0) {
        gaps.push({
            id: 'dia-sobrecarregado',
            label: 'Dia sobrecarregado',
            severity: 'warning',
            detail: `${plural(overloaded.length, 'dia acima de', 'dias acima de')} ${capacity} min de foco; pior: ${peak ? `${peak.label} com ${peak.minutes} min` : ''}`,
        });
    }
    // O dia útil vazio mora em conferenciasDoPlano (02/11): a Missão lê a mesma conta.
    const vazios = new Set(diasUteisVazios(days.map(day => day.date), new Set(days.filter(day => day.scheduled.length > 0).map(day => day.date))));
    const emptyWeekdays = days.filter(day => vazios.has(day.date));
    if (emptyWeekdays.length > 0) {
        gaps.push({
            id: 'dia-vazio',
            label: 'Dia útil vazio',
            severity: 'info',
            detail: `${plural(emptyWeekdays.length, 'dia útil sem nada agendado', 'dias úteis sem nada agendado')}: ${emptyWeekdays.map(day => day.label).join(', ')}`,
        });
    }
    if (totals.unestimated > 0) {
        gaps.push({
            id: 'sem-estimativa',
            label: 'Sem estimativa',
            severity: 'info',
            detail: `${plural(totals.unestimated, 'tarefa da semana sem estimativa', 'tarefas da semana sem estimativa')} — a carga planejada é um piso, não o total`,
        });
    }
    const overdue = open.filter(task => task.overdue);
    if (overdue.length > 0) {
        gaps.push({
            id: 'prazo-vencido',
            label: 'Prazo vencido',
            severity: 'warning',
            detail: `${plural(overdue.length, 'tarefa aberta com prazo vencido', 'tarefas abertas com prazo vencido')}`,
        });
    }
    if (totals.withoutProject > 0) {
        gaps.push({
            id: 'sem-projeto',
            label: 'Sem projeto',
            severity: 'info',
            detail: `${plural(totals.withoutProject, 'tarefa da semana sem projeto', 'tarefas da semana sem projeto')}`,
        });
    }

    return {
        week,
        start: bounds.start,
        end: bounds.end,
        days,
        capacityMinutes: capacity,
        plannedMinutes,
        overflowMinutes,
        peakDay: peak ? { date: peak.date, minutes: peak.minutes } : null,
        totals,
        gaps,
    };
}

/* ==========================================================================
   Matriz DFM de Ação
   ========================================================================== */

export interface MissionMatrixCell {
    id: 'agora' | 'agendar' | 'rapido' | 'soltar' | 'sem-impacto';
    label: string;
    hint: string;
    tasks: MissionTask[];
}

/** Filtro canônico da view: só o que está na mesa. Capturado ainda não é decisão. */
const EXECUTABLE_STATUSES = ['next-action', 'in-progress'];

/** Meta-mãe do fluxo da semana. Origina blocos atômicos; não é item de matriz. */
const SMART_TYPE = 'tarefa_smart';

/**
 * Células na ordem em que a view canônica as desenha: por faixa de impacto
 * (alto, baixo, classificar) e, dentro da faixa, urgente antes de não urgente.
 * `hideEmptyColumns: false` no `.base`: a célula vazia é informação — ela diz
 * onde não há nada, e sumir com ela esconderia o quadrante negligenciado.
 */
const MATRIX_CELLS: ReadonlyArray<Omit<MissionMatrixCell, 'tasks'>> = [
    { id: 'agora', label: 'Fazer agora', hint: 'urgente e alto impacto — é o que o dia protege primeiro' },
    { id: 'agendar', label: 'Agendar bloco', hint: 'importa e não é urgente — bloco reservado, não sobra de agenda' },
    { id: 'rapido', label: 'Resolver rápido', hint: 'urgente e baixo impacto — resolve agora e sai da frente' },
    { id: 'soltar', label: 'Soltar ou agrupar', hint: 'nem urgente nem alto impacto — só entra com sobra declarada' },
    { id: 'sem-impacto', label: 'Classificar impacto', hint: 'impacto não declarado — classificar antes de priorizar' },
];

/**
 * Sinal de prazo da view da Matriz DFM (`TaskNotes/Views/matriz-dfm.base`, aposentada em 02/11/2026,
 * fórmula `dueSignal`): vencido conta os dias atrasados, hoje fala por si, até
 * três dias avisa, e além disso o prazo não é sinal — só data.
 *
 * O texto sai sem emoji: o glifo de alerta é pintura do painel. O motor entrega
 * o número e a leitura; quem desenha escolhe o ícone do tema.
 */
export function dueSignal(due: string, today: string): { days: number | null; label: string; late: boolean } {
    // `due` pode chegar com hora (`2026-09-14T18:00`); o sinal é de dia inteiro.
    const days = daysBetween(today, String(due ?? '').slice(0, 10));
    if (days === null) return { days: null, label: '', late: false };
    if (days < 0) return { days, label: `${-days}d atrasada`, late: true };
    if (days === 0) return { days, label: 'hoje', late: false };
    if (days <= 3) return { days, label: `${days}d`, late: false };
    return { days, label: '', late: false };
}

/**
 * Matriz DFM de Ação — urgência × impacto.
 *
 * Espelha `TaskNotes/Views/matriz-dfm.base` (aposentada em 02/11/2026; a regra ficou aqui), que era a fonte da verdade da
 * triagem: lá, urgência é **apenas** `priority` (`high` marca a coluna urgente)
 * e o eixo de impacto separa alto (`impacto >= 7`), baixo e "classificar
 * impacto" (impacto vazio). Prazo não entra na urgência: quem declara urgência
 * é o operador na triagem, e reclassificar por `due` reescreveria a decisão do operador.
 *
 * O filtro da view é aplicado aqui nas três cláusulas que o `MissionTask`
 * carrega: status executável, não arquivada e `type != "tarefa_smart"`. As
 * demais (`hasTag("task")`, dentro de `TaskNotes/Tasks`) já são garantidas pelo
 * coletor que monta a tarefa, e a cláusula de `blockedBy` não é reproduzida
 * porque o tipo não carrega dependência — declarado para não parecer
 * esquecimento.
 *
 * Arquivada e SMART-mãe ficam fora porque não são ação de matriz: a primeira
 * saiu da mesa, a segunda é meta e aparece no plano como origem dos blocos.
 * Nota antiga sem `type` chega como `task` — o coletor normaliza, e tratar
 * ausência como "não executável" sumiria com tarefa real do operador.
 */
export function buildPriorityMatrix(tasks: MissionTask[]): MissionMatrixCell[] {
    const cells = MATRIX_CELLS.map(spec => ({ ...spec, tasks: [] as MissionTask[] }));
    const byId = new Map(cells.map(cell => [cell.id, cell]));

    for (const task of tasks) {
        if (isTerminalStatus(task.status)) continue;
        if (task.archived === true) continue;
        if (String(task.type ?? '').trim().toLowerCase() === SMART_TYPE) continue;
        if (!EXECUTABLE_STATUSES.includes(String(task.status ?? '').trim().toLowerCase())) continue;

        const urgent = isUrgentPriority(task.priority);
        const impact = parseImpactScore(task.impact);
        // Impacto ausente não é "baixo impacto": sem número, a triagem ainda não
        // aconteceu, e jogar a tarefa em "soltar" a enterraria por omissão.
        const quadrant: MissionMatrixCell['id'] = impact === null
            ? 'sem-impacto'
            : isHighImpact(impact)
                ? (urgent ? 'agora' : 'agendar')
                : (urgent ? 'rapido' : 'soltar');
        (byId.get(quadrant) as MissionMatrixCell).tasks.push(task);
    }

    for (const cell of cells) {
        // Mesma ordem do quadro: vencido, vence hoje, impacto, título. Console e
        // matriz não podem discordar sobre quem vem primeiro.
        cell.tasks.sort((a, b) => {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
            if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
            const impact = (parseImpactScore(b.impact) ?? 0) - (parseImpactScore(a.impact) ?? 0);
            if (impact !== 0) return impact;
            return a.title.localeCompare(b.title);
        });
    }

    return cells;
}

/**
 * Urgência declarada. `urgent` é alias tolerado porque o catálogo do TaskNotes
 * aceita os dois textos e uma tarefa escrita à mão não pode virar "não urgente"
 * por causa de uma letra.
 */
function isUrgentPriority(raw: unknown): boolean {
    const value = Array.isArray(raw) ? raw[0] : raw;
    return String(value ?? '').trim().toLowerCase() === 'high'
        || String(value ?? '').trim().toLowerCase() === 'urgent';
}

/* ==========================================================================
   Timeline — da intenção ao prazo
   ========================================================================== */

export interface MissionTimelineEntry {
    task: MissionTask;
    /** `scheduledDate`: quando o autor decidiu executar. */
    start: string;
    /** `due`: quando o mundo cobra. */
    end: string;
    /** Dias entre intenção e prazo; negativo quando o plano está invertido. */
    slackDays: number | null;
    state: 'folga' | 'no-dia' | 'invertida' | 'atrasada' | 'sem-prazo' | 'sem-agenda';
}

/**
 * Estado da barra entre intenção e prazo.
 *
 * `invertida` vem antes de qualquer outra leitura: agendar depois do prazo é um
 * plano declarado impossível. Tratar isso como "atrasada" esconderia o erro do
 * autor atrás de uma consequência.
 */
function timelineState(task: MissionTask, start: string, end: string, today: string): MissionTimelineEntry['state'] {
    if (!start) return 'sem-agenda';
    if (!end) return 'sem-prazo';
    if (start > end) return 'invertida';
    if (today && end < today) return 'atrasada';
    return start === end ? 'no-dia' : 'folga';
}

/** Quem declarou dia vem primeiro, em ordem cronológica; sem agenda vai para o fim. */
function compareTimeline(a: MissionTimelineEntry, b: MissionTimelineEntry): number {
    if (!a.start || !b.start) {
        if (!a.start && !b.start) return a.task.title.localeCompare(b.task.title);
        return a.start ? -1 : 1;
    }
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    if (a.end !== b.end) {
        if (!a.end) return 1;
        if (!b.end) return -1;
        return a.end < b.end ? -1 : 1;
    }
    const impact = (parseImpactScore(b.task.impact) ?? 0) - (parseImpactScore(a.task.impact) ?? 0);
    if (impact !== 0) return impact;
    return a.task.title.localeCompare(b.task.title);
}

/**
 * Timeline do plano aberto: cada tarefa como barra do dia agendado ao prazo.
 *
 * `slackDays` negativo é a folga invertida, entregue como está — aparar para
 * zero apagaria a única evidência de que a intenção e o prazo se contradizem.
 */
export function buildTimeline(tasks: MissionTask[], today: string): MissionTimelineEntry[] {
    const entries: MissionTimelineEntry[] = [];
    for (const task of tasks) {
        if (isTerminalStatus(task.status)) continue;
        const start = planSchedule(task).date;
        const end = String(task.due ?? '').slice(0, 10);
        entries.push({
            task,
            start,
            end,
            slackDays: start && end ? daysBetween(start, end) : null,
            state: timelineState(task, start, end, today),
        });
    }
    return entries.sort(compareTimeline);
}

/* ==========================================================================
   Radar do trimestre
   ========================================================================== */

export interface MissionQuarterWeek {
    week: string;
    start: string;
    end: string;
    state: 'passada' | 'corrente' | 'futura';
    openTasks: number;
    minutes: number;
    hasNote: boolean;
}

/** `2026-Q3` -> primeiro e último dia do trimestre civil, ou `null`. */
function quarterRange(quarter: string): { start: string; end: string } | null {
    const p = partesDoTrimestre(String(quarter ?? '').trim());
    if (!p) return null;
    const year = p.ano;
    const firstMonth = (p.trimestre - 1) * 3 + 1;
    const start = new Date(Date.UTC(year, firstMonth - 1, 1));
    // Dia 0 do mês seguinte ao último do trimestre = último dia do trimestre.
    const end = new Date(Date.UTC(year, firstMonth + 2, 0));
    return { start: isoDay(start), end: isoDay(end) };
}

/**
 * Radar do trimestre: as semanas ISO que o trimestre **toca**, da semana do
 * primeiro dia à semana do último, com a carga declarada de cada uma e se existe
 * nota Week para ela.
 *
 * O trimestre civil começa no dia 1, que quase nunca é segunda: as semanas das
 * pontas entram inteiras, ainda que o trimestre só ocupe parte delas. É por isso
 * que a contagem é 13 quando o trimestre começa numa segunda e 14 em qualquer
 * outro caso — fatiar o calendário em semanas não dá um número redondo, e
 * forçar 13 esconderia dias de um trimestre real.
 *
 * `weeksWithNotes` é a única informação que este motor não tem como derivar das
 * tarefas: sem ela, `hasNote` é `false` — ausência de nota declarada, não prova
 * de que a semana ficou sem review.
 */
export function buildQuarterRadar(
    tasks: MissionTask[],
    quarter: string,
    today: string,
    weeksWithNotes: string[] = [],
): MissionQuarterWeek[] {
    const range = quarterRange(quarter);
    if (!range) return [];

    const open = tasks.filter(task => !isTerminalStatus(task.status));
    const notes = new Set((weeksWithNotes ?? []).map(week => String(week).trim()).filter(Boolean));
    const current = weekOf(today);
    const last = weekOf(range.end);

    const weeks: MissionQuarterWeek[] = [];
    // Ids ISO são zero-padded, então comparar como texto é comparar no tempo.
    for (let cursor = weekOf(range.start); cursor && cursor <= last; cursor = nextWeek(cursor)) {
        // Trava de segurança: um trimestre toca no máximo 14 semanas. O teto só
        // existe para que uma aritmética de calendário quebrada não vire laço infinito.
        if (weeks.length > 60) break;
        const bounds = weekBounds(cursor);
        if (!bounds) break;
        const weekTasks = open.filter(task => task.week === cursor);
        weeks.push({
            week: cursor,
            start: bounds.start,
            end: bounds.end,
            // Sem `today` legível não há semana corrente para comparar: toda
            // semana sai como futura, que é o estado neutro — declarar passado
            // sem data seria afirmar o que não se sabe.
            state: !current ? 'futura' : cursor < current ? 'passada' : cursor === current ? 'corrente' : 'futura',
            openTasks: weekTasks.length,
            minutes: sumEstimates(weekTasks),
            hasNote: notes.has(cursor),
        });
    }
    return weeks;
}
