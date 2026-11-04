/**
 * O dia a dia no clique-direito de uma tarefa no canvas (ou de várias).
 *
 * Tudo num submenu "DFM" do menu nativo do nó: agendar, pôr na semana, mudar
 * status, Comando do Dia, abrir o canvas do projeto ou da semana. Quem grava é
 * o frontmatter do TaskNotes, pelos mesmos campos que ele usa.
 *
 * O Comando do Dia abre o protocolo do dia com a ação já escolhida — as
 * perguntas de reflexão (entrega suficiente, limite, valor, barreira) continuam
 * sendo do operador; o menu só poupa a busca pela tarefa.
 */
import { Menu, Modal, Notice, Setting, TFile } from 'obsidian';
import type { App, MenuItem } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from './boardPlugin';
import type { TaskRecord } from '../tasks/taskRecord';
import { TERMINAL, fold } from '../project/projectCanvasModel';
import { statusWriter } from './taskCompletion';
import { opcoesDoEstado } from '../missao/intencoes';
import { wantsNewTab } from '../canvas/managedZone';
import { shortWeek } from '../engine/calendario';
import { DO_NOW_PAPEL, doNowVariables } from '../canvas/taskCardModel';
import type { Papel } from '../engine/papeisDeProtocolo';
import { DIA } from '../engine/dia';
import { portaDoPeriodo } from '../missao/estadoTela';

const m = () => (window as any).moment;

function dateIn(days: number): string {
    return m()().add(days, 'day').format('YYYY-MM-DD');
}

function nextMonday(): string {
    const d = m()();
    return d.add(((8 - d.isoWeekday()) % 7) || 7, 'day').format('YYYY-MM-DD');
}

function weekOf(offsetWeeks: number): string {
    return m()().add(offsetWeeks, 'week').format('GGGG-[W]WW');
}

/** A data de agendar (o "Escolher data…" deste menu e o "⏭️ Adiar" do cartão de tarefa). */
export class DateModal extends Modal {
    private value: string;
    constructor(app: App, initial: string, private readonly done: (date: string | null) => void) {
        super(app);
        this.value = initial;
    }
    onOpen(): void {
        this.titleEl.setText('Agendar para');
        let chosen = false;
        new Setting(this.contentEl).setName('Data').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(this.value).onChange(v => { this.value = v; });
            text.inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { chosen = true; this.close(); } });
        });
        new Setting(this.contentEl).addButton(b => b.setButtonText('Agendar').setCta().onClick(() => { chosen = true; this.close(); }));
        this.onClose = () => this.done(chosen && DIA.test(this.value) ? this.value : null);
    }
}

type Patch = Record<string, unknown>;

export class TaskMenus {
    constructor(private readonly plugin: DFMPlugin, private readonly board: MissionBoard) {}

    private get app() { return this.plugin.app; }

    register(): void {
        const { workspace } = this.app;
        this.plugin.registerEvent(workspace.on('canvas:node-menu' as any, (menu: Menu, node: any) => {
            const task = node?.file instanceof TFile ? this.board.tasks.read(node.file) : null;
            if (task) this.submenu(menu, [task], 'DFM');
        }));
        this.plugin.registerEvent(workspace.on('canvas:selection-menu' as any, (menu: Menu, canvas: any) => {
            const tasks = Array.from<any>(canvas?.selection ?? [])
                .map(n => (n?.file instanceof TFile ? this.board.tasks.read(n.file) : null))
                .filter((t): t is TaskRecord => t !== null);
            if (tasks.length) this.submenu(menu, tasks, `DFM · ${tasks.length} tarefa${tasks.length > 1 ? 's' : ''}`);
        }));
    }

    /**
     * Aplica o mesmo patch a todas. Concluir e cancelar passam pelo TaskNotes
     * (`statusWriter`): arquivam, emitem o evento e respeitam a recorrência. Reabrir
     * (uma feita ou cancelada para um status aberto) também: sai do arquivo.
     */
    private async apply(tasks: TaskRecord[], patch: Patch, label: string): Promise<void> {
        let changed = 0;
        for (const task of tasks) {
            const writer = typeof patch.status === 'string' ? statusWriter(patch.status, task.status) : 'updateTask';
            const ok = writer === 'completeTask' ? await this.board.completeTask(task.path)
                : writer === 'setStatus' ? await this.board.setStatus(task.path, String(patch.status))
                : writer === 'reopenTask' ? await this.board.reopenTask(task.path, String(patch.status))
                : await this.board.updateTask(task.path, patch);
            if (ok) changed++;
        }
        if (tasks.length > 1 || patch.status !== 'done') new Notice(`${label}: ${changed} tarefa${changed === 1 ? '' : 's'}`);
    }

