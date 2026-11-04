/**
 * O DFM dentro da interface do próprio canvas, sem painel lateral.
 *
 * Duas barras que o Obsidian já desenha ganham um grupo DFM:
 *
 * - **Barra de baixo** (`canvas.cardMenuEl`, onde ficam cartão, nota e mídia):
 *   Tarefa, Tarefa existente, Widget e Mais. Como os botões nativos, Tarefa e
 *   Widget podem ser **arrastados** até o ponto do canvas onde o nó deve nascer;
 *   um clique cria no centro da tela.
 * - **Barra de seleção** (`canvas.menu`, a que aparece sobre o que está
 *   selecionado, com lixeira, cor e zoom): Concluir, Agendar, Editar no
 *   TaskNotes, Nova ação, menu de tarefa, Configurar widget, Organizar em grade
 *   — conforme a seleção (`canvasToolbarModel.ts`).
 *
 * Nada disso é API pública do Obsidian (medido na 1.13.7). Por isso cada
 * gancho é por instância de canvas, testa o que usa antes de usar, e desfaz o
 * que fez quando o plugin descarrega.
 */
import { Menu, Notice, TFile, setIcon, setTooltip } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from './boardPlugin';
import type { BoardCanvasMenus } from './boardCanvasMenus';
import type { TaskMenus } from './taskMenus';
import type { TaskRecord } from '../tasks/taskRecord';
import { readWidgetText } from './boardEdit';
import { BOARD_CATALOG } from './boardSpec';
import { QUERY_PRESETS } from './queryPresets';
import { selectionActions } from './canvasToolbarModel';
import type { SelectedItem, SelectionAction } from './canvasToolbarModel';
import { currentQuarter } from '../engine/calendario';
import { portaDoPeriodo } from '../missao/estadoTela';
import { askCompletionWhen } from '../ui/completionModals';

type Pos = { x: number; y: number };

export class CanvasToolbar {
    private readonly hooked = new WeakSet<object>();

    constructor(
        private readonly plugin: DFMPlugin,
        private readonly board: MissionBoard,
        private readonly menus: BoardCanvasMenus,
        private readonly taskMenus: TaskMenus,
    ) {}

    register(): void {
        const { workspace } = this.plugin.app;
        const hookAll = () => workspace.getLeavesOfType('canvas').forEach(leaf => this.hook(leaf));
        this.plugin.registerEvent(workspace.on('layout-change', hookAll));
        this.plugin.registerEvent(workspace.on('active-leaf-change', hookAll));
        workspace.onLayoutReady(hookAll);
        // Tarefa mudou (concluída, agendada): a barra da seleção reflete na hora.
        this.plugin.registerEvent(this.plugin.app.metadataCache.on('changed', file => {
            for (const leaf of workspace.getLeavesOfType('canvas')) {
                const canvas: any = (leaf.view as any)?.canvas;
                const touched = Array.from<any>(canvas?.selection ?? []).some(n => n?.file?.path === file.path);
                if (touched) canvas.menu?.render?.(true);
            }
        }));
    }

    private hook(leaf: WorkspaceLeaf): void {
        const view: any = leaf.view;
        const canvas = view?.canvas;
        if (!canvas || this.hooked.has(canvas)) return;
        this.hooked.add(canvas);
        try { this.mountBottomBar(canvas, view); } catch (error) { console.error('DFM: barra do canvas falhou', error); }
        try { this.hookSelectionBar(canvas, view); } catch (error) { console.error('DFM: barra de seleção falhou', error); }
    }

    /* ------------------------------------------------------ barra de baixo */

