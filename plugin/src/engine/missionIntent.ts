/**
 * Intenção — a direção do esforço (interno × externo), derivada do que já está escrito.
 *
 * O console sabia ler cinco coisas do vault: estoque, plano, estrutura, execução
 * rotineira e ciclo de vida de projetos. Não sabia ler a sexta — **para onde o
 * esforço aponta**. Na matriz de prioridade, `impacto: 9` em "Revisar o
 * rascunho" e em "Publicar o artigo" eram indistinguíveis; e a procrastinação do
 * operador, medida pelo próprio operador, não aparece como ócio: aparece como trabalho
 * produtivo em coisa secundária.
 *
 * Este módulo é a peça que faltava, e ela obedece às mesmas regras dos irmãos
 * (`missionPlan`, `missionGraph`, `missionPortfolio`):
 *
 * 1. **Função pura.** Sem I/O, sem `obsidian`, sem `Date.now()` — `today` é
 *    sempre parâmetro. O coletor entrega o que já leu.
 * 2. **Ausência não é zero e não é culpa.** Sem verbo e sem entrega não há
 *    classificação: `indeterminado` é estado de primeira classe,
 *    com a razão escrita ("nada decide"), nunca um chute. Tarefa sem data de
 *    criação não tem idade zero — não tem idade.
 * 3. **Nada de vocabulário de caráter.** Todo sinal de drift cita data, contagem
 *    e caminho. Nenhuma frase avalia o operador, e nenhuma acusa por ausência.
 * 4. **O ranking não sobrescreve a triagem.** `priority` e `impacto` são decisões
 *    do operador; o score daqui ordena **apenas** as faixas da superfície nova, e
 *    sempre sai acompanhado dos termos que o compuseram.
 * 5. **Os pesos são da tabela única** (`pesos_decisao.json`, categorias `painel_*`,
 *    desde 25/10/2026): este módulo lê os pesos em uso de `panelWeights.ts`, que o
 *    coletor do painel atualiza a cada leitura do arquivo. Nenhum peso mora aqui.
 *
 * Ciclo de importação: este módulo importa de `missionControl` e de
 * `missionPortfolio` **apenas tipos**. Um ciclo de valores já quebrou esta base
 * duas vezes; as listas de verbos e os limiares vivem aqui.
 */
import type { MissionTask, WorkNucleo } from './missionTypes';
import { DIA, diaNoInicio } from './dia';
// A direção do esforço mora nos tipos de base da projeção; reexportada para quem a lia daqui.
export type { WorkNucleo };
import type { PortfolioProject } from './missionPortfolio';
import { columnStatus, panelWeights } from './panelWeights';
import { daysBetween, isoDay, parseDay, shiftDay } from './missionCalendar';
import { fixadaEntre } from './proximaAcao';
import { classificarDirecao, externaQueEspera, infiniteVerb, MIN_DECIDING_SCORE, READY_INTERNAL_AFTER, titleWords, type ClassificacaoDaDirecao } from './direcao';

/* ==========================================================================
   Direção do trabalho
   ========================================================================== */

/*
 * A direção (para fora ou para dentro), o verbo sem fim e a ação para fora que espera mudaram
 * de casa em 02/11 para `engine/direcao.ts` (o inventário da aposentadoria, itens 3, 4 e 7):
 * a Missão os lê de lá, e esta intenção lê o mesmo, com os pesos em uso do painel
 * (`panelWeights().direcao`). Os nomes de antes ficam aqui, para quem os lia daqui.
 * O lugar não é a direção (manual 012, 29/10/2026): o porquê está em `direcao.ts`.
 */
export type WorkClassification = ClassificacaoDaDirecao;
export { MIN_DECIDING_SCORE, READY_INTERNAL_AFTER, infiniteVerb };

/**
 * Classifica a direção de uma tarefa a partir do que já está escrito nela, com os
 * pesos da direção em uso do painel (`painel_direcao` da tabela única).
 *
 * A conta é `classificarDirecao` (`direcao.ts`); toda classificação carrega `reasons`
 * — não existe rótulo sem motivo — e `confidence` cai quando as evidências discordam.
 */
export function classifyWork(task: MissionTask): WorkClassification {
    return classificarDirecao(task, panelWeights().direcao);
}

/**
 * Direção já derivada na tarefa, ou derivada agora.
 *
 * O campo é opcional no tipo porque só o coletor o preenche; tarefa montada à mão
 * em teste, ponte ou agente cai na classificação pura em vez de virar
 * "indeterminado" por falta de campo.
 */
export function nucleoOf(task: MissionTask): WorkNucleo {
    const declared = task?.nucleo;
    if (declared === 'externo' || declared === 'interno' || declared === 'indeterminado') return declared;
    return classifyWork(task).nucleo;
}

/** Razões da direção: as gravadas na tarefa, ou as derivadas agora. */
export function reasonsOf(task: MissionTask): string[] {
    if (Array.isArray(task?.nucleoReason) && task.nucleoReason.length > 0) return [...task.nucleoReason];
    return classifyWork(task).reasons;
}

/* ==========================================================================
   P2 — a pergunta que a triagem faz, nunca a captura
   ========================================================================== */

/* ==========================================================================
   Limiares de drift — medidos no vault, declarados aqui
   ========================================================================== */

/**
 * Limiares calibrados no clone de 14/09/2026 (74 tarefas, 58 abertas, 32
 * executáveis, 34 projetos). Cada número é um piso que o vault medido **cruza**
 * ou não — e o card diz sempre qual piso foi usado, para poder ser discutido.
 *
 * Nenhum limiar nasce de estimativa: os que não disparam hoje estão aqui com a
 * contagem real do vault ao lado, no relatório desta janela.
 */
