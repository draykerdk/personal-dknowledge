// As escolhas fechadas que as tools da ponte oferecem ao modelo.
//
// Por quê: um modelo menor escolhe bem numa lista e erra ao adivinhar texto livre. Cada
// lista aqui é cópia de um dono no cofre, e a cópia é vigiada por teste
// (`native-dsh/test/contract.test.mjs`): mudou o dono, o teste fica vermelho até a cópia
// acompanhar. O gateway do DFMsystem continua validando tudo de novo; a lista daqui só
// evita a chamada errada e diz ao modelo o que existe.

// Os status de uma TaskNote não moram aqui: vêm do modelo da tarefa (`Config/dominios/tarefa.json`,
// a tabela de estados), lido por `schema.js` ao montar as tools (02/11/2026).

/** A urgência. Dono: o catálogo do TaskNotes e `PRIORITIES` em `src/engine/dshOperatorCore.ts`. */
export const TASK_PRIORITIES = ["none", "low", "normal", "high"];

/** Onde dá para fazer. Dono: `TASK_CONTEXTS` em `src/engine/taskContexts.ts`. */
export const TASK_CONTEXTS = ["💻 Computador", "🌍 Externo", "📱 Celular", "🎬 Criação", "🤝 Relacional", "🚶 Campo"];

/**
 * Os protocolos que a ponte abre para o operador quando a config do pacote não diz (`protocol_ids`):
 * os do pacote aberto que fazem um papel da ponte (`PAPEIS_DA_PONTE` em `src/engine/dshAllowlist.ts`,
 * com os ids de partida de `src/definicoes.ts`). Os ids do cofre de cada pessoa moram na config dela,
 * não aqui; o gateway confere de novo e recusa o resto.
 */
export const PROTOCOL_IDS_DE_PARTIDA = ["planejamento_semanal", "review_semanal"];

/**
 * As seções do painel que a ponte oferece. Dono: `MISSION_SECTIONS` em
 * `src/engine/missionControl.ts`, igual de ponta a ponta (os `vitals` da gamificação saíram
 * do dono em 02/11/2026).
 */
export const MISSION_SECTIONS = [
  "tasks", "plan", "habits", "cycles", "projects", "portfolio", "intent",
  "areas", "trees", "canvases", "protocols", "operator", "notes",
];

/**
 * Os tetos da projeção do painel. Dono: `DEFAULT_PROJECTION_LIMITS` em
 * `src/engine/missionControl.ts`, igual de ponta a ponta (o `nudgeActions` saiu do dono em
 * 02/11/2026).
 */
export const MISSION_LIMIT_KEYS = [
  "canvases", "protocols", "trees", "projects", "portfolioProjects", "tasksPerBucket",
  "areas", "planTasksPerDay", "planMatrixPerCell", "planTimeline", "habits",
  "intentActions", "intentBands", "intentDrift",
];

/**
 * Os períodos do estado da Missão (`dfm_mission_state`). Dono: `PERIODOS_DO_ESTADO` em
 * `src/engine/estadoDaMissao.ts`; o teto da lista, `ITENS_DO_ESTADO.maximo` no mesmo arquivo.
 */
export const MISSION_PERIODS = ["hoje", "amanha", "semana", "proxima_semana"];
export const MISSION_STATE_MAX_ITEMS = 40;

/**
 * O que o agente pode propor (`dfm_propose`). Dono: `ACOES_DA_PROPOSTA` em
 * `src/engine/propostasDoAgente.ts`; o tamanho do porquê, `PORQUE_MAXIMO` no mesmo arquivo.
 */
export const PROPOSAL_ACTIONS = ["ligar_smart", "ligar_projeto", "semana", "dia", "criar_tarefa"];
export const PROPOSAL_REASON_MAX = 200;
