/**
 * Todo projeto tem um canvas, e o canvas gerencia as tarefas do projeto.
 *
 * - **Sincroniza** a zona gerida (`projectCanvasModel.ts`) quando uma TaskNote do
 *   projeto muda — criada, concluída, religada, apagada. Só em canvas que já
 *   existe; criar canvas é sempre um comando.
 * - **Cria** o canvas do projeto que não tem (um a um, ou os que faltam de uma vez,
 *   com confirmação; pasta que é submódulo git fica de fora).
 * - **Fluxos no próprio canvas** (clique-direito): nova SMART no projeto, nova
 *   ação atômica numa SMART, ligar ação solta a uma SMART.
 *
 * Canvas aberto é atualizado ao vivo (`canvas.setData`, que entra no desfazer);
 * canvas fechado é regravado no arquivo. Nos dois casos o motor de canvas recebe
 * a nova linha de base, para não tratar a zona como edição do operador.
 *
 * Canvas dentro de repositório git aninhado (submódulo ou pasta com `.git`) não
 * é criado nem sincronizado: é de outro repositório. O canvas desse projeto mora
 * na área, em `100 - AREAS/<área>/Canvases/<Nome>.canvas` (decisão 5a; o caminho
 * vem do resolvedor único `projectCanvasPath.ts`). No celular nenhum canvas é
 * criado nem gravado (`canvasWritesAllowed`).
 *
 * Departamentos (`200 - DEPARTMENTS/<Nome>`, índice `<Nome>.md`) também são
 * projetos aqui (um departamento pode ser uma das centrais da Temporada). O canvas de departamento
 * que ainda não tem zona gerida (feito à mão, como o `Meditation.canvas`) só
 * ganha a zona por pedido (comando, menu ou criação), nunca ao abrir.
 *
 * Fase 5: a zona abre com o cabeçalho `dfm-pc-proj` (nome, o "quanto falta" de
 * `projectProgress` e "↑ trimestre · semana em foco · área") e as setas
 * projeto → SMART.
 *
 * Setas que gravam (Fase 2): o gerente diz ao observador de setas
 * (`EdgeLinkWatcher`) qual nota-índice e qual `.canvas` são de qual projeto
 * (`linkScope`), e a sincronização da zona passa o observador ao
 * `applyCanvasPlan`. "Ligar a uma SMART…" usa a mesma regra da seta SMART → ação
 * (`edgeLinks.patchFor`). A seta do operador que toca a zona e é só desenho
 * fica na sincronização (`keepEdgeFor`, Fase 3).
 */
import { Menu, Notice, TFile, normalizePath } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from '../board/boardPlugin';
import { BoardCanvasMenus } from '../board/boardCanvasMenus';
import {
    PROJECT_HEAD_ID, TERMINAL, ZONE_GROUP_ID, collectProjectTasks, fold, gitmodulePaths, insideNestedRepo, newProjectCanvas, offersLinkToSmart, planProjectCanvas,
    projectKeys, projectProgress, smartOptionsFor,
} from './projectCanvasModel';
import type { NavRef, PlanResult, ProjectHeader, ProjectInfo, ProjectProgress, TaskInfo } from './projectCanvasModel';
import { AREAS_ROOT, areaRootOf, conventionalCanvasPath, projectCanvasPath } from './projectCanvasPath';
import { currentQuarter, quarterPeriod, shortWeek } from '../engine/calendario';
import { applyCanvasPlan, canvasWritesAllowed, revealCanvas } from '../canvas/managedZone';
import { motherLink, patchFor } from '../canvas/edgeLinks';
import type { ManagedScope, ProjectRef } from '../canvas/edgeLinks';
import type { EdgeLinkWatcher } from '../canvas/edgeLinkWatcher';
import { projetoAtual } from '../missao/intencoes';
import { ehSemana } from '../engine/periodo';

const SYNC_DELAY_MS = 1500;

