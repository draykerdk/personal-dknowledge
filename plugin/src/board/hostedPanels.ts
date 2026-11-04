/**
 * As visões do console antigo que ficam, hospedadas nos cartões do painel novo.
 *
 * O que faz: guarda os desenhadores das visões que o painel ainda mostra (a matriz, a escolha, o
 * esperando, os hábitos, os projetos, as árvores, as áreas, os protocolos, o operador, a bancada, a
 * integridade e as ferramentas de canvas), monta o contexto de cada uma a partir do snapshot e
 * desenha a visão pedida no cartão. O "refresh" de uma visão vira o redesenho do painel.
 * Por quê: a vista antiga do Mission Control (as abas, os modos, as colunas, os tamanhos e o
 * diagnóstico) se aposentou em 02/11/2026 e saiu do código em 03/11/2026, quando a remoção já
 * estava decidida; o painel ficou com os cartões que a Missão não faz, e esta classe
 * é o que restou dela: só o hospedeiro, sem vista registrada.
 * Erro e ataque: um id sem desenhador não desenha (`renderPanel` responde `false` e o painel diz que
 * a visão não existe mais); o protocolo que não existe vira aviso, nunca exceção solta; o console
 * nunca despacha trabalho ao DSH sozinho (a invocação abre para o humano confirmar).
 * Prova: tests/board/hostedPanels.test.ts (o que desenha e o que não) e tests/ui/missionPanelContracts.test.ts (as classes no CSS).
 */
import { Notice } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionSnapshot } from '../engine/missionControl';
import { buildSkillInvocation, getDfmDshSkill } from '../engine/dshSkills';
import { MissionDshAction, MissionPanelContext, openVaultLink } from '../ui/mission/context';
import { renderFunnel, renderWaiting } from '../ui/mission/panelExecution';
import { renderAreas, renderCanvases, renderProjects, renderTrees } from '../ui/mission/panelStructure';
import { renderIntegrity, renderOperatorCard, renderProtocols } from '../ui/mission/panelOperator';
import { renderMatrix } from '../ui/mission/panelMatrix';
import { renderHabits } from '../ui/mission/panelHabits';
import { emptyBenchState, renderBench } from '../ui/mission/panelBench';
import { emptyPortfolioState, renderPortfolioActions, renderPortfolioBoard, renderPortfolioCompliance } from '../ui/mission/panelPortfolio';
import { renderKanban } from '../ui/mission/panelKanban';
import { renderCanvasTools } from '../ui/mission/panelTools';
import { MissionFocusModal, MissionPromptModal } from '../ui/mission/modals';

/** Assinatura de uma visão desenhável: o mesmo contrato de `render*` dos módulos. */
type PanelRenderer = (host: HTMLElement, ctx: MissionPanelContext) => void;

export class HostedMissionPanels {
    private snapshot: MissionSnapshot | null = null;
    private readonly benchState = emptyBenchState();
    /** Estado do quadro de projetos: seleção, dry-run exibido e última validação. */
    private readonly portfolioState = emptyPortfolioState();

    constructor(
        private readonly plugin: DFMPlugin,
        private readonly redraw: (force: boolean) => void,
        private readonly openTaskOrNote: (path: string) => Promise<void>,
    ) {}

    private get app() { return this.plugin.app; }

    /** O "refresh" pedido por uma visão redesenha o painel novo. */
    async refresh(force = false): Promise<void> {
        if (force) this.plugin.getMissionControl().invalidate();
        this.redraw(force);
    }

    has(id: string): boolean {
        return !!this.panelRenderers()[id];
    }

    /** Desenha a visão `id` no `host`. `false` se a visão não existe. */
    renderPanel(id: string, host: HTMLElement, snapshot: MissionSnapshot): boolean {
        const renderer = this.panelRenderers()[id];
        if (!renderer) return false;
        this.snapshot = snapshot;
        renderer(host, this.buildContext(snapshot));
        return true;
    }

    /**
     * Onde cada id de visão vira desenho: o contrato que liga o cartão `painel` do layout
     * (`board/panelLayout.ts`, `LEGACY_PANELS`) aos desenhadores publicados pelos módulos.
     */
    private panelRenderers(): Record<string, PanelRenderer | undefined> {
        const repeat = () => void this.refresh(false);
        return {
            matrix: (host, ctx) => renderMatrix(host, ctx),
            habits: (host, ctx) => renderHabits(host, ctx),
            funnel: (host, ctx) => renderFunnel(host, ctx),
            waiting: (host, ctx) => renderWaiting(host, ctx),
            protocols: (host, ctx) => renderProtocols(host, ctx),
            portfolioBoard: (host, ctx) => renderPortfolioBoard(host, ctx),
            kanban: (host, ctx) => renderKanban(host, ctx),
            portfolioActions: (host, ctx) => renderPortfolioActions(host, ctx, this.portfolioState, repeat),
            projects: (host, ctx) => renderProjects(host, ctx),
            trees: (host, ctx) => renderTrees(host, ctx),
            portfolioCompliance: (host, ctx) => renderPortfolioCompliance(host, ctx, this.portfolioState, repeat),
            areas: (host, ctx) => renderAreas(host, ctx),
            canvasTools: (host, ctx) => renderCanvasTools(host, ctx),
            canvases: (host, ctx) => renderCanvases(host, ctx),
            operatorCard: (host, ctx) => renderOperatorCard(host, ctx),
            bench: (host, ctx) => renderBench(host, ctx, this.benchState, repeat),
            integrity: (host, ctx) => renderIntegrity(host, ctx),
        };
    }

