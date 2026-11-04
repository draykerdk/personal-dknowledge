/**
 * O índice que liga **canvas** a projetos, áreas e tarefas.
 *
 * A convenção existe no vault desde sempre — o canvas de um projeto se chama como
 * a pasta dele (`<pasta>/<nome>.canvas`), e medido em 15/09 são **25** arquivos assim
 * — contando só pasta de projeto em coluna kanban, que é o que o teste do vault fixa.
 * (Um 27 circulou antes por contar qualquer pasta cujo nome batesse, inclusive as que
 * não são projeto.) A convenção vivia **derivada dentro do painel**, repetida em cada
 * lugar que precisava dela. Aqui ela passa a ter uma casa: o painel pergunta, o modelo
 * responde.
 *
 * Três ligações, cada uma com uma fonte diferente — e é importante não confundi-las:
 *
 * 1. **projeto → canvas**: pela convenção do caminho. Não depende de campo nenhum
 *    no frontmatter, então funciona para os 25 que já existem e para os próximos.
 * 2. **área → canvas**: por pertencimento à árvore da área. Uma área tem vários
 *    canvas (medido: 24, 12, 11 e 3 nas quatro áreas), e um deles é o do topo.
 * 3. **tarefa → canvas**: pelo que o canvas **contém**. O caminho inverso (a tarefa
 *    declarar em que canvas está) existe no motor, mas está quebrado — ver a nota
 *    em `taskCanvasOf`. Enquanto isso, a ligação confiável é ler o desenho.
 */
import type { CanvasGraph } from './canvasMap';
import type { MissionSnapshot } from './missionSnapshot';
import type { MissionArea, MissionCanvas, MissionTask } from './missionTypes';
import type { PortfolioProject } from './missionPortfolio';
import { isProjectCanvasPath } from '../project/projectCanvasPath';

export interface CanvasIndexEntry {
    path: string;
    name: string;
    folder: string;
    nodes: number | null;
    edges: number | null;
    /** Última alteração do arquivo, para o painel dizer o frescor do desenho. */
    mtime: number | null;
    /** Projeto dono, quando o caminho segue a convenção da pasta do projeto. */
    project: string | null;
    /**
     * Pasta do projeto dono — o caminho em que o casamento aconteceu.
     *
     * Existe porque o **nome** não identifica um projeto: dois projetos homônimos em
     * áreas diferentes dariam o mesmo nome, e derivar a pasta a partir dele
     * apontaria os dois para o canvas do primeiro.
     */
    projectPath: string | null;
    /** Área dona, quando o canvas vive na árvore dela. */
    area: string | null;
    /** É o canvas do topo da área (o cockpit dela), não um canvas de projeto. */
    areaCockpit: boolean;
    /** Canvas do próprio sistema (kernel/dashboards) — não é trabalho do operador. */
    system: boolean;
}

export interface MissionCanvasIndex {
    entries: CanvasIndexEntry[];
    /** Pasta do projeto → o canvas dele. É a chave **autoritativa**. */
    byProjectPath: Map<string, CanvasIndexEntry>;
    /**
     * Nome do projeto → o canvas dele, **apenas quando o nome não é ambíguo**.
     *
     * Dois projetos com o mesmo nome em áreas diferentes são possíveis (hoje não
     * existem, medido em 15/09). Nesse caso o nome sai do mapa: devolver o canvas do
     * primeiro faria um projeto mostrar o desenho do outro, e ausência declarada é
     * melhor que dado trocado.
     */
    byProject: Map<string, CanvasIndexEntry>;
    /** Nomes de projeto que aparecem mais de uma vez no quadro. */
    ambiguousProjectNames: string[];
    /** Área (id) → os canvas da árvore dela, do mais recente ao mais antigo. */
    byArea: Map<string, CanvasIndexEntry[]>;
    /** Área (id) → o canvas do topo. */
    byAreaCockpit: Map<string, CanvasIndexEntry>;
    totals: {
        canvases: number;
        /** Quantos estão ligados a um projeto pela convenção. */
        withProject: number;
        /** Quantos vivem na árvore de alguma área. */
        withArea: number;
        /** Quantos não estão em nenhuma das duas — o número que pede olhar. */
        loose: number;
        /** Quantos são do próprio sistema. */
        system: number;
    };
}

function allProjects(snapshot: MissionSnapshot): PortfolioProject[] {
    return snapshot?.portfolio?.columns?.flatMap(column => column.projects ?? []) ?? [];
}

/**
 * O projeto dono deste canvas, se o caminho seguir a convenção.
 *
 * O casamento é por **caminho exato**, não por nome de arquivo: nome de arquivo
 * colide (existem canvas homônimos em pastas diferentes) e o caminho é o que o
 * script de ativação move junto. Os caminhos possíveis vêm do resolvedor único
 * (`project/projectCanvasPath.ts`): `<pasta do projeto>/<nome do projeto>.canvas`
 * e, para projeto que é repositório git próprio, `100 - AREAS/<área>/Canvases/<nome>.canvas`
 * (decisão 5a, 14/10/2026; correção L9 do plano do canvas).
 */
