/**
 * O que o cartão de tarefa mostra — módulo puro, testável sem Obsidian.
 *
 * O nó de tarefa da arquitetura universal (19/10, 4.7, aprovado) é uma instância da
 * unidade (3.1) e das duas gramáticas:
 * - **linha de cima:** a bolinha de concluir e o título;
 * - **linha do motivo:** os 2 pesos maiores da tarefa, da tabela única
 *   (`engine/decisionWeights.ts`, a reputação contextual);
 * - **linha da unidade:** o emoji do contexto, a estimativa, o prazo relativo e o
 *   status; o impacto vira a cor da borda;
 * - **ações ao passar o mouse:** 🤝 Fazer agora, ⏭️ Adiar, ↗️ Abrir; o resto no menu.
 *
 * A SMART troca a linha do motivo pela linha da gramática de mostrar das ações dela
 * ("3 feitas · 3/5 do plano · faltam 2", pela função única `engine/showGrammar.ts`) e o 🤝 Fazer agora abre o gesto com as ações
 * dela. Concluir a entrega é decisão da revisão: ela não tem bolinha.
 *
 * No celular o cartão só lê (`readOnly`): nada nele grava.
 */
import type { TaskRecord } from '../tasks/taskRecord';
import type { Papel } from '../engine/papeisDeProtocolo';
import { isoWeekOf } from '../engine/decisionWeights';
import { childProgress } from './taskColor';
import { SMART_HORIZON, grammarCounts, grammarText, showGrammar, type GrammarCounts, type GrammarUnit } from '../engine/showGrammar';
import {
    formatPoints,
    isClosedUnit,
    scoreTask,
    type DecisionContext,
    type TaskRelations,
    type TaskScore,
    type TaskUnit,
    type WeightReason,
    type WeightTable,
} from '../engine/decisionWeights';

export type CardTone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'muted';

/** A borda pelo impacto (1 a 10); `sem` quando a tarefa não tem impacto. */
export type ImpactLevel = 'alto' | 'medio' | 'baixo' | 'sem';

/**
 * O papel do gesto que o 🤝 Fazer agora abre (`fazer_agora`): o protocolo é o que a tabela
 * vigente dá (no cofre de origem, a versão paralela do 🤝); sem ele, o 🤝 não aparece.
 */
export const DO_NOW_PAPEL: Papel = 'fazer_agora';
/** O passo do gesto que escolhe a tarefa (a árvore do agora). */
export const DO_NOW_STEP = 'tarefa_agora';

export interface TaskCardModel {
    kind: 'smart' | 'acao';
    done: boolean;
    /** O cartão só lê (celular): nenhum botão que grava é desenhado. */
    readOnly: boolean;
    title: string;
    status: { key: string; label: string; tone: CardTone };
    /** Prazo (ou agendamento, quando não há prazo), em palavras relativas a hoje. */
    date: { label: string; tone: CardTone; title: string } | null;
    impacto: number | null;
    impactLevel: ImpactLevel;
    /** Os emojis dos contextos (onde dá para fazer); vazio sem contexto. */
    context: { label: string; title: string } | null;
    /** A estimativa (`timeEstimate`); `null` sem estimativa (ausência não é zero). */
    estimate: string | null;
    week: string;
    /** Linha do motivo: os 2 pesos maiores (só ação aberta); vazio = nenhum peso. */
    reasons: { label: string; title: string } | null;
    /** SMART: a linha da gramática de mostrar das ações dela. */
    grammar: string | null;
    progress: { done: number; total: number; pct: number } | null;
    focusMinutes: number;
    tracking: boolean;
    /** Peça do fluxo de criação: 🔥 ignição ou 📤 soltar; `null` quando não é peça. */
    peca: { mark: string; label: string; title: string } | null;
    /** Assinatura: o cartão só é redesenhado quando ela muda. */
    signature: string;
}

export const STATUS_VIEW: Record<string, { label: string; tone: CardTone }> = {
    inbox: { label: 'Inbox', tone: 'muted' },
    'next-action': { label: 'Próxima', tone: 'accent' },
    'in-progress': { label: 'Em curso', tone: 'warn' },
    'waiting-on': { label: 'Esperando', tone: 'warn' },
    someday: { label: 'Algum dia', tone: 'muted' },
    done: { label: 'Feita', tone: 'good' },
    cancelled: { label: 'Cancelada', tone: 'muted' },
};

