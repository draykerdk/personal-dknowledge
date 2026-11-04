/**
 * Os marcadores de um modelo (`{{nome}}`, `{{date:FMT}}`, `{{targetweek:FMT}}`,
 * `{{weekday:VAR:N:FMT}}`…), resolvidos num lugar só.
 *
 * Por quê: o protocolo (`JSONProtocol.processTemplate` e `processProperties`) e o
 * reparo das notas de período criadas pelo Calendar ou pelo Periodic Notes
 * (`temporal/periodNoteRepair.ts`, 27/10/2026) precisam dar o mesmo texto para o
 * mesmo modelo. Antes, as regras viviam só dentro da classe do protocolo, presas à
 * nota ativa; agora a classe monta o relógio (`TokenClock`) e chama estas funções,
 * e o reparo monta o relógio da nota de período e chama as mesmas.
 *
 * Módulo puro: sem Obsidian e sem `window`. O moment chega como argumento.
 */
import { ehSemana, ehTrimestre } from './periodo';

/** O pedaço do moment que os marcadores usam. */
export interface DateValue {
    format(format?: string): string;
    clone(): DateValue;
    add(amount: number, unit: string): DateValue;
    subtract(amount: number, unit: string): DateValue;
    startOf(unit: string): DateValue;
    isoWeekday(): number;
    isValid(): boolean;
}

/** `moment(texto, formato, estrito)`. */
export type DateFactory = (input?: string, format?: string, strict?: boolean) => DateValue;

/**
 * As datas de uma renderização. `context` é lida uma vez; as outras são funções,
 * chamadas só quando o marcador aparece (como sempre foi no protocolo).
 */
export interface TokenClock {
    /** A data de contexto: `{{date}}`, `{{tomorrow}}`, `{{yesterday}}`. */
    context: DateValue;
    /** A semana sendo planejada: `{{planweek}}`. */
    planWeek: () => DateValue;
    /** A semana-alvo: `{{targetweek}}`. */
    targetWeek: () => DateValue;
    /** O trimestre-alvo: `{{targetquarter}}`. */
    targetQuarter: () => DateValue;
    /** O relógio de verdade: `{{hoje}}`, `{{amanha}}`. */
    now: () => DateValue;
    /** A segunda-feira da semana guardada na variável (`{{weekday:VAR:N:FMT}}`). */
    weekStartOf: (variableName: string) => DateValue;
}


