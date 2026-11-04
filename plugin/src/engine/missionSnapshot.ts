/**
 * O retrato do Mission Control (MissionSnapshot) e as partes dele que o agregador monta: o quadro
 * das tarefas, os ciclos, os hábitos, os protocolos e o operador.
 *
 * Por quê: o passo `tiposDoSnapshot` da divisão do motor (tests/engine/modeloMotor.test.ts). O
 * retrato morava no agregador (missionControl, camada 7), e o canvas do projeto e o índice dos
 * canvas (camada 5) o importavam de lá. Aqui, na projeção, ele lê os tipos das peças (o plano, o
 * grafo, o portfólio, a intenção, o catálogo) e os de base (missionTypes.ts), e nenhuma dessas
 * peças o importa de volta. O missionControl reexporta tudo, para quem já lia de lá.
 *
 * Só tipos: nada roda deste arquivo.
 */
import type { HabitCadence } from './habits';
import type { ProtocolCatalogInput } from './protocolCatalog';
import type { MissionMatrixCell, MissionPlanWeek, MissionQuarterWeek, MissionTimelineEntry } from './missionPlan';
import type { MissionGraph } from './missionGraph';
import type { MissionIntent } from './missionIntent';
import type { MissionPortfolio } from './missionPortfolio';
import type { MissionArea, MissionCanvas, MissionProject, MissionTask, MissionTree } from './missionTypes';

/* ==========================================================================
   O quadro das tarefas
   ========================================================================== */

export interface MissionBucketSpec {
    id: string;
    label: string;
    icon: string;
    statuses: string[];
    hint: string;
}

export interface MissionTaskTotals {
    open: number;
    terminal: number;
    overdue: number;
    dueToday: number;
    highImpact: number;
    withoutProject: number;
    focusWeek: number;
    /** As "algum dia": fora de Abertas e de Vencidas, ditas à parte ("+N algum dia"). */
    someday: number;
}

export interface MissionTaskBoard {
    buckets: Array<MissionBucketSpec & { tasks: MissionTask[] }>;
    totals: MissionTaskTotals;
}

/* ==========================================================================
   Ciclos — notas recorrentes (Day / Week / Quarterly)
   ========================================================================== */

export type MissionCycleKind = 'day' | 'week' | 'quarter';
export type MissionCycleState = 'absent' | 'open' | 'closed';

export interface MissionCycleField {
    key: string;
    label: string;
    value: string;
    filled: boolean;
}

export interface MissionCycle {
    kind: MissionCycleKind;
    label: string;
    name: string;
    path: string;
    link: string;
    exists: boolean;
    state: MissionCycleState;
    headline: string;
    value: string;
    rating: string;
    fields: MissionCycleField[];
    filled: number;
    total: number;
    /**
     * O que o ▶️ deixou na Day: entrega suficiente, valor, ação e o compromisso 🤝.
     * Lido do frontmatter (o modelo do Q4 não tem campo inline); as Days antigas
     * ainda caem nos campos inline e no `tarefa_smart`.
     */
    command: { unicaCoisa: string; valor: string; acao: string; compromisso: string; taskPath: string };
    /** Só da Day: ECH, contagem e aprendizado, que vêm do 🔎 Aprofundar. Fora do selo de campos. */
    telemetry: MissionCycleField[];
    /**
     * O compromisso que o 🌙 deixou para hoje, da última Day que o tiver (a regra da
     * pauta, 16/10): o texto, quando foi deixado ("ontem" ou `DD/MM`) e, quando é uma
     * TaskNote ainda executável, o caminho dela. Vazio sem compromisso deixado.
     */
    inheritedTrigger: string;
    inheritedTriggerWhen: string;
    inheritedTriggerPath: string;
    /** Só da Week: o valor das relações do par da semana (`valor_relacao`, 25/10). */
    relation: string;
}

/* ==========================================================================
   Hábitos
   ========================================================================== */

/**
 * O tracker de hábitos visto pelo console.
 *
 * A derivação usa o **mesmo motor** dos blocos ```dfm-habits``` das notas
 * (`engine/habits.ts`): contagem de execuções, nunca streak; ausência de
 * registro é ausência de dado. O que muda é só a superfície — antes o tracker
 * existia dentro de uma nota ou na aba Rotinas do Control Center antigo, e o
 * agente não o alcançava de lugar nenhum.
 */
export interface MissionHabitRow {
    path: string;
    title: string;
    protocolId: string | null;
    /** Regime declarado no tracker: `manual`, `protocol` ou `automatico`. */
    tracking: string;
    cells: Array<{ date: string; done: boolean }>;
    execucoes: number;
    doneToday: boolean;
    /** Última execução registrada, ou `null` quando nunca houve registro. */
    lastExecuted: string | null;
    /** Janela de revisão declarada (`revisar_em`) já vencida. */
    revisaoVencida: boolean;
    /** Data de `revisar_em`, quando declarada. */
    reviewOn?: string | null;
    /** Ritmo lido de `frequencia` (ver `habitToday`). */
    cadence?: HabitCadence;
    /** Execuções de segunda até hoje. */
    semana?: number;
    /** Hoje se espera o registro e ele ainda não veio. */
    pendenteHoje?: boolean;
    /** Hoje entra na conta de "hábitos hoje" (esperado ou já feito). */
    contaHoje?: boolean;
    /** Vezes por semana pedidas (só no semanal). */
    metaSemanal?: number | null;
    /** 1 alta, 2 média, 3 baixa. */
    prioridade?: number;
    /** Pilar ou projeto do trimestre a que o hábito serve. */
    pilar?: string | null;
}