    /** O menu DFM de tarefa num ponto da tela (cartão de tarefa). `only` abre direto um grupo. */
    openAt(event: MouseEvent, tasks: TaskRecord[], only?: 'agendar'): void {
        const menu = new Menu();
        if (only === 'agendar') this.fillSchedule(menu, tasks.filter(t => !TERMINAL.has(t.status)), tasks.length === 1 ? tasks[0] : null);
        else this.fill(menu, tasks);
        menu.showAtMouseEvent(event);
    }

    private fillSchedule(sub: Menu, open: TaskRecord[], single: TaskRecord | null): void {
        sub.addItem(i => i.setTitle('Hoje').onClick(() => void this.apply(open, { scheduled: dateIn(0) }, 'Agendada para hoje')));
        sub.addItem(i => i.setTitle('Amanhã').onClick(() => void this.apply(open, { scheduled: dateIn(1) }, 'Agendada para amanhã')));
        sub.addItem(i => i.setTitle('Próxima segunda').onClick(() => void this.apply(open, { scheduled: nextMonday() }, 'Agendada para segunda')));
        sub.addItem(i => i.setTitle('Escolher data…').onClick(() => {
            new DateModal(this.app, single?.scheduled || dateIn(0), date => { if (date) void this.apply(open, { scheduled: date }, `Agendada para ${date}`); }).open();
        }));
        sub.addItem(i => i.setTitle('Definir prazo…').onClick(() => {
            new DateModal(this.app, single?.due || dateIn(7), date => { if (date) void this.apply(open, { due: date }, `Prazo ${date}`); }).open();
        }));
        if (open.some(t => t.scheduled)) sub.addItem(i => i.setTitle('Tirar da agenda').onClick(() => void this.apply(open, { scheduled: null }, 'Sem agenda')));
    }

    private submenu(menu: Menu, tasks: TaskRecord[], title: string): void {
        menu.addItem(item => {
            item.setSection('action').setTitle(title).setIcon('check-square');
            const sub: Menu = (item as any).setSubmenu?.() ?? menu;
            this.fill(sub, tasks);
        });
    }

    private group(menu: Menu, title: string, icon: string, fill: (sub: Menu) => void): void {
        menu.addItem((item: MenuItem) => {
            item.setTitle(title).setIcon(icon);
            const sub: Menu = (item as any).setSubmenu?.() ?? menu;
            fill(sub);
        });
    }

