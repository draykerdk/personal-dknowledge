/**
 * Portfólio de projetos — o ciclo de vida lido do vault inteiro.
 *
 * Por que este módulo existe: o Control Center antigo tinha um quadro kanban por
 * área, e ele movia a pasta do projeto com `fileManager.renameFile`. O nó de
 * arquivo de um `.canvas` guarda o caminho **completo**, então cada arrasto
 * deixava o mapa do projeto apontando para uma pasta que não existe mais — a
 * regra da casa proíbe. O quadro volta aqui sem o arrasto: esta camada lê, e a
 * movimentação sancionada é o script do vault (`activate_project.py`), que
 * reescreve os canvas junto com a pasta.
 *
 * Mesmo contrato dos irmãos (`missionPlan`, `missionGraph`): **função pura**,
 * sem I/O e sem `obsidian`. O coletor entrega o que já leu; aqui só se deriva —
 * e é por isso que os testes cobrem este arquivo sem abrir o Obsidian.
 *
 * Ciclo de importação: este módulo importa de `missionControl` **apenas tipos**.
 * Um ciclo de valores já quebrou esta base duas vezes; `PROJECT_STAGES` vive
 * aqui (é a ordem canônica do quadro) e `missionControl` a reexporta.
 */
import type { MissionArea, MissionProject } from './missionTypes';

/* ==========================================================================
   Colunas canônicas
   ========================================================================== */

/**
 * As seis fases do kanban de projetos (`100 - AREAS/<área>/100 - PROJECTS/`).
 *
 * A lista mora aqui porque é ela que define a **ordem** do quadro. `discoverAreas`
 * conta por estágio e o portfólio desenha por estágio; duas listas divergiriam na
 * primeira coluna nova, e o painel passaria a esconder projetos em silêncio.
 */
export const PROJECT_STAGES = ['1 - Backlog', '2 - Active', '3 - Waiting', '4 - Review', '5 - Done', '6 - Integration'] as const;

/** As seis colunas, na ordem canônica. Toda coluna existe sempre, mesmo vazia. */
export const PROJECT_COLUMNS: ReadonlyArray<string> = PROJECT_STAGES;

/**
 * Cada coluna pelo estágio que ela é (a chave é o `status` que espelha a coluna), lida
 * da lista acima: quem precisa de uma coluna (o destino de um gesto, as de projeto
 * encerrado, a do Cold Storage) a pede aqui, e nunca escreve a string de novo.
 *
 * Por quê: as cópias à mão divergem em silêncio na primeira coluna nova (harmonização
 * H2b, 29/10/2026; PRINCIPIOS §4, seção As cópias à mão). A ordem e o `status` de cada
 * coluna são conferidos contra `200 - FUNCTIONS/Scripts/colunas_kanban.py`, a cópia
 * única dos scripts (`tests/contracts/colunasKanban.test.ts`).
 */
export const STAGE = {
    backlog: PROJECT_STAGES[0],
    active: PROJECT_STAGES[1],
    waiting: PROJECT_STAGES[2],
    review: PROJECT_STAGES[3],
    done: PROJECT_STAGES[4],
    integration: PROJECT_STAGES[5],
} as const;

/** As colunas de projeto encerrado: ali o ciclo terminou (fora da lista do painel e do P1). */
export const CLOSED_STAGES: ReadonlySet<string> = new Set([STAGE.done, STAGE.integration]);

/**
 * As colunas que o juiz P1 cobra (`validate_projects.py`), **na ordem em que a
 * lista de correção deve ser lida**.
 *
 * Não é a ordem do quadro, e é de propósito: um projeto em Active sem
 * nota-índice está em uso e reprova a bancada hoje; um no Backlog é estoque e
 * espera a vez. O quadro desenha o Backlog primeiro porque é onde está a maior
 * parte dos projetos; a lista do que consertar começa pelo que está rodando.
 *
 * Done e Integration ficam fora: ali o ciclo já terminou, e cobrar README de um
 * projeto arquivado seria inventar uma reprovação que o juiz não faz.
 */
const P1_SEVERITY: ReadonlyArray<string> = [STAGE.active, STAGE.waiting, STAGE.review, STAGE.backlog];

/** `1 - Backlog` → `Backlog`. A coluna sem o prefixo de ordem. */
export function stageLabel(stage: string): string {
    const value = String(stage ?? '');
    return value.replace(/^\d+\s*-\s*/, '').trim() || value;
}

/* ==========================================================================
   Tipos
   ========================================================================== */

export interface PortfolioProject {
    /** Nome da pasta = nome canônico do projeto (o script de ativação procura por ele). */
    name: string;
    /** Pasta do projeto. */
    path: string;
    /** Nome da área, sem o prefixo numérico da pasta (`01 - Uma área` → `Uma área`). */
    area: string;
    /** `1 - Backlog` … `6 - Integration`. */
    column: string;
    /** Caminho da nota-índice quando existe (`README.md` ou `<nome>.md`). */
    index: string | null;
    /** A nota-índice declara `type: iniciativa`? É o que o juiz P1 cobra. */
    hasIndexType: boolean;
    /** Doc `type: arvore_progressao` na pasta, quando existe. */
    tree: string | null;
    /**
     * Tarefas ligadas ao projeto pelo nome, como `aggregateProjects` as agrega.
     *
     * `total: 0` significa **nenhuma tarefa vinculada** — ausência de dado, não
     * "zero tarefas feitas". O painel é obrigado a dizer a ausência em palavras;
     * uma barra de progresso vazia transformaria o silêncio do vault em nota.
     */
    tasks: { total: number; completed: number; blocked: number };
}

