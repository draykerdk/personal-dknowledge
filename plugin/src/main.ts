import { Plugin, Notice, Menu, MarkdownView, MarkdownRenderChild, TFile } from 'obsidian';
import { DFMPluginSettings, DEFAULT_SETTINGS } from './settings';
import { DFMSettingTab } from './ui/settingsTab';
import { DFMRecentFilesView, VIEW_TYPE_DFM_RECENT } from './ui/views/recentFilesView';
import { MODULOS_OPCIONAIS } from './modulosOpcionais';
import { lerDefinicoes, type Definicoes } from './definicoes';
import { ProtocolSelectorModal } from './ui/suggesters';
import { DFMOrganizer } from './organizer';
import { ProtocolManager } from './engine/jsonProtocol';
import { NowTreeService } from './engine/nowTreeService';
import { NucleoService } from './engine/nucleoService';
import { RouteLogService } from './engine/routeLog';
import { DiaryService } from './engine/diaryService';
import { askCompletionWhen, askNightCompletions } from './ui/completionModals';
import { HabitLog } from './engine/habitLog';
import { ContextBridge } from './engine/contextBridge';
import { MetadataWatcher } from './engine/metadataWatcher';
import { CanvasEngine } from './engine/canvasengine/canvasEngine';
import { runFractalContextForActiveCanvas } from './engine/canvasengine/canvasFractal';
import { canGoBack, navigateFractalBack, navigateFractalUp } from './engine/canvasengine/canvasFractalNavigation';
import { ProgressionEngine } from './engine/progressionEngine';
import { InputModal } from './ui/modals';
import { NovaArvoreModal } from './ui/arvoreModals';
import { buildGrid, parseHabit, resolveClick, formatarDiaIngles, calcHabitMetrics, calcGridStats } from './engine/habits';
import { DshOperatorBridge } from './engine/dshOperatorBridge';
import { MissionControl } from './engine/missionControl';
import { MissionBoard } from './board/boardPlugin';
import { ProjectCanvasManager } from './project/projectCanvasManager';
import { abrirTriagemDaMissao } from './ui/abrirTriagem';
import { PORTAS_APOSENTADAS, comandoDaPorta, periodoDaPorta } from './ui/portasAposentadas';
import { PeriodNotes } from './temporal/periodNotes';
import { VIEW_TYPE_DFM_MISSAO } from './missao/hosts/aba';
import { EdgeLinkWatcher } from './canvas/edgeLinkWatcher';
import { PeriodNoteRepairWatcher } from './temporal/periodNoteRepairWatcher';
import { renderDayNote } from './temporal/periodNoteRepair';
import { applyDfmAction, parseDfmBlock, DfmBlockAction } from './engine/dfmBlocks';
import { DIA } from './engine/dia';
import { gravacaoVista, minutosDoAvisoDeSync } from './engine/avisoDeSync';
import { semanaNoTexto, trimestreNoTexto } from './engine/periodo';

/** A chave, no armazenamento local do aparelho, da última gravação da Day de hoje que ele viu (o aviso de sync). */
const CHAVE_DA_GRAVACAO_DA_DAY = 'dfm-gravacao-da-day';

export function parseDfmButtonId(raw: string): string {
    const token = raw.trim();
    if (token.startsWith('command:')) return token;
    const colonIndex = token.indexOf(':');
    return (colonIndex > -1 ? token.substring(colonIndex + 1) : token).trim();
}

export { parseDfmBlock };
export type DfmBlockButton = DfmBlockAction;

export default class DFMPlugin extends Plugin {
    settings!: DFMPluginSettings;
    /**
     * O registro dos hábitos que o DFM marca sozinho (protocolo, Pomodoro, Comando do Dia,
     * bloco do agora, 📖 Pelo diário). Saiu do gerente da gamificação quando ela foi
     * arquivada, em 29/10/2026 (`ARQUIVO_GAMIFICACAO.md`).
     */
    habitLog!: HabitLog;
    metadataWatcher!: MetadataWatcher;
    manager!: ProtocolManager;
    /**
     * A árvore do agora e o bloco aberto (a tabela de pesos, o registro da reputação
     * contextual e o pomodoro do TaskNotes). Os scripts da pauta usam a mesma ordem
     * por `app.plugins.plugins['dfm-system'].nowTree.rankPages(...)`.
     */
    nowTree!: NowTreeService;
    /**
     * O núcleo (escolher, o registro com tipo e a contagem por tipo; arquitetura do
     * núcleo de 21/10). As vistas em dataviewjs usam a mesma escolha do passo `rankWith`
     * por `app.plugins.plugins['dfm-system'].nucleo.escolher('<domínio>', páginas)`.
     */
    nucleo!: NucleoService;
    /**
     * O registro das rotas do 🧭 Router Central (Fase D, plano de 22/10, seção 5): a
     * situação do primeiro menu e o protocolo aberto, em `Reputação contextual/Rotas AAAA-MM.md`.
     */
    rotas!: RouteLogService;
    /**
     * A leitura do diário (2.28 e 2.29, 22/10/2026): o "📖 Pelo diário" do 🌙 e o diário
     * escrito como fechamento do dia. Só leitura, para conferir:
     * `app.plugins.plugins['dfm-system'].diario.tomorrowFrom('AAAA-MM-DD')` e `.reading(dia)`.
     */
    diario!: DiaryService;
    organizer!: DFMOrganizer;
    canvasEngine!: CanvasEngine;
    progressionEngine!: ProgressionEngine;
    lastDshContextPath: string | null = null;
    contextBridge!: ContextBridge;
    dshOperatorBridge!: DshOperatorBridge;
    /**
     * Motor do Mission Control. Vive no plugin, e não na view, porque duas
     * superfícies leem o mesmo estado: o console visual e o agente DSH. Uma
     * instância só garante que ponte e painel nunca digam números diferentes.
     */
    private missionControl: MissionControl | null = null;
    board!: MissionBoard;
    /** Observador das setas desenhadas nos canvas geridos. */
    edgeLinks!: EdgeLinkWatcher;
    /**
     * A nota de semana ou de trimestre criada crua pelo Calendar ou pelo Periodic Notes,
     * preenchida pelo modelo, e o comando "Preencher os marcadores crus desta nota".
     * Conferir: `app.plugins.plugins['dfm-system'].periodNotes.preview('2026-W45')`.
     */
    periodNotes!: PeriodNoteRepairWatcher;
    private isSavingSettings = false;
    private hasPendingSettingsSave = false;
    private lastArvoreAutoReevalDate: string | null = null;