export const DRIFT_THRESHOLDS = {
    /** Criadas em 30 dias para disparar a leitura de criação em massa. */
    created30: 15,
    /** Abertas com impacto ≥ 7 exigidas junto. */
    openHighImpact: 10,
    /** Executáveis com verbo de pesquisa/revisão. */
    researchRun: 3,
    /** Abertas com verbo de melhoria sobre algo que já funciona. */
    improvementRun: 2,
    /** Executáveis externas com idade ≥ 7 dias ou data vencida. */
    staleExternal: 3,
    /** Internas abertas criadas depois da externa mais antiga. */
    internalAfter: 3,
    /** Frente em curso simultânea (troca frequente de tarefa). */
    inProgress: 3,
    /** Idade, em dias, de tarefa aberta sem próximo passo declarado. */
    staleDays: 21,
    /** Quantas tarefas nessa condição. */
    staleCount: 3,
    /** Internas (ou sem contexto) abertas. */
    internalOpen: 10,
} as const;

/** Janela padrão dos ciclos fechados: a semana. */
export const CLOSED_CYCLE_WINDOW_DAYS = 7;

/* ==========================================================================
   Calendário mínimo — mesma aritmética UTC do plano
   ========================================================================== */

// As contas do dia (parseDay, isoDay, shiftDay, daysBetween) moram em missionCalendar.ts, as
// mesmas do plano; o daysBetween fica reexportado daqui, para quem o lia daqui.
export { daysBetween };

/** Janela de N dias terminando em `today` (inclusive). Data ilegível devolve `null`. */
export function windowOf(today: string, days: number = CLOSED_CYCLE_WINDOW_DAYS): { start: string; end: string; days: number } | null {
    const end = parseDay(today);
    if (!end || !Number.isFinite(days) || days < 1) return null;
    return { start: isoDay(shiftDay(end, -(Math.round(days) - 1))), end: isoDay(end), days: Math.round(days) };
}

/** Idade em dias de uma data ISO até `today`; `null` quando não há data legível. */
function ageInDays(date: string, today: string): number | null {
    const value = DIA.test(String(date ?? '')) ? String(date) : String(date ?? '').slice(0, 10);
    return daysBetween(value, today);
}