export interface PortfolioColumn {
    stage: string;
    label: string;
    projects: PortfolioProject[];
}

export interface MissionPortfolio {
    /** Uma faixa por coluna — as seis canônicas sempre presentes, na ordem. */
    columns: PortfolioColumn[];
    areas: Array<{ name: string; path: string; canvas: string | null; projects: number; departments: number }>;
    departments: Array<{ name: string; area: string; path: string }>;
    /** Projetos sem a nota-índice com `type: iniciativa` — o que o juiz P1 reprova. */
    missingIndex: PortfolioProject[];
    totals: {
        /** Projetos lidos no quadro inteiro. */
        projects: number;
        /** Quantos têm nota-índice com `type: iniciativa` (passam no P1). */
        indexed: number;
        /** Quantos têm doc `type: arvore_progressao` na pasta. */
        withTree: number;
    };
}

/* ==========================================================================
   Derivação
   ========================================================================== */

/**
 * Índice `nome → métricas de tarefa`.
 *
 * O cruzamento é por **nome** porque é o que o TaskNotes grava em `projects`
 * (wikilink sem caminho) e o que o script de ativação procura na pasta. Casar
 * por caminho seria impossível: a pasta muda de coluna, o nome não.
 */
export function indexProjectTasks(projects: MissionProject[]): Map<string, PortfolioProject['tasks']> {
    const index = new Map<string, PortfolioProject['tasks']>();
    for (const project of projects ?? []) {
        const name = String(project?.name ?? '').trim();
        if (!name) continue;
        index.set(name, {
            total: Number(project.total) || 0,
            completed: Number(project.completed) || 0,
            blocked: Number(project.blocked) || 0,
        });
    }
    return index;
}

/** Ausência de tarefa tem a mesma forma do zero: o painel decide como dizer isso. */
const NO_TASKS: PortfolioProject['tasks'] = { total: 0, completed: 0, blocked: 0 };

/** Métricas de um projeto, ou a ausência declarada quando não há tarefa vinculada. */
export function tasksForProject(index: Map<string, PortfolioProject['tasks']>, name: string): PortfolioProject['tasks'] {
    return index.get(String(name ?? '').trim()) ?? { ...NO_TASKS };
}

/**
 * Monta o quadro a partir do que o coletor leu.
 *
 * Três decisões que valem registrar:
 *
 * 1. **As seis colunas sempre existem.** Coluna vazia é informação: diz que a
 *    fase não está em uso. Sumir com ela faria o operador concluir que a fase
 *    não existe no sistema.
 * 2. **Pasta em coluna fora das seis não some.** Uma coluna criada à mão entra
 *    depois das canônicas, com o próprio nome — o quadro nunca esconde projeto
 *    por não reconhecer a pasta onde ele está.
 * 3. **`missingIndex` na ordem de gravidade**, não em ordem alfabética nem na
 *    ordem do quadro: um projeto em Active sem índice pesa mais que um no
 *    Backlog, e a lista é para ser corrigida de cima para baixo.
 */
export function buildPortfolio(
    projects: PortfolioProject[],
    areas: MissionArea[],
    departments: Array<{ name: string; area: string; path: string }>,
): MissionPortfolio {
    const listed = (Array.isArray(projects) ? projects : []).filter(Boolean);
    const depts = (Array.isArray(departments) ? departments : []).filter(Boolean);
    const byName = (a: PortfolioProject, b: PortfolioProject) => a.name.localeCompare(b.name);

    const strays = [...new Set(listed.map(project => project.column))]
        .filter(column => !PROJECT_COLUMNS.includes(column))
        .sort((a, b) => a.localeCompare(b));
    const columns: PortfolioColumn[] = [...PROJECT_COLUMNS, ...strays].map(stage => ({
        stage,
        label: stageLabel(stage),
        projects: listed.filter(project => project.column === stage).sort(byName),
    }));

    const severity = new Map(P1_SEVERITY.map((stage, index) => [stage, index]));
    const missingIndex = listed
        .filter(project => !project.hasIndexType && severity.has(project.column))
        .sort((a, b) => (severity.get(a.column) ?? 0) - (severity.get(b.column) ?? 0) || byName(a, b));

    return {
        columns,
        areas: (Array.isArray(areas) ? areas : []).map(area => ({
            name: area.name,
            path: area.path,
            canvas: area.canvas ?? null,
            projects: listed.filter(project => project.area === area.name).length,
            departments: depts.filter(dept => dept.area === area.name).length,
        })),
        departments: depts.map(dept => ({ name: dept.name, area: dept.area, path: dept.path })),
        missingIndex,
        totals: {
            projects: listed.length,
            // `indexed` conta quem PASSA no P1 — nota-índice com `type: iniciativa`.
            // Não é "tem algum .md na pasta": o juiz cobra o tipo, e uma contagem
            // mais generosa aqui faria o painel absolver o que a bancada reprova.
            indexed: listed.filter(project => project.hasIndexType).length,
            withTree: listed.filter(project => Boolean(project.tree)).length,
        },
    };
}