    async onload() {
        console.log('Carregando DFM System 2.9.0...');

        // Register Views
        // As duas vistas antigas (o DFM Control Center e o Mission Control dos painéis antigos) saíram em
        // 03/11/2026 com o código aposentado: as portas delas abrem a Missão ou o painel
        // (ui/portasAposentadas.ts).
        this.registerView(
            VIEW_TYPE_DFM_RECENT,
            (leaf) => new DFMRecentFilesView(leaf, this)
        );

        // Add Ribbon Icon for Dashboard
        // A ribbon abre o painel (o hub), que abre na página Missão.
        this.addRibbonIcon('layout-dashboard', 'DFM Mission Control', () => {
            void this.board.openPanel();
        });

        // Os módulos opcionais (src/modulosOpcionais.ts) registram aqui as vistas, os ícones e os comandos
        // deles, logo depois do ícone do painel, onde o ícone do agente sempre ficou na fita.
        for (const modulo of MODULOS_OPCIONAIS) modulo.registrar?.(this);

        // Catálogo lateral do canvas — na lateral direita, ao lado do canvas.


        // Add Ribbon Icon for Quick TaskNote Creation (Ported from Bridge)
        this.addRibbonIcon('check-square', 'Criar Tarefa no Canvas ou Markdown (DFM)', (evt: MouseEvent) => {
            const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
            if (activeView && activeView.getViewType() === "canvas") {
                this.canvasEngine.createTaskNote(activeView);
            } else if (activeView && activeView.getViewType() === "markdown") {
                this.canvasEngine.createTaskNoteForMarkdown(activeView as MarkdownView);
            } else {
                new Notice("Abra um arquivo Canvas ou uma Nota Markdown primeiro para adicionar um TaskNote!");
            }
        });

        // Add Command for Quick TaskNote Creation (Ported from Bridge)
        this.addCommand({
            id: 'dfm-create-tasknote-canvas',
            name: 'Criar TaskNote no Canvas/Markdown atual',
            checkCallback: (checking: boolean) => {
                const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
                if (activeView && (activeView.getViewType() === "canvas" || activeView.getViewType() === "markdown")) {
                    if (!checking) {
                        if (activeView.getViewType() === "canvas") {
                            this.canvasEngine.createTaskNote(activeView);
                        } else {
                            this.canvasEngine.createTaskNoteForMarkdown(activeView as MarkdownView);
                        }
                    }
                    return true;
                }
                return false;
            }
        });

        await this.loadSettings();
        this.app.workspace.onLayoutReady(() => {
            // Aba do catálogo que ficou salva no layout: sai junto com a camada antiga.
            this.app.workspace.getLeavesOfType('dfm-canvas-rail-view').forEach(leaf => leaf.detach());
        });

        // A gamificação (pontos, C.A.O.S., nível, barra de status, Oráculo) foi arquivada
        // em 29/10/2026: não carrega mais. Os dados em `settings.gamification` ficam como
        // estão; o código está em `arquivo/gamificacao/` (`ARQUIVO_GAMIFICACAO.md`).
        this.habitLog = new HabitLog(this);

        this.manager = new ProtocolManager(this);
        this.nowTree = new NowTreeService(this);
        this.nucleo = new NucleoService(this);
        for (const modulo of MODULOS_OPCIONAIS) modulo.comONucleo?.(this);
        this.rotas = new RouteLogService(this.app);
        this.diario = new DiaryService(this);
        this.organizer = new DFMOrganizer(this);

        this.metadataWatcher = new MetadataWatcher(this);
        // "Quando terminou?" na conclusão pelo TaskNotes (checkbox, "Complete on", celular; 4.6).
        // Com o provável de onde foi e quanto levou, para a segunda linha da conclusão dita depois.
        this.metadataWatcher.askWhen = async (name, path) => askCompletionWhen(this.app, name, path ? await this.nowTree?.probableFor(path) : undefined);

        // Ponte "Nota Atual" -> DSH: grava sinal vivo (path/title/ts, nunca o corpo).
        // Coração de 4 min mantém o ts fresco enquanto a mesma nota fica em foco;
        // o controlador considera sinal obsoleto acima de 15 min.
        this.contextBridge = new ContextBridge(this);
        this.dshOperatorBridge = new DshOperatorBridge(this);
        this.register(() => { void this.dshOperatorBridge.stop(); });
        this.registerInterval(window.setInterval(
            () => void this.contextBridge.notifyCurrent(), 240_000
        ));

        // Register Metadata Watcher for Tasknotes
        this.metadataWatcher.register();

        // Register Canvas Engine
        this.canvasEngine = new CanvasEngine(this);
        this.canvasEngine.registerEvents();

        // O quadro: widgets como blocos ```dfm-widget``` que o próprio Obsidian
        // renderiza em nó de canvas ou nota. Posição, tamanho e grupo são do canvas.
        this.board = new MissionBoard(this);
        this.board.register();

        // A seta desenhada num canvas gerido grava o campo da tarefa (Fase 2 do plano do canvas).
        const edgeLinks: EdgeLinkWatcher = new EdgeLinkWatcher(EdgeLinkWatcher.depsFor(this, this.board, path => edgeLinks.scope(path)));
        edgeLinks.register(this);
        this.edgeLinks = edgeLinks;

        // Todo projeto tem um canvas, e o canvas gerencia as SMART e as ações do projeto.
        const projectCanvas = new ProjectCanvasManager(this, this.board, edgeLinks);
        projectCanvas.register();
        // As notas de período (a nota do trimestre, a da semana e a semana em foco), lidas pelo painel e
        // pelo cabeçalho do canvas de projeto.
        this.board.periodNotes = new PeriodNotes(this.app);
        // Os canvas da semana e do trimestre saíram em 03/11/2026 (aposentados em 02/11): a Missão na semana e no
        // trimestre é a tela deles, e as portas dos comandos abrem lá (ui/portasAposentadas.ts).
        this.board.projectCanvas = projectCanvas;

        // A Week/o trimestre que nasce como cópia crua do modelo (o mini calendário só
        // copia) é preenchida como se o DFM a tivesse criado (27/10/2026).
        this.periodNotes = new PeriodNoteRepairWatcher(this);
        this.periodNotes.register();

        // Register Progression Engine (Árvore de Progressão)
        this.progressionEngine = new ProgressionEngine(this);
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file instanceof TFile && file.path.startsWith('100 - AREAS')) {
                    this.progressionEngine.invalidateDiscoveryCache();
                }
            })
        );

        // As portas das ferramentas que a Missão já substitui (aposentadoria, fases 1 e 2, 02/11/2026):
        // ficam com o id (botões e atalhos valem) e abrem a Missão, o painel, ou a Missão na semana ou no
        // trimestre (da nota aberta, ou o de hoje), fora da paleta (ui/portasAposentadas.ts).
        const hoje = () => (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
        const noPeriodo = (escala: 'semana' | 'trimestre') => () =>
            this.board.abrirMissaoNoPeriodo(periodoDaPorta(escala, this.app.workspace.getActiveFile()?.basename, hoje()));
        const destinos = { missao: () => this.board.openMissao(), painel: () => this.board.openPanel(), semana: noPeriodo('semana'), trimestre: noPeriodo('trimestre') };
        for (const porta of PORTAS_APOSENTADAS) this.addCommand(comandoDaPorta(porta, destinos, m => new Notice(m, 6000)));

        // As SMART abertas de semanas passadas têm o grupo delas na triagem (02/11/2026), onde ele
        // dá a semana de cada uma: o comando só leva até lá, sem gravar nada (o rollover em lote,
        // sem Desfazer, se aposentou em 30/10/2026; o id fica pelos atalhos).
        this.addCommand({
            id: 'dfm-rollover-smart',
            name: '📥 SMART de semanas passadas: abrir a triagem',
            callback: () => {
                void abrirTriagemDaMissao(this.app, () => this.board.openMissao(), VIEW_TYPE_DFM_MISSAO)
                    .catch(e => new Notice(`Não abriu a triagem: ${(e as Error)?.message ?? e}`));
            }
        });

        this.addCommand({
            id: 'dfm-arvore-reavaliar-todas',
            name: '🌳 Reavaliar Todas as Árvores de Progressão',
            callback: async () => {
                await this.progressionEngine.reevaluateAll(this.settings.arvoreProgressao);
                new Notice('🌳 Árvores de Progressão reavaliadas.');
            }
        });

        this.addCommand({
            id: 'dfm-arvore-nova',
            name: '🌳 Nova Árvore de Progressão',
            callback: () => {
                new NovaArvoreModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'dfm-sync-tree-map',
            name: '🗺️ Sincronizar Mapa Geral (árvore DFM)',
            callback: () => void this.canvasEngine.generateDFMTreeCanvas(),
        });

        this.addCommand({
            id: 'dfm-sync-active-canvas-dependencies',
            name: '🔗 Sincronizar Dependências do Canvas Ativo',
            checkCallback: (checking: boolean) => {
                const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
                if (activeView && activeView.getViewType() === "canvas") {
                    if (!checking) {
                        this.canvasEngine.syncActiveCanvas(activeView);
                    }
                    return true;
                }
                return false;
            }
        });

        // O contexto fractal do canvas ativo: escreve/atualiza o cabeçalho de
        // escala (trilha `sistema → área → projeto` e as ligações de subir e
        // descer) e, depois, só os nós de contexto que faltam — nunca um segundo
        // cabeçalho. Quem decide é `canvasFractalContext.ts`; quem grava é
        // `canvasFractal.ts`, com o guarda de releitura antes de cada escrita.
        //
        // A frase que o operador lê é a do relatório (`report.message`), mostrada
        // pelo motor via `ports.notice` — um aviso só para todos os desfechos
        // (gravado, atualizado, inalterado, abortado, recusado), com o que ficou
        // de fora e o motivo. Não se avisa de novo aqui: dois avisos para o mesmo
        // fato é ruído.
        this.addCommand({
            id: 'dfm-canvas-contexto-fractal',
            name: '🧭 Gerar contexto fractal do canvas ativo',
            checkCallback: (checking: boolean) => {
                const activeView: any = this.app.workspace.activeLeaf?.view;
                if (activeView && activeView.getViewType?.() === 'canvas' && activeView.file) {
                    if (!checking) {
                        void runFractalContextForActiveCanvas(this.canvasEngine, activeView);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'dfm-canvas-fractal-back',
            name: '🧭 Retornar ao canvas anterior no histórico fractal',
            checkCallback: (checking: boolean) => {
                if (canGoBack()) {
                    if (!checking) {
                        void navigateFractalBack(this.app);
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'dfm-canvas-fractal-up',
            name: '🧭 Subir nível fractal (Canvas acima)',
            checkCallback: (checking: boolean) => {
                const activeView: any = this.app.workspace.activeLeaf?.view;
                if (activeView && activeView.getViewType?.() === 'canvas' && activeView.file) {
                    if (!checking) {
                        const snapshot = (this.getMissionControl?.() as any)?.peek?.() ?? null;
                        // O ramo da semana (do canvas da semana ao do trimestre, que o gerente criava) saiu com os
                        // canvas da semana e do trimestre (aposentadoria, fase 2, 02/11/2026): a pinça da Missão sobe.
                        void navigateFractalUp(this.app, activeView, snapshot).then(ok => {
                            if (!ok) new Notice('🧭 Você já está no topo fractal (Cockpit do Sistema)');
                        });
                    }
                    return true;
                }
                return false;
            }
        });

        // O menu do acervo no próprio canvas: o catálogo que hoje vive no painel
        // lateral e no clique-direito passa a existir dentro do desenho, como
        // bloco marcado (`dfm-canvas-menu`) — nó de título com a escala lida e a
        // conta do acervo, um nó por grupo e um nó por item com o id que o menu
        // executa. Idempotente: rodar de novo atualiza o bloco, nunca cria um
        // segundo. Quem monta é `canvasMenuCanvas.ts`; quem grava é
        // `canvasMenuWriter.ts`, com o guarda de releitura antes de cada escrita.
        // A frase que o operador lê é a do relatório, mostrada pelo motor via
        // `ports.notice` — um aviso só, como no comando fractal.
        // `dfm-sync-quarterly-canvas` é uma porta aposentada desde 02/11/2026: o mesmo id (o botão 🔄 da nota
        // do trimestre) abre o trimestre na Missão (ui/portasAposentadas.ts).

        this.addCommand({
            id: 'dfm-format-active-canvas-tasks',
            name: '✨ Formatar Tarefas do Canvas Ativo',
            checkCallback: (checking: boolean) => {
                const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
                if (activeView && activeView.getViewType() === "canvas") {
                    if (!checking) {
                        this.canvasEngine.formatActiveCanvasTasks(activeView);
                    }
                    return true;
                }
                return false;
            }
        });

        // O observador de checklist (TaskWatcher) só pontuava os itens `- [x]` de markdown
        // comum; foi arquivado com a gamificação em 29/10/2026, e com ele as escutas de
        // `editor-change` e `modify` que só o chamavam.
        // O movimento automático por tag (`organizer.organize(file)` no `modify`) está
        // DESLIGADO desde 19/07/2026. Motivos: (1) o gatilho é um salvamento, não uma
        // decisão; (2) 10 das 14 regras apontavam para "500 - RESOURCES/Knowledge/...",
        // árvore que não existe, e organize() cria a pasta ausente antes de mover — a
        // primeira nota marcada criaria uma árvore fantasma; (3) as regras estavam assim há
        // meses sem ninguém sentir falta, ou seja, ninguém depende disto. A classe
        // DFMOrganizer permanece para uso por comando explícito.

        this.registerEvent(this.app.workspace.on('file-open', async (file) => {
            if (file) {
                if (file.extension === 'md') {
                    this.lastDshContextPath = file.path;
                    void this.contextBridge.notify(file);
                }
                
                // Recent Files logic
                if (file.extension === 'md') {
                    // Prevent saving settings during initial layout restore phase
                    if (!this.app.workspace.layoutReady) return;
                    const max = this.settings.maxRecentFiles || 30;
                    let rf = this.settings.recentFiles || [];
                    rf = rf.filter(p => p !== file.path);
                    rf.unshift(file.path);
                    if (rf.length > max) rf = rf.slice(0, max);
                    this.settings.recentFiles = rf;
                    await this.saveSettings();

                    // Update view if open
                    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DFM_RECENT);
                    if (leaves.length > 0 && leaves[0].view instanceof DFMRecentFilesView) {
                        leaves[0].view.render();
                    }
                }
            }
        }));

        // Hook diário da Árvore de Progressão: fallback do gatilho por evento da Fase 1 —
        // pega critérios `contador`, que não disparam task-changed. Roda no máximo 1x/dia.
        this.registerEvent(this.app.workspace.on('file-open', async (file) => {
            if (!this.app.workspace.layoutReady) return;
            if (!file || file.extension !== 'md') return;
            if (!DIA.test(file.basename)) return;
            if (!file.path.startsWith('300 - RUNTIME/302 - Daymiss')) return;
            if (!this.settings.arvoreProgressao?.autoReavaliar) return;

            const today = (window as any).moment().format('YYYY-MM-DD');
            if (this.lastArvoreAutoReevalDate === today) return;
            this.lastArvoreAutoReevalDate = today;

            await this.progressionEngine.reevaluateAll(this.settings.arvoreProgressao);
        }));

        // `window.DFM` (a gamificação para o Dataview) e a barra de status (nível, pontos,
        // CAOS e ECH) saíram com o arquivamento da gamificação (29/10/2026).

        // manager and organizer already initialized above (before event handlers)

        // Add Settings Tab
        this.addSettingTab(new DFMSettingTab(this.app, this));

        // Wait for layout ready to ensure vault is loaded
        this.app.workspace.onLayoutReady(async () => {
            await this.manager.loadProtocols();
            this.registerCommandsAndRibbon();
            // O fim do pomodoro e o 🌙 fecham o bloco aberto pelo gesto. O TaskNotes pode
            // terminar de carregar depois, ou ser recarregado: a escuta do pomodoro tenta de
            // novo em 5 s e se religa a cada gesto (`attachPomodoro` confere a API de agora).
            this.nowTree.register();
            // A tela opcional do 🌙 (as concluídas do dia sem lugar e tempo; arquitetura 4.6).
            this.nowTree.nightScreen = items => askNightCompletions(this.app, items);
            window.setTimeout(() => this.nowTree.attachPomodoro(), 5000);
            // O diário escrito conta como fechamento (o "🌒 Fechar o dia"): lido na abertura
            // do plugin e na virada do dia (a cada 10 min confere se o dia mudou).
            const clockDay = () => (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
            void this.diario.checkClosings(clockDay());
            this.registerInterval(window.setInterval(() => void this.diario.checkClosings(clockDay()), 10 * 60 * 1000));

            // A ponte do agente só sobe quando está ligada nas definições (`ponte`).
            await this.aplicarPonte();

            // Check for recent modifications (Sync Conflict Warning)
            this.checkForRecentModifications();
            // A gravação da Day de hoje que este aparelho vê (a Missão, o motor, a edição daqui) fica registrada no
            // aparelho: o aviso de sync da próxima abertura não avisa dela (06/11, engine/avisoDeSync.ts).
            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (!(file instanceof TFile) || file.name !== `${(window as any).moment().format('YYYY-MM-DD')}.md`) return;
                try { this.app.saveLocalStorage(CHAVE_DA_GRAVACAO_DA_DAY, { caminho: file.path, mtime: file.stat.mtime }); } catch { /* sem o armazenamento, o aviso fica como era */ }
            }));
        });

        // Register Global Hotkey Command
        this.addCommand({
            id: 'open-dfm-menu',
            name: 'Abrir Menu de Protocolos',
            hotkeys: [{ modifiers: ["Mod"], key: "D" }],
            callback: () => {
                new ProtocolSelectorModal(this.app, this.manager).open();
            }
        });

        // `open-action-matrix` e `open-planning-timeline` (as vistas .base da Matriz DFM e da Linha do Tempo) são
        // portas aposentadas desde 02/11/2026: abrem a semana e o trimestre na Missão (ui/portasAposentadas.ts).

        // Register Recent Files Command
        this.addCommand({
            id: 'open-dfm-recent-files',
            name: 'Abrir Arquivos Recentes (DFM)',
            callback: () => {
                this.activateRecentFilesView();
            }
        });

        // "Definir Comando do Dia": o id fica (botões de Days antigas e atalhos o
        // chamam), mas abre o ▶️ Comando do Dia. O fluxo antigo de 4 perguntas
        // (valores C.A.O.S, macro foco, campos inline) foi retirado em 2026-10-16:
        // a Day do Q4 não tem campo inline e ele terminava sempre em aviso.
        // O ▶️ pelo papel `abrir_dia` (D1 do mapa da v0): sem protocolo para ele, o comando não aparece.
        this.addCommand({
            id: 'define-comando-dia',
            name: 'Definir Comando do Dia',
            checkCallback: (checking: boolean) => {
                const protocol = this.manager?.doPapel('abrir_dia');
                if (!protocol) return false;
                if (checking) return true;
                void Promise.resolve(protocol.run()).catch((error: unknown) => {
                    console.error('DFM: o ▶️ Comando do Dia falhou:', error);
                    new Notice('⚠️ O ▶️ Comando do Dia falhou ao iniciar.', 6000);
                });
                return true;
            }
        });
        // Register Command for Generating Strategic Canvas Manually
        this.addCommand({
            id: 'dfm-generate-strategic-canvas',
            name: 'Gerar Canvas Estratégico (Projeto/Departamento/Área Atual)',
            callback: () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const path = activeFile.path;
                    let type: 'project' | 'department' | 'area' | null = null;
                    if (path.includes('100 - PROJECTS')) type = 'project';
                    else if (path.includes('200 - DEPARTMENTS')) type = 'department';
                    else if (path.includes('000 - INDEX')) type = 'area';
                    
                    if (type) {
                        this.canvasEngine.generateStrategicCanvas(activeFile, type);
                    } else {
                        new Notice('O arquivo ativo não pertence a um Projeto, Departamento ou Índice de Área.');
                    }
                } else {
                    new Notice('Nenhum arquivo ativo.');
                }
            }
        });

        // Register Organizer Event (Removed duplicate 'modify' registration to prevent infinite loop)

        // Register Markdown Code Block for Buttons
        this.registerMarkdownCodeBlockProcessor("dfm", (source, el, ctx) => {
            // A notação do bloco tem **uma** casa: `engine/dfmBlocks.ts`. Este
            // processador usa o mesmo parser e a mesma decisão de destino que o
            // widget de canvas (`applyDfmAction`), então o mesmo botão faz a mesma
            // coisa na nota e dentro do canvas.
            //
            // O que fica aqui é só o que é **do editor de notas** e não tem
            // equivalente no canvas: trocar para o modo fonte e focar o editor antes
            // de disparar o comando, para o comando agir sobre o texto visível.
            const blocksData = parseDfmBlock(source);

            blocksData.forEach(params => {
                const btn = el.createEl("button", { text: params.button, cls: "mod-cta" });
                btn.style.width = blocksData.length > 1 ? `calc(${100/blocksData.length}% - 10px)` : "100%";
                btn.style.display = "inline-block";
                btn.style.marginBottom = "10px";
                btn.addEventListener("click", () => {
                    applyDfmAction(params, {
                        executeCommand: cmdId => {
                            const run = () => {
                                const success = (this.app as any).commands.executeCommandById(cmdId);
                                if (!success) {
                                    new Notice(`❌ Comando não encontrado ou falhou: ${cmdId}`);
                                }
                            };
                            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                            if (!activeView) {
                                run();
                                return;
                            }
                            if (activeView.getMode() === "preview") {
                                (activeView as any).setState({ mode: "source" }, { history: false });
                            }
                            setTimeout(() => {
                                if (activeView.editor) {
                                    activeView.editor.focus();
                                }
                                run();
                            }, 50);
                        },
                        runProtocol: (protocolId, vars) => {
                            const protocol = this.manager.get(protocolId);
                            if (!protocol) {
                                new Notice(`❌ Protocolo não encontrado: ${protocolId}`);
                                return;
                            }
                            // Botões de "Continuar Rascunho" carregam as respostas já dadas em
                            // `vars` (base64 de JSON — ver JSONProtocol.encodeVariablesForButton),
                            // para que o protocolo retome em vez de reiniciar do zero.
                            let initialVariables = {};
                            if (vars) {
                                try {
                                    initialVariables = JSON.parse(decodeURIComponent(escape(atob(vars))));
                                } catch (e) {
                                    console.error("DFM: Falha ao decodificar vars do botão:", e);
                                }
                            }
                            protocol.run(initialVariables);
                        },
                        notice: message => new Notice(message),
                    });
                });
            });
        });

        this.registerHabitsCodeBlock();
        this.registerHabitCycleSummaryCodeBlock();
    }

    /**
     * Bloco ```dfm-habits``` — tracker de hábitos nativo.
     *
     * Existe para o vault não depender de um patch à mão no bundle do
     * habit-tracker-21, que sumia a cada atualização do plugin. Config opcional
     * no corpo do bloco: `path:` (pasta dos hábitos) e `days:` (janela).
     *
     * Regras vindas de engine/habits.ts: contagem de execuções (nunca streak),
     * célula vazia não é falha e hábito guiado abre o protocolo só no dia de hoje.
     */
    /**
     * Bloco ```dfm-habits``` — tracker de hábitos nativo.
     *
     * Suporta matriz completa de 31 dias com rolagem horizontal alinhada a Hoje (7 dias padrão),
     * abreviação de dias em inglês (MON, TUE, etc.) e visualização de métricas por nota de hábito.
     */
    registerHabitsCodeBlock() {
        this.registerMarkdownCodeBlockProcessor("dfm-habits", async (source, el, ctx) => {
            const config: Record<string, string> = {};
            for (const linha of source.split("\n")) {
                const i = linha.indexOf(":");
                if (i > 0) {
                    config[linha.substring(0, i).trim()] = linha
                        .substring(i + 1).trim().replace(/^["']|["'],?$/g, "");
                }
            }
            const activeFilePath = ctx.sourcePath;
            const pasta = config.path || "200 - FUNCTIONS/Habits/Tracker";

            // A grade de todos os hábitos (diária, semana) é o widget do Mission
            // Control: marca hoje, lê a frequência e oferece a revisão vencida.
            // A visão de um hábito só (dentro da nota do próprio hábito) e pastas
            // fora do tracker canônico seguem no desenho antigo.
            const umHabito = config.file || activeFilePath.startsWith(`${pasta}/`);
            if (!umHabito && pasta === "200 - FUNCTIONS/Habits/Tracker" && this.board) {
                const dias = parseInt(config.days ?? config.dias ?? "", 10);
                this.board.mountHabitsBlock(el, ctx, Number.isFinite(dias) ? dias : null);
                return;
            }

            await this.renderHabitsView(el, config, activeFilePath);

            const refreshChild = new MarkdownRenderChild(el);
            ctx.addChild(refreshChild);
            refreshChild.registerEvent(this.app.metadataCache.on("changed", (file) => {
                if (file.path.startsWith(`${pasta}/`) || file.path === activeFilePath) {
                    this.renderHabitsView(el, config, activeFilePath);
                }
            }));
        });
    }

    /** Resumo compacto por ciclo, para Week e Quarter, sem converter ausência em falha. */
    registerHabitCycleSummaryCodeBlock() {
        this.registerMarkdownCodeBlockProcessor("dfm-habit-summary", async (source, el, ctx) => {
            const config: Record<string, string> = {};
            for (const line of source.split("\n")) {
                const separator = line.indexOf(":");
                if (separator <= 0) continue;
                config[line.substring(0, separator).trim()] = line.substring(separator + 1).trim();
            }

            await this.renderHabitCycleSummary(el, config.scope, ctx.sourcePath);
            const refreshChild = new MarkdownRenderChild(el);
            ctx.addChild(refreshChild);
            refreshChild.registerEvent(this.app.metadataCache.on("changed", (file) => {
                if (file.path.startsWith("200 - FUNCTIONS/Habits/Tracker/")) {
                    this.renderHabitCycleSummary(el, config.scope, ctx.sourcePath);
                }
            }));
        });
    }

    private async renderHabitCycleSummary(containerEl: HTMLElement, scope: string | undefined, sourcePath: string) {
        containerEl.empty();
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof TFile) || (scope !== "week" && scope !== "quarter")) {
            containerEl.createDiv({ text: "Resumo de hábitos: defina `scope: week` ou `scope: quarter`." });
            return;
        }

        const moment = (window as any).moment;
        const frontmatter = this.app.metadataCache.getFileCache(sourceFile)?.frontmatter || {};
        const identifier = String(scope === "week"
            ? (frontmatter.week || semanaNoTexto(sourceFile.basename))
            : (frontmatter.quarter || trimestreNoTexto(sourceFile.basename)));
        const cycle = scope === "week"
            ? moment(identifier, "GGGG-[W]WW", true)
            : moment(identifier, "YYYY-[Q]Q", true);

        if (!cycle.isValid()) {
            containerEl.createDiv({ text: `Resumo de hábitos: não encontrei ${scope === "week" ? "a semana" : "o trimestre"} no frontmatter ou nome da nota.` });
            return;
        }

        const start = cycle.clone().startOf(scope === "week" ? "isoWeek" : "quarter");
        const end = cycle.clone().endOf(scope === "week" ? "isoWeek" : "quarter");
        const today = moment().startOf("day");
        const observedEnd = moment.min(today, end.clone().startOf("day"));
        const elapsedDays = observedEnd.isBefore(start, "day") ? 0 : observedEnd.diff(start, "days") + 1;
        const startDate = start.format("YYYY-MM-DD");
        const endDate = observedEnd.format("YYYY-MM-DD");
        const trackerPath = "200 - FUNCTIONS/Habits/Tracker";
        const habits = this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(`${trackerPath}/`))
            .map(file => parseHabit(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter))
            .filter(habit => habit.ativo)
            .map(habit => ({
                ...habit,
                cycleEntries: elapsedDays === 0 ? [] : habit.entries.filter(date => date >= startDate && date <= endDate)
            }));

        const totalEntries = habits.reduce((total, habit) => total + habit.cycleEntries.length, 0);
        const coveredDays = new Set(habits.flatMap(habit => habit.cycleEntries)).size;
        const card = containerEl.createDiv({ cls: "dfm-habit-cycle-summary" });
        card.createEl("h4", { text: scope === "week" ? `🌱 Hábitos da semana ${identifier}` : `🌱 Hábitos do trimestre ${identifier}` });
        card.createDiv({
            text: elapsedDays > 0
                ? `${totalEntries} registros em ${elapsedDays} dias observados · ${coveredDays} dias com ao menos uma prática.`
                : "Este ciclo ainda não começou.",
            cls: "dfm-habit-cycle-summary-caption"
        });

        const table = card.createEl("table", { cls: "dfm-habits" });
        const header = table.createEl("thead").createEl("tr");
        header.createEl("th", { text: "HÁBITO" });
        header.createEl("th", { text: "REGISTROS" });
        const body = table.createEl("tbody");
        for (const habit of habits) {
            const row = body.createEl("tr");
            row.createEl("td", { text: habit.title });
            row.createEl("td", { text: `${habit.cycleEntries.length} de ${elapsedDays} dias` });
        }
    }

    async renderHabitsView(containerEl: HTMLElement, config: Record<string, string> = {}, activeFilePath?: string) {
        containerEl.empty();
        const mainContainer = containerEl.createDiv({ cls: "dfm-habits-container" });
        const hoje = (window as any).moment().format("YYYY-MM-DD");
        const pasta = config.path || "200 - FUNCTIONS/Habits/Tracker";

        // Single Habit File View (metrics for a single habit note)
        const targetFile = config.file === "current" && activeFilePath
            ? activeFilePath
            : (config.file || (activeFilePath && activeFilePath.startsWith(`${pasta}/`) ? activeFilePath : null));

        if (targetFile) {
            const arquivo = this.app.vault.getAbstractFileByPath(targetFile);
            if (arquivo instanceof TFile) {
                const habit = parseHabit(arquivo.path, this.app.metadataCache.getFileCache(arquivo)?.frontmatter);
                const metrics = calcHabitMetrics(habit, hoje, 30);
                
                const card = mainContainer.createDiv({ cls: "dfm-habit-single-card" });
                const header = card.createDiv({ cls: "dfm-habit-single-header" });
                const titleEl = header.createDiv({ cls: "dfm-habit-single-title" });
                titleEl.createSpan({ text: habit.title });
                if (habit.protocolId) {
                    titleEl.createSpan({
                        cls: "dfm-habits-guiado",
                        text: " 🤖 Guiado",
                        attr: { title: `Protocolo ${habit.protocolId}` }
                    });
                }

                const gridStats = card.createDiv({ cls: "dfm-habit-single-grid" });
                
                const statTotal = gridStats.createDiv({ cls: "dfm-habits-stat-card" });
                statTotal.createDiv({ cls: "dfm-habits-stat-val accent-green", text: String(metrics.totalEntries) });
                statTotal.createDiv({ cls: "dfm-habits-stat-lbl", text: "Total Execuções" });

                const stat30 = gridStats.createDiv({ cls: "dfm-habits-stat-card" });
                // "N de M dias" (25/10/2026): a contagem dos dias com registro nos dias já vividos da janela.
                stat30.createDiv({ cls: "dfm-habits-stat-val accent-green", text: `${metrics.windowEntries} de ${metrics.windowDays} dias` });
                stat30.createDiv({ cls: "dfm-habits-stat-lbl", text: "Últimos 30 dias" });

                const statUltimo = gridStats.createDiv({ cls: "dfm-habits-stat-card" });
                const rotuloUltimo = metrics.lastExecuted === hoje ? "Hoje" : (metrics.lastExecuted || "Nenhum");
                statUltimo.createDiv({ cls: "dfm-habits-stat-val", text: rotuloUltimo });
                statUltimo.createDiv({ cls: "dfm-habits-stat-lbl", text: "Último Registro" });

                // Render single habit row matrix for past 24 days
                const grade = buildGrid([habit], hoje, 24);
                this.renderHabitsMatrixTable(mainContainer, grade, hoje, arquivo, () =>
                    this.renderHabitsView(containerEl, config, activeFilePath));
                return;
            }
        }

        // Full Matrix View for all active habits (24 days default)
        const dias = Math.max(7, Math.min(31, parseInt(config.days) || 24));
        const arquivos = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(`${pasta}/`))
            .sort((a, b) => a.path.localeCompare(b.path));
        const habitos = arquivos.map(f =>
            parseHabit(f.path, this.app.metadataCache.getFileCache(f)?.frontmatter));
        const grade = buildGrid(habitos, hoje, dias);

        if (grade.rows.length === 0) {
            mainContainer.createEl("div", {
                cls: "dfm-habits-vazio",
                text: `Nenhum hábito em treino em ${pasta}.`
            });
            return;
        }

        // Show Dashboard Stats Header if requested
        if (config.showStats === "true") {
            const stats = calcGridStats(grade, hoje);
            const statsGrid = mainContainer.createDiv({ cls: "dfm-habits-stats-dashboard" });

            const cHoje = statsGrid.createDiv({ cls: "dfm-habits-stat-card" });
            cHoje.createDiv({ cls: "dfm-habits-stat-val accent-green", text: `${stats.concluidosHoje} / ${stats.totalAtivos}` });
            cHoje.createDiv({ cls: "dfm-habits-stat-lbl", text: "Concluídos Hoje" });

            const cExec = statsGrid.createDiv({ cls: "dfm-habits-stat-card" });
            cExec.createDiv({ cls: "dfm-habits-stat-val accent-orange", text: String(stats.totalExecucoesJanela) });
            cExec.createDiv({ cls: "dfm-habits-stat-lbl", text: "Execuções (Janela)" });
        }

        this.renderHabitsMatrixTable(mainContainer, grade, hoje, undefined, () =>
            this.renderHabitsView(containerEl, config, activeFilePath));
    }

    private renderHabitsMatrixTable(
        parentEl: HTMLElement,
        grade: { days: string[]; rows: any[] },
        hoje: string,
        singleFile?: TFile,
        refresh?: () => Promise<void>
    ) {
        const scrollWrapper = parentEl.createDiv({ cls: "dfm-habits-scroll-wrapper" });

        // Mouse wheel vertical-to-horizontal scroll conversion
        scrollWrapper.addEventListener("wheel", (evt: WheelEvent) => {
            if (evt.deltaY !== 0 && !evt.shiftKey) {
                evt.preventDefault();
                scrollWrapper.scrollLeft += evt.deltaY;
            }
        }, { passive: false });

        const tabela = scrollWrapper.createEl("table", { cls: "dfm-habits" });
        const cabecalho = tabela.createEl("thead").createEl("tr");
        
        cabecalho.createEl("th", { cls: "dfm-habits-nome", text: "HÁBITO" });
        
        for (const dia of grade.days) {
            const info = formatarDiaIngles(dia, hoje);
            let cls = "dfm-habits-dia";
            if (info.isToday) cls += " is-today";
            if (info.isWeekend) cls += " is-weekend";
            if (info.isFuture) cls += " is-future";

            const th = cabecalho.createEl("th", {
                cls,
                attr: { title: `${dia} (${info.weekdayStr})` }
            });
            th.createSpan({ text: info.weekdayStr });
            th.createSpan({ cls: "dfm-habits-dia-num", text: info.dayNumStr });
        }
        cabecalho.createEl("th", { cls: "dfm-habits-total", text: "✔" });

        const corpo = tabela.createEl("tbody");
        for (const linha of grade.rows) {
            const arquivo = singleFile || this.app.vault.getAbstractFileByPath(linha.path);
            const tr = corpo.createEl("tr");
            const nome = tr.createEl("td", { cls: "dfm-habits-nome" });
            const link = nome.createEl("a", { text: linha.title, cls: "internal-link" });
            link.addEventListener("click", (evt) => {
                evt.preventDefault();
                this.app.workspace.openLinkText(linha.path, "", false);
            });
            if (linha.protocolId) {
                nome.createSpan({
                    cls: "dfm-habits-guiado",
                    text: " 🤖",
                    attr: { title: `Guiado pelo protocolo: ${linha.protocolId}` }
                });
            }

            for (const celula of linha.cells) {
                const td = tr.createEl("td");
                const isToday = celula.date === hoje;
                const isFuture = celula.date > hoje;

                let cellCls = "dfm-habits-celula";
                if (celula.done) cellCls += " is-done";
                else if (isToday) cellCls += " is-today-empty";
                else if (isFuture) cellCls += " is-future";

                const btn = td.createDiv({
                    cls: cellCls,
                    text: celula.done ? "✓" : (isFuture ? "" : "·"),
                    attr: {
                        title: `${linha.title} | ${celula.date}${isToday ? " (Hoje)" : ""}${celula.done ? " - Concluído" : ""}`
                    }
                });

                btn.addEventListener("click", async () => {
                    const atual = parseHabit(
                        linha.path,
                        arquivo instanceof TFile
                            ? this.app.metadataCache.getFileCache(arquivo)?.frontmatter
                            : {}
                    );
                    const decisao = resolveClick(atual, celula.date, hoje);
                    if (decisao.action === "blocked") {
                        new Notice(decisao.reason);
                        return;
                    }
                    if (decisao.action === "protocol") {
                        (this.app as any).commands
                            .executeCommandById(`dfm-system:dfm-${decisao.protocolId}`);
                        return;
                    }
                    if (!(arquivo instanceof TFile)) return;
                    // A marca à mão passa pela porta única dos hábitos: o dia em `entries` e a linha na Day (06/11).
                    await this.habitLog.alternarDia(arquivo.path, celula.date);
                    await refresh?.();
                });
            }

            tr.createEl("td", { cls: "dfm-habits-total", text: String(linha.execucoes) });
        }

        const scrollToToday = () => {
            scrollWrapper.scrollLeft = scrollWrapper.scrollWidth;
        };
        scrollToToday();
        setTimeout(scrollToToday, 50);
        setTimeout(scrollToToday, 250);
    }

    checkForRecentModifications() {
        const today = (window as any).moment().format("YYYY-MM-DD");
        const dailyNote = this.app.vault.getMarkdownFiles().find(f => f.name === `${today}.md`);

        if (!dailyNote) return; 

        // O que este aparelho gravou (a Missão, há pouco) não é sync de outro aparelho (06/11).
        let vista = null;
        try { vista = gravacaoVista(this.app.loadLocalStorage(CHAVE_DA_GRAVACAO_DA_DAY)); } catch { vista = null; }
        const minutesAgo = minutosDoAvisoDeSync({ caminho: dailyNote.path, mtime: dailyNote.stat.mtime }, Date.now(), vista);
        if (minutesAgo !== null) {
            new Notice(
                `⚠️ AVISO DE SYNC: A nota diária foi modificada há ${minutesAgo} min (provavelmente em outro device). Aguarde 2-3 min para o iCloud sincronizar antes de editar, ou você pode perder dados.`,
                15000 
            );
            console.warn(`DFM Sync Warning: Daily note modified ${minutesAgo} minutes ago. Potential sync conflict.`);
        }
    }

    registerCommandsAndRibbon() {
        this.addRibbonIcon('zap', 'DFM Actions', (evt) => {
            const menu = new Menu();
            const protocols = this.manager.getAll();
            const routers = protocols.filter((p: any) => p.id.startsWith('router_'));
            const normal = protocols.filter((p: any) => !p.id.startsWith('router_'));

            routers.forEach((protocol: any) => {
                menu.addItem((item) =>
                    item.setTitle(`🧭 ${protocol.name}`).setIcon(protocol.icon).onClick(() => protocol.run())
                );
            });

            if (routers.length > 0 && normal.length > 0) menu.addSeparator();

            normal.forEach((protocol: any) => {
                menu.addItem((item) =>
                    item.setTitle(`📜 ${protocol.name}`).setIcon(protocol.icon).onClick(() => protocol.run())
                );
            });

            menu.showAtMouseEvent(evt);
        });

        this.manager.getAll().forEach((protocol: any) => {
            const isRouter = protocol.id.startsWith('router_');
            this.addCommand({
                id: `dfm-${protocol.id}`,
                name: `${isRouter ? '🧭 Router' : '📜 Protocolo'}: ${protocol.name}`,
                callback: () => protocol.run()
            });
        });
    }

    /**
     * O que faz: as definições do sistema (B1): o bloco `definicoes` do salvamento, por cima das
     * definições de partida dos módulos opcionais e dos padrões (`lerDefinicoes`).
     * Por quê: os leitores pedem as definições aqui, e não ao `data.json`; sem o bloco salvo, valem
     * as de partida. Lidas a cada pedido, então o que a aba gravar vale na hora.
     * Prova: tests/definicoes/definicoes.test.ts e tests/opcionais/cofre.test.ts.
     */
    get definicoes(): Definicoes {
        return lerDefinicoes(this.settings, this.partidaDasDefinicoes);
    }

    /**
     * O que faz: põe a ponte do agente no estado das definições (`ponte`): ligada, sobe na porta
     * dela (ou troca de porta, descendo e subindo); desligada, desce.
     * Por quê: a ponte é opcional; sem ela ligada nada escuta nem avisa. Quem a liga ou muda a porta
     * na aba vê o efeito na hora, sem reabrir o Obsidian.
     * Erro e ataque: a porta ocupada (ou a falha ao gravar o descritor) vira um aviso e um erro no
     * console, e a ponte fica descida; nunca derruba a carga do plugin.
     */
    async aplicarPonte(): Promise<void> {
        const { ligada, porta } = this.definicoes.ponte;
        const ponte = this.dshOperatorBridge;
        if (ponte.ativa && (!ligada || ponte.porta !== porta)) await ponte.stop();
        if (!ligada || ponte.ativa) return;
        try {
            if (await ponte.start(porta)) console.log(`DFM System: ponte operacional DSH ativa em loopback (porta ${porta}).`);
        } catch (error) {
            console.error('DFM System: falha ao iniciar ponte operacional DSH:', error);
            new Notice(`DFM System: a ponte do agente não subiu na porta ${porta}. Veja o console.`, 10000);
        }
    }

    /** As camadas de partida das definições: as dos módulos opcionais, na ordem da lista. */
    get partidaDasDefinicoes(): unknown[] {
        return MODULOS_OPCIONAIS.map(modulo => modulo.definicoesDePartida);
    }

    async loadSettings() {
        const stored = await this.loadData() ?? {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored, {
            arvoreProgressao: Object.assign({}, DEFAULT_SETTINGS.arvoreProgressao, stored.arvoreProgressao ?? {}),
        });
        for (const modulo of MODULOS_OPCIONAIS) modulo.naCargaDasConfiguracoes?.(this.settings, stored);
    }

    /**
     * Acessor do motor do Mission Control. Criado sob demanda e invalidado
     * sempre — quem chama decide se quer o snapshot do cache de 15 s ou um
     * recém-lido (`build(true)`).
     */
    getMissionControl(): MissionControl {
        if (!this.missionControl) this.missionControl = new MissionControl(this);
        return this.missionControl;
    }

    async activateRecentFilesView() {
        const { workspace } = this.app;
        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DFM_RECENT);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_DFM_RECENT, active: true });
        }
        
        if (leaf) workspace.revealLeaf(leaf);
    }

    async saveSettings() {
        if (this.isSavingSettings) {
            this.hasPendingSettingsSave = true;
            return;
        }

        this.isSavingSettings = true;
        try {
            await this.saveData(this.settings);
        } catch (e) {
            console.error("DFM: Erro ao salvar configurações:", e);
            new Notice("⚠️ Não foi possível salvar as configurações — o progresso pode se perder ao recarregar.", 6000);
        } finally {
            this.isSavingSettings = false;
        }

        if (this.hasPendingSettingsSave) {
            this.hasPendingSettingsSave = false;
            await this.saveSettings();
        }
    }

    async createDailyNote(dateStr: string): Promise<TFile | null> {
        const moment = (window as any).moment;
        const m = moment(dateStr, "YYYY-MM-DD");
        
        let folder = "300 - RUNTIME/302 - Daymiss/Day";
        let templatePath = "200 - FUNCTIONS/Models/Day modelo.md";
        let format = "YYYY-MM-DD";
        
        // Try to read periodic-notes data.json
        try {
            const periodicConfig = await this.app.vault.adapter.read(".obsidian/plugins/periodic-notes/data.json");
            const config = JSON.parse(periodicConfig);
            if (config?.daily?.folder) folder = config.daily.folder;
            if (config?.daily?.template) templatePath = config.daily.template;
            if (config?.daily?.format) format = config.daily.format;
        } catch (e) {
            // Fallback to daily-notes.json
            try {
                const dailyConfig = await this.app.vault.adapter.read(".obsidian/daily-notes.json");
                const config = JSON.parse(dailyConfig);
                if (config?.folder) folder = config.folder;
                if (config?.template) templatePath = config.template;
                if (config?.format) format = config.format;
            } catch (err) {
                console.log("DFM: Could not parse daily/periodic note configs, using defaults.", err);
            }
        }
        
        // Ensure folder exists
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }
        
        const filename = m.format(format);
        const fullPath = `${folder}/${filename}.md`;
        
        // Load template content
        let content = "";
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
        if (templateFile && templateFile instanceof TFile) {
            const rawContent = await this.app.vault.read(templateFile);

            // Os marcadores que o Periodic Notes resolve ({{date}}, {{time}}, {{title}},
            // os dias da semana) e o `quarter` pela regra da quinta-feira: a 2026-09-28
            // é da W40, do Q4, e não do Q3 do calendário (27/10/2026). A regra mora em
            // `renderDayNote` (temporal/periodNoteRepair.ts), testada sem Obsidian.
            content = renderDayNote(rawContent, m, format, moment());
        } else {
            content = `# 📅 ${filename}\n\n`;
        }
        
        // Outra criação pode ter chegado antes (Periodic Notes, outro protocolo): a
        // Day que já existe serve, em vez de falhar e perder o registro de quem pediu.
        const existing = this.app.vault.getAbstractFileByPath(fullPath);
        if (existing instanceof TFile) return existing;
        try {
            const newFile = await this.app.vault.create(fullPath, content);
            new Notice(`📅 Nota Diária criada: ${filename}`);
            return newFile;
        } catch (e) {
            const raced = this.app.vault.getAbstractFileByPath(fullPath);
            if (raced instanceof TFile) return raced;
            console.error("DFM: Error creating daily note:", e);
            return null;
        }
    }

    /**
     * A linha no DFM Timeline da Day: a conclusão (ou o cancelamento) de tarefa e o
     * rascunho interrompido de um protocolo. O registro de um protocolo que terminou não
     * passa por aqui: o escritor único dele é `JSONProtocol.logToDailyNote` (decisão de
     * 29/10, um escritor só da Day, o formato limpo). `options.noCreate`: sem a Day, não cria e devolve
     * `false` (a conclusão de outro dia vai para a Week). `options.noHour`: a hora não foi
     * dita ("Ontem", "Outro dia"): a linha diz "sem hora" e vai para a seção de registros.
     */
    async logToDailyTimeline(type: 'protocol' | 'task', label: string, reference: string, isNote: boolean, customTime?: any, statusText?: string, options: { noCreate?: boolean; noHour?: boolean } = {}): Promise<boolean> {
        const moment = (window as any).moment;
        const time = customTime || moment();
        const dateStr = time.format("YYYY-MM-DD");

        let dailyNote = this.app.vault.getMarkdownFiles().find(f => f.name === `${dateStr}.md`);
        if (!dailyNote && options.noCreate) return false;
        if (!dailyNote) {
            console.log(`DFM Timeline: Nota diária (${dateStr}) não encontrada. Criando via PeriodicNotes/DailyNotes settings...`);
            dailyNote = await this.createDailyNote(dateStr) || undefined;
            if (!dailyNote) {
                console.log(`DFM Timeline: Não foi possível criar a nota diária para ${dateStr}.`);
                return false;
            }
        }

        const timestamp = options.noHour ? "sem hora" : time.format("HH:mm");
        // Sem hora dita, nenhuma seção de hora casa: a linha vai para a seção de registros.
        const hour = options.noHour ? -1 : time.hour();

        let logLine = "";
        if (type === 'protocol') {
            const status = statusText || 'executado';
            if (isNote) {
                logLine = `**[${timestamp}] Protocolo ${label} ${status}:** [[${reference}]]`;
            } else {
                if (reference.includes('\n')) {
                    logLine = `**[${timestamp}] Protocolo ${label} ${status}:**\n${reference}`;
                } else {
                    logLine = `**[${timestamp}] Protocolo ${label} ${status}:** ${reference}`;
                }
            }
        } else if (type === 'task') {
            const taskLink = reference ? `[[${reference.replace('.md', '')}|${label}]]` : label;
            // Cancelar não é concluir: o registro é neutro (`statusText: 'cancelada'`).
            const what = statusText === 'cancelada' ? 'Tarefa cancelada' : 'Conclusão de tarefa';
            logLine = `**[${timestamp}] ${what}:** ${taskLink}`;
        }

        let content = await this.app.vault.read(dailyNote);
        const lines = content.split("\n");
        let headerIndex = -1;
        
        const hourStr = String(hour);
        const hourlyHeaderRegex = new RegExp(`^#{1,6}\\s*(0?${hourStr})(?:[:h\\s]|$)`, 'i');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#') && hourlyHeaderRegex.test(line)) {
                headerIndex = i;
                break;
            }
        }
        
        if (headerIndex !== -1) {
            let nextHeaderIndex = lines.length;
            for (let i = headerIndex + 1; i < lines.length; i++) {
                if (lines[i].trim().startsWith('#')) {
                    nextHeaderIndex = i;
                    break;
                }
            }
            
            let insertIndex = nextHeaderIndex;
            while (insertIndex > headerIndex + 1 && lines[insertIndex - 1].trim() === "") {
                insertIndex--;
            }
            
            lines.splice(insertIndex, 0, logLine);
            content = lines.join("\n");
        } else {
            let fallbackIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('<!-- DFM_LOGS_START -->')) {
                    fallbackIndex = i;
                    break;
                }
            }
            
            if (fallbackIndex !== -1) {
                lines.splice(fallbackIndex + 1, 0, `- ${logLine}`);
                content = lines.join("\n");
            } else {
                const fallbackHeaders = [
                    "## 🗂️ Log de Notas Criadas no Obsidian",
                    "# 🤖 SISTEMAS DE INTEGRAÇÃO & LOGS AUTOMÁTICOS",
                    "## ✍️ Diário Livre e Registros Especiais"
                ];
                
                let foundHeaderIndex = -1;
                for (const header of fallbackHeaders) {
                    foundHeaderIndex = lines.findIndex(l => l.trim().toLowerCase() === header.toLowerCase());
                    if (foundHeaderIndex !== -1) break;
                }
                
                if (foundHeaderIndex !== -1) {
                    let nextHeaderIndex = lines.length;
                    for (let i = foundHeaderIndex + 1; i < lines.length; i++) {
                        if (lines[i].trim().startsWith('#')) {
                            nextHeaderIndex = i;
                            break;
                        }
                    }
                    let insertIndex = nextHeaderIndex;
                    while (insertIndex > foundHeaderIndex + 1 && lines[insertIndex - 1].trim() === "") {
                        insertIndex--;
                    }
                    lines.splice(insertIndex, 0, `- ${logLine}`);
                    content = lines.join("\n");
                } else {
                    content = content.trimEnd() + `\n\n- ${logLine}\n`;
                }
            }
        }
        
        await this.app.vault.modify(dailyNote, content);
        new Notice(options.noHour ? `⏱️ Timeline: registrado na Day de ${dateStr}` : `⏱️ Timeline: Log registrado para às ${timestamp}`);
        return true;
    }

    async updateDailyCommandFields(unicaCoisa: string, valor: string, actionCommand: string, macroFoco: string, targetDate?: string, commandTaskPath?: string): Promise<boolean> {
        const m = targetDate ? (window as any).moment(targetDate, "YYYY-MM-DD") : (window as any).moment();
        const today = m.format("YYYY-MM-DD");
        const dailyNote = this.app.vault.getMarkdownFiles().find(f => f.name === `${today}.md`);

        if (!dailyNote) {
            console.log(`DFM: Nota diária (${today}) não encontrada para atualizar Comando do Dia.`);
            return false;
        }

        let content = await this.app.vault.read(dailyNote);
        let updated = content;

        const hasInlineFields = /unica_coisa::|valor_hyadhuad::|acao_comando::|tarefa_smart::|macro_foco::|valor::/i.test(updated);
        
        if (hasInlineFields) {
            if (unicaCoisa !== undefined) updated = updated.replace(/(unica_coisa::\s*)(.*?)(?=\]|$|\n)/gi, `$1${unicaCoisa}`);
            if (valor !== undefined) {
                if (updated.includes("valor_hyadhuad::")) {
                    updated = updated.replace(/(valor_hyadhuad::\s*)(.*?)(?=\]|$|\n)/gi, `$1${valor}`);
                } else {
                    updated = updated.replace(/(valor::\s*)(.*?)(?=\]|$|\n)/gi, `$1${valor}`);
                }
            }
            if (actionCommand !== undefined) {
                if (updated.includes("acao_comando::")) {
                    updated = updated.replace(/(acao_comando::\s*)(.*?)(?=\]|$|\n)/gi, `$1${actionCommand}`);
                } else {
                    updated = updated.replace(/(tarefa_smart::\s*)(.*?)(?=\]|$|\n)/gi, `$1${actionCommand}`);
                }
            }
            if (macroFoco !== undefined) updated = updated.replace(/(macro_foco::\s*)(.*?)(?=\]|$|\n)/gi, `$1${macroFoco}`);
        }
        // Removido em 2026-08-04: havia um segundo ramo que procurava as frases
        // "desnecessário:", "encarnar hoje:", "frente principal:" e "TaskNotes):" no
        // corpo da diária. Elas vinham do Day modelo ANTIGO e não existem em nenhum
        // template desde a reformulação ACT+Adler — o ramo rodava e nunca escrevia nada.
        // O ramo dos campos inline acima continua: 35 diárias legadas ainda os têm.

        const contentUpdated = updated !== content;
        if (updated !== content) {
            await this.app.vault.modify(dailyNote, updated);
        }

        // Processa o frontmatter por último: `vault.modify` regrava o arquivo inteiro e
        // apagaria o vínculo canônico se fosse executado depois desta alteração.
        let frontmatterUpdated = false;
        if (commandTaskPath?.trim()) {
            const existingPath = this.app.metadataCache.getFileCache(dailyNote)?.frontmatter?.command_task_path;
            if (existingPath !== commandTaskPath) {
                await this.app.fileManager.processFrontMatter(dailyNote, (fm: any) => {
                    fm.command_task_path = commandTaskPath;
                });
                frontmatterUpdated = true;
            }
        }
        return contentUpdated || frontmatterUpdated;
    }

    onunload() {
        this.canvasEngine?.clearPeriodicInterval();
    }
}
