/**
 * Opções do DFM nos menus do próprio canvas.
 *
 * Nó e seleção usam os eventos nativos do Obsidian (`canvas:node-menu`,
 * `canvas:selection-menu`): as opções entram no menu que o canvas já abre, com
 * a mesma aparência e o mesmo teclado. Para a área vazia o Obsidian não tem
 * evento; ali o submenu "DFM" entra no menu nativo do fundo (`hookEmptyMenu`).
 */
import { Menu, TFile, getAllTags } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from './boardPlugin';
import { arrangeInGrid, patchWidgetText, readWidgetText } from './boardEdit';
import { BOARD_CATALOG, TASK_FILTERS } from './boardSpec';
import type { BoardTaskFilter, BoardWidgetSpec, QueryGroup, QueryPrazo, QueryScopeKind, QueryShow } from './boardSpec';
import { projectNames } from './boardModel';
import type { PortfolioProject } from '../engine/missionPortfolio';

import { QUERY_PRESETS } from './queryPresets';

const SECTION = 'action';



/** Tarefa do TaskNotes: identificada pela tag `task`, como o TaskNotes está configurado. */
function isTaskNote(cache: ReturnType<DFMPlugin['app']['metadataCache']['getFileCache']>): boolean {
    const tags = cache ? getAllTags(cache) ?? [] : [];
    return tags.some(tag => tag === '#task' || tag.startsWith('#task/'));
}

/** Quem mais põe itens no menu da área vazia (ex.: o gerente de canvas de projeto). */
export type EmptyMenuContributor = (menu: Menu, ctx: { canvas: any; view: any; pos: { x: number; y: number } | null }) => void;

export class BoardCanvasMenus {
    private hooked = new WeakSet<object>();
    static readonly emptyMenuContributors: EmptyMenuContributor[] = [];

    constructor(private readonly plugin: DFMPlugin, private readonly board: MissionBoard) {}

    register(): void {
        const { workspace } = this.plugin.app;
        this.plugin.registerEvent(workspace.on('canvas:node-menu' as any, (menu: Menu, node: any) => this.nodeMenu(menu, node)));
        this.plugin.registerEvent(workspace.on('canvas:selection-menu' as any, (menu: Menu, canvas: any) => this.selectionMenu(menu, canvas)));
        const hookAll = () => workspace.getLeavesOfType('canvas').forEach(leaf => this.hookEmptyMenu(leaf));
        this.plugin.registerEvent(workspace.on('layout-change', hookAll));
        this.plugin.registerEvent(workspace.on('active-leaf-change', hookAll));
        workspace.onLayoutReady(hookAll);
    }

    /* ------------------------------------------------------------ nó */

    private nodeMenu(menu: Menu, node: any): void {
        try {
            if (typeof node?.text === 'string' && readWidgetText(node.text)) this.widgetItems(menu, node);
            else if (node?.file instanceof TFile) this.fileItems(menu, node);
        } catch (error) {
            console.error('DFM Board: falha ao montar menu do nó', error);
        }
    }

    /** Itens de edição de um nó de widget (menu do nó e botão da barra de seleção). */
    widgetItems(menu: Menu, node: any): void {
        const spec = readWidgetText(node.text)!;
        const set = (patch: Record<string, unknown>) => {
            const next = patchWidgetText(node.text, patch);
            if (next === null) return;
            node.setText(next);
            node.canvas?.requestSave?.();
        };

        menu.addItem(item => item.setSection(SECTION).setTitle('Widget: trocar tipo…').setIcon('shapes').onClick(async () => {
            const entry = await this.board.pick([...BOARD_CATALOG], e => `${e.label} — ${e.description}`, 'Novo tipo');
            if (!entry) return;
            const patch: Record<string, unknown> = { kind: entry.kind, limite: entry.defaultLimit };
            if (entry.kind === 'projeto' && !spec.projeto) {
                const name = await this.pickProject();
                if (!name) return;
                patch.projeto = name;
            }
            set(patch);
        }));

        if (spec.kind === 'tarefas') {
            menu.addItem(item => item.setSection(SECTION).setTitle('Widget: recorte…').setIcon('filter').onClick(async () => {
                const filter = await this.board.pick([...TASK_FILTERS], f => f.label, 'Qual recorte?');
                if (filter) set({ filtro: filter.id as BoardTaskFilter });
            }));
        }
        if (spec.kind === 'projeto' || spec.kind === 'tarefas') {
            menu.addItem(item => item.setSection(SECTION).setTitle(spec.kind === 'tarefas' ? 'Widget: limitar a um projeto…' : 'Widget: trocar projeto…').setIcon('folder-kanban').onClick(async () => {
                const name = await this.pickProject(spec.kind === 'tarefas');
                if (name === null) return;
                set({ projeto: name || undefined });
            }));
        }
        if (spec.kind === 'consulta') this.queryItems(menu, spec, set);
        menu.addItem(item => item.setSection(SECTION).setTitle(`Widget: quantidade de itens (${spec.limite})…`).setIcon('list-ordered').onClick(async () => {
            const n = await this.board.pick([3, 5, 8, 12, 20], v => `${v} itens`, 'Quantos itens?');
            if (n) set({ limite: n });
        }));
        menu.addItem(item => item.setSection(SECTION).setTitle('Widget: reler dados').setIcon('refresh-cw').onClick(() => void this.board.store.refreshNow()));
    }