    private mountBottomBar(canvas: any, view: any): void {
        const bar: HTMLElement | undefined = canvas.cardMenuEl;
        if (!bar || bar.querySelector('.dfm-cbar')) return;
        const group = bar.createDiv('dfm-cbar');
        group.createDiv('dfm-cbar-sep');

        this.barButton(group, canvas, 'square-check', 'Nova tarefa — clique ou arraste até o lugar', {
            click: (event) => this.newTask(canvas, view, null, event),
            drop: (pos, event) => this.newTask(canvas, view, pos, event),
        });
        this.barButton(group, canvas, 'list-checks', 'Trazer tarefa existente — clique ou arraste', {
            click: () => void this.board.insertTask(canvas),
            drop: pos => void this.board.insertTask(canvas, pos),
        });
        this.barButton(group, canvas, 'layout-dashboard', 'Widget ou consulta — clique ou arraste', {
            click: (event) => this.widgetMenu(canvas, null).showAtMouseEvent(event),
            drop: (pos, event) => this.widgetMenu(canvas, pos).showAtMouseEvent(event),
        });
        this.barButton(group, canvas, 'more-horizontal', 'Mais do DFM', {
            click: (event) => this.moreMenu(canvas, view).showAtMouseEvent(event),
        });
        this.plugin.register(() => group.remove());
    }