export interface MissionHabits {
    /** Pasta lida — a tela diz de onde veio, e o que fazer se estiver vazia. */
    folder: string;
    /** Os dias da janela, do mais antigo para o mais novo. */
    days: string[];
    windowDays: number;
    rows: MissionHabitRow[];
    stats: {
        ativos: number;
        concluidosHoje: number;
        execucoesJanela: number;
        /**
         * Execuções de segunda até hoje, somadas entre os hábitos ativos: o hábito conta
         * na semana, sem sequência (núcleo, 4.4). Substitui a taxa de adesão em % (25/10/2026).
         */
        execucoesSemana: number;
        /** Quantos hábitos contam hoje pela cadência (esperados ou já feitos). */
        esperadosHoje?: number;
    };
}

/* ==========================================================================
   Protocolos e DSH
   ========================================================================== */

export interface MissionProtocol {
    id: string;
    name: string;
    icon: string;
    group: string;
    dshEnabled: boolean;
}

export interface MissionOperator {
    /** Sinal vivo "nota atual" gravado pelo ContextBridge. */
    signal: { path: string; title: string; ts: string } | null;
    signalAgeMinutes: number | null;
    /** Descritor da ponte operacional (3082). Ausente = ponte offline. */
    bridge: { port: number; vault: string; version: string; startedAt: string } | null;
    health: { ok: boolean; taskNotesVersion: string | null; capabilities: string[]; error?: string } | null;
    audit: Array<{ ts: string; action: string; target: string; ok: boolean; errorCode?: string }>;
    skills: Array<{ id: string; label: string; description: string; primary: boolean }>;
    allowlist: string[];
}

/* ==========================================================================
   Snapshot
   ========================================================================== */

export interface MissionSnapshot {
    generatedAt: string;
    today: string;
    week: string;
    quarter: string;
    vaultName: string;
    pluginVersion: string;
    board: MissionTaskBoard;
    /**
     * O plano, não o estoque.
     *
     * `board` diz o que existe; `plan` diz o que foi prometido para quando —
     * carga por dia, buracos, intenção vencida. Os dois convivem de propósito:
     * ler só o estoque foi o que fez o console parecer completo sem estar.
     */
    plan: MissionPlanWeek;
    /** Matriz DFM de ação (urgência × impacto), na língua da view canônica. */
    matrix: MissionMatrixCell[];
    /** Da intenção ao prazo, por tarefa. */
    timeline: MissionTimelineEntry[];
    /** As 13 semanas do trimestre, com o que existe em cada uma. */
    radar: MissionQuarterWeek[];
    /** Grafo tipado do plano vivo — o canvas que o vault não desenhou. */
    graph: MissionGraph;
    /** Tracker de hábitos: contagem de execuções, nunca streak. */
    habits: MissionHabits;
    cycles: { day: MissionCycle; week: MissionCycle; quarter: MissionCycle };
    projects: MissionProject[];
    /**
     * O ciclo de vida dos projetos, coluna por coluna.
     *
     * `projects` diz o trabalho (tarefas por projeto); `portfolio` diz onde cada
     * projeto está no kanban, se tem a nota-índice que o juiz P1 cobra e se tem
     * árvore de progressão. São perguntas diferentes sobre o mesmo objeto — e a
     * segunda não existia em lugar nenhum do console.
     */
    portfolio: MissionPortfolio;
    /**
     * A direção do esforço — a sexta leitura que o console não tinha.
     *
     * `board` diz o que existe, `plan` diz o que foi prometido, `portfolio` diz
     * onde cada projeto está. `intent` diz **para onde o esforço aponta**:
     * quantas tarefas abertas são externas, qual é a próxima ação real do
     * projeto mais perto de gerar resultado, quais externas estão prontas para o
     * mundo, quais ciclos fecharam na semana e quais sinais de drift o vault
     * sustenta com número e data.
     */
    intent: MissionIntent;
    areas: MissionArea[];
    trees: MissionTree[];
    canvases: MissionCanvas[];
    protocols: MissionProtocol[];
    /**
     * O catálogo inteiro para a página "Protocolos" do painel: definições, arquivos, o que
     * não carregou e o uso nas Days de 30 dias (`engine/protocolCatalog.ts`). `null` sem
     * registro de protocolos. Fica fora da projeção do operador.
     */
    protocolCatalog?: ProtocolCatalogInput | null;
    operator: MissionOperator;
    notes: string[];
}