    /** Editar a consulta sem tocar no texto do bloco. */
    private queryItems(menu: Menu, spec: BoardWidgetSpec, set: (patch: Record<string, unknown>) => void): void {
        const scopes: Array<[QueryScopeKind, string]> = [['canvas', 'Este canvas'], ['projeto', 'Projeto'], ['semana', 'Semana'], ['trimestre', 'Trimestre'], ['vault', 'Vault inteiro']];
        const shows: Array<[QueryShow, string]> = [['lista', 'Lista'], ['contagem', 'Contagem'], ['progresso', 'Progresso'], ['kanban', 'Kanban'], ['grupos', 'Grupos']];
        const groups: Array<[QueryGroup, string]> = [['status', 'Status'], ['projeto', 'Projeto'], ['semana', 'Semana'], ['contexto', 'Contexto']];
        const statuses: Array<[string, string]> = [['abertas', 'Abertas'], ['todas', 'Todas'], ['concluidas', 'Concluídas'], ['next-action,in-progress', 'Próximas e em execução'], ['waiting-on', 'Esperando'], ['inbox', 'Inbox']];
        const prazos: Array<[QueryPrazo | '', string]> = [['', 'Qualquer prazo'], ['vencidas', 'Vencidas'], ['hoje', 'Hoje'], ['semana', 'Nesta semana'], ['sem-prazo', 'Sem prazo']];
        const choose = <T extends string>(title: string, icon: string, options: Array<[T, string]>, key: string) => {
            menu.addItem(item => item.setSection(SECTION).setTitle(title).setIcon(icon).onClick(async () => {
                const chosen = await this.board.pick(options, o => o[1], title.replace('…', '?'));
                if (!chosen) return;
                set({ [key]: chosen[0] || undefined, ...(key === 'escopo' && chosen[0] === 'projeto' && !spec.projeto ? await this.projectPatch() : {}) });
            }));
        };
        choose(`Consulta: escopo (${spec.escopo ?? 'canvas'})…`, 'crosshair', scopes, 'escopo');
        choose(`Consulta: mostrar como (${spec.mostrar ?? 'lista'})…`, 'layout-list', shows, 'mostrar');
        if (spec.mostrar === 'grupos') choose(`Consulta: agrupar por (${spec.agrupar ?? 'status'})…`, 'group', groups, 'agrupar');
        choose('Consulta: status…', 'circle-dot', statuses, 'status');
        choose('Consulta: prazo…', 'calendar-clock', prazos, 'prazo');
    }

    private async projectPatch(): Promise<Record<string, unknown>> {
        const name = await this.pickProject();
        return name ? { projeto: name } : {};
    }

    private fileItems(menu: Menu, node: any): void {
        const file: TFile = node.file;
        const cache = this.plugin.app.metadataCache.getFileCache(file);

        // Tarefa: o submenu "DFM" de `taskMenus.ts` cuida de agendar, semana e status.
        if (isTaskNote(cache)) return;

        const project = this.projectFor(file.path);
        if (!project) return;
        menu.addItem(item => item.setSection(SECTION).setTitle(`Criar tarefa em ${project.name}`).setIcon('square-check').onClick(() => {
            const view = this.viewOf(node.canvas);
            const engine: any = (this.plugin as any).canvasEngine;
            if (!view || typeof engine?.createTaskNote !== 'function') return;
            const index = project.index ? project.index.replace(/\.md$/, '') : `${project.path}/${project.name}`;
            void engine.createTaskNote(view, { x: node.x, y: node.y + node.height + 40 }, {
                projectPath: project.path,
                projectName: project.name,
                canonicalWikilink: `[[${index}|${project.name}]]`,
            });
        }));
        menu.addItem(item => item.setSection(SECTION).setTitle('Pôr painel do projeto ao lado').setIcon('panel-right').onClick(() => {
            this.board.createWidgetNode(node.canvas, { kind: 'projeto', projeto: project.name }, { x: node.x + node.width + 40, y: node.y });
        }));
    }

    /** O projeto do portfólio dono do arquivo: a nota-índice ou qualquer nota na pasta. */
    private projectFor(path: string): PortfolioProject | null {
        const snapshot = this.board.store.current();
        // Sem leitura ainda: pede agora; o próximo clique-direito já traz as opções.
        if (!snapshot) this.board.store.warm();
        const all = (snapshot?.portfolio?.columns ?? []).flatMap(c => c.projects);
        return all.find(p => p.index === path) ?? all.find(p => path.startsWith(`${p.path}/`)) ?? null;
    }

    /* ------------------------------------------------------- seleção */

    private selectionMenu(menu: Menu, canvas: any): void {
        const nodes = Array.from<any>(canvas?.selection ?? []).filter(n => typeof n?.x === 'number' && typeof n?.moveAndResize === 'function');
        if (nodes.length < 2) return;
        menu.addItem(item => item.setSection(SECTION).setTitle('Organizar em grade').setIcon('layout-grid').onClick(() => this.arrangeGrid(canvas, nodes)));
    }