function projectOwnerOf(
    path: string,
    projects: PortfolioProject[],
): { name: string; path: string } | null {
    for (const project of projects) {
        if (!project.path || !project.name) continue;
        if (isProjectCanvasPath(path, project)) {
            return { name: project.name, path: project.path };
        }
    }
    return null;
}

function areaOwnerOf(folder: string, areas: MissionArea[]): MissionArea | null {
    let best: MissionArea | null = null;
    for (const area of areas) {
        if (!area.path) continue;
        if (folder !== area.path && !folder.startsWith(`${area.path}/`)) continue;
        // Prefixo mais longo vence: área dentro de área é possível.
        if (!best || area.path.length > best.path.length) best = area;
    }
    return best;
}

/**
 * O índice completo, a partir do snapshot já lido.
 *
 * Não lê o vault: recebe `canvases`, `areas` e `portfolio` do coletor. Um canvas
 * aparece **no máximo** em um projeto (o dono) e em uma área (a que o contém), e os
 * dois podem coexistir: o canvas de um projeto mora dentro da área dele.
 */
export function buildCanvasIndex(snapshot: MissionSnapshot): MissionCanvasIndex {
    const projects = allProjects(snapshot);
    const areas = snapshot?.areas ?? [];
    const entries: CanvasIndexEntry[] = [];

    for (const canvas of (snapshot?.canvases ?? []) as MissionCanvas[]) {
        const folder = canvas.folder ?? '';
        const area = areaOwnerOf(folder, areas);
        // O cockpit da área é o canvas que leva o nome dela na própria raiz. Os dois
        // nomes possíveis entram porque a área guarda o rótulo sem prefixo numérico
        // e a pasta com ele.
        const areaCockpit = Boolean(area) && (
            canvas.path === `${area!.path}/${area!.name}.canvas`
            || canvas.path === `${area!.path}/${area!.id}.canvas`
        );

        const owner = projectOwnerOf(canvas.path, projects);

        entries.push({
            path: canvas.path,
            name: canvas.name,
            folder,
            nodes: canvas.nodes,
            edges: canvas.edges,
            mtime: typeof canvas.mtime === 'number' ? canvas.mtime : null,
            project: owner ? owner.name : null,
            projectPath: owner ? owner.path : null,
            area: area ? area.id : null,
            areaCockpit,
            system: Boolean(canvas.system),
        });
    }

    const byProjectPath = new Map<string, CanvasIndexEntry>();
    const porNome = new Map<string, CanvasIndexEntry[]>();
    const byProject = new Map<string, CanvasIndexEntry>();
    const byArea = new Map<string, CanvasIndexEntry[]>();
    const byAreaCockpit = new Map<string, CanvasIndexEntry>();

    for (const entry of entries) {
        if (entry.project) {
            if (entry.projectPath && !byProjectPath.has(entry.projectPath)) {
                byProjectPath.set(entry.projectPath, entry);
            }
            const lista = porNome.get(entry.project) ?? [];
            lista.push(entry);
            porNome.set(entry.project, lista);
        }
        if (entry.area) {
            const list = byArea.get(entry.area) ?? [];
            list.push(entry);
            byArea.set(entry.area, list);
            if (entry.areaCockpit && !byAreaCockpit.has(entry.area)) byAreaCockpit.set(entry.area, entry);
        }
    }

    const ambiguousProjectNames: string[] = [];
    for (const [nome, lista] of porNome) {
        // Nome com mais de um canvas é nome ambíguo: sai do mapa por nome.
        if (lista.length > 1) ambiguousProjectNames.push(nome);
        else byProject.set(nome, lista[0]);
    }

    return {
        entries,
        byProjectPath,
        byProject,
        ambiguousProjectNames,
        byArea,
        byAreaCockpit,
        totals: {
            canvases: entries.length,
            withProject: entries.filter(entry => entry.project).length,
            withArea: entries.filter(entry => entry.area).length,
            loose: entries.filter(entry => !entry.project && !entry.area && !entry.system).length,
            system: entries.filter(entry => entry.system).length,
        },
    };
}

/**
 * O índice do snapshot, calculado **uma vez** por quadro.
 *
 * O memo é por identidade do snapshot: o coletor devolve o mesmo objeto enquanto o
 * cache de 15 s vale, e três painéis pedindo o índice na mesma renderização não
 * pagam três varreduras. `WeakMap` para o snapshot antigo poder ser coletado.
 */
const INDEX_MEMO = new WeakMap<MissionSnapshot, MissionCanvasIndex>();

export function canvasIndexOf(snapshot: MissionSnapshot): MissionCanvasIndex {
    const cached = INDEX_MEMO.get(snapshot);
    if (cached) return cached;
    const built = buildCanvasIndex(snapshot);
    INDEX_MEMO.set(snapshot, built);
    return built;
}

/**
 * O canvas de um projeto, pelo **caminho da pasta** — a chave autoritativa.
 *
 * Prefira esta: nome de projeto pode repetir entre áreas, e o caminho não.
 */