/**
 * O que faz: um dia em palavras relativas a hoje: "hoje", "amanhã", "ontem",
 * "em 4 dias", "há 3 dias".
 * Por quê: o prazo relativo da linha da unidade (4.7); a data exata fica no título.
 * Erro e ataque: data inválida devolve o texto como veio (nunca "NaN dias").
 * Prova: tests/canvas/taskCardModel.test.ts ("prazo relativo").
 */
export function relativeDay(date: string, today: string): string {
    const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (!Number.isFinite(diff)) return date;
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`;
}

/** O que faz: minutos em texto curto: 25min, 1h, 1h30. */
export function minutesText(n: number): string {
    const h = Math.floor(n / 60), m = n % 60;
    return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`;
}

/**
 * O que faz: o nível da borda pelo impacto: 7 a 10 alto, 4 a 6 médio, 1 a 3 baixo.
 * Por quê: "o impacto vira a cor da borda" (4.7). O corte de 7 é o mesmo que já
 * destacava o impacto no cartão.
 */
export function impactLevelOf(impacto: number | null): ImpactLevel {
    if (impacto === null || !Number.isFinite(impacto)) return 'sem';
    if (impacto >= 7) return 'alto';
    if (impacto >= 4) return 'medio';
    return 'baixo';
}

/** O que faz: os emojis dos contextos (`"💻 Computador"` → `💻`), com os nomes no título. */
export function contextView(contexts: readonly string[] | undefined): TaskCardModel['context'] {
    const list = (contexts ?? []).map(c => String(c).trim()).filter(Boolean);
    if (!list.length) return null;
    const marks = list.map(c => c.split(/\s+/)[0]);
    return { label: marks.join(''), title: `Onde dá para fazer: ${list.join(', ')}` };
}

/**
 * O que faz: a linha do motivo: os `n` pesos maiores, já ordenados pela pontuação.
 * Por quê: "a linha de motivo dos pesos" (4.7): o cartão diz por que pesa, como a
 * árvore do agora; os pontos ficam no título, para a linha caber no nó.
 * Entra → sai: motivos de `scoreTask` → `{ label, title }` ou `null` sem motivo.
 */
export function reasonsView(motivos: readonly WeightReason[] | undefined, n = 2): TaskCardModel['reasons'] {
    const top = (motivos ?? []).slice(0, Math.max(0, n));
    if (!top.length) return null;
    return {
        label: top.map(m => m.texto).join(' · '),
        title: `Pesos do plano: ${top.map(m => `${m.texto} ${m.pontos > 0 ? '+' : ''}${formatPoints(m.pontos)}`).join(' · ')}`,
    };
}

/** Fora da grade do agora: o mesmo corte da árvore do agora (`fitsToday`). */
const OFF_THE_GRID = new Set(['someday', 'maybe', 'waiting-on']);

/**
 * O que faz: pontua, pela tabela única, as tarefas abertas que não são SMART e guarda
 * os motivos de cada uma pelo caminho.
 * Por quê: o cartão mostra os mesmos pesos do gesto (a mesma `scoreTask`, a mesma
 * tabela); calcular a lista de uma vez evita uma leitura por nó.
 * Entra → sai: unidades, contexto, tabela e vínculos → Map caminho → motivos (do
 * maior para o menor). Concluída, cancelada, arquivada e SMART ficam fora, e também
 * algum dia, talvez e esperando: a árvore do agora não as ordena (estão fora da grade;
 * um prazo antigo nelas não é peso de agora).
 * Prova: tests/canvas/taskCardModel.test.ts ("linha do motivo").
 */
export function reasonsByPath(units: readonly TaskUnit[], ctx: DecisionContext, table: WeightTable, relations: TaskRelations): Map<string, WeightReason[]> {
    const out = new Map<string, WeightReason[]>();
    for (const [path, score] of scoresByPath(units, ctx, table, relations)) out.set(path, score.motivos);
    return out;
}

