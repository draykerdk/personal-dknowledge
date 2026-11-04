/**
 * Liga o cartão de tarefa ao plugin: dados do índice, pesos da tabela única, ações do
 * quadro, menus e o gesto. O formatador de canvas chama `mount(node, file)` para cada
 * nó que é TaskNote (a cada volta do laço de 5 s).
 *
 * Liga:
 * - os motivos dos pesos: a mesma `scoreTask` e a mesma tabela do gesto, pelo serviço
 *   da árvore do agora (`plugin.nowTree`), calculadas para a lista toda de uma vez e
 *   guardadas por 30 s (o laço redesenha o cartão quando a assinatura muda);
 * - 🤝 Fazer agora → o gesto (o papel `DO_NOW_PAPEL`) já com a tarefa; na SMART, um menu
 *   com as ações dela que cabem hoje, pela ordem dos pesos;
 * - ⏭️ Adiar → amanhã ou outro dia (`scheduled`, pelo `MissionBoard.updateTask`);
 * - a bolinha → `completeFromCard` → `MissionBoard.completeTask`, que pergunta "Quando
 *   terminou?" antes de concluir (fechar sem escolher não conclui).
 *
 * Regula: no celular (`Platform.isMobile`) o cartão só lê; nada daqui grava por lá.
 */
import { Menu, Notice, Platform, TFile } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from '../board/boardPlugin';
import { DateModal, type TaskMenus } from '../board/taskMenus';
import { statusWriter } from '../board/taskCompletion';
import type { TaskRecord } from '../tasks/taskRecord';
import { smartChildren } from '../project/projectCanvasModel';
import { isManagedId } from './managedIds';
import { buildTaskRelations, type WeightReason } from '../engine/decisionWeights';
import { DO_NOW_PAPEL, doNowVariables, focusOf, reasonsByPath, reasonsView, taskCardModel, STATUS_VIEW, postponeUpdates } from './taskCardModel';
import { mountTaskCard } from './taskCard';
import type { TaskCardActions } from './taskCard';

/** Quanto tempo os motivos calculados valem antes de serem recalculados. */
const REASONS_TTL_MS = 30_000;