export function projectCanvasFor(
    index: MissionCanvasIndex,
    project: { name?: string; path?: string } | null | undefined,
): CanvasIndexEntry | null {
    if (!project) return null;
    if (project.path) {
        const porCaminho = index.byProjectPath.get(project.path);
        if (porCaminho) return porCaminho;
    }
    return project.name ? projectCanvasOf(index, project.name) : null;
}

/**
 * O canvas de um projeto pelo **nome**, quando o nome não é ambíguo.
 *
 * Devolve `null` para nome repetido em áreas diferentes — ausência declarada em vez
 * do desenho de outro projeto.
 */
export function projectCanvasOf(index: MissionCanvasIndex, projectName: string): CanvasIndexEntry | null {
    return index.byProject.get(projectName) ?? null;
}

/** Os canvas de uma área, do mais recente ao mais antigo. */
export function canvasesOfArea(index: MissionCanvasIndex, areaId: string): CanvasIndexEntry[] {
    return index.byArea.get(areaId) ?? [];
}

/** O canvas do topo da área (o cockpit dela), quando existe. */
export function areaCockpitOf(index: MissionCanvasIndex, areaId: string): CanvasIndexEntry | null {
    return index.byAreaCockpit.get(areaId) ?? null;
}

/**
 * Um projeto que tem nó neste canvas, com os caminhos por onde ele foi achado.
 *
 * Os caminhos existem porque o nó aponta para um **arquivo** — na prática, quase
 * sempre a nota-índice do projeto (`000 - INDEX/<nome>.md`) — e sem eles o painel
 * não consegue ligar o nó clicado ao projeto. Guardar só o nome deixava o inspetor
 * mudo justamente no nó mais provável de ser clicado.
 */
export interface CanvasProjectLink {
    name: string;
    /** Pasta do projeto. */
    path: string;
    /** Nota-índice, quando existe. É o alvo mais comum de um nó de projeto. */
    index: string | null;
}

export interface CanvasContents {
    /** Tarefas do TaskNotes que aparecem como nó neste canvas. */
    tasks: MissionTask[];
    /** Nomes de projeto cujo nó está neste canvas. */
    projects: string[];
    /** Os mesmos projetos, com caminhos — para o painel ligar o nó ao objeto. */
    projectLinks: CanvasProjectLink[];
    /** Nós de texto que não são arquivo nem grupo. */
    texts: number;
    groups: number;
    /** Nós de arquivo que não são tarefa nem projeto (notas comuns). */
    notes: number;
}

/**
 * O que este canvas **contém**, cruzando o desenho com o quadro.
 *
 * A ligação tarefa → canvas é lida **do desenho**, e não do frontmatter, por dois
 * motivos que continuam valendo:
 *
 * 1. O desenho é a verdade do momento: um nó presente é a tarefa naquele canvas,
 *    sem depender de nenhum campo ter sido gravado.
 * 2. Medido em 15/09: apenas **4 de 74** tarefas aparecem em canvas, e nenhuma tem
 *    registro no frontmatter — a ligação escrita praticamente não existe no vault,
 *    então lê-la daria ausência em quase toda consulta.
 *
 * Histórico que vale registrar: até esta janela o motor gravava o canvas dentro do
 * campo `projects` da tarefa (`canvasSync.addCanvasToProject`), e como o canvas do
 * projeto tem o **mesmo nome** do projeto, esse registro era indistinguível de um
 * vínculo de projeto real — criava ligação falsa. Foi corrigido: o motor passou a
 * gravar no campo de relações, que é a casa desse dado, e desde o Passo 0 da Missão (0d,
 * 27/10/2026) não grava nada quando o canvas tem o nome de um projeto. O desenho continua
 * sendo a leitura preferida, agora por verdade direta e não por contorno de defeito.
 */
export function canvasContents(
    graph: CanvasGraph | null,
    snapshot: MissionSnapshot,
): CanvasContents {
    const empty: CanvasContents = { tasks: [], projects: [], projectLinks: [], texts: 0, groups: 0, notes: 0 };
    if (!graph) return empty;

    const tasks = (snapshot?.board?.buckets ?? []).flatMap(bucket => bucket.tasks ?? []);
    const byPath = new Map(tasks.map(task => [task.path, task]));
    const projects = allProjects(snapshot);
    const projectNames = new Set<string>();

    const result: CanvasContents = { tasks: [], projects: [], projectLinks: [], texts: 0, groups: 0, notes: 0 };
    const seen = new Set<string>();

    for (const node of graph.nodes ?? []) {
        if (node.type === 'group') { result.groups += 1; continue; }
        if (node.type === 'text') { result.texts += 1; continue; }

        const target = node.target ?? '';
        if (!target) { result.notes += 1; continue; }

        const task = byPath.get(target);
        if (task) {
            if (!seen.has(task.path)) { seen.add(task.path); result.tasks.push(task); }
            continue;
        }

        const owner = projects.find(project => project.index === target || project.path === target);
        if (owner) {
            if (!projectNames.has(owner.name)) {
                projectNames.add(owner.name);
                result.projects.push(owner.name);
                result.projectLinks.push({ name: owner.name, path: owner.path, index: owner.index });
            }
            continue;
        }

        result.notes += 1;
    }

    return result;
}