    private buildContext(snapshot: MissionSnapshot): MissionPanelContext {
        return {
            app: this.app,
            plugin: this.plugin,
            snapshot,
            refresh: (force = true) => this.refresh(force),
            openPath: path => this.openTaskOrNote(path),
            openLink: link => openVaultLink(this.app, link),
            runProtocol: (id, vars) => this.runProtocol(id, vars),
            invokeDsh: action => this.invokeDsh(action),
            executeCommand: id => this.executeCommand(id),
            focusTasks: (statuses, label) => this.focusTasks(statuses, label),
            notice: (message, timeout) => new Notice(message, timeout ?? 5000),
        };
    }

    /** Mesmo caminho dos botões das notas: `manager.get(id).run(vars)`. */
    private runProtocol(id: string, vars?: Record<string, any>): Promise<void> {
        const protocol = this.plugin.manager?.get(id);
        if (!protocol) {
            new Notice(`❌ Protocolo não encontrado: ${id}`);
            return Promise.resolve();
        }
        void Promise.resolve(vars ? protocol.run(vars) : protocol.run()).catch((error: unknown) => {
            console.error(`DFM Mission Control: protocolo ${id} falhou:`, error);
            new Notice(`⚠️ Protocolo ${id} falhou ao iniciar.`, 6000);
        });
        return Promise.resolve();
    }

    private executeCommand(id: string): void {
        const commandId = id.startsWith('dfm-system:') ? id : `dfm-system:${id}`;
        const executed = (this.app as any).commands?.executeCommandById?.(commandId);
        if (!executed) new Notice(`⚠️ Comando indisponível: ${commandId}`, 5000);
    }

    /**
     * Prepara a invocação e abre a confirmação. O console nunca despacha
     * trabalho ao DSH por conta própria — o humano decide enviar.
     */
    private async invokeDsh(action: MissionDshAction): Promise<void> {
        const signal = this.snapshot?.operator.signal ?? null;
        const note = signal ? { basename: signal.title, path: signal.path } : null;

        if (action.kind === 'skill') {
            const skill = getDfmDshSkill(action.id);
            if (!skill) {
                new Notice(`⚠️ Skill DFM não encontrada: ${action.id}`);
                return;
            }
            // O DSH View resolve a nota de contexto por `lastDshContextPath`:
            // fixar o sinal vivo faz a sessão abrir já ancorada na nota certa.
            if (note) this.plugin.lastDshContextPath = note.path;
            new MissionPromptModal(
                this.app,
                `Invocação · ${skill.label}`,
                buildSkillInvocation(skill, note),
                note
                    ? `Contexto ancorado em [[${note.path}]]. Abra o DSH pela ribbon e cole a invocação.`
                    : 'Nenhum sinal de contexto vivo — a invocação vai sem nota ancorada.',
            ).open();
            return;
        }

        const prompt = [
            `Conduza comigo o protocolo DFM \`${action.id}\` em modo interativo.`,
            'Leia primeiro o estado vivo do DFM e preserve as decisões atuais.',
            'Não preencha respostas por mim: faça a pergunta, aguarde o meu insumo e só então proponha o próximo passo.',
        ].join('\n');
        new MissionPromptModal(
            this.app,
            `Protocolo · ${action.id}`,
            prompt,
            'Para executar o fluxo interativo dentro do Obsidian, use o chip de protocolo no painel do operador.',
        ).open();
    }

    /** Drill-down do funil: abre a lista completa do bucket, não só as seis primeiras. */
    private focusTasks(statuses: string[], label: string): Promise<void> {
        const buckets = this.snapshot?.board.buckets ?? [];
        const tasks = buckets
            .filter(bucket => statuses.length === 0 || bucket.statuses.some(status => statuses.includes(status)))
            .flatMap(bucket => bucket.tasks);
        const subtitle = `${tasks.length} tarefa(s) · ordem do motor: vencidas → hoje → impacto → título`;
        new MissionFocusModal(this.app, label, tasks, subtitle).open();
        return Promise.resolve();
    }
}
