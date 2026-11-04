/**
 * A forma de mostrar (arquitetura universal de 19/10, seção 2.2), numa função só.
 *
 * Os mesmos rótulos, na mesma ordem, em todo lugar onde há números:
 * **feitas · do plano · faltam · fora do plano · algum dia**. O zerado não aparece;
 * sem porcentagem e sem medalha. Os estados são os da seção 3.3: cancelada é neutra
 * (não conta em nada), "algum dia" fica à parte, feita sem ter estado no horizonte é
 * "fora do plano".
 *
 * Quem mostra números escolhe só as unidades e o horizonte; a conta e o texto saem
 * daqui (plano da Fase B, 22/10/2026). Os horizontes:
 * - **de trabalho** (`workHorizon`): a SMART (as ações dela) e o projeto (as SMART e
 *   as ações dele no trimestre). A aberta é do plano; a feita é do plano quando
 *   esteve num horizonte (`week` ou `scheduled`; com período, dentro dele) e é fora do
 *   plano quando foi feita sem ele (com período, concluída dentro dele);
 * - **de tempo** (`timeHorizon`): a semana (`week`), o dia (`scheduled`) e o trimestre
 *   (as semanas dele). É do plano o que tem o horizonte no período (`week` numa das
 *   semanas, ou `scheduled` numa das datas); é fora do plano a feita no período
 *   (`completedDate`) sem ter estado nele.
 * Nos dois, `feitas` = do plano feitas + fora do plano.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/showGrammar.test.ts.
 */

/** O que uma unidade (a TaskNote, 3.1) precisa para entrar na conta. */
export interface GrammarUnit {
    status?: string;
    week?: string;
    scheduled?: string;
    /** `AAAA-MM-DD`; só os horizontes de tempo (e o projeto no trimestre) a leem. */
    completedDate?: string;
}

export interface GrammarCounts {
    feitas: number;
    planoFeitas: number;
    plano: number;
    faltam: number;
    fora: number;
    algumDia: number;
}

/** As semanas (`AAAA-Www`) e as datas (`AAAA-MM-DD`) de um período. */
export interface GrammarPeriod {
    weeks: readonly string[];
    dates: readonly string[];
}

/**
 * O horizonte da conta. `trabalho`: a aberta é do plano (a SMART, o projeto); `tempo`:
 * só o que tem o horizonte no período (a semana, o dia, o trimestre). Sem período, o
 * horizonte de trabalho não tem janela (a SMART).
 */
export interface GrammarHorizon {
    kind: 'trabalho' | 'tempo';
    period: GrammarPeriod | null;
}

/** O que faz: o horizonte de trabalho; com `period`, a feita só conta dentro dele (o projeto no trimestre). */
export function workHorizon(period: GrammarPeriod | null = null): GrammarHorizon {
    return { kind: 'trabalho', period };
}

/** O que faz: o horizonte de tempo de um período (a semana, o dia, o trimestre). */
export function timeHorizon(period: GrammarPeriod): GrammarHorizon {
    return { kind: 'tempo', period };
}

/** A SMART: as ações dela, sem janela de tempo (a regra do cartão desde 19/10). */
export const SMART_HORIZON: GrammarHorizon = workHorizon(null);

const DONE = new Set(['done', 'completed', 'complete']);
const CANCELLED = new Set(['cancelled', 'canceled']);

/**
 * O que faz: conta as unidades de um horizonte nos rótulos da forma de mostrar.
 * Por quê: uma conta só em toda escala (2.2 e 3.3); cada lugar que mostra números
 * passa as unidades e o horizonte, e nenhum monta "x/y" por conta própria.
 * Entra → sai: unidades e horizonte → contagens (a entrada não é mutada).
 * Erro e ataque: status em maiúsculas ou ausente, campos ausentes e período vazio não
 * quebram (unidade sem horizonte num período de tempo fica de fora).
 * Prova: tests/engine/showGrammar.test.ts e tests/canvas/taskCardModel.test.ts
 * ("gramática de mostrar", a regra da SMART, que não muda).
 */
export function grammarCounts(units: readonly GrammarUnit[], horizon: GrammarHorizon = SMART_HORIZON): GrammarCounts {
    const period = horizon.period;
    const weeks = new Set(period?.weeks ?? []);
    const dates = new Set(period?.dates ?? []);
    const inPeriod = (u: GrammarUnit) => (!!u.week && weeks.has(String(u.week))) || (!!u.scheduled && dates.has(String(u.scheduled)));
    const hadHorizon = (u: GrammarUnit) => !!(u.week || u.scheduled);
    /** Do plano? A aberta, no horizonte de trabalho, sempre é. */
    const planned = (u: GrammarUnit, done: boolean) => {
        if (horizon.kind === 'trabalho' && !done) return true;
        if (horizon.kind === 'trabalho' && !period) return hadHorizon(u);
        return inPeriod(u);
    };
    /** Feita fora do plano: sem período, qualquer uma; com período, concluída dentro dele. */
    const doneWithin = (u: GrammarUnit) => !period || (!!u.completedDate && dates.has(String(u.completedDate).slice(0, 10)));

    let feitas = 0, planoFeitas = 0, plano = 0, fora = 0, algumDia = 0;
    for (const unit of units || []) {
        if (!unit) continue;
        const status = String(unit.status ?? '').toLowerCase();
        if (CANCELLED.has(status)) continue;
        if (status === 'someday') { if (planned(unit, false)) algumDia++; continue; }
        if (DONE.has(status)) {
            if (planned(unit, true)) { feitas++; planoFeitas++; plano++; }
            else if (doneWithin(unit)) { feitas++; fora++; }
            continue;
        }
        if (planned(unit, false)) plano++;
    }
    return { feitas, planoFeitas, plano, faltam: plano - planoFeitas, fora, algumDia };
}