function today(): string {
    return (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
}

function isoWeek(): string {
    return (window as any).moment?.().format('GGGG-[W]WW') ?? '';
}

/** O que o widget `projeto` e o painel precisam de um projeto: a mesma conta do trimestre e da zona. */
export interface ProjectFacts {
    name: string;
    progress: ProjectProgress;
    /** O canvas do projeto, quando existe. */
    canvas: string | null;
    index: string | null;
}

interface PortfolioLike {
    columns?: Array<{ projects: Array<{ name: string; path: string; index: string | null }> }>;
    departments?: Array<{ name: string; path: string }>;
}

export class ProjectCanvasManager {
    private pending = new Set<string>();
    private timer: number | null = null;
    /** Última filiação conhecida de cada tarefa: tirar uma tarefa do projeto também ressincroniza. */
    private membership = new Map<string, Set<string>>();
    /** Submódulos do `.gitmodules` do vault, lidos uma vez (no `onLayoutReady`). */
    private submoduleRoots: Promise<string[]> | null = null;
    /** Raízes de repositório aninhado já conhecidas (`.gitmodules` e pastas com `.git`): o resolvedor do caminho lê daqui. */
    private readonly nested = new Set<string>();
    /** Pastas cuja `.git` já foi conferida. */
    private readonly checked = new Set<string>();

    constructor(private readonly plugin: DFMPlugin, private readonly board: MissionBoard, private readonly links: EdgeLinkWatcher | null = null) {}

    private get app() { return this.plugin.app; }
    private get engine(): any { return (this.plugin as any).canvasEngine; }
    private autoSync(): boolean { return (this.plugin.settings as any).projectCanvasAutoSync !== false; }

    register(): void {
        const plugin = this.plugin;

        plugin.addCommand({
            id: 'dfm-project-canvas-sync',
            name: 'Projeto: sincronizar canvas do projeto',
            checkCallback: checking => {
                const project = this.activeProjectSync();
                if (!project) return false;
                if (!checking) void project.then(p => {
                    if (p) void this.sync(p, { notify: true });
                    else new Notice('Nenhum projeto reconhecido aqui.');
                });
                return true;
            },
        });
        plugin.addCommand({
            id: 'dfm-project-canvas-open',
            name: 'Projeto: abrir (ou criar) canvas do projeto…',
            callback: () => void this.pickAndOpen(),
        });
        plugin.addCommand({
            id: 'dfm-project-canvas-create-missing',
            name: 'Projetos: criar os canvas que faltam',
            callback: () => void this.createMissing(),
        });
        plugin.addCommand({
            id: 'dfm-project-canvas-sync-all',
            name: 'Projetos: sincronizar todos os canvas de projeto',
            callback: () => void this.syncAll(),
        });

        plugin.registerEvent(this.app.metadataCache.on('changed', file => this.onTaskChanged(file)));
        // Ao abrir: o dia pode ter virado (vencidas mudam de cor) sem nenhuma tarefa mudar.
        plugin.registerEvent(this.app.workspace.on('file-open', file => {
            if (!(file instanceof TFile) || file.extension !== 'canvas' || !this.autoSync()) return;
            // Espera a view montar o canvas antes de ler o que está desenhado.
            window.setTimeout(() => {
                void this.projectOf(file.path).then(p => {
                    if (p && this.canvasPathFor(p) === file.path) return this.sync(p);
                }).catch(error => console.error('DFM Projeto: falha ao sincronizar ao abrir', error));
            }, 800);
        }));
        plugin.registerEvent(this.app.vault.on('delete', file => file instanceof TFile && this.onTaskGone(file.path)));
        plugin.registerEvent(this.app.vault.on('rename', (_file, oldPath) => this.onTaskGone(oldPath)));
        plugin.registerEvent(this.app.workspace.on('canvas:node-menu' as any, (menu: Menu, node: any) => this.nodeMenu(menu, node)));
        BoardCanvasMenus.emptyMenuContributors.push((menu, ctx) => this.emptyMenu(menu, ctx));
        plugin.registerEvent(this.app.workspace.on('dfm:protocol-complete' as any, (payload: any) => void this.onProtocol(payload)));
        plugin.register(() => { if (this.timer !== null) window.clearTimeout(this.timer); });
        this.links?.addResolver(path => this.linkScope(path));
        this.app.workspace.onLayoutReady(() => {
            // As raízes de repositório antes de qualquer leitura de caminho (a nota do trimestre também pergunta).
            void this.learnRoots(this.projectFolders());
            const tasks = this.readTasks();
            const smarts = this.smartIndex(tasks);
            for (const task of tasks) this.remember(task, smarts);
        });
    }

    /* ------------------------------------------------------------ leitura */

    private taskInfo(file: TFile): TaskInfo | null {
        return this.board.tasks.read(file);
    }

    readTasks(): TaskInfo[] {
        return this.board.tasks.all();
    }

    /** Projetos do kanban e departamentos, com as raízes de repositório deles já conferidas. */
    async projects(): Promise<ProjectInfo[]> {
        let snapshot = this.board.store.current();
        if (!snapshot) snapshot = await this.plugin.getMissionControl().build();
        const list = this.fromPortfolio(snapshot?.portfolio);
        await this.learnRoots(list.map(p => p.path));
        return list;
    }

    /** O mesmo, sem esperar: do portfólio já lido (para quem não pode ser assíncrono). */
    projectsSync(): ProjectInfo[] {
        return this.fromPortfolio(this.board.store.current()?.portfolio);
    }

    private fromPortfolio(portfolio: PortfolioLike | null | undefined): ProjectInfo[] {
        const projects: ProjectInfo[] = (portfolio?.columns ?? []).flatMap(c => c.projects)
            .map(p => ({ name: p.name, path: p.path, index: p.index, kind: 'projeto' as const }));
        const known = new Set(projects.map(p => fold(p.name)));
        for (const d of portfolio?.departments ?? []) {
            if (!d?.name || !d.path || known.has(fold(d.name))) continue;
            known.add(fold(d.name));
            projects.push({ name: d.name, path: d.path, index: this.departmentIndex(d.path, d.name), kind: 'departamento' });
        }
        return projects;
    }

    /** A nota-índice do departamento: `<Nome>.md`; sem ela, o `README.md`. */
    private departmentIndex(folder: string, name: string): string | null {
        for (const candidate of [`${folder}/${name}.md`, `${folder}/README.md`]) {
            const path = normalizePath(candidate);
            if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) return path;
        }
        return null;
    }

    /** O canvas do projeto, pelo resolvedor único (repositório aninhado → canvas na área). */
    canvasPathFor(project: Pick<ProjectInfo, 'name' | 'path'>): string {
        return normalizePath(projectCanvasPath(project, this.nested));
    }

    /** O canvas da pasta de um projeto ou departamento (a nota do trimestre pergunta por aqui). */
    canvasPathOfFolder(folder: string): string {
        const path = normalizePath(folder);
        return this.canvasPathFor({ name: path.slice(path.lastIndexOf('/') + 1), path });
    }

    /**
     * Para as setas que gravam: a nota-índice e o `.canvas` de cada projeto
     * apontam o projeto; no canvas do projeto, o cabeçalho `dfm-pc-proj` também.
     */
    async linkScope(path?: string): Promise<ManagedScope> {
        const projectsByFile: Record<string, ProjectRef> = {};
        const projectNodes: Record<string, ProjectRef> = {};
        for (const p of await this.projects()) {
            const ref: ProjectRef = { name: p.name, keys: [...projectKeys(p)] };
            if (p.index) projectsByFile[p.index] = ref;
            const canvas = this.canvasPathFor(p);
            projectsByFile[canvas] = ref;
            if (path && canvas === path) projectNodes[PROJECT_HEAD_ID] = ref;
        }
        return { projectsByFile, projectNodes };
    }

    /**
     * O "quanto falta" de um projeto pelo nome, sem esperar: a mesma conta
     * (`projectProgress`, com a forma de mostrar no trimestre atual) do trimestre e
     * do cabeçalho da zona. `null` se o portfólio não conhece o projeto.
     */
    factsFor(name: string): ProjectFacts | null {
        const project = this.projectsSync().find(p => fold(p.name) === fold(name));
        if (!project) return null;
        const canvas = this.canvasPathFor(project);
        return {
            name: project.name,
            progress: projectProgress(project, this.readTasks(), quarterPeriod(currentQuarter(today()))),
            canvas: this.app.vault.getAbstractFileByPath(canvas) instanceof TFile ? canvas : null,
            index: project.index,
        };
    }

    /** Nomes de projeto que uma tarefa toca — direto, ou pela SMART mãe. */
    private projectKeysOf(task: TaskInfo, smarts: Map<string, TaskInfo>): Set<string> {
        const keys = new Set<string>();
        for (const link of task.projects) {
            const smart = smarts.get(fold(link));
            if (smart) smart.projects.forEach(p => keys.add(fold(p)));
            else keys.add(fold(link));
        }
        return keys;
    }

    private remember(task: TaskInfo, smarts?: Map<string, TaskInfo>): Set<string> {
        const index = smarts ?? this.smartIndex(this.readTasks());
        const keys = this.projectKeysOf(task, index);
        const before = this.membership.get(task.path) ?? new Set<string>();
        this.membership.set(task.path, keys);
        return new Set([...before, ...keys]);
    }

    private smartIndex(tasks: TaskInfo[]): Map<string, TaskInfo> {
        return new Map(tasks.filter(t => t.type === 'tarefa_smart').map(t => [fold(t.basename), t]));
    }

    /* -------------------------------------------------------- disparo */

    private onTaskChanged(file: TFile): void {
        if (!this.autoSync() || !(file instanceof TFile)) return;
        const task = this.taskInfo(file);
        if (!task) return;
        const touched = this.remember(task);
        // SMART mudou (título, status, projeto): as filhas dela também mudam de lugar.
        this.queue(touched);
    }

    private onTaskGone(path: string): void {
        const before = this.membership.get(path);
        if (!before || !this.autoSync()) return;
        this.membership.delete(path);
        this.queue(before);
    }

    private queue(keys: Set<string>): void {
        keys.forEach(k => this.pending.add(k));
        if (this.pending.size === 0) return;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.flush(), SYNC_DELAY_MS);
    }

    private async flush(): Promise<void> {
        this.timer = null;
        const keys = new Set(this.pending);
        this.pending.clear();
        const projects = (await this.projects()).filter(p => keys.has(fold(p.name)) || (p.index && keys.has(fold(p.index.replace(/^.*\//, '').replace(/\.md$/, '')))));
        for (const project of projects) {
            if (!(this.app.vault.getAbstractFileByPath(this.canvasPathFor(project)) instanceof TFile)) continue;
            if (await this.inNestedRepo(project)) continue;
            await this.sync(project).catch(error => console.error('DFM Projeto: falha ao sincronizar canvas', project.name, error));
        }
    }

    /** Submódulos declarados no `.gitmodules` da raiz do vault. */
    private gitmoduleRoots(): Promise<string[]> {
        this.submoduleRoots ??= this.app.vault.adapter.read('.gitmodules')
            .then(raw => gitmodulePaths(raw).map(p => normalizePath(p)))
            .catch(() => []);
        return this.submoduleRoots;
    }

    /** As pastas de projeto e de departamento do vault (`100 - AREAS/<área>/100 - PROJECTS/<coluna>/<projeto>` e `200 - DEPARTMENTS/<dep>`). */
    private projectFolders(): string[] {
        const folders: string[] = [];
        const children = (path: string): any[] => ((this.app.vault.getAbstractFileByPath(path) as any)?.children ?? [])
            .filter((c: any) => c && Array.isArray(c.children));
        for (const area of children(AREAS_ROOT)) {
            for (const column of children(`${area.path}/100 - PROJECTS`)) for (const p of children(column.path)) folders.push(p.path);
            for (const d of children(`${area.path}/200 - DEPARTMENTS`)) folders.push(d.path);
        }
        return folders;
    }

    /** Aprende quais pastas são repositório aninhado (`.gitmodules` e `.git` própria); cada pasta é conferida uma vez. */
    private async learnRoots(folders: Iterable<string>): Promise<void> {
        for (const root of await this.gitmoduleRoots()) this.nested.add(root);
        for (const raw of folders) {
            const folder = normalizePath(String(raw ?? ''));
            if (!folder || this.checked.has(folder)) continue;
            this.checked.add(folder);
            if (await this.isSubmodule(folder)) this.nested.add(folder);
        }
    }

    /** O canvas do projeto cai dentro de um repositório aninhado? Com o resolvedor, só se a pasta não fica numa área. */
    async inNestedRepo(project: ProjectInfo): Promise<boolean> {
        await this.learnRoots([project.path]);
        return insideNestedRepo(this.canvasPathFor(project), this.nested);
    }

    /** A pasta do projeto é (ou fica dentro de) um repositório aninhado? */
    private async folderInNestedRepo(project: ProjectInfo): Promise<boolean> {
        await this.learnRoots([project.path]);
        return insideNestedRepo(conventionalCanvasPath(project), this.nested);
    }

    /* ------------------------------------------------------ sincronizar */

    /**
     * Refaz a zona gerida. Devolve `false` se o projeto não tem canvas.
     * `explicit` (comando, menu, criação): o canvas de departamento sem zona
     * ganha a zona; sem ele, fica como o operador o desenhou.
     */
    async sync(project: ProjectInfo, opts: { notify?: boolean; explicit?: boolean } = {}): Promise<boolean> {
        if (await this.inNestedRepo(project)) {
            const path = this.canvasPathFor(project);
            console.warn(`DFM Projeto: "${path}" fica num repositório git aninhado; a zona não é sincronizada ali.`);
            if (opts.notify) new Notice(`${project.name} fica num repositório git próprio: o canvas não é sincronizado ali.`);
            return false;
        }
        const path = this.canvasPathFor(project);
        const tasks = this.readTasks();
        const tree = collectProjectTasks(project, tasks);
        const header = this.headerFor(project, tasks);
        const keepEdge = await this.links?.keepEdgeFor(path).catch(error => { console.error('DFM Projeto: sem o contexto das setas', error); return undefined; });
        const explicit = opts.explicit === true || opts.notify === true;
        let stats: PlanResult['stats'] | null = null;
        const result = await applyCanvasPlan(this.app, this.engine, path, current => {
            // Canvas de departamento desenhado à mão: a zona só entra por pedido.
            if (project.kind === 'departamento' && !explicit && !(current.nodes ?? []).some(n => n.id === ZONE_GROUP_ID)) return current;
            const plan = planProjectCanvas(current, project, tree, { today: today(), keepEdge, header });
            stats = plan.stats;
            return plan.data;
        }, { links: this.links });
        if (result === 'sem-canvas') {
            if (opts.notify) new Notice(`${project.name} ainda não tem canvas. Use "Projeto: abrir (ou criar) canvas do projeto".`);
            return false;
        }
        if (opts.notify && result === 'vista-desatualizada') new Notice(`${project.name}: a aba aberta do canvas está desatualizada em relação ao arquivo. Feche e reabra o canvas; a zona não foi gravada.`);
        else if (opts.notify && result === 'somente-leitura') new Notice('No celular os canvas geridos só leem; a zona é sincronizada no computador.');
        else if (opts.notify && result === 'adiado') new Notice(`${project.name}: a zona não foi gravada agora (seta recém-gravada ou gesto em curso). Ela se atualiza na próxima mudança.`);
        else if (opts.notify && stats) new Notice(this.summary(project, stats));
        return true;
    }

    /**
     * O cabeçalho da zona: a forma de mostrar do projeto no trimestre atual
     * (`projectProgress`, a conta do trimestre) e o caminho de volta — o trimestre atual, a semana em foco e a
     * área. O trimestre e a semana levam à nota (o canvas deles se aposentou em 02/11/2026); a área, ao canvas
     * dela quando existe. Sem arquivo, só texto.
     */
    headerFor(project: ProjectInfo, tasks: TaskInfo[] = this.readTasks()): ProjectHeader {
        const exists = (path: string | null | undefined) => !!path && this.app.vault.getAbstractFileByPath(path) instanceof TFile;
        const firstThat = (...paths: Array<string | null | undefined>) => paths.find(p => exists(p)) ?? null;
        const notes = this.board.periodNotes;
        const quarter = currentQuarter(today());
        const quarterRef: NavRef = { label: quarter, path: firstThat(notes?.quarterNote(quarter)?.path) };
        let week: NavRef | null = null;
        if (notes) {
            const focus = notes.focusWeek(quarter);
            if (focus) week = { label: shortWeek(focus), path: firstThat(notes.weekNotePath(focus)) };
        }
        let area: NavRef | null = null;
        const root = areaRootOf(project.path);
        if (root) {
            const folder = root.slice(root.lastIndexOf('/') + 1);
            const name = folder.replace(/^\d+\s*-\s*/, '');
            area = { label: name, path: firstThat(normalizePath(`${root}/${name}.canvas`), normalizePath(`${root}/${folder}.canvas`)) };
        }
        return { progress: projectProgress(project, tasks, quarterPeriod(quarter)), quarter: quarterRef, week, area };
    }

    private summary(project: ProjectInfo, stats: { smarts: number; tasks: number; loose: number; skipped: number }): string {
        const parts = [`${stats.smarts} SMART`, `${stats.tasks} ações`];
        if (stats.loose) parts.push(`${stats.loose} sem SMART`);
        if (stats.skipped) parts.push(`${stats.skipped} já no canvas fora da zona`);
        return `${project.name}: ${parts.join(' · ')}`;
    }

    async syncAll(): Promise<void> {
        let count = 0;
        // Os canvas que já têm zona; o de departamento feito à mão continua como está.
        for (const project of await this.projects()) if (await this.sync(project)) count++;
        new Notice(`Canvas de projeto sincronizados: ${count}.`);
    }

    /* ----------------------------------------------------------- criar */

    private async isSubmodule(folder: string): Promise<boolean> {
        return this.app.vault.adapter.exists(normalizePath(`${folder}/.git`));
    }

    /**
     * Abre o canvas do projeto na mesma aba (o voltar retorna); `newTab`
     * (Cmd/Ctrl), numa aba nova; `reveal: false` só cria e sincroniza, sem abrir
     * aba. Projeto em repositório aninhado: o canvas nasce na área.
     */
    async openOrCreate(project: ProjectInfo, opts: { newTab?: boolean; reveal?: boolean } = {}): Promise<TFile | null> {
        await this.learnRoots([project.path]);
        let file = this.app.vault.getAbstractFileByPath(this.canvasPathFor(project));
        if (!(file instanceof TFile)) {
            const created = await this.create(project);
            if (!created) return null;
            file = created;
            new Notice(`Canvas de ${project.name} criado${this.canvasPathFor(project) === conventionalCanvasPath(project) ? '' : ` em ${this.canvasPathFor(project)}`}.`);
        }
        if (opts.reveal !== false) await revealCanvas(this.app, file as TFile, opts.newTab === true);
        return file as TFile;
    }

    /**
     * Cria o canvas no lugar que o resolvedor dá (com a pasta `Canvases/` da área,
     * se faltar) e sincroniza a zona. Recusa no celular e dentro de repositório
     * aninhado (pasta fora de uma área). `null` = não criou.
     */
    private async create(project: ProjectInfo): Promise<TFile | null> {
        if (!canvasWritesAllowed()) {
            new Notice(`${project.name} ainda não tem canvas. No celular os canvas geridos não são criados; crie no computador.`);
            return null;
        }
        if (await this.inNestedRepo(project)) {
            new Notice(`${project.name} fica num repositório git próprio e fora de uma área: o canvas não é criado ali para não sujar o outro repositório.`);
            return null;
        }
        const path = this.canvasPathFor(project);
        const folder = path.slice(0, path.lastIndexOf('/'));
        if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const file = await this.app.vault.create(path, JSON.stringify(newProjectCanvas(project), null, '\t'));
        await this.sync(project, { explicit: true });
        return file;
    }

    private async pickAndOpen(): Promise<void> {
        const projects = await this.projects();
        const project = await this.board.pick(projects, p => {
            const has = this.app.vault.getAbstractFileByPath(this.canvasPathFor(p)) instanceof TFile;
            return `${p.name}${has ? '' : '  (sem canvas — será criado)'}`;
        }, 'Qual projeto?');
        if (project) await this.openOrCreate(project);
    }

    async createMissing(): Promise<void> {
        if (!canvasWritesAllowed()) {
            new Notice('No celular os canvas geridos não são criados; crie no computador.');
            return;
        }
        const missing: ProjectInfo[] = [];
        let submodules = 0;
        // Só projetos do kanban: departamento ganha canvas um a um (o painel ou "abrir (ou criar)").
        for (const project of (await this.projects()).filter(p => p.kind !== 'departamento')) {
            if (this.app.vault.getAbstractFileByPath(this.canvasPathFor(project)) instanceof TFile) continue;
            // Repositório aninhado que já tem o canvas dele lá dentro (do outro repositório): fica como está.
            if (await this.folderInNestedRepo(project)
                && (await this.inNestedRepo(project) || this.app.vault.getAbstractFileByPath(conventionalCanvasPath(project)) instanceof TFile)) {
                submodules++;
                continue;
            }
            missing.push(project);
        }
        if (missing.length === 0) {
            new Notice(submodules ? `Todos os projetos têm canvas (${submodules} em repositório próprio ignorado(s)).` : 'Todos os projetos já têm canvas.');
            return;
        }
        const ConfirmModal = require('../engine/canvasengine/canvasModals').ConfirmModal;
        const names = missing.map(p => `• ${p.name}${this.canvasPathFor(p) === conventionalCanvasPath(p) ? '' : ' (na área: o projeto é um repositório git próprio)'}`).join('\n');
        new ConfirmModal(this.app, `Criar canvas para ${missing.length} projeto(s)?\n\n${names}`, async () => {
            let created = 0;
            for (const project of missing) if (await this.create(project)) created++;
            new Notice(`${created} canvas de projeto criados.`);
        }, () => undefined).open();
    }

    /* ---------------------------------------------------- canvas ativo */

    /** O projeto do canvas ativo, ou da nota ativa dentro de uma pasta de projeto. `null` = não se aplica. */
    private activeProjectSync(): Promise<ProjectInfo | null> | null {
        const file = this.app.workspace.getActiveFile();
        if (!file) return null;
        return this.projectOf(file.path);
    }

    async projectOf(path: string): Promise<ProjectInfo | null> {
        const projects = await this.projects();
        return projects.find(p => this.canvasPathFor(p) === path)
            ?? projects.find(p => path.startsWith(`${p.path}/`))
            ?? null;
    }

    /* ------------------------------------------------------- protocolos */

    /** Abre o protocolo de SMART do cofre (o papel `criar_smart`) já com o projeto escolhido. */
    newSmart(project: ProjectInfo): void {
        void this.board.runPapel('criar_smart', {
            projeto: project.name,
            projeto_display: `[[${project.name}]]`,
            projeto_path: project.index ?? '',
        });
    }

    /**
     * Abre o protocolo de ação atômica do cofre já com a SMART mãe escolhida. A
     * semana da SMART vai junto (`tarefa_smart_prop_week`, como o seletor faria):
     * é dela que saem os dias oferecidos em "em que dia?".
     */
    newAction(smart: { basename: string; path: string }): void {
        const file = this.app.vault.getAbstractFileByPath(smart.path);
        const week = file instanceof TFile ? String(this.app.metadataCache.getFileCache(file)?.frontmatter?.week ?? '') : '';
        void this.board.runPapel('nova_tarefa_do_projeto', {
            tarefa_smart: smart.basename,
            tarefa_smart_display: `[[${smart.basename}]]`,
            tarefa_smart_path: smart.path,
            ...(ehSemana(week) ? { tarefa_smart_prop_week: week } : {}),
        });
    }

    private async onProtocol(payload: { id?: string; file?: TFile | null; variables?: Record<string, any> }): Promise<void> {
        const file = payload?.file;
        try {
            const departamento = this.board.ehDoPapel(payload?.id, ['criar_departamento']);
            if ((departamento || this.board.ehDoPapel(payload?.id, ['criar_projeto'])) && file instanceof TFile && file.parent && canvasWritesAllowed()) {
                // O índice do projeto (e, desde 02/11/2026, o do departamento: um nascimento só,
                // o padrão fractal) já embute `![[<nome>.canvas]]`: o canvas gerido nasce junto.
                const project: ProjectInfo = { name: file.parent.name, path: file.parent.path, index: file.path,
                    ...(departamento ? { kind: 'departamento' as const } : {}) };
                await this.learnRoots([project.path]);
                if (!(this.app.vault.getAbstractFileByPath(this.canvasPathFor(project)) instanceof TFile) && !(await this.inNestedRepo(project))) {
                    const path = this.canvasPathFor(project);
                    const folder = path.slice(0, path.lastIndexOf('/'));
                    if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
                    await this.app.vault.create(path, JSON.stringify(newProjectCanvas(project), null, '\t'));
                    // A primeira ação é criada pelo protocolo logo antes; a zona já a recebe.
                    window.setTimeout(() => void this.sync(project, { explicit: true }), 1500);
                    new Notice(`Canvas de ${project.name} criado.`);
                }
            }
            if (this.board.ehDoPapel(payload?.id, ['nova_tarefa_do_projeto']) && file instanceof TFile) {
                // Kernel: a ação herda `week` e `impacto` da SMART mãe, nunca `priority`.
                // Vale também para o 📤 par criado junto (`_createdTasks`).
                const smartPath = String(payload.variables?.tarefa_smart_path ?? '');
                const smart = smartPath ? this.app.vault.getAbstractFileByPath(smartPath) : null;
                const smartFm = smart instanceof TFile ? this.app.metadataCache.getFileCache(smart)?.frontmatter ?? {} : {};
                if (smartFm.week || smartFm.impacto !== undefined) {
                    const created = Array.isArray(payload.variables?._createdTasks) ? payload.variables._createdTasks : [];
                    const targets = [file, ...created.map((p: string) => this.app.vault.getAbstractFileByPath(p)).filter((f: any): f is TFile => f instanceof TFile)];
                    for (const target of targets) {
                        await this.app.fileManager.processFrontMatter(target, fm => {
                            if (smartFm.week) fm.week = smartFm.week;
                            if (smartFm.impacto !== undefined && (fm.impacto === undefined || fm.impacto === '')) fm.impacto = smartFm.impacto;
                        });
                    }
                }
            }
        } catch (error) {
            console.error('DFM Projeto: falha ao reagir ao protocolo', payload?.id, error);
        }
    }

    /* ---------------------------------------------------------- menus */

    private viewOf(canvas: any): any | null {
        return this.app.workspace.getLeavesOfType('canvas').map(l => l.view as any).find(v => v?.canvas === canvas) ?? null;
    }


    /** O projeto (ou departamento) dono deste canvas, pelo resolvedor e pelo portfólio já lido. */
    projectForCanvas(path: string | undefined): ProjectInfo | null {
        if (!path) return null;
        return this.projectsSync().find(p => this.canvasPathFor(p) === path) ?? null;
    }

    /** SMART abertas do projeto, para escolher a mãe de uma ação nova. */
    openSmarts(project: ProjectInfo): TaskInfo[] {
        return this.readTasks().filter(t => t.type === 'tarefa_smart' && !TERMINAL.has(t.status)
            && t.projects.some(link => fold(link) === fold(project.name)));
    }

    private emptyMenu(menu: Menu, ctx: { canvas: any; view: any }): void {
        const project = this.projectForCanvas(ctx.view?.file?.path);
        if (!project) return;
        // A SMART nova só com o protocolo do papel (D1 do mapa da v0: sem ele, a opção some).
        if (this.board.idDoPapel('criar_smart')) menu.addItem(item => item.setSection('action').setTitle(`Nova tarefa SMART em ${project.name}`).setIcon('target').onClick(() => {
            this.newSmart(project);
        }));
        menu.addItem(item => item.setSection('action').setTitle('Sincronizar execução do projeto').setIcon('refresh-cw').onClick(() => {
            void this.sync(project, { notify: true });
        }));
    }

    private nodeMenu(menu: Menu, node: any): void {
        const file = node?.file;
        if (!(file instanceof TFile)) return;
        const task = this.taskInfo(file);
        if (!task) return;
        const view = this.viewOf(node.canvas);

        if (task.type === 'tarefa_smart' && !TERMINAL.has(task.status)) {
            if (this.board.idDoPapel('nova_tarefa_do_projeto')) menu.addItem(item => item.setSection('action').setTitle('Nova ação atômica desta SMART').setIcon('list-plus').onClick(() => {
                this.newAction({ basename: file.basename, path: file.path });
            }));
            if (canvasWritesAllowed()) menu.addItem(item => item.setSection('action').setTitle('Mover para outro projeto…').setIcon('folder-input').onClick(() => void this.moveToProject(file, task)));
            return;
        }

        if (!TERMINAL.has(task.status) && canvasWritesAllowed()) {
            // A mesma função do arrasto da Missão (P6; proposta do Mission Control, §3):
            // tirar a mãe, tirar o projeto antigo e pôr o novo, numa gravação só, com Desfazer.
            menu.addItem(item => item.setSection('action').setTitle('Mover para outro projeto…').setIcon('folder-input').onClick(() => void this.moveToProject(file, task)));
        }

        if (task.type !== 'tarefa_smart' && !TERMINAL.has(task.status)) {
            // Num canvas de projeto, a regra da zona: sem SMART mãe aberta neste
            // projeto, a ação está em "Direto no projeto" e o menu oferece religar
            // (a mãe aberta de outro projeto não conta aqui). Fora dele, a global.
            const project = this.projectForCanvas(view?.file?.path);
            const keys = project ? projectKeys(project) : null;
            if (!offersLinkToSmart(task, this.smartIndex(this.readTasks()), keys)) return;
            menu.addItem(item => item.setSection('action').setTitle('Ligar a uma SMART…').setIcon('link').onClick(() => void this.linkToSmart(file, task, keys)));
        }
    }

    /**
     * "Mover para outro projeto…": a mesma composição da tabela das setas que o arrasto da
     * Missão usa (`board.gravacoes.mover`, destino `projeto`): tira a mãe, tira o projeto de
     * agora e põe o escolhido; o aviso traz Desfazer (a pilha única).
     */
    private async moveToProject(file: TFile, task: TaskInfo): Promise<void> {
        const refs = new Map(this.projectsSync().map(p => [p.name, { name: p.name, keys: [...projectKeys(p)] }]));
        const smarts = this.smartIndex(this.readTasks());
        const de = projetoAtual(task.projects, nome => smarts.get(fold(nome)) ?? null, [...refs.values()]);
        const options = this.projectsSync().filter(p => !de || fold(p.name) !== fold(de.name)).sort((a, b) => a.name.localeCompare(b.name));
        const project = await this.board.pick(options, p => `${p.name}${p.kind === 'departamento' ? '  · departamento' : ''}`, `Mover ${file.basename} para qual projeto?`);
        if (!project) return;
        await this.board.gravacoes.mover(file.path, { tipo: 'projeto', projeto: refs.get(project.name)!, de });
    }

    /**
     * Ação solta → SMART mãe: troca o vínculo direto do projeto pelo da SMART
     * (contrato do Kernel). Vindo de um canvas de projeto (`prefer`), as SMART
     * desse projeto aparecem primeiro; as de outro projeto levam o nome dele.
     */
    private async linkToSmart(file: TFile, task: TaskInfo, prefer: Set<string> | null = null): Promise<void> {
        const options = smartOptionsFor(task, this.readTasks(), prefer);
        if (options.length === 0) {
            new Notice('Nenhuma SMART aberta no projeto desta tarefa. Crie uma pelo clique-direito no canvas do projeto.');
            return;
        }
        const here = (s: TaskInfo) => !prefer || s.projects.some(p => prefer.has(fold(p)));
        const label = (s: TaskInfo) => `${s.basename}${s.week ? `  · ${s.week}` : ''}${here(s) ? '' : `  · ${s.projects.join(', ')}`}`;
        const smart = await this.board.pick(options, label, 'Qual SMART mãe?');
        if (!smart) return;
        const smartFile = this.app.vault.getAbstractFileByPath(smart.path);
        const smartFm = smartFile instanceof TFile ? this.app.metadataCache.getFileCache(smartFile)?.frontmatter ?? {} : {};
        // A mesma regra da seta SMART → ação: sai o vínculo direto com o projeto da
        // SMART, ficam as outras mães, entra a SMART; herda `week`/`impacto` vazios.
        const link = motherLink(file, { path: smart.path, basename: smart.basename, type: smart.type, projects: smart.projects, week: smartFm.week, impacto: smartFm.impacto });
        await this.board.updateTaskWith(file.path, fm => patchFor(fm, link));
        new Notice(`${file.basename} → ${smart.basename}`);
    }
}