    private fill(menu: Menu, tasks: TaskRecord[]): void {
        const single = tasks.length === 1 ? tasks[0] : null;
        const open = tasks.filter(t => !TERMINAL.has(t.status));

        // A ponte canvas → protocolo (4.7): "o clique-direito de um nó de tarefa no canvas
        // da semana oferece 🤝 Fazer agora, que abre o gesto já com aquela tarefa". Na
        // SMART, o mesmo menu do 🤝 do cartão: as ações dela que cabem hoje.
        if (single && !TERMINAL.has(single.status) && this.temPapel(DO_NOW_PAPEL)) {
            menu.addItem(i => i.setTitle('🤝 Fazer agora').setIcon('handshake').onClick((evt: MouseEvent) => this.doNow(evt, single)));
            menu.addSeparator();
        }

        if (single && !TERMINAL.has(single.status) && single.type !== 'tarefa_smart' && this.temPapel('abrir_dia')) {
            menu.addItem(i => i.setTitle('Definir como Comando do Dia').setIcon('crosshair').onClick(() => this.commandOfDay(single)));
            menu.addSeparator();
        }

        if (open.length) {
            this.group(menu, 'Agendar', 'calendar-plus', sub => this.fillSchedule(sub, open, single));
            this.group(menu, 'Semana', 'calendar-range', sub => {
                sub.addItem(i => i.setTitle(`Semana atual (${weekOf(0)})`).onClick(() => void this.apply(open, { week: weekOf(0) }, `Na ${weekOf(0)}`)));
                sub.addItem(i => i.setTitle(`Próxima semana (${weekOf(1)})`).onClick(() => void this.apply(open, { week: weekOf(1) }, `Na ${weekOf(1)}`)));
            });
        }

        this.group(menu, 'Status', 'circle-dot', sub => {
            // Os estados vêm do modelo da tarefa (`tarefa.json`), os mesmos do ⋯ Status da Missão (03/11: um jeito por
            // função); antes da primeira leitura da Missão, a lista de sempre.
            const tabela = this.board.missao?.estadosDaTarefa?.() ?? [];
            const maiuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
            const statuses: Array<[string, string, string]> = tabela.length
                ? opcoesDoEstado(tabela, null).map((o): [string, string, string] => [o.valor, o.conclui ? `Concluir (${o.rotulo})` : maiuscula(o.rotulo), o.conclui ? 'check-circle' : o.neutro ? 'x-circle' : 'circle-dot'])
                : [
                    ['next-action', 'Próxima ação', 'zap'], ['in-progress', 'Em execução', 'play'], ['waiting-on', 'Esperando', 'hourglass'],
                    ['someday', 'Algum dia', 'archive'], ['done', 'Concluir', 'check-circle'], ['cancelled', 'Cancelar', 'x-circle'],
                ];
            for (const [status, label, icon] of statuses) {
                if (single && single.status === status) continue;
                sub.addItem(i => i.setTitle(label).setIcon(icon).onClick(() => void this.apply(tasks, { status }, label)));
            }
        });

        if (single) {
            menu.addSeparator();
            const project = this.projectOf(single);
            if (project && this.board.projectCanvas) {
                menu.addItem(i => i.setTitle(`Abrir canvas de ${project}`).setIcon('folder-kanban').onClick(async evt => {
                    const pcm = this.board.projectCanvas!;
                    const p = (await pcm.projects()).find(x => fold(x.name) === fold(project));
                    if (p) await pcm.openOrCreate(p, { newTab: wantsNewTab(evt) });
                    else new Notice(`Projeto ${project} não está no portfólio.`);
                }));
            }
            // A semana DA TAREFA na Missão, não a semana em foco (o canvas da semana se aposentou em 02/11/2026).
            const porta = portaDoPeriodo(single.week);
            if (porta) {
                menu.addItem(i => i.setTitle(`Ver a ${shortWeek(porta.foco)} na Missão`).setIcon('calendar-days')
                    .onClick(() => void this.board.abrirMissaoNoPeriodo(porta)));
            }
        }
    }

    /**
     * 🤝 Fazer agora pelo menu: o mesmo do botão do cartão (`TaskCards.doNowFrom`: na
     * SMART, o menu das ações dela; no celular, nada). Sem os cartões, abre o gesto
     * direto com a tarefa.
     */
    private doNow(event: MouseEvent, task: TaskRecord): void {
        const cards: any = (this.board as any).taskCards;
        if (cards?.doNowFrom) { cards.doNowFrom(event, task); return; }
        if (task.type === 'tarefa_smart') return;
        void this.board.runPapel(DO_NOW_PAPEL, doNowVariables(task));
    }

    /**
     * O que faz: o cofre tem protocolo para o papel (`MissionBoard.idDoPapel`)? A opção do menu
     * só aparece com ele (D1 do mapa da v0). Um quadro sem a leitura (o de teste) mostra tudo.
     */
    private temPapel(papel: Papel): boolean {
        const board: any = this.board;
        return typeof board?.idDoPapel === 'function' ? board.idDoPapel(papel) !== null : true;
    }

    /** Projeto real: direto, ou pela SMART mãe. */
    private projectOf(task: TaskRecord): string | null {
        const smarts = new Map(this.board.tasks.all().filter(t => t.type === 'tarefa_smart').map(t => [fold(t.basename), t]));
        for (const link of task.projects) {
            const smart = smarts.get(fold(link));
            if (smart?.projects[0]) return smart.projects[0];
            if (!smart) return link;
        }
        return null;
    }

    private commandOfDay(task: TaskRecord): void {
        // O ▶️ pelo papel; sem protocolo para ele, a opção nem aparece (`temPapel`).
        const protocol = (this.plugin as any).manager?.doPapel?.('abrir_dia');
        if (!protocol) return;
        // As mesmas variáveis que o seletor de nota do passo `acao_comando` gravaria:
        // com elas o protocolo pula a escolha e segue para as perguntas do operador.
        const folder = task.path.slice(0, task.path.lastIndexOf('/'));
        void protocol.run({
            acao_comando: task.basename,
            acao_comando_display: `[[${task.basename}]]`,
            acao_comando_path: task.path,
            acao_comando_folder: folder,
        });
    }
}
