/**
 * Liga o quadro ao Obsidian: bloco ```dfm-widget```, comandos e ribbon.
 *
 * O desenho acontece dentro do Markdown que o próprio Obsidian renderiza — num
 * nó de texto de canvas ou numa nota. Por isso não há DOM injetado em nó, laço
 * de remontagem, alça de redimensionar ou arrasto próprio: tudo isso é o canvas.
 */
import type { MotorDaGaveta } from '../missao/gavetaDoMotor';
import type { MarkdownPostProcessorContext, PaneType } from 'obsidian';
import { App, FuzzySuggestModal, Keymap, MarkdownRenderChild, Menu, Notice, TFile, getFrontMatterInfo, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { parseHabit, resolveClick, reviewPatch } from '../engine/habits';
import type { HabitReviewChoice } from '../engine/habits';
import type DFMPlugin from '../main';
import { BoardStore } from './boardStore';
import { TaskIndex } from '../tasks/taskIndex';
import type { ProjectCanvasManager } from '../project/projectCanvasManager';
import { BOARD_CATALOG, TASK_FILTERS, parseWidgetSpec, widgetBlock } from './boardSpec';
import type { BoardCatalogEntry, BoardTaskFilter, BoardWidgetSpec } from './boardSpec';
import { renderBoardError, renderBoardWidget, renderConsulta, renderMissaoAtalho } from './boardRender';
import { evaluateQuery } from './queryModel';
import type { NavInput } from './panelNav';
import { departmentsInFocus, indexCandidates } from './panelNav';
import { focoDoTrimestre, linkNames, temporadaFrom } from '../engine/temporada';
import type { TaskRecord } from '../tasks/taskRecord';
import { fold as foldName, linkTarget } from '../project/projectCanvasModel';
import { listOf } from '../tasks/taskRecord';
import type { QueryScope } from './queryModel';
import { currentQuarter, isoWeekOf, plannedWeekOf, quarterWeeks } from '../engine/calendario';
import { dayOverText } from '../engine/tarefasNoPeriodo';
import { PeriodNotes } from '../temporal/periodNotes';
import type { BoardActions } from './boardRender';
import { atalhoDaMissao, projectNames, type AtalhoDaMissao } from './boardModel';
import { BoardCanvasMenus } from './boardCanvasMenus';
import { TaskMenus } from './taskMenus';
import { CanvasToolbar } from './canvasToolbar';
import { TaskCards } from '../canvas/taskCards';
import { completionRoute, isArchivedTask, markCompletionAnswer, markCompletionNoticed, releaseOffer, reopenRoute, takeCompletionAnswer, withoutArchiveNotice, type CompletionWhen } from './taskCompletion';
import { askCompletionWhen } from '../ui/completionModals';
import { BoardPanelView, VIEW_TYPE_DFM_BOARD_PANEL } from './boardPanel';
import { MissaoView, VIEW_TYPE_DFM_MISSAO } from '../missao/hosts/aba';
import { ligacoesNoCache, montarNoLugar, protocolosNoCofre, type MissaoNoLugar, type OpcoesDoLugar } from '../missao/hosts/lugar';
import type { EstadoDaMissao, PedidoDaNotaNova } from '../missao/view/componente';
import { ProtocolTools } from './protocolActions';
import { MissaoService } from '../missao/missaoService';
import { hojeLocal } from '../missao/hosts/relogio';
import { caminhoImporta } from '../missao/entrada';
import { GravacoesDaMissao, PilhaDoDesfazer, type DepsDaGravacao } from '../missao/missaoWrites';
import type { Avisar, MissaoModelo, RegistroDoFeito, ResultadoDaGravacao } from '../missao/tipos';
import { idDoProjeto } from '../missao/linhagem';
import { portaDoPeriodo, type PortaDoPeriodo } from '../missao/estadoTela';
import { PORTAS } from '../missao/frases';
import { capturarNaCaixa, type ResultadoDaCaptura } from '../ui/mission/captureCore';
import type { LinkTask } from '../canvas/edgeLinks';
import { DO_NOW_PAPEL, doNowVariables, scoresByPath } from '../canvas/taskCardModel';
import type { Papel } from '../engine/papeisDeProtocolo';
import { definicoesDe, type TrilhaDefinida } from '../definicoes';
import { comMarca, estadoDaTrilha, type EstadoDaTrilha } from '../missao/trilha';
import { buildTaskRelations } from '../engine/decisionWeights';
import { GravacoesDaTriagem, type DepsDaTriagem } from '../missao/triagemWrites';
import { ensureFolder } from '../missao/hosts/pastas';
import { GravacoesDoNovo, type DepsDoNovo } from '../missao/novoWrites';
import { statusAoGanharLugar } from '../missao/intencoes';
import { ARQUIVO_DAS_PROPOSTAS, FilaDePropostas } from '../engine/propostasDoAgente';
import { notaDoMolde, type PassoDoProtocolo } from '../missao/novo';
import { planWeekStart, renderTemplateTokens, type TokenClock } from '../engine/templateTokens';
import { createTaskViaApi, openTaskForm, prefillFromFrontmatter } from '../engine/tasknotesBridge';
import { carimboDoMomento } from '../engine/dia';
import { registrarFeito as registrarOFeito, type ResultadoDoRegistro } from '../missao/registrarFeito';

export const BOARD_BLOCK = 'dfm-widget';
export const BOARD_HOVER_SOURCE = 'dfm-board';

class BoardWidgetChild extends MarkdownRenderChild {
    private unsubscribe: (() => void) | null = null;

    constructor(
        containerEl: HTMLElement,
        private readonly spec: BoardWidgetSpec,
        private readonly store: BoardStore,
        private readonly actions: BoardActions,
    ) {
        super(containerEl);
    }

    onload(): void {
        this.draw();
        this.unsubscribe = this.store.subscribe(() => this.draw());
    }

    onunload(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private draw(): void {
        renderBoardWidget(this.containerEl, this.spec, this.store.current(), this.actions);
    }
}

/**
 * Widget de consulta: mede o canvas onde mora. O escopo (arquivos do canvas,
 * projeto do canvas, semana em foco do trimestre) é recalculado quando o
 * canvas muda; o resultado, quando as tarefas mudam.
 */
class QueryWidgetChild extends MarkdownRenderChild {
    private unsubscribe: (() => void) | null = null;
    private scope: QueryScope | null = null;

    constructor(
        containerEl: HTMLElement,
        private readonly spec: BoardWidgetSpec,
        private readonly board: MissionBoard,
        private readonly sourcePath: string,
        private readonly actions: BoardActions,
    ) {
        super(containerEl);
    }

    onload(): void {
        this.draw();
        void this.refreshScope();
        this.unsubscribe = this.board.store.subscribe(() => this.draw());
        this.registerEvent(this.board.app.vault.on('modify', file => {
            if (file.path === this.sourcePath) void this.refreshScope();
        }));
    }

    onunload(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private async refreshScope(): Promise<void> {
        this.scope = await this.board.queryScope(this.sourcePath);
        this.draw();
    }

    private draw(): void {
        const result = this.scope ? evaluateQuery(this.spec, this.board.tasks.all(), this.scope) : null;
        renderConsulta(this.containerEl, this.spec, result, this.actions, this.scope?.today ?? today());
    }
}

function today(): string {
    return (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
}

/** Viewport do canvas, em coordenadas do canvas. `x`/`y` são o centro visível. */
function viewportCenter(canvas: any): { x: number; y: number } {
    const x = Number(canvas?.x);
    const y = Number(canvas?.y);
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function activeCanvas(app: App): any | null {
    const view: any = app.workspace.activeLeaf?.view;
    return view?.getViewType?.() === 'canvas' && view.canvas ? view.canvas : null;
}

class PickModal<T> extends FuzzySuggestModal<T> {
    constructor(app: App, private readonly items: T[], private readonly label: (item: T) => string, placeholder: string, private readonly done: (item: T) => void) {
        super(app);
        this.setPlaceholder(placeholder);
    }
    getItems(): T[] { return this.items; }
    getItemText(item: T): string { return this.label(item); }
    onChooseItem(item: T): void { this.done(item); }
}

function pick<T>(app: App, items: T[], label: (item: T) => string, placeholder: string): Promise<T | null> {
    return new Promise(resolve => {
        let chosen = false;
        const modal = new PickModal(app, items, label, placeholder, item => { chosen = true; resolve(item); });
        const close = modal.onClose.bind(modal);
        // `onChooseItem` roda depois de `onClose`; o adiamento evita resolver null antes.
        modal.onClose = () => { close(); window.setTimeout(() => { if (!chosen) resolve(null); }, 0); };
        modal.open();
    });
}

/**
 * O aviso do Desfazer único: o texto e, quando há o que desfazer, o link "Desfazer" (8 s,
 * o mesmo tempo do aviso das setas).
 */
function avisoComDesfazer(text: string, undo?: () => void): void {
    if (!undo) { new Notice(text, 6000); return; }
    const fragment = document.createDocumentFragment();
    fragment.append(`${text} · `);
    const link = fragment.createEl('a', { text: 'Desfazer', href: '#' });
    const notice = new Notice(fragment, 8000);
    link.addEventListener('click', event => {
        event.preventDefault();
        notice.hide();
        undo();
    });
}

export class MissionBoard {
    readonly store: BoardStore;
    /** Todas as TaskNotes, inclusive concluídas — a fonte dos canvas geridos e das consultas. */
    readonly tasks: TaskIndex;
    /** Preenchidos pelo plugin depois do registro: o painel navega por eles. */
    projectCanvas: ProjectCanvasManager | null = null;
    /** As notas de período: a do trimestre, a da semana e a semana em foco (temporal/periodNotes.ts). */
    periodNotes: PeriodNotes | null = null;
    /** Cartão de tarefa nos nós de TaskNote (montado pelo formatador de canvas). */
    taskCards: TaskCards | null = null;
    /** Os gestos da página "Protocolos" (rodar, fase, objetivo, bancada, mapa do 🧭). */
    readonly protocolTools: ProtocolTools;
    /**
     * O leitor da página Missão (arquitetura de 27/10/2026, 3.7): lê o cofre sem o snapshot e
     * entrega o modelo puro por versão. Inspeção: `await board.missao.modelo()`.
     */
    readonly missao: MissaoService;
    /**
     * O Desfazer único (arquitetura da página Missão, P6; proposta do Mission Control, "Um
     * Desfazer só"): a Missão, o painel e as setas do canvas registram aqui; o aviso traz
     * "Desfazer" e o ⌘Z da Missão desfaz a última.
     */
    readonly desfazer: PilhaDoDesfazer;
    /** As gravações da Missão (e do "Mover para outro projeto…" do canvas), com o Desfazer. */
    readonly gravacoes: GravacoesDaMissao;
    /** As gravações da triagem (a nota da Caixa, a ideia pelo 🗂️, o rascunho), na mesma pilha. */
    readonly triagem: GravacoesDaTriagem;
    /** As gravações do Novo (a tarefa pelo TaskNotes, com a herança e o Desfazer), na mesma pilha. */
    readonly novo: GravacoesDoNovo;
    /**
     * As propostas do agente do sistema (02/11/2026): esperam na triagem da Missão, e o aceite grava
     * pelas setas ou pelo Novo, com o Desfazer na mesma pilha. A ponte do operador só propõe.
     */
    readonly propostas: FilaDePropostas;

    get app() { return this.plugin.app; }

    /** O que um widget de consulta enxerga, a partir do arquivo onde ele mora. */
    async queryScope(sourcePath: string): Promise<QueryScope> {
        const date = today();
        let canvasFiles: Set<string> | null = null;
        if (sourcePath.endsWith('.canvas')) {
            const file = this.app.vault.getAbstractFileByPath(sourcePath);
            canvasFiles = new Set();
            if (file instanceof TFile) {
                try {
                    const data = JSON.parse(await this.app.vault.cachedRead(file));
                    for (const n of data?.nodes ?? []) if (n?.type === 'file' && typeof n.file === 'string') canvasFiles.add(n.file);
                } catch { /* canvas ilegível: escopo vazio, dito pelo widget */ }
            }
        }
        let canvasProject: string | null = null;
        if (canvasFiles && this.projectCanvas) {
            const project = (await this.projectCanvas.projects()).find(p => this.projectCanvas!.canvasPathFor(p) === sourcePath);
            canvasProject = project?.name ?? null;
        }
        // `semana: atual` é a semana de hoje e o trimestre é o da semana de hoje (D6), em todo canvas: o canvas
        // da semana e o do trimestre, onde ela era a daquele canvas, se aposentaram em 02/11/2026.
        return {
            today: date,
            currentWeek: isoWeekOf(date),
            canvasFiles,
            canvasProject,
            focusWeek: null,
            quarterWeeks: quarterWeeks(currentQuarter(date)),
        };
    }

    /** Tudo o que a navegação do painel precisa, lido do vault agora. */
    async navInput(): Promise<NavInput> {
        const date = today();
        const files = this.app.vault.getMarkdownFiles().filter(f => !f.path.includes('305 - P&D'));
        const fmOf = (f: TFile) => this.app.metadataCache.getFileCache(f)?.frontmatter ?? {};

        const lt = files.find(f => fmOf(f).type === 'longterm_note' && fmOf(f).status !== 'closed') ?? null;
        const ltCanvas = lt ? this.app.vault.getFiles().find(f => f.extension === 'canvas' && f.basename === lt.basename)?.path ?? null : null;

        // O trimestre da semana de hoje (D6): em 29–31/03/2027 o calendário diz Q1, a W13 é do Q2.
        const quarter = currentQuarter(date);
        const qNote = this.periodNotes?.quarterNote(quarter) ?? null;
        const focus = this.periodNotes?.focus(quarter) ?? { week: isoWeekOf(date), path: null, label: `Semana ${isoWeekOf(date)}` };

        const day = files.find(f => f.basename === date && fmOf(f).type === 'daily_note') ?? null;
        const comando = day ? String(fmOf(day).acao_comando ?? '').trim() || null : null;

        let snapshot = this.store.current();
        if (!snapshot) snapshot = await this.plugin.getMissionControl().build();
        // A central a que cada projeto serve: o `projects` da nota-índice (<nome>.md ou
        // README.md, nessa ordem, como o canvas), o mesmo campo de ligação das tarefas
        // (arquitetura 3.2).
        const fmAt = (path: string): Record<string, any> => {
            const file = this.app.vault.getAbstractFileByPath(path);
            return file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter ?? {} : {};
        };
        const servesOf = (folder: string, name: string, index?: string | null): string[] => {
            const candidates = indexCandidates(folder, name, index);
            const found = candidates.find(path => this.app.vault.getAbstractFileByPath(path) instanceof TFile);
            return found ? linkNames(fmAt(found).projects) : [];
        };
        const projects: NavInput['projects'] = [];
        for (const col of snapshot?.portfolio?.columns ?? []) {
            for (const p of col.projects) {
                // O resolvedor único: projeto em repositório próprio tem o canvas na área.
                const canvas = this.projectCanvas?.canvasPathFor({ name: p.name, path: p.path }) ?? '';
                projects.push({
                    name: p.name, area: p.area || 'Sem área', stage: p.column,
                    canvasExists: this.app.vault.getAbstractFileByPath(canvas) instanceof TFile,
                    submodule: await this.app.vault.adapter.exists(`${p.path}/.git`),
                    serves: servesOf(p.path, p.name, p.index),
                });
            }
        }
        // A Temporada (25/10/2026): a lista `temporada` da nota do trimestre; sem ela,
        // `departamentos_foco`.
        const qFm = qNote ? this.app.metadataCache.getFileCache(qNote)?.frontmatter ?? {} : {};
        const temporada = temporadaFrom(qFm);
        const temporadaKeys = new Set(temporada.map(foldName));
        // Um foco só (27/10/2026): com `projetos_foco` na nota, a lista do trimestre decide
        // quais departamentos entram e quais auxiliares aparecem sob cada central.
        const foco = linkNames(qFm.projetos_foco).length ? focoDoTrimestre(qFm) : [];
        // Departamentos entram como linha de projeto (canvas pelo mesmo resolvedor, mesmas
        // contagens): os em foco no trimestre, os da Temporada e os que servem a uma
        // central (um departamento pode servir a outra central).
        const departments = (snapshot?.portfolio?.departments ?? []).map(d => ({ ...d, serves: servesOf(d.path, d.name) }));
        const onTable = foco.length
            ? departmentsInFocus(departments, foco)
            : [
                ...departmentsInFocus(departments, [...listOf(qFm.departamentos_foco), ...temporada]),
                ...departments.filter(d => d.serves.some(name => temporadaKeys.has(foldName(name)))),
            ];
        for (const d of onTable) {
            if (projects.some(p => foldName(p.name) === foldName(d.name))) continue;
            const canvas = this.projectCanvas?.canvasPathFor({ name: d.name, path: d.path }) ?? '';
            projects.push({
                name: d.name, area: d.area || 'Sem área', stage: 'Departamento',
                canvasExists: this.app.vault.getAbstractFileByPath(canvas) instanceof TFile,
                submodule: await this.app.vault.adapter.exists(`${d.path}/.git`),
                serves: d.serves,
            });
        }
        const otherTargets = [
            ...(snapshot?.portfolio?.departments ?? []).map(d => d.name),
            ...(snapshot?.portfolio?.areas ?? []).map(a => a.name),
        ];

        return {
            today: date,
            currentWeek: isoWeekOf(date),
            longTerm: { label: lt?.basename ?? 'Longo prazo', canvas: ltCanvas, note: lt?.path ?? null },
            quarter: { id: quarter, note: qNote?.path ?? null },
            focus: { week: focus.week, label: focus.label, note: focus.path },
            day: { note: day?.path ?? null, comando },
            tasks: this.tasks.all(),
            projects,
            otherTargets,
            temporada,
            foco,
        };
    }

    /**
     * Liga uma ação à SMART mãe (contrato do Kernel: `projects: [[SMART]]`, herda
     * `week`/`impacto` se faltarem) ou direto a um projeto. Vínculos que não
     * apontam para nada existente saem; os válidos ficam.
     */
    async linkTask(path: string, target: { smart?: TaskRecord; project?: string }, keep: (link: string) => boolean = () => true): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        const smartFile = target.smart ? this.app.vault.getAbstractFileByPath(target.smart.path) : null;
        const smartFm = smartFile instanceof TFile ? this.app.metadataCache.getFileCache(smartFile)?.frontmatter ?? {} : {};
        const link = target.smart ? `[[${target.smart.basename}]]` : `[[${target.project}]]`;
        await this.app.fileManager.processFrontMatter(file, fm => {
            const kept = listOf(fm.projects).filter(l => keep(linkTarget(l)) && foldName(linkTarget(l)) !== foldName(linkTarget(link)));
            // Ligar à SMART substitui o vínculo direto com o projeto dela.
            const smartProjects = new Set((target.smart?.projects ?? []).map(foldName));
            fm.projects = [...kept.filter(l => !smartProjects.has(foldName(linkTarget(l)))), link];
            if (target.smart) {
                if (!fm.week && smartFm.week) fm.week = smartFm.week;
                if (fm.impacto === undefined && smartFm.impacto !== undefined) fm.impacto = smartFm.impacto;
            }
            fm.dateModified = new Date().toISOString();
        });
        this.store.scheduleRefresh();
        return true;
    }

    /** Roda o protocolo; a promessa acaba quando a rodada acaba (a triagem espera o 🗂️). */
    runProtocol(id: string, vars: Record<string, unknown> = {}): Promise<void> {
        const protocol = (this.plugin as any).manager?.get?.(id);
        if (protocol) return Promise.resolve(protocol.run(vars)).catch(e => { console.error(`DFM: o protocolo ${id} falhou`, e); });
        new Notice(`Protocolo ${id} não encontrado.`);
        return Promise.resolve();
    }

    /** O motor de um protocolo carregado (o `JSONProtocol` do gerente), para a gaveta do ciclo da Missão (P12b); `null` = não carregado. */
    motorDoProtocolo(id: string): MotorDaGaveta | null {
        const protocol = (this.plugin as any).manager?.get?.(id);
        return protocol && protocol.def ? protocol as MotorDaGaveta : null;
    }

    /**
     * O que faz: o id do protocolo carregado que faz o papel (`ProtocolManager.idDoPapel`), ou
     * `null`: o painel, os cartões e a Missão só desenham o botão de um papel com protocolo.
     */
    idDoPapel(papel: Papel): string | null {
        const manager = (this.plugin as any).manager;
        return typeof manager?.idDoPapel === 'function' ? manager.idDoPapel(papel) : null;
    }

    /** O id dado é o protocolo de um dos papéis (pela tabela vigente): os ouvintes do fim de um protocolo. */
    ehDoPapel(id: unknown, papeis: readonly Papel[]): boolean {
        const manager = (this.plugin as any).manager;
        return typeof manager?.ehDoPapel === 'function' ? manager.ehDoPapel(id, papeis) : false;
    }

    /** Roda o protocolo do papel (`runProtocol`); sem protocolo para o papel, nada acontece (o botão nem aparece). */
    runPapel(papel: Papel, vars: Record<string, unknown> = {}): Promise<void> {
        const id = this.idDoPapel(papel);
        return id ? this.runProtocol(id, vars) : Promise.resolve();
    }

    /** O nome de um protocolo como o JSON dele diz (o emoji e o nome, `name`); `null` = não carregado. */
    nomeDoProtocolo(id: string): string | null {
        const nome = (this.plugin as any).manager?.get?.(id)?.name;
        return typeof nome === 'string' && nome.trim() ? nome.trim() : null;
    }

    /**
     * Abre uma tarefa na janela de edição do TaskNotes (a interface dela).
     * Com Cmd/Ctrl, ou se o TaskNotes não reconhecer o arquivo, abre a nota.
     */
    async openTask(path: string, event?: MouseEvent | KeyboardEvent): Promise<void> {
        const mod = !!event && ((event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey);
        const tn: any = (this.app as any).plugins?.plugins?.tasknotes;
        if (!mod && tn && typeof tn.openTaskEditModal === 'function') {
            try {
                const info = await (tn.cacheManager?.getTaskInfo?.(path) ?? tn.cacheManager?.getCachedTaskInfo?.(path));
                if (info) {
                    await tn.openTaskEditModal(info, () => this.store.scheduleRefresh());
                    return;
                }
            } catch (error) {
                console.error('DFM: TaskNotes não abriu a tarefa; abrindo a nota', error);
            }
        }
        await this.app.workspace.openLinkText(path, '', 'tab');
    }

    /** Abre o que o widget/painel apontou: tarefa na janela do TaskNotes; o resto como nota. */
    openAny(path: string, event: MouseEvent | undefined, sourcePath = '', newLeaf: boolean | PaneType = 'tab'): void {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile && this.tasks.read(file)) {
            void this.openTask(path, event);
            return;
        }
        void this.app.workspace.openLinkText(path, sourcePath, newLeaf);
    }

    /** Seletor com busca, devolvendo `null` se o operador fechar sem escolher. */
    pick<T>(items: T[], label: (item: T) => string, placeholder: string): Promise<T | null> {
        return pick(this.plugin.app, items, label, placeholder);
    }

    /**
     * O que o agente do sistema lê de um nó pela borda (02/11/2026, `dfm_node`): os campos e as ligações da
     * nota pelo cache de metadados e o lido dos protocolos, as mesmas leituras do painel do nó. Só lê.
     */
    leitorDoAgente() {
        const app = this.plugin.app;
        return {
            leitor: {
                camposDaNota: (path: string) => {
                    const file = app.vault.getAbstractFileByPath(path);
                    return (file instanceof TFile && app.metadataCache.getFileCache(file)?.frontmatter) || null;
                },
                ligacoesDaNota: (path: string) => ligacoesNoCache(app, path),
            },
            protocolos: (caminho: string, hoje: string) => protocolosNoCofre(app, caminho, hoje),
        };
    }

    constructor(private readonly plugin: DFMPlugin) {
        // O quadro relê só com o que importa: as mesmas casas da Missão (`caminhoImporta`).
        this.store = new BoardStore(plugin, (caminho, evento) => caminhoImporta(evento, caminho, this.missao.casasSincronas()));
        this.tasks = new TaskIndex(plugin.app);
        this.protocolTools = new ProtocolTools(plugin, this);
        this.missao = new MissaoService({
            app: plugin.app,
            // O relógio do lugar (o dia local), o mesmo que a Missão montada recebe.
            hoje: hojeLocal,
            tarefas: () => this.tasks.all(),
            canvasDoProjeto: p => this.projectCanvas?.canvasPathFor(p) ?? null,
            parDaSemana: semana => plugin.nucleo?.parDaSemana(semana) ?? Promise.resolve(null),
            pastaDaCaixa: () => definicoesDe(plugin).pastas.inbox,
            // A nota da reserva, das definições (A6): vazia, o dinheiro da Missão fica sem a reserva.
            notaDaReserva: () => definicoesDe(plugin).arquivos.reserva,
            pastasDasTarefas: () => {
                const tn = (plugin.app as any).plugins?.plugins?.tasknotes?.settings;
                return tn ? [tn.tasksFolder, tn.archiveFolder].filter((f: unknown) => typeof f === 'string' && f) : null;
            },
            pastaDosProtocolos: () => definicoesDe(plugin).pastas.protocolos,
            lerArquivo: path => plugin.app.vault.adapter.read(path),
            tabelaDosPapeis: () => plugin.manager?.tabelaDosPapeis?.(),
            registrarEvento: ref => plugin.registerEvent(ref),
            // Os pesos da tabela única, pelo mesmo caminho do cartão de tarefa (`TaskCards.refreshReasons`).
            // As propostas do agente esperam no grupo delas da triagem (a fila já lida).
            propostas: () => this.propostas?.itens() ?? [],
            // A trilha de uso (05/11/2026): o arquivo dos textos, as chaves e as marcas do salvamento.
            trilha: () => this.trilhaParaOLeitor(),
            pesos: async hoje => {
                const tree: any = (plugin as any).nowTree;
                if (!tree?.loadWeights || !tree?.taskUnits || !tree?.decisionContext) return null;
                const { table } = await tree.loadWeights();
                const units = tree.taskUnits();
                const ctx = await tree.decisionContext(units, { hoje });
                const live = units.filter((unit: any) => !String(unit.path).startsWith('TaskNotes/Archive/'));
                return scoresByPath(live, ctx, table, buildTaskRelations(units));
            },
        });
        this.desfazer = new PilhaDoDesfazer({ avisar: avisoComDesfazer });
        this.gravacoes = new GravacoesDaMissao(this.depsDaGravacao(), this.desfazer);
        this.triagem = new GravacoesDaTriagem(this.depsDaTriagem(), this.desfazer);
        this.novo = new GravacoesDoNovo(this.depsDoNovo(), this.desfazer);
        const adapter = () => plugin.app.vault.adapter;
        this.propostas = new FilaDePropostas({
            ler: async () => (await adapter().exists(ARQUIVO_DAS_PROPOSTAS) ? adapter().read(ARQUIVO_DAS_PROPOSTAS) : null),
            gravar: texto => adapter().write(ARQUIVO_DAS_PROPOSTAS, texto),
            modelo: () => this.missao.modelo(),
            mover: (caminho, destino, avisar) => this.gravacoes.mover(caminho, destino, avisar),
            criar: (valores, smart, avisar) => this.novo.tarefa(valores, smart, avisar),
            // A linha aceita (05/11, a Day ou a Week): a nota pelo cofre; o texto novo vem de `acrescentarNaSecao`.
            lerNota: async caminho => { const f = plugin.app.vault.getAbstractFileByPath(caminho); return f instanceof TFile ? plugin.app.vault.read(f) : null; },
            gravarNota: async (caminho, texto) => {
                const f = plugin.app.vault.getAbstractFileByPath(caminho);
                if (!(f instanceof TFile)) throw new Error(`a nota ${caminho} não está no cofre`);
                await plugin.app.vault.modify(f, texto);
            },
            registrarDesfazer: (rotulo, desfazer, avisar) => this.desfazer.registrar({ rotulo, desfazer }, avisar),
            aoMudar: () => this.missao.agendar(),
            agora: () => new Date().toISOString(),
        });
    }

    /**
     * Os efeitos do Novo: a criação pela API do TaskNotes (com o `type`), o formulário nativo
     * dele, a SMART como ponta de seta, o `updateTaskWith` e a lixeira do sistema (o Desfazer).
     */
    private depsDoNovo(): DepsDoNovo {
        const app = this.plugin.app;
        const file = (path: string) => { const f = app.vault.getAbstractFileByPath(path); return f instanceof TFile ? f : null; };
        return {
            criarTarefa: pedido => createTaskViaApi(app, pedido, { source: 'dfm-missao-novo' }),
            abrirFormulario: fm => openTaskForm(app, prefillFromFrontmatter(fm)),
            carimbo: () => carimboDoMomento(new Date()),
            // A regra D1 (02/11) no "Abrir no TaskNotes" (06/11): a tarefa que herdou a semana sai da entrada.
            aoGanharLugar: status => statusAoGanharLugar(this.missao.estadosDaTarefa(), status),
            tarefa: path => this.linkTaskAt(path),
            atualizarTarefa: (path, fn) => this.updateTaskWith(path, fn),
            lerTexto: async path => { const f = file(path); return f ? app.vault.read(f) : null; },
            lixeira: async path => { const f = file(path); if (!f) return false; await app.vault.trash(f, true); return true; },
            // A nota simples do Novo (30/10, `via: nota`): o frontmatter do pedido, o nome repetido com sufixo.
            // Com o molde (02/11, a nota de função), o corpo do molde com as fichas do protocolo (`renderTemplateTokens`).
            criarNota: async (pasta, nome, fm, molde) => {
                let texto = `---\n${stringifyYaml(fm)}---\n`;
                if (molde) {
                    const f = file(molde.caminho);
                    if (!f) throw new Error(`o molde ${molde.caminho} não está no cofre`);
                    const m = (window as any).moment;
                    const hoje = () => m();
                    const clock: TokenClock = { context: m(), planWeek: () => planWeekStart(m()), targetWeek: () => planWeekStart(m()), targetQuarter: hoje, now: hoje, weekStartOf: () => planWeekStart(m()) };
                    texto = notaDoMolde(renderTemplateTokens(await app.vault.read(f), molde.variaveis, clock), fm, o => stringifyYaml(o));
                }
                if (!app.vault.getAbstractFileByPath(pasta)) await app.vault.createFolder(pasta);
                let caminho = `${pasta}/${nome}.md`;
                for (let n = 2; app.vault.getAbstractFileByPath(caminho); n++) caminho = `${pasta}/${nome} ${n}.md`;
                const criada = await app.vault.create(caminho, texto);
                return criada.path;
            },
            refrescar: () => this.store.scheduleRefresh(),
        };
    }

    /** Os passos de um protocolo como o JSON dele declara (o Novo pré-responde por eles); `null` = não carregado. */
    passosDoProtocolo(id: string): PassoDoProtocolo[] | null {
        const steps = (this.plugin as any).manager?.get?.(id)?.def?.steps;
        return Array.isArray(steps) ? steps.filter((s: any) => s && typeof s.id === 'string') : null;
    }

    /** Os efeitos das gravações da triagem: o `renameFile` (que reescreve os links), o `updateNoteWith` e o protocolo. */
    private depsDaTriagem(): DepsDaTriagem {
        const app = this.plugin.app;
        const file = (path: string) => { const f = app.vault.getAbstractFileByPath(path); return f instanceof TFile ? f : null; };
        return {
            existe: path => !!file(path),
            garantirPasta: pasta => ensureFolder(app, pasta),
            moverArquivo: async (de, para) => {
                const f = file(de);
                if (!f) throw new Error(`a nota ${de} não está mais no cofre`);
                await app.fileManager.renameFile(f, para);
                return f.path;
            },
            atualizarNota: (path, fn) => this.updateNoteWith(path, fn),
            frontmatter: path => this.fmAt(path),
            frontmatterDoDisco: async path => {
                const f = file(path);
                if (!f) return null;
                const info = getFrontMatterInfo(await app.vault.read(f));
                try { return info.exists ? (parseYaml(info.frontmatter) ?? {}) : {}; } catch { return this.fmAt(path); }
            },
            rodarProtocolo: (id, vars) => this.runProtocol(id, vars),
            idDoPapel: papel => this.idDoPapel(papel),
            abrirNota: async path => { await app.workspace.openLinkText(path, '', 'tab'); },
            lerTexto: async path => { const f = file(path); return f ? app.vault.read(f) : ''; },
            refrescar: () => this.store.scheduleRefresh(),
            hoje: () => (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10),
            carimbo: () => carimboDoMomento(new Date()),
        };
    }

    /** O frontmatter de uma nota pelo caminho (o cache), ou `null`. */
    private fmAt(path: string): Record<string, any> | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter ?? null : null;
    }

    /** A TaskNote como ponta de seta (o mesmo do contexto das setas, `EdgeLinkWatcher.depsFor`). */
    private linkTaskAt(path: string): LinkTask | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const task = this.tasks.read(file);
        if (!task) return null;
        const fm = this.fmAt(path) ?? {};
        return { path: task.path, basename: task.basename, type: task.type, projects: task.projects, week: fm.week, impacto: fm.impacto };
    }

    /**
     * O que faz: o complemento do aviso quando uma tarefa chega a um dia que passa do Bloco Sagrado da semana dele
     * (" · o dia passa de 2 h (2,5 h agendadas)", `dayOverText`, a mesma conta da carga que a Missão pinta), com a
     * tarefa já no dia (o índice pode não ter visto a gravação); dentro do bloco, ou sem bloco legível, `''`.
     * Por quê: o inventário da aposentadoria (fase 2, item 3, 02/11): a seta dia → ação do canvas avisava, e os gestos
     * da Missão (o arrasto, o Ligar, o "Mover para…") não; os dois leem daqui, uma leitura só da Week e da conta.
     */
    avisoDeCargaNoDia(data: string, caminho: string): string {
        const file = this.app.vault.getAbstractFileByPath(caminho);
        const moved = file instanceof TFile ? this.tasks.read(file) : null;
        return dayOverText(data, this.tasks.all(), this.periodNotes?.weekNoteField(isoWeekOf(data), 'bloco_sagrado'), moved ?? undefined);
    }

    /** Os efeitos das gravações da Missão: só os caminhos do quadro (`updateTaskWith`, `setStatus`…). */
    private depsDaGravacao(): DepsDaGravacao {
        const smarts = () => this.tasks.all().filter(t => t.type === 'tarefa_smart');
        const tn = () => (this.app as any).plugins?.plugins?.tasknotes?.settings ?? null;
        const localizar = (path: string): string | null => {
            if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) return path;
            // A concluída vai para o arquivo do TaskNotes: o mesmo nome, outra pasta.
            const name = path.slice(path.lastIndexOf('/') + 1);
            for (const pasta of [String(tn()?.archiveFolder ?? 'TaskNotes/Archive'), String(tn()?.tasksFolder ?? 'TaskNotes/Tasks')]) {
                const moved = normalizePath(`${pasta}/${name}`);
                if (this.app.vault.getAbstractFileByPath(moved) instanceof TFile) return moved;
            }
            const base = name.replace(/\.md$/, '');
            return this.tasks.all().find(t => t.basename === base)?.path ?? null;
        };
        return {
            atualizarTarefa: (path, fn) => this.updateTaskWith(path, fn),
            atualizarNota: (path, fn) => this.updateNoteWith(path, fn),
            status: (path, status) => this.setStatus(path, status),
            concluir: path => this.completeTask(path),
            reabrir: (path, status) => this.reopenTask(path, status),
            frontmatter: path => this.fmAt(path),
            localizar,
            // O Arquivar do menu de status (02/11): o gesto do TaskNotes (`api.tasks.archive`: a tag e a pasta).
            arquivar: async (path, sim) => {
                const api = this.taskNotesApi();
                if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) return null;
                if (typeof api?.tasks?.archive === 'function') {
                    try {
                        const t = await api.tasks.archive(path, sim);
                        await this.store.refreshNow();
                        const depois = typeof t?.path === 'string' && this.app.vault.getAbstractFileByPath(t.path) instanceof TFile ? t.path : localizar(path);
                        return depois;
                    } catch (error) {
                        console.error(`DFM: o TaskNotes não arquivou ${path}`, error);
                        return null;
                    }
                }
                // Sem o TaskNotes: as duas coisas que ele faz (a tag do arquivo e a pasta), como diz a convenção.
                return this.arquivarSemTaskNotes(path, sim);
            },
            // O Excluir do menu de status (02/11): a lixeira do Obsidian, nunca apagar de vez.
            lixeira: path => this.mandarParaALixeira(path),
            restaurar: (naLixeira, para) => this.trazerDaLixeira(naLixeira, para),
            // O dia que passa do bloco, no aviso do gesto que põe a tarefa nele (02/11).
            cargaDoDia: (path, data) => this.avisoDeCargaNoDia(data, path),
            tarefa: path => this.linkTaskAt(path),
            contexto: () => {
                const all = smarts();
                const keys = new Set(all.map(t => foldName(t.basename)));
                return {
                    isSmartName: (name: string) => keys.has(foldName(name)),
                    smartPorNome: (name: string) => {
                        const t = all.find(x => foldName(x.basename) === foldName(name));
                        return t ? this.linkTaskAt(t.path) : null;
                    },
                    // A tarefa da entrada que ganha um dia ou uma semana sai da entrada (D1, 02/11), pela tabela do modelo.
                    aoGanharLugar: (status: string) => statusAoGanharLugar(this.missao.estadosDaTarefa(), status),
                };
            },
            // O porquê dos pesos vai junto, como no 🤝 do cartão do canvas (`TaskCards.doNowFrom`).
            fazerAgora: (path, motivos) => {
                const file = this.app.vault.getAbstractFileByPath(path);
                const task = file instanceof TFile ? this.tasks.read(file) : null;
                if (task) void this.runPapel(DO_NOW_PAPEL, doNowVariables(task, motivos));
            },
            refrescar: () => this.store.scheduleRefresh(),
            statusFechado: status => {
                const catalog: any[] = Array.isArray(tn()?.customStatuses) ? tn().customStatuses : [];
                const entry = catalog.find(c => c?.value === status);
                return entry ? !!entry.isCompleted : status === 'done' || status === 'cancelled';
            },
            // A checklist da nota (29/10): o texto de agora entra e o novo sai, numa gravação só.
            processarTexto: async (path, fn) => {
                const f = this.app.vault.getAbstractFileByPath(path);
                if (!(f instanceof TFile)) return false;
                let mudou = false;
                await this.app.vault.process(f, texto => {
                    const novo = fn(texto);
                    if (novo === null || novo === texto) return texto;
                    mudou = true;
                    return novo;
                });
                return mudou;
            },
        };
    }

    register(): void {
        const plugin = this.plugin;
        plugin.register(() => this.store.destroy());
        this.missao.registrar();
        plugin.register(() => this.missao.destruir());
        // A fila das propostas do agente, lida uma vez: com alguma, a Missão passa à versão que a mostra.
        void this.propostas.listar().then(lista => { if (lista.length) this.missao.agendar(); }).catch(e => console.error('DFM: a fila das propostas não se leu', e));
        this.tasks.attach(ref => plugin.registerEvent(ref));
        plugin.registerHoverLinkSource(BOARD_HOVER_SOURCE, { display: 'DFM Mission Control', defaultMod: true });

        plugin.registerMarkdownCodeBlockProcessor(BOARD_BLOCK, (source, el, ctx) => {
            const parsed = parseWidgetSpec(source);
            const root = el.createDiv();
            if ('error' in parsed) {
                renderBoardError(root, parsed.error);
                return;
            }
            // O atalho da Missão (item 8): no canvas de projeto, o zoom no projeto; no de um período, o período
            // (`atalhoDaMissao`); abre pela mesma `openMissao` das portas, sem assinar nada.
            if (parsed.spec.kind === 'missao') { renderMissaoAtalho(root, parsed.spec, this.atalhoDoLugar(parsed.spec, ctx.sourcePath), this); return; }
            const actions = this.actions(ctx.sourcePath, root);
            if (parsed.spec.kind === 'consulta') ctx.addChild(new QueryWidgetChild(root, parsed.spec, this, ctx.sourcePath, actions));
            else ctx.addChild(new BoardWidgetChild(root, parsed.spec, this.store, actions));
        });

        plugin.registerView(VIEW_TYPE_DFM_BOARD_PANEL, leaf => new BoardPanelView(leaf, plugin, this));
        plugin.registerView(VIEW_TYPE_DFM_MISSAO, leaf => new MissaoView(leaf, plugin, this));
        const canvasMenus = new BoardCanvasMenus(plugin, this);
        canvasMenus.register();
        const taskMenus = new TaskMenus(plugin, this);
        taskMenus.register();
        this.taskCards = new TaskCards(plugin, this, taskMenus);
        new CanvasToolbar(plugin, this, canvasMenus, taskMenus).register();

        plugin.addCommand({
            id: 'dfm-board-panel',
            name: 'Mission Control: abrir painel',
            callback: () => void this.openPanel(),
        });

        plugin.addCommand({
            id: 'dfm-abrir-missao',
            name: 'DFM: Abrir a Missão',
            callback: () => void this.openMissao(),
        });

        // As portas (02/11, itens 26 e 27): da Week ou da nota do trimestre aberta, a Missão naquele período;
        // os modelos novos têm o botão (`command:dfm-system:dfm-abrir-missao-no-periodo`).
        plugin.addCommand({
            id: 'dfm-abrir-missao-no-periodo',
            name: PORTAS.comando,
            checkCallback: (checking: boolean) => {
                const porta = portaDoPeriodo(this.app.workspace.getActiveFile?.()?.basename);
                if (!porta) return false;
                if (!checking) void this.abrirMissaoNoPeriodo(porta);
                return true;
            },
        });
        // O fim do 🌳 e do 🧭: o aviso leva à Missão no período planejado (o canvas da semana e o do trimestre, que
        // nasciam aqui, se aposentaram em 02/11/2026).
        plugin.registerEvent((this.app.workspace as any).on('dfm:protocol-complete', (fim: any) => {
            if (!this.ehDoPapel(fim?.id, ['planejar_semana', 'planejar_proxima_semana', 'planejar_trimestre'])) return;
            const porta = portaDoPeriodo(fim?.file?.basename) ?? portaDoPeriodo(plannedWeekOf(fim?.file?.path ? this.app.metadataCache.getFileCache(fim.file)?.frontmatter ?? {} : {}, fim?.variables));
            if (!porta) return;
            const aviso = document.createDocumentFragment();
            aviso.append(PORTAS.fim(porta.foco));
            const link = aviso.createEl('a', { text: PORTAS.abrir, href: '#' });
            link.addEventListener('click', e => { e.preventDefault(); void this.abrirMissaoNoPeriodo(porta); });
            new Notice(aviso, 12000);
        }));

        // `dfm-board-open` (o quadro em canvas) é uma porta aposentada desde 02/11/2026: abre o painel
        // (ui/portasAposentadas.ts, registrada pelo main.ts).

        plugin.addCommand({
            id: 'dfm-board-add-widget',
            name: 'Mission Control: adicionar widget ao canvas',
            checkCallback: (checking: boolean) => {
                if (!activeCanvas(plugin.app)) return false;
                if (!checking) void this.addWidget(activeCanvas(plugin.app));
                return true;
            },
        });

        plugin.addCommand({
            id: 'dfm-board-refresh',
            name: 'Mission Control: reler dados dos widgets',
            callback: () => void this.store.refreshNow(),
        });
    }

    private actions(sourcePath: string, hoverParent: HTMLElement): BoardActions {
        const app = this.plugin.app;
        const inCanvas = sourcePath.endsWith('.canvas');
        return {
            open: (path, event) => {
                // Tarefa abre a janela do TaskNotes; nota comum, em aba (no canvas,
                // abrir no mesmo painel tiraria o quadro da frente).
                this.openAny(path, event, sourcePath, Keymap.isModEvent(event) || (inCanvas ? 'tab' : false));
            },
            hover: (path, event, target) => {
                app.workspace.trigger('hover-link', {
                    event, source: BOARD_HOVER_SOURCE, hoverParent, targetEl: target, linktext: path, sourcePath,
                });
            },
            complete: path => this.completeTask(path),
            habit: (path, date) => this.toggleHabit(path, date),
            reviewHabit: (path, event) => this.reviewHabit(path, event),
            // O widget `projeto` conta como o trimestre e a zona do projeto (`projectProgress`).
            project: name => this.projectCanvas?.factsFor(name) ?? null,
            protocols: this.protocolTools.actions(),
            scope: sourcePath || 'nota',
        };
    }

    /**
     * Grava campos do TaskNotes na tarefa (`scheduled`, `week`, `status`…).
     * `null` apaga o campo. Status `done` e `cancelled` não passam por aqui —
     * use `completeTask` e `setStatus` (`statusWriter` em `taskCompletion.ts`).
     */
    async updateTask(path: string, patch: Record<string, unknown>): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        await this.app.fileManager.processFrontMatter(file, frontmatter => {
            for (const [key, value] of Object.entries(patch)) {
                if (value === null || value === undefined) delete frontmatter[key];
                else frontmatter[key] = value;
            }
            frontmatter.dateModified = new Date().toISOString();
        });
        this.store.scheduleRefresh();
        return true;
    }

    /**
     * Grava na tarefa o patch que `fn` calcula sobre o frontmatter atual (`null`
     * no patch apaga o campo) e marca `dateModified`. É o caminho das setas do
     * canvas e do "Ligar a uma SMART…": a regra (`edgeLinks.patchFor`) decide
     * sobre o frontmatter do momento da gravação, não sobre uma leitura velha.
     * `fn` devolvendo `null` (nada a mudar) não grava. `before` traz os valores
     * anteriores das chaves mudadas (`undefined` = não existia), para desfazer.
     */
    async updateTaskWith(path: string, fn: (fm: Record<string, any>) => Record<string, unknown> | null): Promise<{ changed: boolean; before: Record<string, unknown> }> {
        const before: Record<string, unknown> = {};
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return { changed: false, before };
        // Prévia sobre o cache: sem nada a mudar, o arquivo nem é aberto.
        const cached = JSON.parse(JSON.stringify(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}));
        if (!fn(cached)) return { changed: false, before };
        let changed = false;
        await this.app.fileManager.processFrontMatter(file, frontmatter => {
            const patch = fn(frontmatter);
            if (!patch || Object.keys(patch).length === 0) return;
            for (const [key, value] of Object.entries(patch)) {
                before[key] = frontmatter[key] === undefined ? undefined : JSON.parse(JSON.stringify(frontmatter[key]));
                if (value === null || value === undefined) delete frontmatter[key];
                else frontmatter[key] = value;
            }
            frontmatter.dateModified = new Date().toISOString();
            changed = true;
        });
        if (changed) this.store.scheduleRefresh();
        return { changed, before };
    }

    /**
     * O irmão de `updateTaskWith` para a nota que não é TaskNote (arquitetura da página
     * Missão, §4.4): o patch que `fn` calcula sobre o frontmatter do momento, sem
     * `dateModified` (que é do TaskNotes). `null` no patch apaga o campo; `fn` devolvendo
     * `null` não grava. `before` traz os valores anteriores, para desfazer.
     */
    async updateNoteWith(path: string, fn: (fm: Record<string, any>) => Record<string, unknown> | null): Promise<{ changed: boolean; before: Record<string, unknown> }> {
        const before: Record<string, unknown> = {};
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension !== 'md') return { changed: false, before };
        const cached = JSON.parse(JSON.stringify(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}));
        if (!fn(cached)) return { changed: false, before };
        let changed = false;
        await this.app.fileManager.processFrontMatter(file, frontmatter => {
            const patch = fn(frontmatter);
            if (!patch || Object.keys(patch).length === 0) return;
            for (const [key, value] of Object.entries(patch)) {
                before[key] = frontmatter[key] === undefined ? undefined : JSON.parse(JSON.stringify(frontmatter[key]));
                if (value === null || value === undefined) delete frontmatter[key];
                else frontmatter[key] = value;
            }
            changed = true;
        });
        if (changed) this.store.scheduleRefresh();
        return { changed, before };
    }

    /**
     * O arquivo do TaskNotes sem a API dele (o Obsidian com o TaskNotes desligado): a tag do arquivo
     * (`fieldMapping.archiveTag`) e a pasta (`archiveFolder` ao arquivar, `tasksFolder` ao tirar), as duas
     * coisas que ele faz (convenções, "Arquivada"). Devolve o caminho de depois, ou `null`.
     */
    private async arquivarSemTaskNotes(path: string, sim: boolean): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const s = (this.app as any).plugins?.plugins?.tasknotes?.settings ?? null;
        const tag = String(s?.fieldMapping?.archiveTag ?? 'archived');
        await this.app.fileManager.processFrontMatter(file, fm => {
            const tags = (Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []).map((x: unknown) => String(x));
            const sem = tags.filter((x: string) => x.replace(/^#/, '') !== tag);
            fm.tags = sim ? [...sem, tag] : sem;
            fm.dateModified = new Date().toISOString();
        });
        const pasta = String((sim ? s?.archiveFolder : s?.tasksFolder) ?? (sim ? 'TaskNotes/Archive' : 'TaskNotes/Tasks'));
        const destino = normalizePath(`${pasta}/${file.name}`);
        if (destino !== file.path && !this.app.vault.getAbstractFileByPath(destino)) {
            if (!this.app.vault.getAbstractFileByPath(pasta)) await this.app.vault.createFolder(pasta);
            await this.app.fileManager.renameFile(file, destino);
        }
        new Notice(sim ? 'TaskNotes indisponível: arquivada pela tag e pela pasta' : 'TaskNotes indisponível: tirada do arquivo pela tag e pela pasta');
        await this.store.refreshNow();
        return file.path;
    }

    /**
     * Manda a nota para a lixeira pela escolha do Obsidian (`fileManager.trashFile`: a do sistema ou a
     * `.trash` do cofre). A escolha "apagar de vez" vira a `.trash` do cofre: daqui nada se apaga sem volta.
     * Devolve onde ela ficou na `.trash` (o que entrou nela agora), ou `naLixeira: null` na do sistema.
     */
    async mandarParaALixeira(path: string): Promise<{ naLixeira: string | null } | null> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        const adapter = this.app.vault.adapter;
        const nome = file.name;
        const naTrash = async () => ((await adapter.exists('.trash')) ? (await adapter.list('.trash')).files : []);
        const antes = new Set(await naTrash());
        try {
            if ((this.app.vault as any).getConfig?.('trashOption') === 'none') await this.app.vault.trash(file, false);
            else await this.app.fileManager.trashFile(file);
        } catch (error) {
            console.error(`DFM: ${path} não foi para a lixeira`, error);
            return null;
        }
        const novos = (await naTrash()).filter(f => !antes.has(f));
        const achada = novos.find(f => f.slice(f.lastIndexOf('/') + 1) === nome) ?? novos.find(f => f.endsWith('.md')) ?? null;
        this.store.scheduleRefresh();
        return { naLixeira: achada };
    }

    /** Traz a nota da `.trash` do cofre de volta ao caminho de antes (o Desfazer do Excluir), sem sobrescrever nada. */
    async trazerDaLixeira(naLixeira: string, para: string): Promise<'ok' | 'ocupado' | 'sumiu'> {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(naLixeira))) return 'sumiu';
        if (this.app.vault.getAbstractFileByPath(para) || (await adapter.exists(para))) return 'ocupado';
        const pasta = para.includes('/') ? para.slice(0, para.lastIndexOf('/')) : '';
        if (pasta && !(await adapter.exists(pasta))) await adapter.mkdir(pasta);
        await adapter.rename(naLixeira, para);
        this.store.scheduleRefresh();
        return 'ok';
    }

    /** A TaskNote está no arquivo do TaskNotes (a tag ou a pasta, `isArchivedTask`)? */
    tarefaArquivada(path: string): boolean {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        return isArchivedTask({ path, tags: this.tasks.read(file)?.tags });
    }

    /** A API de runtime do TaskNotes (`apiVersion`, `tasks.complete`, `tasks.setStatus`), se carregada. */
    private taskNotesApi(): any | null {
        return (this.app as any).plugins?.plugins?.tasknotes?.api ?? null;
    }

    /** Pede ao TaskNotes; `false` (com log) se ele recusar, para cair no caminho do frontmatter. */
    private async viaTaskNotes(path: string, run: () => Promise<unknown>): Promise<boolean> {
        try {
            await run();
            return true;
        } catch (error) {
            console.error(`DFM: o TaskNotes não trocou o status de ${path}; gravando direto`, error);
            return false;
        }
    }

    /** O caminho sem TaskNotes: `status` (+ data de conclusão, se `done`) direto no frontmatter. */
    private async writeStatus(file: TFile, status: string, completedOn?: string): Promise<void> {
        const date = completedOn || today();
        await this.app.fileManager.processFrontMatter(file, frontmatter => {
            frontmatter.status = status;
            if (status === 'done') frontmatter.completedDate = date;
            frontmatter.dateModified = new Date().toISOString();
        });
    }

    /**
     * Troca o status da tarefa. `done` vai para `completeTask`; `cancelled`
     * passa pela API do TaskNotes (arquiva e emite o evento), conforme
     * `completionRoute`; os demais gravam o campo que o TaskNotes usa.
     */
    async setStatus(path: string, status: string): Promise<boolean> {
        if (status === 'done') return this.completeTask(path);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const api = this.taskNotesApi();
        const route = completionRoute({ status, recurrence: fm.recurrence, apiVersion: api?.apiVersion });
        const done = route.via === 'api-status' && await this.viaTaskNotes(path, () => api.tasks.setStatus(path, status));
        if (!done) {
            const notice = route.via === 'frontmatter' ? route.notice : withoutArchiveNotice(status);
            if (notice) new Notice(notice);
            await this.writeStatus(file, status);
        }
        await this.store.refreshNow();
        return true;
    }

    /**
     * Conclui pela API do TaskNotes (`api.tasks.complete`): ele grava `status`
     * e a data, arquiva (`done` tem `autoArchive`) e emite `task.completed`.
     * Passa `{ status: 'done' }` porque, sem ele, o TaskNotes devolve intacta a
     * tarefa que já tem um status concluído (`cancelled` conta como concluído).
     * Recorrente abre a nota; sem a API, grava o frontmatter e avisa.
     *
     * É A CONCLUSÃO ÚNICA (arquitetura 4.6): o painel, o cartão do canvas, os menus e a
     * barra de seleção concluem por aqui. Antes de concluir, pergunta "Quando terminou?"
     * (Agora já marcado · Mais cedo hoje · Ontem · Outro dia); fechar sem escolher não
     * conclui. `options.when` já respondido (a barra de seleção pergunta uma vez para
     * todas) não pergunta de novo. A resposta segue para o observador do `task.completed`,
     * que grava a linha no dia dito e a hora real na reputação contextual.
     */
    async completeTask(path: string, options: { when?: CompletionWhen | null } = {}): Promise<boolean> {
        const app = this.plugin.app;
        const file = app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice('Tarefa não encontrada.');
            return false;
        }
        const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const api = this.taskNotesApi();
        const route = completionRoute({ status: 'done', recurrence: fm.recurrence, apiVersion: api?.apiVersion });
        if (route.via === 'open-note') {
            new Notice(route.notice);
            void app.workspace.openLinkText(path, '', 'tab');
            return false;
        }
        const when = options.when ?? await askCompletionWhen(app, file.basename, await (this.plugin as any).nowTree?.probableFor?.(path));
        if (!when) return false;
        // O aviso (com a oferta do 📤) sai daqui: o observador do `task.completed` não repete.
        markCompletionNoticed(path);
        markCompletionAnswer(path, when);
        const done = route.via === 'api-complete' && await this.viaTaskNotes(path, () => api.tasks.complete(path, { status: 'done' }));
        if (!done) {
            const notice = route.via === 'frontmatter' ? route.notice : withoutArchiveNotice('done');
            if (notice) new Notice(notice);
            await this.writeStatus(file, 'done', when.date);
            // Sem o TaskNotes não há `task.completed`: o registro do dia dito sai daqui.
            const answer = takeCompletionAnswer(path);
            if (answer) await this.plugin.metadataWatcher?.recordCompletion(file.basename, file.path, answer);
        }
        this.completedNotice(file.basename, fm.peca);
        await this.store.refreshNow();
        return true;
    }

    /**
     * "Concluída: X". Na peça 📤 (`peca: soltar`), o aviso traz o atalho
     * "📤 Registrar onde saiu", que abre o Bloco de Criação com a etapa 📤
     * Publicar já respondida (`releaseOffer`). Só oferece; ignorar não muda nada.
     */
    completedNotice(name: string, peca: unknown): void {
        const offer = releaseOffer(peca);
        // Sem protocolo para o papel da oferta, a conclusão avisa como as outras (D1 do mapa da v0).
        const registro = offer ? this.idDoPapel(offer.papel) : null;
        if (!offer || !registro) { new Notice(`Concluída: ${name}`); return; }
        const fragment = document.createDocumentFragment();
        fragment.append(`Concluída: ${name} · `);
        const link = fragment.createEl('a', { text: offer.label, href: '#' });
        const notice = new Notice(fragment, 15000);
        link.addEventListener('click', event => {
            event.preventDefault();
            notice.hide();
            // A peça vai junto: o "No ar" da Week conta a soltura uma vez, com o link.
            this.runProtocol(registro, { peca_tarefa: name });
        });
    }

    /**
     * Reabre uma tarefa concluída pela API do TaskNotes (`reopenRoute`): o
     * status volta (`api.tasks.uncomplete`) e, se ela estava arquivada, sai de
     * `TaskNotes/Archive/` (`api.tasks.archive(path, false)`). Sem a API, grava
     * o status e avisa se ela continua no arquivo.
     */
    async reopenTask(path: string, status = 'next-action'): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        const record = this.tasks.read(file);
        const api = this.taskNotesApi();
        const route = reopenRoute({ archived: isArchivedTask({ path, tags: record?.tags }), apiVersion: api?.apiVersion });
        const done = route.via === 'api' && await this.viaTaskNotes(path, async () => {
            const task = await api.tasks.uncomplete(path, { status });
            if (route.unarchive) await api.tasks.archive(task?.path ?? path, false);
        });
        if (!done) {
            const notice = route.via === 'frontmatter' ? route.notice : (isArchivedTask({ path, tags: record?.tags }) ? 'TaskNotes não tirou a tarefa do arquivo: reaberta em TaskNotes/Archive' : null);
            if (notice) new Notice(notice);
            await this.writeStatus(file, status);
        }
        await this.store.refreshNow();
        return true;
    }

    /** O painel: o mesmo quadro, lido como colunas. Reaproveita a aba se já aberta. */
    async openPanel(): Promise<void> {
        const { workspace } = this.plugin.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DFM_BOARD_PANEL)[0];
        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_DFM_BOARD_PANEL, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    /**
     * Abre a Missão na aba própria (reaproveita a aba se já aberta). Com um estado (o
     * "⤢ Abrir em outra aba" da página), a aba abre no mesmo período e no mesmo nó.
     */
    async openMissao(estado?: EstadoDaMissao): Promise<void> {
        const { workspace } = this.plugin.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DFM_MISSAO)[0];
        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_DFM_MISSAO, active: true, state: estado ? { missao: estado } : {} });
        } else if (estado) {
            await leaf.setViewState({ type: VIEW_TYPE_DFM_MISSAO, active: true, state: { missao: estado } });
        }
        workspace.revealLeaf(leaf);
    }

    /**
     * O que faz: o atalho da Missão do bloco `tipo: missao` pelo lugar dele: o projeto do canvas de projeto e o
     * nome do arquivo (o canvas ou a nota de um período), lidos aqui; a decisão é do `atalhoDaMissao`.
     */
    atalhoDoLugar(spec: BoardWidgetSpec, caminho: string): AtalhoDaMissao {
        const nome = caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.(canvas|md)$/, '');
        const projeto = caminho.endsWith('.canvas') ? this.projectCanvas?.projectForCanvas(caminho)?.name ?? null : null;
        return atalhoDaMissao(spec, { projeto, nome });
    }

    /** O que faz: abre o atalho da Missão: o estado dele pela `openMissao` das portas; sem estado, a Missão como estava. */
    abrirMissao(atalho: AtalhoDaMissao): void {
        void this.openMissao(atalho.estado ?? undefined);
    }

    /**
     * O que faz: abre a Missão no período de uma porta (02/11): a escala dele, a linha dele em foco e o nó
     * dele escolhido; a pinça no nó entra no ramo, onde se planeja.
     */
    async abrirMissaoNoPeriodo(porta: PortaDoPeriodo): Promise<void> {
        await this.openMissao({ escala: porta.escala, foco: porta.foco, selecionado: porta.selecionado, abrirTudo: false, aberto: null, onde: null });
    }

    /**
     * O que faz: monta a Missão num contêiner qualquer (o mesmo adaptador da página e da aba).
     * Por quê: a medida fora da tela (larguras de 375, 820 e 1440 px, sem abrir janela nem aba)
     * e, no P14, o módulo do canvas. Quem monta desmonta (`destruir`).
     * Inspeção: `app.plugins.plugins['dfm-system'].board.montarMissaoEm(div, { lugar: 'aba' })`.
     */
    montarMissaoEm(container: HTMLElement, opcoes: OpcoesDoLugar): MissaoNoLugar {
        return montarNoLugar(this, this.plugin.app, container, opcoes);
    }

    /**
     * Pergunta o widget e cria o nó. Sem `pos`, no centro da tela; com `pos`
     * (clique-direito na área vazia), com o canto superior esquerdo ali.
     */
    async addWidget(canvas: any, pos: { x: number; y: number } | null = null): Promise<void> {
        if (!canvas) return;
        const entry = await this.pick<BoardCatalogEntry>([...BOARD_CATALOG], e => `${e.label} — ${e.description}`, 'Qual widget?');
        if (entry) await this.addWidgetKind(canvas, entry, pos);
    }

    /** Um widget de tipo já escolhido; pergunta só o que o tipo exige (recorte, projeto). */
    async addWidgetKind(canvas: any, entry: BoardCatalogEntry, pos: { x: number; y: number } | null = null): Promise<void> {
        if (!canvas) return;
        const spec: Partial<BoardWidgetSpec> & { kind: BoardCatalogEntry['kind'] } = { kind: entry.kind };
        if (entry.kind === 'tarefas') {
            const filter = await this.pick([...TASK_FILTERS], f => f.label, 'Qual recorte?');
            if (!filter) return;
            spec.filtro = filter.id as BoardTaskFilter;
        }
        if (entry.kind === 'projeto') {
            if (!this.store.current()) await this.store.refreshNow();
            const snapshot = this.store.current();
            const name = await this.pick(snapshot ? projectNames(snapshot) : [], n => n, 'Qual projeto?');
            if (!name) return;
            spec.projeto = name;
        }

        const { width, height } = entry.size;
        const center = viewportCenter(canvas);
        this.createWidgetNode(canvas, spec, pos ?? { x: Math.round(center.x - width / 2), y: Math.round(center.y - height / 2) });
    }

    /**
     * O bloco ```dfm-habits``` das notas (diária, semana) desenhado pelo mesmo
     * widget de hábitos do Mission Control: uma implementação só, viva, que marca.
     */
    mountHabitsBlock(el: HTMLElement, ctx: MarkdownPostProcessorContext, days: number | null): void {
        const root = el.createDiv();
        const spec: BoardWidgetSpec = { kind: 'habitos', limite: 30, titulo: 'Hábitos', ...(days ? { dias: Math.max(7, Math.min(24, days)) } : {}) };
        ctx.addChild(new BoardWidgetChild(root, spec, this.store, this.actions(ctx.sourcePath, root)));
        this.store.warm();
    }

    /**
     * Um dia de hábito, pelo caminho canônico do tracker (`engine/habits.ts`):
     * `resolveClick` decide e `HabitLog.alternarDia` grava (o dia e a linha da marca na Day, 06/11).
     * Guiado de hoje abre o protocolo; futuro e automático só avisam.
     */
    async toggleHabit(path: string, date: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            new Notice(`Nota do hábito não encontrada: ${path}`);
            return;
        }
        // Relê no clique: Pomodoro, protocolo ou sync podem ter marcado o mesmo dia.
        const habit = parseHabit(path, this.app.metadataCache.getFileCache(file)?.frontmatter ?? null);
        const decision = resolveClick(habit, date, today());
        if (decision.action === 'blocked') {
            new Notice(decision.reason);
            await this.store.refreshNow();
            return;
        }
        if (decision.action === 'protocol') {
            (this.app as any).commands?.executeCommandById?.(`dfm-system:dfm-${decision.protocolId}`);
            return;
        }
        // A porta única dos hábitos (06/11): o dia em `entries` e a linha da marca na Day.
        await this.plugin.habitLog.alternarDia(path, date);
        // A pontuação do hábito manual (`scoreHabit`, razão `settings.habitLedger`) saiu em
        // 29/10/2026, com o arquivamento da gamificação: marcar e desmarcar só mudam o dia.
        await this.store.refreshNow();
    }

    /** O frontmatter do disco (e não do cache, que chega depois do `processFrontMatter`). */
    private async fmDoDisco(path: string): Promise<Record<string, any> | null> {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return null;
        const info = getFrontMatterInfo(await this.app.vault.read(f));
        try { return info.exists ? (parseYaml(info.frontmatter) ?? {}) : {}; } catch { return this.fmAt(path); }
    }

    /**
     * O que faz: o +1 de um hábito na Missão: marca o dia pelo caminho de sempre (`toggleHabit`:
     * o dia futuro e o automático recusam; o do protocolo abre o protocolo) e registra o Desfazer
     * na pilha única, que só tira a marca se ela ainda está lá. O dia já marcado não se desmarca
     * por aqui (o botão é +1, não alternância).
     * Entra → sai: a nota do hábito, o dia e o aviso → o resultado (ok só quando a marca entrou).
     */
    async marcarHabito(path: string, date: string, avisar: Avisar): Promise<ResultadoDaGravacao> {
        const ler = async () => { const fm = await this.fmDoDisco(path); return fm ? parseHabit(path, fm) : null; };
        const antes = await ler();
        if (!antes) return { ok: false, texto: `Nota do hábito não encontrada: ${path}` };
        const titulo = antes.title || path.split('/').pop()!.replace(/\.md$/, '');
        if (antes.entries.includes(date)) { avisar(`${titulo}: já tem marca neste dia`); return { ok: false, texto: 'já marcado' }; }
        await this.toggleHabit(path, date);
        const depois = await ler();
        // O protocolo aberto, o dia recusado (ou uma gravação que não chegou ao disco): nada a desfazer.
        if (!depois?.entries.includes(date)) return { ok: false, texto: 'não marcado' };
        this.desfazer.registrar({
            rotulo: `+1 · ${titulo}`,
            desfazer: async () => {
                const agora = await ler();
                if (!agora?.entries.includes(date)) return { feito: false, texto: `A marca de ${titulo} já não está lá` };
                await this.toggleHabit(path, date);
                return { feito: true, texto: `Desfeito: +1 · ${titulo}` };
            },
        }, avisar);
        return { ok: true, texto: `+1 · ${titulo}` };
    }

    /* ------------------------------------------------------------ a trilha de uso (05/11/2026) */

    /** Os dias de uso de cada gesto e o índice da última Missão desenhada (o critério `uso` da árvore lê daqui). */
    private ultimaTrilha: { usos: Readonly<Record<string, number>>; deAntes: ReadonlySet<string> } | null = null;

    /** O que faz: o estado da trilha no salvamento do plugin (`trilhaUso`), lido e limpo. */
    private estadoDaTrilha(): EstadoDaTrilha {
        return estadoDaTrilha((this.plugin.settings as any).trilhaUso);
    }

    /** O que faz: grava o estado da trilha no salvamento e, se pedido, a Missão relê (as marcas entram no uso). */
    private async gravarTrilha(estado: EstadoDaTrilha, reler: boolean): Promise<void> {
        (this.plugin.settings as any).trilhaUso = estado;
        await this.plugin.saveSettings();
        if (reler) this.missao.agendar();
    }

    /**
     * O que faz: o que o leitor da Missão lê da trilha: o arquivo dos textos e as chaves, das definições, e as
     * marcas do salvamento; sem o arquivo nas definições, nada (a trilha não aparece).
     */
    trilhaParaOLeitor(): { caminho: string; chaves: TrilhaDefinida; marcas: Record<string, string[]> } | null {
        const d = definicoesDe(this.plugin);
        return d.arquivos.trilha ? { caminho: d.arquivos.trilha, chaves: d.trilha, marcas: this.estadoDaTrilha().marcas } : null;
    }

    /**
     * O que faz: marca um gesto da trilha num dia (o que não deixa outro rastro: mover a que ficou de antes,
     * pôr numa SMART, capturar, decidir na triagem); o mesmo dia de novo não grava.
     * Erro e ataque: a falha ao gravar só vai ao console (a gravação do gesto já aconteceu).
     */
    marcarUso(gesto: string | null, dia: string = today()): void {
        if (!gesto) return;
        const novo = comMarca(this.estadoDaTrilha(), gesto, dia);
        if (novo) void this.gravarTrilha(novo, true).catch(e => console.error('DFM trilha: a marca não gravou', e));
    }

    /** O que faz: a TaskNote ficou de antes, na última Missão desenhada (a marca do "mover a que ficou para trás"). */
    tarefaDeAntes(caminho: string): boolean {
        return !!this.ultimaTrilha?.deAntes.has(caminho);
    }

    /** O que faz: os dias de uso de um gesto na última Missão desenhada; `null` antes dela (o critério `uso` espera). */
    usoDoGesto(gesto: string): number | null {
        const n = this.ultimaTrilha?.usos[gesto];
        return typeof n === 'number' ? n : null;
    }

    /** O que faz: as dicas da primeira vez já vistas (o salvamento). */
    dicasVistas(): string[] {
        return this.estadoDaTrilha().vistas;
    }

    /** O que faz: guarda a dica como vista (ela não volta na próxima abertura); a já vista não grava. */
    verDica(id: string): void {
        const e = this.estadoDaTrilha();
        if (!/^[a-z0-9_]+$/.test(id) || e.vistas.includes(id)) return;
        void this.gravarTrilha({ ...e, vistas: [...e.vistas, id] }, false).catch(err => console.error('DFM trilha: a dica não gravou', err));
    }

    /**
     * O que faz: depois de cada modelo da Missão: guarda os usos (o critério `uso` da árvore os lê) e, quando o
     * gesto da vez muda, guarda o novo e reavalia as árvores: a árvore "Hábito de uso do sistema" desbloqueia o
     * nível seguinte e propõe a tarefa dele na triagem (nada se cria sem o Y dele).
     */
    conferirTrilha(modelo: MissaoModelo): void {
        const t = modelo.trilha;
        this.ultimaTrilha = { usos: t?.usos ?? {}, deAntes: new Set(modelo.indice.vivas.filter(x => x.deAntes).map(x => x.caminho)) };
        const g = t?.gesto;
        const id = !g ? '' : 'gesto' in g ? g.gesto.id : 'fim';
        const e = this.estadoDaTrilha();
        if (!id || id === e.gesto) return;
        void this.gravarTrilha({ ...e, gesto: id }, false)
            .then(() => (this.plugin as any).progressionEngine?.reevaluateAll?.(this.plugin.settings.arvoreProgressao))
            .catch(err => console.error('DFM trilha: a árvore de uso não se reavaliou', err));
    }

    /**
     * O que faz: "Registrar o que fiz" (página Missão, §8.7): a TaskNote nasce pela API do
     * TaskNotes (com `type: task` e `origem: registrar_feito`, sem `scheduled` e sem `week`,
     * mesmo ligada a uma SMART) e conclui pela conclusão única (`completeTask` com `{ when }`):
     * a linha no dia dito, ou na Week sem criar a Day, e a hora real na reputação contextual.
     * Os minutos vão com o onde para o registro dos blocos, nunca para a estimativa.
     * Por quê: a função única do registro do dia (o "＋ O que fiz" da Missão e a pergunta do 🌙).
     * Sem Desfazer: a conclusão pontua, escreve na Day ou na Week e entra no registro dos blocos.
     */
    registrarFeito(registro: RegistroDoFeito): Promise<ResultadoDoRegistro> {
        const app = this.plugin.app;
        const m = (window as any).moment?.();
        return registrarOFeito({
            criar: pedido => createTaskViaApi(app, pedido, { source: 'dfm-registrar-feito' }),
            concluir: (path, when) => this.completeTask(path, { when }),
        }, registro, today(), m ? m.format('HH:mm') : null).then(r => { this.store.scheduleRefresh(); return r; });
    }

    /** A espera da nota nova do "＋ Adicionar": o fim do protocolo dono que ela aguarda (uma por vez). */
    private esperaDaNota: any = null;

    /**
     * O que faz: a nota nova pelo protocolo dono (o "Criar nova" do "＋ Adicionar" de um campo da
     * Missão, página Missão §8.9): roda o protocolo com as variáveis dadas (o nome já respondido, as
     * datas da rodada) e, quando ele termina (`dfm:protocol-complete` do mesmo protocolo e, com o
     * passo, o mesmo nome respondido), entrega a nota criada a quem pediu, que a liga ao campo pela
     * gravação de sempre, com o Desfazer (a nota nova é do protocolo e fica).
     * Erro e ataque: a rodada cancelada não entrega nada, e o pedido seguinte troca o que esperava;
     * o fim de outra rodada do mesmo protocolo, com outro nome, não conta.
     */
    notaNova(pedido: PedidoDaNotaNova, criada: (nota: { nome: string; caminho: string | null }) => void): void {
        const ws: any = this.app.workspace;
        if (this.esperaDaNota) ws.offref(this.esperaDaNota);
        const ref = ws.on('dfm:protocol-complete', (fim: any) => {
            if (fim?.id !== pedido.protocolo) return;
            if (pedido.passo && String(fim?.variables?.[pedido.passo] ?? '').trim() !== pedido.nome) return;
            ws.offref(ref);
            if (this.esperaDaNota === ref) this.esperaDaNota = null;
            criada({ nome: String(fim?.file?.basename ?? pedido.nome), caminho: typeof fim?.file?.path === 'string' ? fim.file.path : null });
        });
        this.esperaDaNota = ref;
        this.plugin.registerEvent(ref);
        void this.runProtocol(pedido.protocolo, pedido.variaveis);
    }

    /** O que faz: a 💡 Captura da Missão: a mesma função da Captura rápida do Mission Control (`capturarNaCaixa`). */
    capturar(texto: string): Promise<ResultadoDaCaptura> {
        return capturarNaCaixa(this.app.vault, definicoesDe(this.plugin).pastas.inbox, texto, (window as any).moment?.().format('YYYY-MM-DD') ?? '');
    }

    /**
     * O que faz: cria a nota ou o canvas que um nó da Missão ainda não tem, pelos comandos de
     * sempre: o canvas do projeto pelo `projectCanvasManager.openOrCreate` e a Day pelo
     * `createDailyNote` do plugin (o Periodic Notes). O canvas da semana e o do trimestre não nascem
     * mais (aposentados em 02/11/2026): a Missão é a tela deles.
     * Entra → sai: o id do nó e o que criar → o resultado, com o aviso em palavras.
     */
    async criarDoNo(id: string, que: 'nota' | 'canvas'): Promise<ResultadoDaGravacao> {
        const k = id.slice(2);
        if (que === 'canvas' && id.startsWith('p:')) {
            const pc = this.projectCanvas;
            const p = pc ? (await pc.projects()).find(x => idDoProjeto(x.name) === id) : null;
            if (!pc || !p) return { ok: false, texto: 'O projeto não está no portfólio' };
            return (await pc.openOrCreate(p)) ? { ok: true, texto: `Canvas de ${p.name} aberto` } : { ok: false, texto: 'O canvas não foi criado' };
        }
        if (que === 'nota' && id.startsWith('d:')) {
            const f = await (this.plugin as any).createDailyNote?.(k);
            if (!(f instanceof TFile)) return { ok: false, texto: 'A Day não foi criada' };
            await this.app.workspace.getLeaf('tab').openFile(f);
            return { ok: true, texto: `Day de ${k} criada` };
        }
        return { ok: false, texto: 'Aqui não há o que criar' };
    }

    /**
     * A revisão que o próprio hábito marcou em `revisar_em`. Nada muda sem o
     * clique: continuar em treino (nova data), integrado ou pausado.
     */
    reviewHabit(path: string, event: MouseEvent): void {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const habit = parseHabit(path, fm);
        const day = today();
        const apply = async (choice: HabitReviewChoice, label: string) => {
            const patch = reviewPatch(choice, day);
            await this.app.fileManager.processFrontMatter(file, front => {
                front.status = patch.status;
                if (patch.revisar_em) front.revisar_em = patch.revisar_em;
            });
            new Notice(`${habit.title}: ${label}`);
            await this.store.refreshNow();
        };
        const menu = new Menu();
        menu.addItem(i => i.setTitle(`Revisão de ${habit.title}${habit.reviewOn ? ` (marcada para ${habit.reviewOn})` : ''}`).setIcon('alarm-clock').setDisabled(true));
        for (const semanas of [2, 4]) {
            const date = reviewPatch({ kind: 'continuar', semanas }, day).revisar_em!;
            menu.addItem(i => i.setTitle(`Continuar em treino — revisar em ${semanas} semanas (${date})`).setIcon('repeat')
                .onClick(() => void apply({ kind: 'continuar', semanas }, `em treino, revisar em ${date}`)));
        }
        menu.addItem(i => i.setTitle('Integrado — já faz parte do dia; sai do tracker').setIcon('check-check')
            .onClick(() => void apply({ kind: 'integrado' }, 'integrado')));
        menu.addItem(i => i.setTitle('Pausar — sai do tracker, fica no vault').setIcon('pause')
            .onClick(() => void apply({ kind: 'pausado' }, 'pausado')));
        menu.addSeparator();
        menu.addItem(i => i.setTitle('Abrir a nota do hábito').setIcon('file-text')
            .onClick(() => void this.app.workspace.openLinkText(path, '', 'tab')));
        menu.showAtMouseEvent(event);
    }

    /**
     * Traz uma TaskNote que já existe para o canvas, como nó de arquivo (o cartão
     * de tarefa se monta nele). Se ela já está no canvas, a vista vai até ela.
     */
    async insertTask(canvas: any, pos: { x: number; y: number } | null = null): Promise<void> {
        if (typeof canvas?.createFileNode !== 'function') return;
        const onCanvas = new Set<string>(Array.from<any>(canvas.nodes?.values?.() ?? []).map(n => n?.file?.path).filter(Boolean));
        const open = this.tasks.all()
            .filter(t => !['done', 'cancelled'].includes(t.status))
            .sort((a, b) => Number(onCanvas.has(a.path)) - Number(onCanvas.has(b.path)) || a.basename.localeCompare(b.basename));
        const label = (t: TaskRecord) => {
            const where = t.projects[0] ? ` · ${t.projects[0]}` : '';
            const kind = t.type === 'tarefa_smart' ? 'SMART · ' : '';
            return `${onCanvas.has(t.path) ? '(já no canvas) ' : ''}${kind}${t.basename}${where}`;
        };
        const task = await this.pick(open, label, 'Qual tarefa trazer para o canvas?');
        if (!task) return;
        const existing = Array.from<any>(canvas.nodes?.values?.() ?? []).find(n => n?.file?.path === task.path);
        if (existing) {
            canvas.selectOnly?.(existing);
            canvas.zoomToSelection?.();
            return;
        }
        const file = this.app.vault.getAbstractFileByPath(task.path);
        if (!(file instanceof TFile)) return;
        const size = task.type === 'tarefa_smart' ? { width: 400, height: 180 } : { width: 400, height: 150 };
        const center = viewportCenter(canvas);
        const at = pos ?? { x: Math.round(center.x - size.width / 2), y: Math.round(center.y - size.height / 2) };
        canvas.createFileNode({ file, pos: at, size, save: true, focus: false });
        canvas.requestSave?.();
    }

    /** Cria o nó de texto com o bloco do widget, no tamanho do catálogo. */
    createWidgetNode(canvas: any, spec: Partial<BoardWidgetSpec> & { kind: BoardCatalogEntry['kind'] }, pos: { x: number; y: number }, size?: { width: number; height: number }): void {
        if (typeof canvas?.createTextNode !== 'function') return;
        const { width, height } = size ?? BOARD_CATALOG.find(e => e.kind === spec.kind)!.size;
        canvas.createTextNode({
            pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
            size: { width, height },
            text: widgetBlock(spec),
            focus: false,
        });
        canvas.requestSave?.();
    }
}