/** `2026-09-14` → `14/09`. Data ilegível sai como está: o painel mostra o cru. */
function shortDate(date: string): string {
    const value = String(date ?? '');
    return DIA.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}` : value;
}

const TERMINAL = new Set(['done', 'completed', 'cancelled', 'canceled']);

function isOpen(task: MissionTask): boolean {
    return !TERMINAL.has(String(task?.status ?? '').trim().toLowerCase());
}

function isExecutable(task: MissionTask): boolean {
    return ['next-action', 'in-progress'].includes(String(task?.status ?? '').trim().toLowerCase());
}

/**
 * A mesma mesa da Matriz DFM: executável, não arquivada e não SMART-mãe.
 *
 * A lista é repetida aqui em vez de importada de `missionPlan` porque importar o
 * valor criaria o ciclo que este repositório já pagou duas vezes; e a regra é
 * curta o bastante para caber num teste que compara as duas leituras.
 */
export function onTheTable(task: MissionTask): boolean {
    if (!isExecutable(task) || task?.archived === true) return false;
    return String(task?.type ?? 'task').trim().toLowerCase() !== 'tarefa_smart';
}

function isBlocked(task: MissionTask): boolean {
    return Array.isArray(task?.blockedBy) && task.blockedBy.length > 0;
}

function projectOf(task: MissionTask, project: string): boolean {
    const name = String(project ?? '').trim();
    return (task?.projects ?? []).some(item => String(item ?? '').trim() === name);
}

/* ==========================================================================
   Agora — o ranking da superfície nova
   ========================================================================== */

export interface IntentAction {
    task: MissionTask;
    /** Soma dos termos abaixo. Não altera `priority`, `impacto` nem a Matriz DFM. */
    score: number;
    /** Motivo visível do score: "para fora +40", "impacto 9 +36", "prazo vencido +15". */
    terms: string[];
    nucleo: WorkNucleo;
    /** Por que a tarefa está nesta faixa (nunca "porque é importante"). */
    reason: string;
}

/*
 * Os pesos do score da faixa "Agora" moram na tabela única (`pesos_decisao.json`,
 * categoria `painel_agora`, desde 25/10/2026; ver `panelWeights.ts`). Cada termo do
 * score cita o peso que usou, para o card mostrar a conta.
 */

/** `vence em 3d` conta como próximo quando o prazo está a até 3 dias. */
const DUE_SOON_DAYS = 3;

/**
 * Score de uma ação, com os termos que o compuseram.
 *
 * O score existe para **ordenar a superfície nova**. Ele não escreve nada, não
 * muda `priority`, `impacto`, `status` nem a Matriz DFM (D4).
 */
export function actionScore(task: MissionTask, today: string): { score: number; terms: string[] } {
    const terms: string[] = [];
    const weights = panelWeights().agora;
    let score = 0;
    const nucleo = nucleoOf(task);

    if (nucleo === 'externo') {
        score += weights.para_fora;
        terms.push(`para fora +${weights.para_fora}`);
    } else if (nucleo === 'indeterminado') {
        score += weights.direcao_indeterminada;
        terms.push(`direção indeterminada +${weights.direcao_indeterminada}`);
    } else {
        score += weights.para_dentro;
        terms.push(`para dentro +${weights.para_dentro}`);
    }

    const impact = Number.isFinite(task?.impact as number) ? (task.impact as number) : null;
    if (impact !== null) {
        const points = Math.max(0, Math.round(impact)) * weights.impacto_por_ponto;
        score += points;
        terms.push(`impacto ${impact} +${points}`);
    } else {
        terms.push('impacto não declarado +0');
    }

    if (task?.overdue) {
        score += weights.prazo_vencido;
        terms.push(`prazo vencido +${weights.prazo_vencido}`);
    } else if (task?.dueToday) {
        score += weights.vence_hoje;
        terms.push(`vence hoje +${weights.vence_hoje}`);
    } else {
        const days = daysBetween(today, String(task?.due ?? '').slice(0, 10));
        if (days !== null && days > 0 && days <= DUE_SOON_DAYS) {
            score += weights.vence_em_breve;
            terms.push(`vence em ${days}d +${weights.vence_em_breve}`);
        }
    }

    if (task?.scheduledPast) {
        score += weights.intencao_vencida;
        terms.push(`intenção vencida +${weights.intencao_vencida}`);
    }
    if (String(task?.status ?? '').trim().toLowerCase() === 'in-progress') {
        score += weights.em_andamento;
        terms.push(`já em execução +${weights.em_andamento}`);
    }

    return { score, terms };
}

/** Ordem estável: score, depois prazo, depois título. Sem ordem não há reprodutibilidade. */
function compareActions(a: IntentAction, b: IntentAction): number {
    if (b.score !== a.score) return b.score - a.score;
    if (a.task.overdue !== b.task.overdue) return a.task.overdue ? -1 : 1;
    return a.task.title.localeCompare(b.task.title);
}

function toAction(task: MissionTask, today: string, reason: string): IntentAction {
    const { score, terms } = actionScore(task, today);
    return { task, score, terms, nucleo: nucleoOf(task), reason };
}

/* ==========================================================================
   Próxima ação real — por projeto (D3)
   ========================================================================== */

export interface NextRealAction {
    project: string;
    column: string;
    task: MissionTask | null;
    reason: string;
    /** `derived` = escolhida pelo motor; `declared` = escrita na nota-índice. */
    origem: 'derived' | 'declared';
    /** Outras externas executáveis do mesmo projeto, para o card não fingir exclusividade. */
    alternatives: number;
}

/*
 * O peso da coluna do quadro (pelo status: active, review, waiting, backlog), de cada
 * ação para fora, da nota-índice e do foco da semana, na escolha do projeto mais perto
 * de gerar resultado, mora na tabela única (`pesos_decisao.json`, categoria
 * `painel_projeto_proximo`, desde 25/10/2026; ver `panelWeights.ts`).
 */

function projectCandidates(project: PortfolioProject, tasks: MissionTask[]): MissionTask[] {
    return tasks.filter(task => onTheTable(task) && projectOf(task, project.name));
}

/**
 * A próxima ação real de **um** projeto: externa, executável, não bloqueada, de
 * maior impacto. Sem externa disponível o motor **não inventa**: devolve a maior
 * ação interna e diz que é interna.
 *
 * `declaredPath` é o override opcional da nota-índice (`proxima_acao_real:`) e,
 * quando existe, vence a derivação — com a origem exibida como `declared`, para
 * que inferência nunca se apresente como declaração.
 */
export function nextRealAction(
    project: PortfolioProject,
    tasks: MissionTask[],
    declaredPath = '',
): NextRealAction {
    const name = String(project?.name ?? '');
    const column = String(project?.column ?? '');
    const candidates = projectCandidates(project, tasks);

    if (declaredPath) {
        // A fixada vence quando ainda é candidata (fixadaEntre, 02/11: a Missão lê a mesma regra).
        const declared = fixadaEntre(candidates, declaredPath, task => [task.path]);
        if (declared) {
            return {
                project: name,
                column,
                task: declared,
                reason: 'declarada na nota-índice do projeto (`proxima_acao_real`)',
                origem: 'declared',
                alternatives: 0,
            };
        }
    }

    const external = candidates.filter(task => nucleoOf(task) === 'externo' && !isBlocked(task));
    const pool = external.length > 0 ? external : candidates.filter(task => !isBlocked(task));
    if (pool.length === 0) {
        return {
            project: name,
            column,
            task: null,
            reason: candidates.length === 0
                ? 'nenhuma tarefa executável ligada a este projeto'
                : `${candidates.length} tarefa(s) executável(is), todas com bloqueador nomeado`,
            origem: 'derived',
            alternatives: 0,
        };
    }

    const ranked = [...pool].sort((a, b) => actionScore(b, '').score - actionScore(a, '').score || a.title.localeCompare(b.title));
    const chosen = ranked[0];
    const isExternal = external.length > 0;
    return {
        project: name,
        column,
        task: chosen,
        reason: isExternal
            ? `externa executável, sem bloqueador nomeado, entre ${pool.length} do projeto`
            : `sem externa executável neste projeto: a maior ação disponível é interna (${pool.length} candidata(s))`,
        origem: 'derived',
        alternatives: Math.max(0, pool.length - 1),
    };
}

/**
 * O projeto mais próximo de gerar resultado — onde a próxima ação real entra no
 * topo da faixa "Agora". Projeto sem tarefa executável não compete: ele não tem
 * próxima ação para oferecer.
 */
export function closestProject(
    projects: PortfolioProject[],
    tasks: MissionTask[],
    weekFocus: string[] = [],
    declaredNext: Record<string, string> = {},
): NextRealAction | null {
    const focus = new Set((weekFocus ?? []).map(item => String(item ?? '').trim()).filter(Boolean));
    const weights = panelWeights().projeto;
    let best: { action: NextRealAction; score: number } | null = null;

    for (const project of projects ?? []) {
        const candidates = projectCandidates(project, tasks);
        if (candidates.length === 0) continue;
        const external = candidates.filter(task => nucleoOf(task) === 'externo' && !isBlocked(task)).length;
        const score = (weights.coluna[columnStatus(String(project.column ?? ''))] ?? 0)
            + weights.cada_externa * external
            + Number(project.hasIndexType === true) * weights.nota_indice
            + Number(focus.has(project.name)) * weights.foco_da_semana;
        const action = nextRealAction(project, tasks, declaredNext[project.name] ?? '');
        if (!action.task) continue;
        if (!best || score > best.score || (score === best.score && project.name.localeCompare(best.action.project) < 0)) {
            best = { action, score };
        }
    }

    return best ? { ...best.action, alternatives: best.action.alternatives } : null;
}

/* ==========================================================================
   Pronto para exposição — o selo derivado
   ========================================================================== */

export interface ReadyForExposure {
    project: string;
    task: MissionTask;
    /** Internas abertas do mesmo projeto criadas depois da externa. */
    internalAfter: number;
    /** Data da externa que espera. */
    since: string;
    reason: string;
}

/**
 * Selo "pronto para exposição": existe externa executável sem bloqueador e, no
 * mesmo projeto, trabalho interno posterior a ela (`READY_INTERNAL_AFTER`). A conta
 * é `externaQueEspera` (`direcao.ts`, 02/11), a mesma que a Missão mostra como sinal.
 */
export function readyForExposure(
    projects: PortfolioProject[],
    tasks: MissionTask[],
    limit = 3,
): ReadyForExposure[] {
    const ready: ReadyForExposure[] = [];
    for (const project of projects ?? []) {
        const espera = externaQueEspera(projectCandidates(project, tasks), {
            direcao: nucleoOf, bloqueada: isBlocked, criada: task => String(task.createdOn ?? ''), titulo: task => task.title, chave: task => task.path,
        });
        if (!espera) continue;
        const { tarefa: external, internasDepois: internalAfter, desde: since } = espera;
        ready.push({
            project: project.name,
            task: external,
            internalAfter,
            since,
            reason: since
                ? `externa aberta desde ${shortDate(since)} e ${internalAfter} interna(s) do mesmo projeto criada(s) depois dela`
                : `${internalAfter} interna(s) do mesmo projeto depois da externa (a externa não tem data de criação)`,
        });
    }
    return ready
        .sort((a, b) => b.internalAfter - a.internalAfter || a.project.localeCompare(b.project))
        .slice(0, Math.max(0, limit));
}

/* ==========================================================================
   Drift — o card que fala de datas e contagens
   ========================================================================== */

export interface DriftSignal {
    id: string;
    /** O fato, com número e data. Nunca uma leitura de caráter. */
    fact: string;
    /** O limiar que disparou, declarado para poder ser discutido. */
    threshold: string;
    /** A evidência citada — títulos, datas e contagens do próprio vault. */
    evidence: string[];
    /** Caminhos das tarefas citadas: é a saída de um clique do card. */
    paths: string[];
    /** A pergunta fechada. Nunca um bloqueio, nunca um ritual novo. */
    question: string;
}

export interface DriftInput {
    tasks: MissionTask[];
    today: string;
    /** `createdOn` ausente em N tarefas: a contagem de criação é um piso. */
    windowDays?: number;
}

function countByNucleo(tasks: MissionTask[], nucleo: WorkNucleo): MissionTask[] {
    return tasks.filter(task => nucleoOf(task) === nucleo);
}

function hasVerb(task: MissionTask, verbs: ReadonlyArray<string>): boolean {
    const words = new Set(titleWords(String(task?.title ?? '')));
    return verbs.some(verb => words.has(verb));
}

const RESEARCH_ONLY = ['revisar', 'revisao', 'pesquisar', 'pesquisa', 'estudar', 'estudo', 'analisar', 'analise', 'mapear', 'documentar', 'planejar', 'planejamento'];
const IMPROVEMENT_ONLY = ['melhorar', 'refinar', 'polir', 'otimizar', 'aprimorar', 'lapidar', 'reorganizar'];

/**
 * Os sinais objetivos do pedido, cada um com limiar numérico e evidência citada.
 *
 * Quatro decisões que este motor toma de propósito:
 *
 * - **sem data não há idade.** Tarefa sem `createdOn` não entra em nenhuma conta
 *   de tempo: 21 tarefas do vault medido estão nessa condição, e tratá-las como
 *   "criadas hoje" seria inventar dado;
 * - **`someday` fica fora das contas de execução.** Estoque não é trabalho em
 *   curso, e cobrar sequência de pesquisa sobre o que está guardado seria
 *   inventar uma dívida que o operador não assumiu;
 * - **o limiar não disparado não vira sinal.** Ausência de drift é uma resposta
 *   legítima, e o painel a exibe como tal;
 * - **nenhum sinal fala do operador.** Todos citam data, contagem e caminho.
 */
export function detectDrift(input: DriftInput): DriftSignal[] {
    const tasks = Array.isArray(input?.tasks) ? input.tasks.filter(Boolean) : [];
    const today = String(input?.today ?? '');
    const windowDays = Math.max(1, Math.round(Number(input?.windowDays) || 30));
    const signals: DriftSignal[] = [];

    const open = tasks.filter(isOpen);
    const executable = open.filter(isExecutable);
    const dated = tasks.filter(task => Boolean(task?.createdOn));
    const undated = tasks.length - dated.length;

    /* 1. Criação em massa com prioritárias ainda abertas. */
    const createdRecently = tasks.filter(task => {
        const age = ageInDays(String(task?.createdOn ?? ''), today);
        return age !== null && age >= 0 && age <= windowDays;
    });
    const openHighImpact = open.filter(task => Number.isFinite(task?.impact as number) && (task.impact as number) >= 7);
    if (createdRecently.length >= DRIFT_THRESHOLDS.created30 && openHighImpact.length >= DRIFT_THRESHOLDS.openHighImpact) {
        signals.push({
            id: 'criacao-com-prioritarias-abertas',
            fact: `${createdRecently.length} tarefa(s) criada(s) nos últimos ${windowDays} dias e ${openHighImpact.length} aberta(s) com impacto ≥ 7`,
            threshold: `≥ ${DRIFT_THRESHOLDS.created30} criadas em ${windowDays} dias e ≥ ${DRIFT_THRESHOLDS.openHighImpact} abertas de alto impacto`,
            evidence: [
                `criação mais recente: ${createdRecently.map(task => task.createdOn).filter(Boolean).sort().slice(-1)[0] ?? '(sem data)'}`,
                `criação mais antiga da janela: ${createdRecently.map(task => task.createdOn).filter(Boolean).sort()[0] ?? '(sem data)'}`,
                `${undated} de ${tasks.length} tarefa(s) sem data de criação: a contagem é um piso, não o total`,
            ],
            paths: [...openHighImpact].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0)).slice(0, 5).map(task => task.path),
            question: 'Alguma dessas prioritárias abertas é a ação que o mundo cobra?',
        });
    }

    /* 2. Sequência de pesquisa/revisão entre as executáveis. */
    const research = executable.filter(task => hasVerb(task, RESEARCH_ONLY));
    if (research.length >= DRIFT_THRESHOLDS.researchRun) {
        signals.push({
            id: 'sequencia-pesquisa-revisao',
            fact: `${research.length} tarefa(s) executável(is) com verbo de pesquisa, revisão ou planejamento`,
            threshold: `≥ ${DRIFT_THRESHOLDS.researchRun} executáveis com verbo de pesquisa/revisão`,
            evidence: research.slice(0, 5).map(task => `${task.title} [${task.status}]`),
            paths: research.slice(0, 5).map(task => task.path),
            question: 'Qual dessas termina sem uma resposta de fora?',
        });
    }

    /* 3. Melhoria repetida sobre algo que já funciona. */
    const improvements = open.filter(task => hasVerb(task, IMPROVEMENT_ONLY));
    if (improvements.length >= DRIFT_THRESHOLDS.improvementRun) {
        signals.push({
            id: 'melhoria-repetida',
            fact: `${improvements.length} tarefa(s) aberta(s) de melhoria, ajuste ou refino`,
            threshold: `≥ ${DRIFT_THRESHOLDS.improvementRun} abertas com verbo de melhoria`,
            evidence: improvements.slice(0, 5).map(task => `${task.title} [${task.status}]`),
            paths: improvements.slice(0, 5).map(task => task.path),
            question: 'Isto já funciona? O que falta é o mundo ver, não ficar melhor?',
        });
    }

    /* 4. Externa pronta adiada enquanto a infraestrutura recebe trabalho. */
    const externalReady = executable.filter(task => nucleoOf(task) === 'externo');
    const staleExternal = externalReady.filter(task => {
        const age = ageInDays(String(task?.createdOn ?? ''), today);
        const due = String(task?.due ?? '').slice(0, 10);
        const scheduled = String(task?.scheduledDate ?? '').slice(0, 10);
        return (age !== null && age >= 7) || (!!due && due < today) || (!!scheduled && scheduled < today);
    });
    const internalOpen = open.filter(task => nucleoOf(task) !== 'externo');
    if (staleExternal.length >= DRIFT_THRESHOLDS.staleExternal) {
        const oldest = [...staleExternal].sort((a, b) => (a.createdOn || '9999').localeCompare(b.createdOn || '9999'))[0];
        const since = String(oldest?.createdOn ?? '');
        const internalAfter = internalOpen.filter(task => since && (task.createdOn || '') > since);
        if (internalAfter.length >= DRIFT_THRESHOLDS.internalAfter) {
            signals.push({
                id: 'externa-adiada-com-infra',
                fact: `${staleExternal.length} externa(s) executável(is) com data vencida ou idade ≥ 7 dias, e ${internalAfter.length} tarefa(s) interna(s) aberta(s) criada(s) depois da mais antiga`,
                threshold: `≥ ${DRIFT_THRESHOLDS.staleExternal} externas paradas e ≥ ${DRIFT_THRESHOLDS.internalAfter} internas criadas depois da mais antiga`,
                evidence: staleExternal.slice(0, 4).map(task =>
                    `${task.title} · criada ${task.createdOn || '(sem data)'} · prazo ${String(task.due ?? '').slice(0, 10) || '(sem prazo)'}`),
                paths: staleExternal.slice(0, 4).map(task => task.path),
                question: `Qual destas externas fecha antes do próximo trabalho interno?`,
            });
        }
    }

    /* 5. Troca frequente de tarefa. */
    const inProgress = open.filter(task => String(task?.status ?? '').trim().toLowerCase() === 'in-progress');
    if (inProgress.length >= DRIFT_THRESHOLDS.inProgress) {
        signals.push({
            id: 'troca-frequente',
            fact: `${inProgress.length} tarefa(s) em execução ao mesmo tempo`,
            threshold: `≥ ${DRIFT_THRESHOLDS.inProgress} em execução simultânea`,
            evidence: inProgress.slice(0, 5).map(task => task.title),
            paths: inProgress.slice(0, 5).map(task => task.path),
            question: 'Qual destas vai até o fim hoje?',
        });
    }

    /* 6. Tarefa aberta há N dias sem próximo passo declarado. */
    const stale = open.filter(task => {
        const age = ageInDays(String(task?.createdOn ?? ''), today);
        return age !== null && age >= DRIFT_THRESHOLDS.staleDays && !task.scheduledDate && !task.due;
    });
    if (stale.length >= DRIFT_THRESHOLDS.staleCount) {
        signals.push({
            id: 'aberta-sem-proximo-passo',
            fact: `${stale.length} tarefa(s) aberta(s) há ${DRIFT_THRESHOLDS.staleDays} dias ou mais sem `+
                '`scheduled` e sem `due`',
            threshold: `≥ ${DRIFT_THRESHOLDS.staleCount} abertas com idade ≥ ${DRIFT_THRESHOLDS.staleDays} dias e nenhuma data declarada`,
            evidence: stale.slice(0, 5).map(task => `${task.title} · ${ageInDays(String(task.createdOn), today)}d`),
            paths: stale.slice(0, 5).map(task => task.path),
            question: 'Alguma destas já morreu? Alguma tem uma data?',
        });
    }

    /* 7. Sequência de trabalho interno com zero resultado externo na janela. */
    const closed = closedCycles(tasks, windowOf(today, CLOSED_CYCLE_WINDOW_DAYS));
    const internalCandidates = open.filter(task => nucleoOf(task) !== 'externo');
    if (internalCandidates.length >= DRIFT_THRESHOLDS.internalOpen && closed.externos === 0) {
        signals.push({
            id: 'internas-sem-ciclo-fechado',
            fact: `${internalCandidates.length} tarefa(s) aberta(s) interna(s) ou sem direção declarada e ${closed.externos} ciclo(s) fechado(s) no mundo nos últimos ${closed.window.days} dias`,
            threshold: `≥ ${DRIFT_THRESHOLDS.internalOpen} internas abertas e zero ciclo externo fechado na janela`,
            evidence: [
                `fechadas na janela: ${closed.total} (${closed.externos} externa(s), ${closed.internos} interna(s), ${closed.indeterminados} sem direção)`,
                `${closed.undated} tarefa(s) concluída(s) sem data de conclusão: a contagem é um piso`,
            ],
            paths: [],
            question: 'Qual ciclo fecha no mundo esta semana?',
        });
    }

    return signals;
}

/* ==========================================================================
   P3 — ciclos fechados (leitura pura)
   ========================================================================== */

export interface ClosedCycleEntry {
    title: string;
    path: string;
    when: string;
    kind: string;
    nucleo: WorkNucleo;
}

export interface ClosedCycles {
    window: { start: string; end: string; days: number };
    publicacoes: number;
    contatos: number;
    respostas: number;
    entregas: number;
    decisoes: number;
    testes: number;
    /** Fechado que não casa com verbo nenhum: não desaparece nem infla categoria. */
    outros: number;
    /** Soma das categorias — cada ciclo entra em exatamente uma. */
    total: number;
    externos: number;
    internos: number;
    indeterminados: number;
    /** Concluídas sem data de conclusão: ficam fora da janela e são declaradas. */
    undated: number;
    evidence: ClosedCycleEntry[];
}

/** `2026-09-14` de uma data que pode vir com hora, com offset ou vazia. */
function dayOf(value: unknown): string {
    return diaNoInicio(String(value ?? ''));
}

/** Categorias na ordem em que são testadas: o primeiro verbo que casa decide. */
const CYCLE_CATEGORIES: ReadonlyArray<{ id: keyof Omit<ClosedCycles, 'window' | 'total' | 'externos' | 'internos' | 'indeterminados' | 'undated' | 'evidence'>; verbs: ReadonlyArray<string> }> = [
    { id: 'publicacoes', verbs: ['publicar', 'publicacao', 'postar', 'divulgar', 'lancar', 'lancamento'] },
    { id: 'contatos', verbs: ['contactar', 'contatar', 'ligar', 'conversar', 'reuniao', 'prospectar', 'negociar', 'contato', 'entrevista', 'convidar'] },
    { id: 'respostas', verbs: ['responder', 'resposta', 'retorno', 'feedback', 'reply'] },
    { id: 'entregas', verbs: ['entregar', 'entrega', 'enviar', 'mandar', 'submeter', 'apresentar'] },
    { id: 'decisoes', verbs: ['decidir', 'decisao', 'escolher', 'fechar', 'aprovado'] },
    { id: 'testes', verbs: ['testar', 'teste', 'validar', 'beta', 'experimento'] },
];

function categorize(task: MissionTask): string {
    const words = new Set(titleWords(String(task?.title ?? '')));
    for (const category of CYCLE_CATEGORIES) {
        if (category.verbs.some(verb => words.has(verb))) return category.id;
    }
    return 'outros';
}

/**
 * Ciclos fechados na janela — a métrica do P3, nascida da evidência (D7).
 *
 * O que conta como ciclo fechado: tarefa **terminal com data de conclusão dentro
 * da janela**. A data vem de `completed`/`completedDate` (o que o TaskNotes grava)
 * e, na falta dela, de `dateModified` — declarado, porque a segunda é mais fraca
 * que a primeira.
 *
 * Ausência de registro não vira zero culpado: `undated` diz quantas conclusões
 * não têm data, e o painel mostra a lacuna em palavras.
 */
export function closedCycles(tasks: MissionTask[], window: { start: string; end: string; days: number } | null): ClosedCycles {
    const safeWindow = window ?? { start: '', end: '', days: CLOSED_CYCLE_WINDOW_DAYS };
    const result: ClosedCycles = {
        window: safeWindow,
        publicacoes: 0, contatos: 0, respostas: 0, entregas: 0, decisoes: 0, testes: 0, outros: 0,
        total: 0, externos: 0, internos: 0, indeterminados: 0, undated: 0, evidence: [],
    };
    if (!safeWindow.start || !safeWindow.end) return result;

    for (const task of tasks ?? []) {
        if (isOpen(task)) continue;
        if (!['done', 'completed'].includes(String(task?.status ?? '').trim().toLowerCase())) continue;

        const when = dayOf(task?.completedOn) || dayOf(task?.modifiedOn);
        if (!when) {
            result.undated += 1;
            continue;
        }
        if (when < safeWindow.start || when > safeWindow.end) continue;

        const kind = categorize(task);
        if (kind !== 'outros') (result as any)[kind] += 1;
        else result.outros += 1;
        result.total += 1;

        const nucleo = nucleoOf(task);
        if (nucleo === 'externo') result.externos += 1;
        else if (nucleo === 'interno') result.internos += 1;
        else result.indeterminados += 1;

        result.evidence.push({ title: task.title, path: task.path, when, kind, nucleo });
    }

    result.evidence.sort((a, b) => b.when.localeCompare(a.when) || a.title.localeCompare(b.title));
    return result;
}

/* ==========================================================================
   Montagem — o que o snapshot carrega
   ========================================================================== */

export interface IntentBand {
    id: 'fechar-ciclos' | 'preparacao' | 'talvez';
    label: string;
    hint: string;
    tasks: IntentAction[];
    /** Quantos itens existem antes do corte da faixa. */
    total: number;
}

export interface IntentClassification {
    externo: number;
    interno: number;
    indeterminado: number;
    /** Abertas sem nenhum contexto declarado: ausência de dado, não direção. */
    semContexto: number;
}

export interface MissionIntent {
    today: string;
    /** A janela da métrica de ciclos fechados. */
    window: { start: string; end: string; days: number } | null;
    classification: IntentClassification;
    /** 1–3 ações, com score e motivo visíveis. */
    agora: IntentAction[];
    /** A próxima ação real do projeto mais próximo de gerar resultado. */
    projetoMaisProximo: NextRealAction | null;
    /** Faixas subordinadas: o que fecha, o que prepara, o que está guardado. */
    faixas: IntentBand[];
    prontos: ReadyForExposure[];
    drift: DriftSignal[];
    ciclos: ClosedCycles;
    /** Lacunas declaradas — o que o motor não pôde ler. */
    gaps: string[];
}

export interface IntentInput {
    tasks: MissionTask[];
    projects?: PortfolioProject[];
    today: string;
    weekFocus?: string[];
    /** `proxima_acao_real:` declarada na nota-índice, por nome de projeto. */
    declaredNext?: Record<string, string>;
    /** Teto de itens por faixa (a projeção do agente tem teto próprio). */
    bandLimit?: number;
    windowDays?: number;
}

/** Teto do motor por faixa. A projeção corta de novo, e declara o corte. */
export const INTENT_BAND_LIMIT = 6;
/** Quantas ações entram em "Agora". O pedido é 1–3, nunca uma lista. */
export const INTENT_AGORA_LIMIT = 3;

/**
 * Monta a seção `intent` do snapshot.
 *
 * A ordem das faixas é a ordem do trabalho: primeiro o que fecha no mundo
 * (`fechar-ciclos`), depois o que prepara (`preparacao`), depois o que está
 * guardado (`talvez`). "Agora" não é faixa: são as 1–3 ações que saem daqui.
 */
export function buildIntent(input: IntentInput): MissionIntent {
    const tasks = Array.isArray(input?.tasks) ? input.tasks.filter(Boolean) : [];
    const projects = Array.isArray(input?.projects) ? input.projects.filter(Boolean) : [];
    const today = String(input?.today ?? '');
    const bandLimit = Math.max(1, Math.round(Number(input?.bandLimit) || INTENT_BAND_LIMIT));
    const window = windowOf(today, Number(input?.windowDays) || CLOSED_CYCLE_WINDOW_DAYS);

    const open = tasks.filter(isOpen);
    const classification: IntentClassification = {
        externo: open.filter(task => nucleoOf(task) === 'externo').length,
        interno: open.filter(task => nucleoOf(task) === 'interno').length,
        indeterminado: open.filter(task => nucleoOf(task) === 'indeterminado').length,
        semContexto: open.filter(task => (task.contexts ?? []).length === 0).length,
    };

    // A mesa do ranking é a mesma da Matriz DFM — executável, não arquivada, não
    // SMART-mãe — mais o bloqueador nomeado, que tira a peça da frente.
    const table = tasks.filter(task => onTheTable(task) && !isBlocked(task));
    const ranked = table
        .map(task => toAction(task, today, 'executável, sem bloqueador nomeado'))
        .sort(compareActions);

    const agora = ranked.filter(action => action.nucleo !== 'interno').slice(0, INTENT_AGORA_LIMIT);
    const agoraPaths = new Set(agora.map(action => action.task.path));
    if (agora.length === 0 && ranked.length > 0) {
        // Sem externa na mesa, a faixa não fica vazia por teimosia: mostra a maior
        // interna e diz, na razão, que é interna.
        agora.push({ ...ranked[0], reason: 'nenhuma externa na mesa: a maior ação disponível é interna' });
        agoraPaths.add(ranked[0].task.path);
    }

    const closing = ranked
        .filter(action => action.nucleo === 'externo' && !agoraPaths.has(action.task.path))
        .sort((a, b) => closingProximity(a.task, today) - closingProximity(b.task, today) || compareActions(a, b));
    const preparation = ranked.filter(action => action.nucleo === 'interno' && !agoraPaths.has(action.task.path));
    const maybe = open
        .filter(task => ['someday', 'backlog'].includes(String(task.status ?? '').trim().toLowerCase()))
        .map(task => toAction(task, today, 'guardada: não compete com a mesa'))
        .sort(compareActions);

    const faixas: IntentBand[] = [
        {
            id: 'fechar-ciclos',
            label: 'Fechar ciclos',
            hint: 'externas executáveis, da mais perto de fechar para a mais longe',
            tasks: closing.slice(0, bandLimit),
            total: closing.length,
        },
        {
            id: 'preparacao',
            label: 'Preparação',
            hint: 'internas: subordinadas ao que fecha, recolhidas por padrão',
            tasks: preparation.slice(0, bandLimit),
            total: preparation.length,
        },
        {
            id: 'talvez',
            label: 'Talvez',
            hint: 'someday e backlog: fora da competição até virarem decisão',
            tasks: maybe.slice(0, bandLimit),
            total: maybe.length,
        },
    ];

    const gaps: string[] = [];
    // A ligação tarefa↔projeto é por NOME de nota — a mesma regra do portfólio e
    // do script de ativação. Quando nenhuma pasta casa, o motor **não inventa**
    // ligação por parecença: declara a lacuna, que é do vault, não do motor.
    const linked = projects.filter(projeto => tasks.some(task => projectOf(task, projeto.name)));
    if (projects.length > 0 && linked.length === 0) {
        gaps.push(`Nenhum dos ${projects.length} projeto(s) do quadro casa, por nome, com uma tarefa: a ligação tarefa↔projeto é por nome de nota, e sem ela não há próxima ação real nem selo de exposição para derivar.`);
    } else if (projects.length > 0 && linked.length < projects.length) {
        gaps.push(`${linked.length} de ${projects.length} projeto(s) do quadro têm tarefa ligada por nome; nos demais a leitura de projeto fica vazia (e o número vazio não é progresso).`);
    }
    const undated = tasks.filter(task => isOpen(task) && !task.createdOn).length;
    if (undated > 0) gaps.push(`${undated} tarefa(s) aberta(s) sem data de criação: nenhuma delas entra em conta de idade.`);
    if (classification.semContexto > 0) gaps.push(`${classification.semContexto} tarefa(s) aberta(s) sem contexto declarado: o filtro de onde ele está não sabe onde ela cabe (a direção vem do verbo e da entrega, não do lugar).`);
    // `onTheTable` JÁ exclui `tarefa_smart` — contar com ele aqui dava sempre zero
    // e a lacuna nunca aparecia. A conta certa é a das metas que estariam na mesa
    // se não fossem metas: executáveis, abertas e não arquivadas.
    const smartOnTable = tasks.filter(task => isExecutable(task)
        && task.archived !== true
        && String(task.type ?? '').trim().toLowerCase() === 'tarefa_smart').length;
    if (smartOnTable > 0) gaps.push(`${smartOnTable} meta(s) SMART executável(is): a Matriz DFM também as deixa fora da mesa, e o ranking segue a mesma regra — elas aparecem no funil e no plano.`);
    const blocked = tasks.filter(task => onTheTable(task) && isBlocked(task)).length;
    if (blocked > 0) gaps.push(`${blocked} tarefa(s) executável(is) com bloqueador nomeado: fora do ranking, listadas no painel de espera.`);

    const projetoMaisProximo = closestProject(projects, tasks, input?.weekFocus ?? [], input?.declaredNext ?? {});
    if (projects.length > 0 && !projetoMaisProximo) {
        gaps.push('Nenhum projeto do quadro tem tarefa executável ligada por nome: não há próxima ação real para derivar nesta leitura.');
    }

    return {
        today,
        window,
        classification,
        agora,
        projetoMaisProximo,
        faixas,
        prontos: readyForExposure(projects, tasks),
        drift: detectDrift({ tasks, today, windowDays: 30 }),
        ciclos: closedCycles(tasks, window),
        gaps,
    };
}

/**
 * Proximidade de fechamento: quem tem prazo vem antes de quem não tem, e prazo
 * vencido vem antes de prazo futuro. Tarefa sem prazo nenhum vai para o fim —
 * não é "urgente por omissão".
 */
export function closingProximity(task: MissionTask, today: string): number {
    const due = String(task?.due ?? '').slice(0, 10);
    const scheduled = String(task?.scheduledDate ?? '').slice(0, 10);
    if (due) {
        const days = daysBetween(today, due);
        if (days !== null) return days;
    }
    if (task?.scheduledPast) return 0;
    if (scheduled) {
        const days = daysBetween(today, scheduled);
        if (days !== null) return days + 1;
    }
    return 999;
}

/** Contagem de direção pronta para o painel: nunca um número sem a lacuna ao lado. */
export function classificationLabel(classification: IntentClassification): string {
    const parts = [
        `${classification.externo} externa(s)`,
        `${classification.interno} interna(s)`,
        `${classification.indeterminado} sem direção`,
    ];
    if (classification.semContexto > 0) parts.push(`${classification.semContexto} sem contexto`);
    return parts.join(' · ');
}