/** Escapa um texto para entrar numa expressão regular. */
function escapeRegExp(value: string): string {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * O que faz: a semana sendo planejada a partir da data de contexto: sex/sáb/dom → a
 * segunda-feira da próxima semana ISO; seg–qui → a própria data.
 * Por quê: o review fecha a semana atual e o planejamento mira a que vem (`{{planweek}}`).
 */
export function planWeekStart(context: DateValue): DateValue {
    if (context.isoWeekday() >= 5) return context.clone().add(1, 'week').startOf('isoWeek');
    return context.clone();
}

/**
 * O que faz: a semana-alvo de `{{targetweek:FMT}}` (a segunda-feira dela).
 * Por quê: sai da nota semanal aberta (`_active_basename`), mais `_semana_offset`; a
 * nova rodada do mesmo protocolo fixa a semana em `_target_week_pin`. Fora da nota
 * semanal e sem deslocamento, vale a semana sendo planejada; com deslocamento, soma à
 * semana da data de contexto (no domingo da W42, a planweek já é a W43).
 * Entra → sai: as variáveis da rodada, a data de contexto e a semana planejada (como
 * funções, lidas só quando precisa) e o moment → a segunda-feira da semana-alvo.
 */
export function targetWeekStart(
    variables: Record<string, unknown> | null | undefined,
    context: () => DateValue,
    planWeek: () => DateValue,
    parse: DateFactory,
): DateValue {
    const pin = String(variables?._target_week_pin ?? '');
    if (ehSemana(pin)) {
        const pinned = parse(pin, 'GGGG-[W]WW', true);
        if (pinned?.isValid?.()) return pinned.startOf('isoWeek');
    }
    const offset = Number(variables?._semana_offset ?? 0) || 0;
    const basename = String(variables?._active_basename || '');
    const base = ehSemana(basename)
        ? parse(basename, 'GGGG-[W]WW', true).startOf('isoWeek')
        : offset
            ? context().clone().startOf('isoWeek')
            : planWeek();
    if (!base || !base.isValid || !base.isValid()) return planWeek();
    return offset ? base.clone().add(offset, 'week').startOf('isoWeek') : base.clone();
}


/**
 * O que faz: o trimestre-alvo de `{{targetquarter:FMT}}` (um dia dele): o trimestre fixado
 * em `_target_quarter_pin` (o dia 1 dele) ou a data de contexto, mais `_trimestre_offset`
 * trimestres (o dia 1 do trimestre deslocado).
 * Por quê: a revisão que fecha o 2026-Q4 abre o planejamento do 2027-Q1 (pino = o trimestre
 * fechado, deslocamento 1), e o "Iniciar planejamento de <Q>" do painel abre o 🧭 de <Q>
 * (pino = <Q>). Sem o pino, o alvo vinha só da nota aberta: depois de salvar a revisão,
 * a nota aberta é a dela, e o "+1" saía do dia de hoje (proposta de 27/10, 4.4).
 * Entra → sai: as variáveis da rodada, a data de contexto (função) e o moment → a data.
 * Erro e ataque: pino fora de `AAAA-Qn` ou inválido é ignorado; deslocamento que não é
 * número vale 0.
 * Prova: tests/engine/trimestrePadrao.test.ts ("targetQuarterStart").
 */
export function targetQuarterStart(
    variables: Record<string, unknown> | null | undefined,
    context: () => DateValue,
    parse: DateFactory,
): DateValue {
    const offset = Number(variables?._trimestre_offset ?? 0) || 0;
    const pin = String(variables?._target_quarter_pin ?? '');
    const pinned = ehTrimestre(pin) ? parse(pin, 'YYYY-[Q]Q', true) : null;
    const base = pinned && pinned.isValid() ? pinned.clone().startOf('quarter') : context().clone();
    return offset ? base.clone().add(offset * 3, 'months').startOf('quarter') : base;
}

/**
 * O que faz: a segunda-feira da semana `AAAA-Www` em `raw`; vazio ou inválido → a
 * semana sendo planejada (a regra de `{{weekday:VAR:N:FMT}}`).
 */
export function weekStartFromValue(raw: unknown, parse: DateFactory, planWeek: () => DateValue): DateValue {
    const text = raw === undefined || raw === null ? '' : String(raw);
    const fromValue = ehSemana(text) ? parse(text, 'GGGG-[W]WW', true) : null;
    return fromValue && fromValue.isValid() ? fromValue.startOf('isoWeek') : planWeek().clone().startOf('isoWeek');
}

/**
 * O que faz: `{{hoje:FMT}}` e `{{amanha:FMT}}`, o dia do relógio, não o de contexto.
 * Por quê: com a W43 aberta no domingo 18/10, `{{date}}` é a segunda 19/10; o "📅 Hoje"
 * do ⚡ mostrava 19/10 e gravava segunda-feira.
 */
export function resolveClockTokens(text: string, now: () => DateValue): string {
    return text
        .replace(/{{hoje:(.*?)}}/g, (_: string, format: string) => now().format(format))
        .replace(/{{amanha:(.*?)}}/g, (_: string, format: string) => now().add(1, 'days').format(format));
}

/**
 * O que faz: `{{weekday:VAR:N:FMT}}`, o dia N (1 = segunda … 7 = domingo) da semana
 * guardada em `VAR`.
 * Por quê: a pergunta "em que dia?" oferece os dias da semana da SMART escolhida, e o
 * trimestre de uma semana é o da quinta dela (`{{weekday:_target_week:4:YYYY-[Q]Q}}`).
 */
export function resolveWeekdayTokens(text: string, weekStartOf: (variableName: string) => DateValue): string {
    return text.replace(/{{weekday:([a-zA-Z0-9_]*):([1-7]):(.*?)}}/g, (_: string, key: string, n: string, format: string) =>
        weekStartOf(key).clone().add(Number(n) - 1, 'days').format(format));
}

/**
 * O que faz: todos os marcadores de data, na ordem de sempre: `date`, `tomorrow`,
 * `yesterday`, `hoje`, `amanha`, `planweek`, `targetweek`, `targetquarter`, `weekday`.
 * Só o marcador muda; o resto do texto fica igual.
 * Por quê: é a parte do modelo que depende do período, a mesma no protocolo e no
 * "Preencher os marcadores crus desta nota".
 * Prova: tests/engine/templateTokens.test.ts.
 */
export function resolveDateTokens(text: string, clock: TokenClock): string {
    let result = text;
    result = result.replace(/{{date:(.*?)}}/g, (_: string, format: string) => clock.context.format(format));
    result = result.replace(/{{tomorrow:(.*?)}}/g, (_: string, format: string) => clock.context.clone().add(1, 'days').format(format));
    result = result.replace(/{{yesterday:(.*?)}}/g, (_: string, format: string) => clock.context.clone().subtract(1, 'days').format(format));
    result = resolveClockTokens(result, clock.now);
    result = result.replace(/{{planweek:(.*?)}}/g, (_: string, format: string) => clock.planWeek().format(format));
    result = result.replace(/{{targetweek:(.*?)}}/g, (_: string, format: string) => clock.targetWeek().format(format));
    result = result.replace(/{{targetquarter:(.*?)}}/g, (_: string, format: string) => clock.targetQuarter().format(format));
    return resolveWeekdayTokens(result, clock.weekStartOf);
}

/**
 * O que faz: o modelo renderizado como o protocolo o grava: as variáveis da rodada
 * (`{{nome}}`), o colchete duplo legado, os marcadores de data e a limpeza final
 * (`[[ ]]` vira "Sem conexão contextual"; `{{nome}}` sem valor sai).
 * Por quê: um renderizador só para a nota que o protocolo cria e para a que o reparo
 * de período preenche (a W44 nascida crua pelo Calendar, 27/10/2026).
 * Entra → sai: o texto, as variáveis e o relógio → o texto renderizado. Texto que não
 * é string → "".
 * Erro e ataque: a resposta do operador pode trazer `$&`, `$'` ou `$1`; a substituição
 * usa função, então o texto entra literal.
 * Prova: tests/engine/templateTokens.test.ts e os testes do protocolo (processTemplate).
 */
export function renderTemplateTokens(template: unknown, variables: Record<string, unknown>, clock: TokenClock): string {
    if (typeof template !== 'string') return '';
    let result = template;
    // 1. As variáveis da rodada (`{{nome}}`).
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`{{${escapeRegExp(key)}}}`, 'g'), () => String(value));
    }
    // 2. Legado: `[[{{var}}]]` com a variável já em `[[Nota]]` vira `[[[[Nota]]]]`.
    result = result.replace(/\[\[\[\[(.*?)\]\]\]\]/g, '[[$1]]');
    // 3. Datas.
    result = resolveDateTokens(result, clock);
    // 4. Contexto vazio e marcador sem valor.
    result = result.replace(/\[\[\s*\]\]/g, 'Sem conexão contextual');
    result = result.replace(/{{[a-zA-Z0-9_]+}}/g, '');
    return result;
}
