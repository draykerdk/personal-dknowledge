/**
 * Os tipos de base da projeção do Mission Control: a tarefa, o projeto, a área, a árvore de
 * progressão e o canvas como o painel os lê, e a direção do esforço de uma tarefa.
 *
 * Por quê: o passo `tiposDoSnapshot` da divisão do motor (tests/engine/modeloMotor.test.ts). Os
 * tipos moravam no agregador (missionControl, que liga ao cofre), e as peças da projeção (o
 * grafo, a intenção, o plano, o portfólio, a matriz, o kanban, o canvas) os importavam de lá:
 * o ciclo do missionControl com quatro delas e o import para cima da camada 5 para a 7. Aqui, na
 * própria projeção, os tipos não importam nenhuma peça, e as peças e o agregador os leem sem
 * volta; o retrato inteiro (MissionSnapshot) mora em missionSnapshot.ts, que lê das peças.
 *
 * Só tipos: nada roda deste arquivo.
 */
import type { GrammarUnit } from './showGrammar';

/* ==========================================================================
   A direção do trabalho
   ========================================================================== */

export type WorkNucleo = 'externo' | 'interno' | 'indeterminado';

/* ==========================================================================
   Tarefas
   ========================================================================== */

export interface MissionTask {
    path: string;
    title: string;
    status: string;
    priority: string;
    projects: string[];
    week: string;
    due: string;
    impact: number | null;
    overdue: boolean;
    dueToday: boolean;
    highImpact: boolean;
    /**
     * Intenção de execução declarada no TaskNotes (`scheduled`), crua.
     * É o campo que separa **estoque** de **plano**: sem ele o console só sabe o
     * que existe, nunca o que foi prometido para quando.
     */
    scheduled: string;
    /** Data declarada (`YYYY-MM-DD`) — o que coloca a tarefa num dia do plano. */
    scheduledDate: string;
    /** Hora declarada (`HH:mm`) ou vazio: tarefa do dia, não de um bloco. */
    scheduledTime: string;
    /** Agendada para um dia que já passou e continua aberta. Intenção vencida, não prazo. */
    scheduledPast: boolean;
    /** Duração estimada em minutos; `null` quando o autor não estimou. */
    estimate: number | null;
    /** Contextos TaskNotes (`🚶 Campo`, `💻 Computador`). */
    contexts: string[];
    /**
     * `task` (ação atômica) ou `tarefa_smart` (meta-mãe). O vault inteiro separa
     * as duas: a Matriz DFM filtra `type != "tarefa_smart"` e o fluxo da semana
     * liga SMART-mãe a blocos atômicos. Sem este campo o console trataria as duas
     * como a mesma coisa — e "1 tarefa" passaria a significar duas coisas.
     */
    type: string;
    /** Arquivada: TaskNotes marca por tag `archived`; o campo `archived: false` é o padrão da casa. */
    archived: boolean;
    /**
     * Wikilinks das tarefas que bloqueiam esta (`blockedBy` do TaskNotes).
     *
     * O campo existe no esquema desde sempre — a view canônica da matriz o usa
     * para tirar da mesa a tarefa que depende de outra em aberto — mas nenhuma
     * tarefa do vault o preenchia até agora. Ler o campo é o que permite ao
     * console mostrar **quem** bloqueia, em vez de só marcar "bloqueado".
     */
    blockedBy: string[];
    /* ------------------------------------------------------------------
       Campos de direção, data e entrega — todos opcionais de propósito.

       `MissionTask` é construído à mão em teste, ponte e agente; transformar
       qualquer um destes em obrigatório quebraria os construtores que não os
       conhecem. Ausente aqui significa **ausência de dado**, nunca zero: tarefa
       sem `createdOn` não tem idade 0, tem idade desconhecida.
       ------------------------------------------------------------------ */
    /** `dateCreated` do TaskNotes, `YYYY-MM-DD`. Vazio = sem data. */
    createdOn?: string;
    /** `dateModified`, `YYYY-MM-DD`. Vazio = sem data. */
    modifiedOn?: string;
    /** `completedDate` — a data que a métrica de ciclos fechados lê. */
    completedOn?: string;
    /** `entrega_observavel` declarada (campo SMART). Vazio = não declarada. */
    deliverable?: string;
    /** `criterio_suficiente` declarado (campo SMART). Vazio = não declarado. */
    sufficientCriteria?: string;
    /** Links `http(s)` no corpo da nota. `undefined` = corpo não lido — ausência, não zero. */
    outboundLinks?: number;
    /**
     * Direção do esforço, derivada por `missionIntent.classifyWork` a partir do
     * que já está escrito na tarefa (contexto, verbo, status, campos SMART).
     * `indeterminado` é estado de primeira classe: sem evidência, não há palpite.
     */
    nucleo?: WorkNucleo;
    /** Por que a direção foi atribuída — cada sinal lido, em PT-BR. */
    nucleoReason?: string[];
}

/* ==========================================================================
   Projetos e áreas
   ========================================================================== */

export type MissionHealth = 'on-track' | 'at-risk' | 'overdue' | 'completed' | 'no-data';

export interface MissionProject {
    name: string;
    total: number;
    completed: number;
    pending: number;
    blocked: number;
    doing: number;
    progressPercent: number;
    health: MissionHealth;
    inFocus: boolean;
    /**
     * As tarefas do projeto como unidades da forma de mostrar (`engine/showGrammar.ts`):
     * o painel conta e escreve a linha pela função única, com o horizonte do projeto no
     * trimestre, em vez de "concluídas/total" e porcentagem. Opcional: os construtores
     * à mão (testes, ponte) não a conhecem, e sem ela a linha é a de ausência.
     */
    units?: GrammarUnit[];
}

export interface MissionArea {
    id: string;
    name: string;
    path: string;
    initiatives: number;
    departments: number;
    staged: Array<{ stage: string; count: number }>;
    canvas: string | null;
}

/* ==========================================================================
   Árvores de progressão e Canvas
   ========================================================================== */

export interface MissionTreeTier {
    num: number;
    /** A letra do nível na trilha ("I" em I1); sem trilha ou sem letra, vazio. */
    prefixo?: string;
    nome: string;
    status: 'done' | 'ativo' | 'locked';
    objetivo: string;
}

export interface MissionTree {
    file: string;
    project: string;
    tiers: MissionTreeTier[];
    active: MissionTreeTier | null;
    done: number;
    total: number;
}

export interface MissionCanvas {
    path: string;
    name: string;
    folder: string;
    nodes: number | null;
    edges: number | null;
    mtime: number;
    system: boolean;
}