function today(): string {
    return (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
    return (window as any).moment?.().add(1, 'day').format('YYYY-MM-DD') ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export class TaskCards {
    private readonly actions: TaskCardActions;
    private reasons = new Map<string, WeightReason[]>();
    private reasonsAt = 0;
    private reasonsBuilding: Promise<void> | null = null;

    constructor(private readonly plugin: DFMPlugin, private readonly board: MissionBoard, private readonly menus: TaskMenus) {
        this.actions = {
            complete: task => this.completeFromCard(task),
            statusMenu: (event, task) => {
                const menu = new Menu();
                for (const [status, view] of Object.entries(STATUS_VIEW)) {
                    if (status === task.status) continue;
                    menu.addItem(i => i.setTitle(view.label).onClick(() => {
                        // Concluir e cancelar passam pelo TaskNotes (arquiva e emite o evento);
                        // reabrir uma feita ou cancelada também (sai do arquivo).
                        const writer = statusWriter(status, task.status);
                        void (writer === 'completeTask' ? this.completeFromCard(task)
                            : writer === 'setStatus' ? this.board.setStatus(task.path, status)
                            : writer === 'reopenTask' ? this.board.reopenTask(task.path, status)
                            : this.board.updateTask(task.path, { status }));
                        this.reasonsAt = 0;
                    }));
                }
                menu.showAtMouseEvent(event);
            },
            dateMenu: (event, task) => this.menus.openAt(event, [task], 'agendar'),
            moreMenu: (event, task) => this.menus.openAt(event, [task]),
            newAction: task => this.newAction(task),
            edit: (event, task) => void this.board.openTask(task.path, event),
            doNow: (event, task) => (task.type === 'tarefa_smart' ? void this.doNowSmart(event, task) : this.doNow(task)),
            podeFazerAgora: () => this.board.idDoPapel(DO_NOW_PAPEL) !== null,
            podeNovaAcao: () => this.board.idDoPapel('nova_tarefa_do_projeto') !== null,
            postpone: (event, task) => this.postpone(event, task),
        };
    }

    /** 🤝 Fazer agora de fora do cartão (o submenu DFM do clique-direito e o ⋯): o mesmo do botão. */
    doNowFrom(event: MouseEvent, task: TaskRecord): void {
        this.actions.doNow(event, task);
    }

    /** Monta (ou atualiza) o cartão no nó; `false` se o arquivo não é TaskNote. */
    mount(node: any, file: TFile): boolean {
        const el: HTMLElement | undefined = node?.nodeEl;
        if (!el) return false;
        const task = this.board.tasks.read(file);
        if (!task) return false;
        // As ações da SMART pela regra da zona e do bloco da semana: o cartão mostra o mesmo número.
        const children = task.type === 'tarefa_smart' ? smartChildren(task, this.board.tasks.all()) : undefined;
        const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const model = taskCardModel(task, today(), {
            children,
            focus: focusOf(fm.timeEntries, Date.now()),
            reasons: this.reasonsOf(task.path),
            readOnly: Platform.isMobile,
        });
        mountTaskCard(el, task, model, this.actions);
        return true;
    }

    /** Os motivos já calculados desta tarefa; pede o recálculo quando passaram de 30 s. */
    private reasonsOf(path: string): WeightReason[] | undefined {
        this.refreshReasons();
        return this.reasons.get(path);
    }

    /**
     * Recalcula, em segundo plano, os motivos de todas as tarefas abertas pela tabela
     * única. Sem o serviço da árvore do agora, o cartão fica sem a linha do motivo.
     */
    private refreshReasons(): void {
        if (this.reasonsBuilding || Date.now() - this.reasonsAt < REASONS_TTL_MS) return;
        const tree: any = (this.plugin as any).nowTree;
        if (!tree?.loadWeights || !tree?.taskUnits || !tree?.decisionContext) return;
        this.reasonsBuilding = (async () => {
            const { table } = await tree.loadWeights();
            const units = tree.taskUnits();
            const ctx = await tree.decisionContext(units, { hoje: today() });
            const live = units.filter((unit: any) => !String(unit.path).startsWith('TaskNotes/Archive/'));
            this.reasons = reasonsByPath(live, ctx, table, buildTaskRelations(units));
        })()
            .catch(error => console.error('DFM cartão de tarefa: os pesos não foram calculados', error))
            .finally(() => { this.reasonsAt = Date.now(); this.reasonsBuilding = null; });
    }

    /**
     * A bolinha do cartão: conclui por `MissionBoard.completeTask`, que pergunta "Quando
     * terminou?" (Agora marcado · Mais cedo hoje · Ontem · Outro dia; na dita depois, a
     * segunda linha com onde foi e quanto levou; arquitetura 4.6) antes de concluir.
     * Fechar sem escolher não conclui: devolve `false` e a bolinha volta a vazia.
     */
    private completeFromCard(task: TaskRecord): Promise<boolean> {
        if (Platform.isMobile) return Promise.resolve(false);
        this.reasonsAt = 0;
        return this.board.completeTask(task.path);
    }

    /** 🤝 Fazer agora: o gesto já com a tarefa e o porquê dos pesos. */
    private doNow(task: TaskRecord): void {
        if (Platform.isMobile) return;
        void this.board.runPapel(DO_NOW_PAPEL, doNowVariables(task, this.reasons.get(task.path)));
    }

    /**
     * 🤝 Fazer agora na SMART: as ações dela que cabem hoje, pela ordem dos pesos da
     * árvore do agora (sem lugar nem tempo: o gesto é que pergunta o resto). A
     * escolhida abre o gesto já com ela.
     */
    private async doNowSmart(event: MouseEvent, smart: TaskRecord): Promise<void> {
        if (Platform.isMobile) return;
        const tree: any = (this.plugin as any).nowTree;
        const kids = smartChildren(smart, this.board.tasks.all());
        const byPath = new Map(kids.map(kid => [kid.path, kid]));
        let ranked: Array<{ path: string; name: string; motivos: WeightReason[]; grupo: string }> = [];
        try {
            const result = tree?.rank ? await tree.rank({ hoje: today() }) : { sugestoes: [], aTriar: [] };
            ranked = [...(result?.sugestoes ?? []), ...(result?.aTriar ?? [])].filter((item: any) => byPath.has(item.path));
        } catch (error) {
            console.error('DFM cartão de tarefa: a lista da SMART não foi montada', error);
        }
        const menu = new Menu();
        if (!ranked.length) {
            menu.addItem(i => i.setTitle('Nenhuma ação desta SMART cabe hoje').setDisabled(true));
        }
        for (const item of ranked) {
            const kid = byPath.get(item.path)!;
            const why = reasonsView(item.motivos)?.label;
            const prefix = item.grupo === 'a_triar' ? '📥 ' : '';
            menu.addItem(i => i.setTitle(`${prefix}${kid.title || kid.basename}${why ? ` — ${why}` : ''}`).setIcon('handshake')
                .onClick(() => void this.board.runPapel(DO_NOW_PAPEL, doNowVariables(kid, item.motivos))));
        }
        if (smart.status !== 'done' && this.board.idDoPapel('nova_tarefa_do_projeto') !== null) {
            menu.addSeparator();
            menu.addItem(i => i.setTitle('Nova ação atômica desta SMART').setIcon('plus').onClick(() => this.newAction(smart)));
        }
        menu.showAtMouseEvent(event);
    }

    /** ⏭️ Adiar: amanhã ou outro dia (o `scheduled`; o resto da agenda fica no ⋯). */
    private postpone(event: MouseEvent, task: TaskRecord): void {
        if (Platform.isMobile) return;
        const write = async (date: string, label: string) => {
            this.reasonsAt = 0;
            if (await this.board.updateTask(task.path, postponeUpdates(task, date))) new Notice(`⏭️ Adiada para ${label}`);
        };
        const menu = new Menu();
        menu.addItem(i => i.setTitle('🌅 Amanhã').onClick(() => void write(tomorrow(), 'amanhã')));
        menu.addItem(i => i.setTitle('📅 Outro dia…').onClick(() => {
            new DateModal(this.plugin.app, task.scheduled && task.scheduled > today() ? task.scheduled : tomorrow(), date => {
                if (date) void write(date, date);
            }).open();
        }));
        menu.showAtMouseEvent(event);
    }

    /**
     * "+" na SMART: abre o protocolo de ação atômica do cofre com a SMART escolhida.
     * Em canvas solto, quando a ação nasce, o nó dela entra logo abaixo da SMART;
     * na zona gerida quem posiciona é a sincronização.
     */
    private newAction(smart: TaskRecord): void {
        if (Platform.isMobile) return;
        const pcm = this.board.projectCanvas;
        if (!pcm) return;
        const leaf = this.plugin.app.workspace.getLeavesOfType('canvas').find(l => {
            const nodes = (l.view as any)?.canvas?.nodes;
            return nodes && [...nodes.values()].some((n: any) => n?.file?.path === smart.path);
        });
        const canvas: any = (leaf?.view as any)?.canvas;
        const node: any = canvas ? [...canvas.nodes.values()].find((n: any) => n?.file?.path === smart.path) : null;
        // As zonas geridas (a do projeto e as da semana e do trimestre, `dfm-pc-` e `dfm-q`): `isManagedId`.
        const loose = node && !isManagedId(node.id);
        if (loose) {
            const ws: any = this.plugin.app.workspace;
            const ref = ws.on('dfm:protocol-complete', (payload: any) => {
                if (!this.board.ehDoPapel(payload?.id, ['nova_tarefa_do_projeto']) || payload?.variables?.tarefa_smart_path !== smart.path) return;
                ws.offref(ref);
                window.clearTimeout(timer);
                const file = payload.file;
                if (!(file instanceof TFile) || typeof canvas.createFileNode !== 'function') return;
                const below = [...canvas.nodes.values()].filter((n: any) => n.x < node.x + node.width && n.x + n.width > node.x && n.y >= node.y)
                    .reduce((max: number, n: any) => Math.max(max, n.y + n.height), node.y + node.height);
                canvas.createFileNode({ file, pos: { x: node.x, y: below + 40 }, size: { width: 400, height: 150 }, save: true });
            });
            // Protocolo abandonado: o ouvinte não fica pendurado.
            const timer = window.setTimeout(() => ws.offref(ref), 10 * 60_000);
        }
        pcm.newAction(smart);
    }
}