    /**
     * Botão no estilo dos nativos da barra. Soltar fora da barra, sobre o canvas,
     * chama `drop` com a posição em coordenadas do canvas; sem arrasto é clique.
     */
    private barButton(parent: HTMLElement, canvas: any, icon: string, label: string,
        on: { click: (event: MouseEvent) => void; drop?: (pos: Pos, event: MouseEvent) => void }): HTMLElement {
        const btn = parent.createDiv({ cls: 'canvas-card-menu-button dfm-cbar-btn', attr: { role: 'button', tabindex: '0', 'aria-label': label } });
        if (on.drop) btn.addClass('mod-draggable');
        setIcon(btn, icon);
        setTooltip(btn, label, { placement: 'top' });
        btn.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            const rect = btn.getBoundingClientRect();
            on.click(new MouseEvent('click', { clientX: rect.left, clientY: rect.top }));
        });
        btn.addEventListener('pointerdown', (down: PointerEvent) => {
            if (down.button !== 0) return;
            down.preventDefault();
            down.stopPropagation();
            const doc = btn.ownerDocument;
            let ghost: HTMLElement | null = null;
            const move = (ev: PointerEvent) => {
                if (!on.drop) return;
                if (!ghost && Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) > 6) {
                    ghost = doc.body.createDiv('dfm-cbar-ghost');
                    setIcon(ghost, icon);
                }
                if (ghost) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; }
            };
            const up = (ev: PointerEvent) => {
                doc.removeEventListener('pointermove', move);
                doc.removeEventListener('pointerup', up);
                const dragged = ghost !== null;
                ghost?.remove();
                if (!dragged) { on.click(ev); return; }
                const target = doc.elementFromPoint(ev.clientX, ev.clientY);
                const overCanvas = !!target && canvas.wrapperEl?.contains(target) && !parent.parentElement?.contains(target);
                if (overCanvas && on.drop && typeof canvas.posFromEvt === 'function') on.drop(canvas.posFromEvt(ev), ev);
            };
            doc.addEventListener('pointermove', move);
            doc.addEventListener('pointerup', up);
        });
        return btn;
    }

    /**
     * Tarefa nova. No canvas de projeto: SMART ou ação de uma SMART, cada uma só quando o cofre tem o
     * protocolo do papel dela (`criar_smart`, `nova_tarefa_do_projeto`); nos outros, ou sem nenhum
     * dos dois, pelo TaskNotes.
     */
    private newTask(canvas: any, view: any, pos: Pos | null, event: MouseEvent): void {
        const pcm = this.board.projectCanvas;
        const project = pcm?.projectForCanvas(view?.file?.path);
        const comSmart = this.board.idDoPapel('criar_smart') !== null;
        const comAcao = this.board.idDoPapel('nova_tarefa_do_projeto') !== null;
        if (!pcm || !project || (!comSmart && !comAcao)) {
            void (this.plugin as any).canvasEngine?.createTaskNote?.(view, pos);
            return;
        }
        const menu = new Menu();
        if (comSmart) menu.addItem(i => i.setTitle(`Nova tarefa SMART em ${project.name}`).setIcon('target').onClick(() => pcm.newSmart(project)));
        const smarts = comAcao ? pcm.openSmarts(project) : [];
        if (smarts.length) {
            menu.addItem(item => {
                item.setTitle('Nova ação atômica em…').setIcon('square-check');
                const sub: Menu = (item as any).setSubmenu?.() ?? menu;
                for (const smart of smarts) sub.addItem(i => i.setTitle(smart.basename).onClick(() => pcm.newAction(smart)));
            });
        }
        menu.addSeparator();
        menu.addItem(i => i.setTitle('Tarefa solta neste canvas').setIcon('sticky-note').onClick(() => {
            void (this.plugin as any).canvasEngine?.createTaskNote?.(view, pos);
        }));
        menu.showAtMouseEvent(event);
    }

    private widgetMenu(canvas: any, pos: Pos | null): Menu {
        const menu = new Menu();
        for (const entry of BOARD_CATALOG) {
            if (entry.kind === 'consulta') continue;
            menu.addItem(i => i.setTitle(entry.label).setIcon(entry.icon).onClick(() => void this.board.addWidgetKind(canvas, entry, pos)));
        }
        menu.addSeparator();
        for (const preset of QUERY_PRESETS) {
            menu.addItem(i => i.setTitle(preset.label).setIcon(preset.icon).onClick(() => {
                const center = { x: Number(canvas.x) || 0, y: Number(canvas.y) || 0 };
                const at = pos ?? { x: center.x - preset.size.width / 2, y: center.y - preset.size.height / 2 };
                this.board.createWidgetNode(canvas, preset.spec, at, preset.size);
            }));
        }
        return menu;
    }

    private moreMenu(canvas: any, view: any): Menu {
        const menu = new Menu();
        const path: string | undefined = view?.file?.path;
        const pcm = this.board.projectCanvas;
        const project = pcm?.projectForCanvas(path);
        if (pcm && project) {
            menu.addItem(i => i.setTitle(`Sincronizar execução de ${project.name}`).setIcon('refresh-cw').onClick(() => void pcm.sync(project, { notify: true })));
        }
        // O canvas da semana e o do trimestre se aposentaram em 02/11/2026: a barra leva ao trimestre na Missão.
        const hoje = (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
        const trimestre = portaDoPeriodo(currentQuarter(hoje));
        if (trimestre) menu.addItem(i => i.setTitle(`Abrir o ${trimestre.foco} na Missão`).setIcon('calendar-range').onClick(() => void this.board.abrirMissaoNoPeriodo(trimestre)));
        const nodes = Array.from<any>(canvas.nodes?.values?.() ?? []);
        const selected = Array.from<any>(canvas.selection ?? []);
        if (selected.length >= 2) {
            menu.addItem(i => i.setTitle(`Organizar seleção em grade (${selected.length})`).setIcon('layout-grid').onClick(() => this.menus.arrangeGrid(canvas, selected)));
        }
        const tasks = this.tasksIn(nodes);
        if (tasks.length) {
            menu.addItem(i => i.setTitle(`Selecionar as tarefas (${tasks.length})`).setIcon('mouse-pointer-square-dashed').onClick(() => {
                // `select`/`deselectAll` do Canvas (1.13.7); a barra de seleção se redesenha sozinha.
                canvas.deselectAll?.();
                for (const n of nodes) if (n?.file instanceof TFile && this.board.tasks.read(n.file)) canvas.select?.(n);
            }));
        }
        menu.addItem(i => i.setTitle('Reler dados dos widgets').setIcon('rotate-cw').onClick(() => void this.board.store.refreshNow()));
        menu.addSeparator();
        menu.addItem(i => i.setTitle('Abrir o Mission Control').setIcon('layout-dashboard').onClick(() => void this.board.openPanel()));
        return menu;
    }

    /* --------------------------------------------------- barra de seleção */

    private hookSelectionBar(canvas: any, view: any): void {
        const bar = canvas.menu;
        const original = bar?.render;
        if (typeof original !== 'function') return;
        const self = this;
        bar.render = function (...args: unknown[]) {
            const result = original.apply(this, args);
            try { self.decorateSelection(canvas, view); } catch (error) { console.error('DFM: barra de seleção falhou', error); }
            return result;
        };
        this.plugin.register(() => {
            if (bar.render !== original) bar.render = original;
            bar.menuEl?.querySelectorAll?.('.dfm-sel').forEach((el: HTMLElement) => el.remove());
        });
    }

    private tasksIn(nodes: any[]): TaskRecord[] {
        return nodes
            .map(n => (n?.file instanceof TFile ? this.board.tasks.read(n.file) : null))
            .filter((t): t is TaskRecord => t !== null);
    }

    private decorateSelection(canvas: any, view: any): void {
        const menuEl: HTMLElement | undefined = canvas.menu?.menuEl;
        const nodes = Array.from<any>(canvas.selection ?? []);
        if (!menuEl || !nodes.length || canvas.isDragging || canvas.readonly) return;
        if (!menuEl.childElementCount || menuEl.querySelector('.dfm-sel')) return;

        const tasks: TaskRecord[] = [];
        const items: SelectedItem[] = nodes.map(n => {
            const task = n?.file instanceof TFile ? this.board.tasks.read(n.file) : null;
            if (task) { tasks.push(task); return { kind: task.type === 'tarefa_smart' ? 'smart' : 'acao', status: task.status }; }
            if (typeof n?.text === 'string' && readWidgetText(n.text)) return { kind: 'widget' };
            return { kind: 'outro' };
        });
        const actions = selectionActions(items, this.board.idDoPapel('nova_tarefa_do_projeto') !== null);
        if (!actions.length) return;

        menuEl.createDiv('dfm-sel dfm-sel-sep');
        const single = tasks.length === 1 ? tasks[0] : null;
        const handlers: Record<SelectionAction, [string, string, (event: MouseEvent) => void]> = {
            concluir: ['Concluir', 'check-circle-2', () => void this.complete(tasks)],
            reabrir: ['Reabrir', 'rotate-ccw', () => void this.reopen(tasks)],
            agendar: ['Agendar', 'calendar-plus', event => this.taskMenus.openAt(event, tasks, 'agendar')],
            editar: ['Editar no TaskNotes', 'pencil', () => single && void this.board.openTask(single.path)],
            'nova-acao': ['Nova ação desta SMART', 'list-plus', () => single && this.board.projectCanvas?.newAction(single)],
            'tarefa-menu': ['Status, semana, Comando do Dia…', 'list-todo', event => this.taskMenus.openAt(event, tasks)],
            widget: ['Configurar widget', 'settings-2', event => {
                const menu = new Menu();
                this.menus.widgetItems(menu, nodes[0]);
                menu.showAtMouseEvent(event);
            }],
            grade: ['Organizar em grade', 'layout-grid', () => this.menus.arrangeGrid(canvas, nodes)],
        };
        for (const action of actions) {
            const [label, icon, run] = handlers[action];
            const btn = menuEl.createEl('button', { cls: `clickable-icon dfm-sel dfm-sel-${action}` });
            setIcon(btn, icon);
            setTooltip(btn, label, { placement: 'top' });
            btn.addEventListener('click', event => { event.stopPropagation(); run(event); });
        }
    }

    private async complete(tasks: TaskRecord[]): Promise<void> {
        const open = tasks.filter(t => t.type !== 'tarefa_smart' && !['done', 'cancelled'].includes(t.status));
        if (open.length === 0) return;
        // "Quando terminou?" uma vez para a seleção inteira (arquitetura 4.6); fechar não conclui.
        const when = open.length > 1 ? await askCompletionWhen(this.plugin.app, `${open.length} tarefas`) : undefined;
        if (open.length > 1 && !when) return;
        let done = 0;
        for (const task of open) if (await this.board.completeTask(task.path, { when })) done++;
        if (open.length > 1) new Notice(`Concluídas: ${done} de ${open.length}`);
    }

    private async reopen(tasks: TaskRecord[]): Promise<void> {
        // Pelo TaskNotes: o status volta e a tarefa sai de TaskNotes/Archive (concluir arquivou).
        for (const task of tasks) if (task.status === 'done') await this.board.reopenTask(task.path, 'next-action');
    }
}