/**
 * O que faz: a pontuação inteira (os pontos e os motivos) de cada tarefa aberta que não é
 * SMART, pela tabela única; o mesmo corte de `reasonsByPath`, que lê daqui.
 * Por quê: a Missão ordena a triagem pelos pontos e mostra o "Por que agora" pelos
 * motivos (arquitetura da Missão, 8.6 e §1), calculados uma vez por versão do modelo.
 * Entra → sai: unidades, contexto, tabela e vínculos → Map caminho → `TaskScore`.
 * Prova: tests/canvas/taskCardModel.test.ts ("linha do motivo") e tests/missao/refinos.test.ts.
 */
export function scoresByPath(units: readonly TaskUnit[], ctx: DecisionContext, table: WeightTable, relations: TaskRelations): Map<string, TaskScore> {
    const out = new Map<string, TaskScore>();
    for (const unit of units || []) {
        if (isClosedUnit(unit) || unit.type === 'tarefa_smart' || OFF_THE_GRID.has(unit.status)) continue;
        out.set(unit.path, scoreTask(unit, ctx, table, relations));
    }
    return out;
}

/** O que uma ação de SMART precisa para entrar na gramática de mostrar. */
export interface GrammarTask extends GrammarUnit {
    status: string;
}

export type { GrammarCounts };
/** A linha da forma de mostrar: a mesma função em toda escala (`engine/showGrammar.ts`). */
export { grammarText };

/**
 * O que faz: conta as ações de uma SMART nos rótulos da gramática de mostrar (2.2).
 * Por quê: a conta é a da função única (`engine/showGrammar.ts`), no horizonte da
 * SMART (`SMART_HORIZON`): as abertas (fora "algum dia") e as concluídas que
 * estiveram num horizonte (`week` ou `scheduled`) são do plano; concluída sem os
 * dois é fora do plano; `someday` fica à parte; cancelada é neutra.
 * Entra → sai: ações → contagens (a entrada não é mutada).
 * Prova: tests/canvas/taskCardModel.test.ts ("gramática de mostrar").
 */
export function smartGrammar(children: readonly GrammarTask[]): GrammarCounts {
    return grammarCounts(children, SMART_HORIZON);
}

/**
 * O que faz: as variáveis que abrem o gesto já com a tarefa escolhida.
 * Por quê: "o clique-direito de um nó de tarefa [...] oferece 🤝 Fazer agora, que abre
 * o gesto já com aquela tarefa" (4.7). São as mesmas que o passo da árvore do agora
 * gravaria; com elas o motor pula a lista, pergunta só onde estou e quanto tempo tenho
 * (o dado que ensina a reputação contextual; decisão de 18/10) e segue para o
 * "Quando?". O motivo dos pesos vai junto, para a linha da Day dizer o porquê.
 */
export function doNowVariables(task: Pick<TaskRecord, 'path' | 'basename'>, motivos?: readonly WeightReason[]): Record<string, unknown> {
    const folder = task.path.slice(0, task.path.lastIndexOf('/'));
    const top = (motivos ?? []).slice(0, 3);
    return {
        [DO_NOW_STEP]: task.basename,
        [`${DO_NOW_STEP}_display`]: `[[${task.basename}]]`,
        [`${DO_NOW_STEP}_path`]: task.path,
        [`${DO_NOW_STEP}_folder`]: folder,
        [`${DO_NOW_STEP}_motivo`]: top.map(m => `${m.texto} ${m.pontos > 0 ? '+' : ''}${formatPoints(m.pontos)}`).join(' · '),
        [`${DO_NOW_STEP}_pontos`]: Math.round(top.reduce((sum, m) => sum + m.pontos, 0) * 10) / 10,
    };
}

/** Minutos de foco a partir de `timeEntries` do TaskNotes; entrada sem fim = foco em andamento. */
export function focusOf(timeEntries: unknown, now: number): { minutes: number; tracking: boolean } {
    let minutes = 0;
    let tracking = false;
    for (const entry of Array.isArray(timeEntries) ? timeEntries : []) {
        const start = entry?.startTime ? Date.parse(entry.startTime) : NaN;
        const end = entry?.endTime ? Date.parse(entry.endTime) : NaN;
        if (!Number.isFinite(start)) continue;
        if (!Number.isFinite(end)) { tracking = true; minutes += Math.max(0, Math.round((now - start) / 60000)); }
        else minutes += Math.max(0, Math.round((end - start) / 60000));
    }
    return { minutes, tracking };
}