/**
 * O que faz: a linha da forma de mostrar: "3 feitas · 3/5 do plano · faltam 2 ·
 * +4 fora do plano · +1 algum dia". O que está zerado não aparece; a ordem e os
 * rótulos não mudam. Sem nada para contar, o texto de ausência (`empty`, "sem ações"
 * no cartão da SMART): ausência não é zero.
 * Prova: tests/engine/showGrammar.test.ts.
 */
export function grammarText(c: GrammarCounts, empty = 'sem ações'): string {
    if (c.feitas === 0 && c.plano === 0 && c.algumDia === 0) return empty;
    const parts: string[] = [];
    if (c.feitas) parts.push(`${c.feitas} ${c.feitas === 1 ? 'feita' : 'feitas'}`);
    if (c.plano) parts.push(`${c.planoFeitas}/${c.plano} do plano`);
    if (c.faltam) parts.push(`faltam ${c.faltam}`);
    if (c.fora) parts.push(`+${c.fora} fora do plano`);
    if (c.algumDia) parts.push(`+${c.algumDia} algum dia`);
    return parts.join(' · ');
}

export interface ShownGrammar {
    counts: GrammarCounts;
    /** A linha; sem nada para contar, o texto de ausência. */
    text: string;
    /** Há algo para mostrar? (`false` = o texto é o de ausência.) */
    shown: boolean;
}

/**
 * O que faz: a forma de mostrar de um horizonte: a conta e a linha, de uma vez.
 * Por quê: a função única da Fase B; cartão da SMART, canvas do trimestre, da semana
 * e do projeto, painel e Week chamam esta (ou `grammarText`, quando a conta não vem
 * de unidades, como a meta das exposições).
 * Entra → sai: unidades, horizonte e o texto de ausência → { counts, text, shown }.
 * Prova: tests/engine/showGrammar.test.ts.
 */
export function showGrammar(units: readonly GrammarUnit[], horizon: GrammarHorizon = SMART_HORIZON, empty = 'sem ações'): ShownGrammar {
    const counts = grammarCounts(units, horizon);
    const shown = counts.feitas > 0 || counts.plano > 0 || counts.algumDia > 0;
    return { counts, text: grammarText(counts, empty), shown };
}

/** As três contagens do ECH que a linha mostra (`contarEch`, `ech.ts`). */
export interface EchCounts {
    entraram: number;
    organizadas: number;
    soltas: number;
    resolvidas: number;
    abertas: number;
    atritos: number;
    dias: number;
}

/** O texto de ausência da linha do ECH: ausência não é zero. */
export const ECH_EMPTY = 'sem registro no período';

/**
 * O que faz: a linha do ECH de um período, na forma de mostrar: "entraram 23 · organizadas
 * 15, soltas 8 · 3 resolvidas, 1 aberta · 2 atritos · 4 dias com registro e tarefa feita".
 * O zerado não aparece; sem porcentagem, sem meta e sem nota. Sem nada para contar, o
 * texto de ausência (`empty`).
 * Por quê: as três contagens do 012, §3 (o que entrou · quanto disso foi organizado e
 * ligado · o que está em harmonia e o que está aberto), pela mesma função de mostrar dos
 * outros números, sem multiplicar um fator pelo outro (29/10/2026).
 * Entra → sai: as contagens e o texto de ausência → a linha.
 * Erro e ataque: número ausente, negativo ou não número vale 0 e some da linha.
 * Prova: tests/engine/ech.test.ts ("a linha").
 */
export function echText(c: Partial<EchCounts>, empty = ECH_EMPTY): string {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const um = (v: number, singular: string, plural: string) => (v === 1 ? singular : plural);
    const entraram = n(c?.entraram), organizadas = n(c?.organizadas), soltas = n(c?.soltas);
    const resolvidas = n(c?.resolvidas), abertas = n(c?.abertas), atritos = n(c?.atritos), dias = n(c?.dias);
    const parts: string[] = [];
    if (entraram) parts.push(`${um(entraram, 'entrou', 'entraram')} ${entraram}`);
    const lugar: string[] = [];
    if (organizadas) lugar.push(`${um(organizadas, 'organizada', 'organizadas')} ${organizadas}`);
    if (soltas) lugar.push(`${um(soltas, 'solta', 'soltas')} ${soltas}`);
    if (lugar.length) parts.push(lugar.join(', '));
    const contradicoes: string[] = [];
    if (resolvidas) contradicoes.push(`${resolvidas} ${um(resolvidas, 'resolvida', 'resolvidas')}`);
    if (abertas) contradicoes.push(`${abertas} ${um(abertas, 'aberta', 'abertas')}`);
    if (contradicoes.length) parts.push(contradicoes.join(', '));
    if (atritos) parts.push(`${atritos} ${um(atritos, 'atrito', 'atritos')}`);
    if (dias) parts.push(`${dias} ${um(dias, 'dia', 'dias')} com registro e tarefa feita`);
    return parts.length ? parts.join(' · ') : empty;
}

/** O que faz: as contagens da linha a partir da conta do ECH (`contarEch`). */
export function echCountsOf(c: { expansao: { total: number }; complexidade: { organizado: number; solto: number }; harmonia: { resolvidas: number; abertas: number; atritos: number; diasFluidos: number } }): EchCounts {
    return {
        entraram: c.expansao.total, organizadas: c.complexidade.organizado, soltas: c.complexidade.solto,
        resolvidas: c.harmonia.resolvidas, abertas: c.harmonia.abertas, atritos: c.harmonia.atritos, dias: c.harmonia.diasFluidos,
    };
}