    arrangeGrid(canvas: any, nodes: any[]): void {
        const byId = new Map(nodes.map(n => [n.id, n]));
        const moves = arrangeInGrid(nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height })));
        for (const move of moves) {
            const n = byId.get(move.id);
            n.moveAndResize({ x: move.x, y: move.y, width: n.width, height: n.height });
        }
        canvas.requestSave?.();
    }

    /* --------------------------------------------------- área vazia */

    /**
     * O menu DFM da área vazia, dentro do menu nativo do fundo do canvas.
     *
     * O Obsidian abre o dele no
     * clique-direito e chama `preventDefault` (medido na 1.13.7:
     * `Canvas.onContextMenu` → `showCreationMenu`). Não há evento para isso,
     * então envolvemos `showCreationMenu` só neste canvas (não no protótipo) e
     * restauramos ao descarregar o plugin.
     *
     * As mesmas opções ficam visíveis sem clique-direito na barra de baixo do
     * canvas (`canvasToolbar.ts`).
     */
    private hookEmptyMenu(leaf: WorkspaceLeaf): void {
        const view: any = leaf.view;
        const canvas = view?.canvas;
        if (!canvas || this.hooked.has(canvas)) return;
        this.hooked.add(canvas);
        // Canvas aberto: as opções de projeto precisam do portfólio lido.
        this.board.store.warm();
        const self = this;

        const original = canvas.showCreationMenu;
        if (typeof original === 'function') {
            canvas.showCreationMenu = function (menu: Menu, pos: any, ...rest: unknown[]) {
                const result = original.call(this, menu, pos, ...rest);
                try {
                    menu.addSeparator();
                    menu.addItem(item => {
                        item.setTitle('DFM').setIcon('layout-dashboard');
                        const sub: Menu | undefined = (item as any).setSubmenu?.();
                        self.fillCanvasMenu(sub ?? menu, canvas, view, pos ?? null);
                    });
                } catch (error) {
                    console.error('DFM Board: falha ao montar o menu do canvas', error);
                }
                return result;
            };
            this.plugin.register(() => { if (canvas.showCreationMenu !== original) canvas.showCreationMenu = original; });
        }
    }

    /** Centro da tela em coordenadas do canvas (para o que o botão do cabeçalho cria). */
    private viewportPos(canvas: any): { x: number; y: number } {
        const x = Number(canvas?.x), y = Number(canvas?.y);
        return { x: Number.isFinite(x) ? x - 200 : 0, y: Number.isFinite(y) ? y - 150 : 0 };
    }

    /** Os itens DFM de um canvas: widget, consultas, tarefa e o que os gerentes acrescentam. */
    fillCanvasMenu(menu: Menu, canvas: any, view: any, pos: { x: number; y: number } | null): void {
        menu.addItem(item => item.setTitle('Adicionar widget…').setIcon('layout-dashboard').onClick(() => void this.board.addWidget(canvas, pos)));
        menu.addItem(item => {
            item.setTitle('Consulta deste canvas').setIcon('search');
            const sub: Menu | undefined = (item as any).setSubmenu?.();
            for (const preset of QUERY_PRESETS) {
                (sub ?? menu).addItem(i => i.setTitle(preset.label).setIcon(preset.icon).onClick(() => {
                    this.board.createWidgetNode(canvas, preset.spec, pos ?? this.viewportPos(canvas), preset.size);
                }));
            }
        });
        menu.addItem(item => item.setTitle('Criar tarefa aqui').setIcon('square-check').onClick(() => {
            void (this.plugin as any).canvasEngine?.createTaskNote?.(view, pos);
        }));
        menu.addItem(item => item.setTitle('Trazer tarefa existente…').setIcon('list-checks').onClick(() => void this.board.insertTask(canvas, pos)));
        for (const contribute of BoardCanvasMenus.emptyMenuContributors) {
            try { contribute(menu, { canvas, view, pos }); } catch (error) { console.error('DFM Board: item de menu falhou', error); }
        }
        menu.addSeparator();
        menu.addItem(item => item.setTitle('Abrir o Mission Control').setIcon('layout-dashboard').onClick(() => void this.board.openPanel()));
    }

    /* ------------------------------------------------------- apoio */

    private viewOf(canvas: any): any | null {
        return this.plugin.app.workspace.getLeavesOfType('canvas').map(l => l.view as any).find(v => v?.canvas === canvas) ?? null;
    }

    /** `''` = "todos os projetos" (só quando `allowAll`); `null` = cancelado. */
    private async pickProject(allowAll = false): Promise<string | null> {
        if (!this.board.store.current()) await this.board.store.refreshNow();
        const snapshot = this.board.store.current();
        const names = snapshot ? projectNames(snapshot) : [];
        const options = allowAll ? ['', ...names] : names;
        const chosen = await this.board.pick(options, n => n || 'Todos os projetos', 'Qual projeto?');
        return chosen === null ? null : chosen;
    }
}