/** 🔥 ignição (a parte nova) ou 📤 soltar (publicar, subir, ligar); outra tarefa → `null`. */
export function pecaView(peca: unknown): TaskCardModel['peca'] {
    if (peca === 'ignicao') return { mark: '🔥', label: '🔥 ignição', title: 'Ignição: a parte nova (roteiro, criativo, primeira versão)' };
    if (peca === 'soltar') return { mark: '📤', label: '📤 soltar', title: 'Soltar: publicar, subir, ligar a campanha — ao concluir, registre onde saiu' };
    return null;
}

/**
 * O que faz: o que o cartão de uma tarefa mostra: o tipo, a linha de cima, a forma de mostrar, a cor e os botões.
 * Por quê: o nó de tarefa da arquitetura universal (19/10, 4.7) sai de uma conta só, testável sem o Obsidian.
 * Prova: tests/canvas/taskCardModel.test.ts.
 */
export function taskCardModel(
    task: TaskRecord,
    today: string,
    opts: {
        children?: TaskRecord[];
        focus?: { minutes: number; tracking: boolean };
        /** Os motivos da tabela de pesos para esta tarefa (`reasonsByPath`). */
        reasons?: readonly WeightReason[];
        readOnly?: boolean;
    } = {},
): TaskCardModel {
    const kind = task.type === 'tarefa_smart' ? 'smart' : 'acao';
    const done = task.status === 'done';
    const open = !['done', 'cancelled'].includes(task.status);
    const view = STATUS_VIEW[task.status] ?? { label: task.status || 'sem status', tone: 'muted' as CardTone };

    let date: TaskCardModel['date'] = null;
    if (task.due) {
        // "Algum dia" está fora da grade: um prazo antigo nela não é atraso de agora (`taskColor`).
        const overdue = open && task.status !== 'someday' && task.due < today;
        date = {
            label: `⏰ ${relativeDay(task.due, today)}`,
            tone: overdue ? 'bad' : task.due === today && open ? 'warn' : 'neutral',
            title: `Prazo: ${task.due}`,
        };
    } else if (task.scheduled) {
        date = { label: `🗓️ ${relativeDay(task.scheduled, today)}`, tone: task.scheduled === today && open ? 'accent' : 'neutral', title: `Agendada: ${task.scheduled}` };
    }

    let progress: TaskCardModel['progress'] = null;
    let grammar: string | null = null;
    // A mesma conta da linha da SMART na zona e no bloco da semana (`childProgress`).
    if (kind === 'smart') {
        progress = childProgress(opts.children ?? []);
        grammar = showGrammar(opts.children ?? [], SMART_HORIZON).text;
    }

    const estimate = typeof task.timeEstimate === 'number' && task.timeEstimate > 0 ? `⏳ ${minutesText(task.timeEstimate)}` : null;
    const focus = opts.focus ?? { minutes: 0, tracking: false };
    const model: Omit<TaskCardModel, 'signature'> = {
        kind, done,
        readOnly: Boolean(opts.readOnly),
        title: String(task.title || task.basename || ''),
        status: { key: task.status, ...view },
        date,
        impacto: task.impacto,
        impactLevel: impactLevelOf(task.impacto),
        context: contextView(task.contexts),
        estimate,
        week: task.week,
        reasons: kind === 'acao' && open ? reasonsView(opts.reasons) : null,
        grammar,
        progress,
        focusMinutes: focus.minutes,
        tracking: focus.tracking,
        peca: pecaView(task.peca),
    };
    return { ...model, signature: JSON.stringify(model) };
}

/**
 * O que faz: os campos que o ⏭️ Adiar grava. A nova data vai para `scheduled`; quando ela
 * cai noutra semana e a tarefa já tinha `week`, a `week` acompanha.
 * Por quê: decisão de 19/10 — adiar para outra semana deixava a `week` antiga, e a tarefa
 * seguia contando no plano da semana velha. Sem `week`, nada é inventado.
 * Entra → sai: (tarefa, `AAAA-MM-DD`) → { scheduled, week? }.
 */
export function postponeUpdates(task: Pick<TaskRecord, 'week'>, date: string): { scheduled: string; week?: string } {
    const semana = isoWeekOf(date);
    const atual = String(task.week ?? '').trim();
    return atual && semana && semana !== atual ? { scheduled: date, week: semana } : { scheduled: date };
}
