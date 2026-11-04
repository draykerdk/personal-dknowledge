/**
 * O painel do Mission Control — o hub do DFM.
 *
 * - **Páginas** (abas) de **cartões** numa grade de 12 colunas. Um cartão é um
 *   widget do quadro/consulta ou uma das visões do console antigo (captura,
 *   fábrica de notas, mapa, kanban, portfólio, bancada…), hospedada como está.
 * - **Arrastar** pela alça reordena (e solta numa aba para mudar de página);
 *   **redimensionar** pela quina ajusta largura (em colunas) e altura; duplo
 *   clique na quina volta a altura para automática. Teclado: Alt+setas movem.
 * - **Responsivo**: 12 colunas em tela larga, 6 em média, 1 em estreita; a
 *   navegação recolhe.
 * - À esquerda, a **navegação** pelas duas hierarquias (Tempo e Projetos), a
 *   **Temporada** (as centrais do trimestre com os auxiliares) e as pendências de
 *   organização.
 *
 * O layout é gravado nas configurações do plugin (`boardPanelLayout`).
 */
import { FuzzySuggestModal, ItemView, Menu, Modal, Notice, Setting, setIcon } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from './boardPlugin';
import { BOARD_CATALOG } from './boardSpec';
import { renderBoardWidget, renderConsulta } from './boardRender';
import type { BoardActions } from './boardRender';
import { evaluateQuery } from './queryModel';
import type { QueryScope } from './queryModel';
import { QUERY_PRESETS } from './queryPresets';
import { buildNav } from './panelNav';
import type { NavModel, ProjectNav } from './panelNav';
import { TriageModal } from './triageModal';
import { HostedMissionPanels } from './hostedPanels';
import {
    LEGACY_PANELS, addCard, addPage, cardLabel, defaultPanelLayout, movePage, moveCard, reconcilePanelLayout,
    packMasonry, removeCard, removePage, renamePage, reorderPage, resizeCard, panelLayoutOnOpen, spanAt6, updateCard, GRID_COLUMNS, MIN_H,
    abaPelaTecla, layoutParaGravar, navRecolhida, podeRedesenharCartao, precisaGravar,
} from './panelLayout';
import { dica } from '../ui/dica';
import type { CardSource, PanelCard, PanelLayoutState } from './panelLayout';
import { fold } from '../project/projectCanvasModel';
import { montarNoLugar, type MissaoNoLugar } from '../missao/hosts/lugar';
import { CHAVE_DA_PAGINA, estadoGuardado, estadoParaGuardar, migrarChaveDoRamo, portaDoPeriodo } from '../missao/estadoTela';
import { agruparEmCinco, cartoesParaRecolher, recolher, type Agrupamento, type CartaoParaRecolher } from './panelRegroup';

export const VIEW_TYPE_DFM_BOARD_PANEL = 'dfm-mission-board';

const WIDTHS: Array<[number, string]> = [[3, '1/4'], [4, '1/3'], [6, '1/2'], [8, '2/3'], [9, '3/4'], [12, 'inteira']];

class TextPrompt extends Modal {
    constructor(app: App, private readonly title: string, private readonly initial: string, private readonly done: (value: string | null) => void) { super(app); }
    onOpen(): void {
        this.titleEl.setText(this.title);
        let value = this.initial;
        let ok = false;
        new Setting(this.contentEl).addText(t => {
            t.setValue(this.initial).onChange(v => { value = v; });
            t.inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { ok = true; this.close(); } });
            window.setTimeout(() => t.inputEl.select(), 10);
        });
        new Setting(this.contentEl).addButton(b => b.setButtonText('OK').setCta().onClick(() => { ok = true; this.close(); }));
        this.onClose = () => this.done(ok ? value : null);
    }
}

interface CatalogItem { label: string; source: CardSource; w: number }

const ROTULO_DA_FASE: Record<string, string> = { olhada: 'Olhada', plano: 'Plano', durante: 'Durante', fechar: 'Fechar' };

/**
 * A lista para conferir antes de mudar o layout (o Recolher e o agrupamento das páginas):
 * mostra o que muda e só aplica no clique do operador. Fechar sem clicar não muda nada.
 */
class ConferirLayout extends Modal {
    constructor(app: App, private readonly titulo: string, private readonly desenhar: (el: HTMLElement) => void, private readonly botao: string, private readonly aplicar: () => void) { super(app); }
    onOpen(): void {
        this.titleEl.setText(this.titulo);
        const body = this.contentEl.createDiv('dfm-bp-lista');
        this.desenhar(body);
        const acts = this.contentEl.createDiv('dfm-bp-lista-acoes');
        const ok = acts.createEl('button', { text: this.botao, cls: 'mod-cta', attr: { type: 'button' } });
        ok.addEventListener('click', () => { this.close(); this.aplicar(); });
        const no = acts.createEl('button', { text: 'Cancelar', attr: { type: 'button' } });
        no.addEventListener('click', () => this.close());
    }
    onClose(): void { this.contentEl.empty(); }
}

class CardCatalog extends FuzzySuggestModal<CatalogItem> {
    constructor(app: App, private readonly items: CatalogItem[], private readonly choose: (item: CatalogItem) => void) {
        super(app);
        this.setPlaceholder('Adicionar ao painel: widget, consulta ou visão do console…');
    }
    getItems(): CatalogItem[] { return this.items; }
    getItemText(item: CatalogItem): string { return item.label; }
    onChooseItem(item: CatalogItem): void { this.choose(item); }
}

/** Altura de uma linha do mural e o espaço vertical entre cartões (px). */
const MASONRY_ROW = 2;
const MASONRY_GAP = 14;

export class BoardPanelView extends ItemView {
    private layout: PanelLayoutState;
    private readonly hosted: HostedMissionPanels;
    private unsubscribe: (() => void) | null = null;
    private rootEl!: HTMLElement;
    private tabsEl!: HTMLElement;
    private gridEl!: HTMLElement;
    private navEl!: HTMLElement;
    private subEl!: HTMLElement;
    private nav: NavModel | null = null;
    private navTimer: number | null = null;
    private saveTimer: number | null = null;
    private openAreas = new Set<string>();
    private showStale = false;
    /** Gesto em curso: redesenhar agora mataria o arrasto; o pedido espera. */
    private gesture = false;
    private pendingDraw = false;
    private queryScopeState: QueryScope | null = null;
    /**
     * Mural: cada cartão ocupa só as linhas da sua altura (linhas de 2 px), e o
     * próximo encaixa logo abaixo do mais baixo — sem o buraco que uma grade por
     * linhas deixa ao lado de um cartão alto. Reage a toda mudança de altura
     * (widget que carrega, recolher, redimensionar, largura da janela).
     */
    private readonly masonry = new ResizeObserver(() => this.schedulePack());
    private packFrame: number | null = null;
    /** A região da Missão (a página tela): montada uma vez, guardada ao trocar de aba, desmontada ao fechar. */
    private missaoEl!: HTMLElement;
    private missaoHost: MissaoNoLugar | null = null;
    private tabsRowEl!: HTMLElement;
    private tabsActionsEl!: HTMLElement;
    /** A largura da vista: a navegação recolhe abaixo de 760 px e o sinal das abas acompanha. */
    private sizer: ResizeObserver | null = null;
    /** O gesto do operador na navegação nesta sessão (vence a largura); `null` = nenhum. */
    private navGesto: boolean | null = null;
    /** O desenho de cada cartão à vista: redesenha só o que mudou, e nunca com o foco num campo dele. */
    private drawn = new Map<string, { el: HTMLElement; html: string }>();
    private drawnShape = '';

    constructor(leaf: WorkspaceLeaf, private readonly plugin: DFMPlugin, private readonly board: MissionBoard) {
        super(leaf);
        this.layout = this.seededLayout();
        this.hosted = new HostedMissionPanels(plugin, force => {
            if (force) void this.board.store.refreshNow();
            this.drawGrid();
        }, path => this.board.openTask(path));
    }

    /**
     * O layout salvo, conferido e com as páginas novas semeadas uma vez
     * (`seedPanelPages`): a lista do que já foi semeado fica nas configurações
     * (`boardPanelSeeded`), e uma página que o operador apagou não volta.
     */
    private seededLayout(): PanelLayoutState {
        const settings = this.plugin.settings as any;
        const opened = panelLayoutOnOpen(settings.boardPanelLayout, settings.boardPanelSeeded);
        if (opened.save) {
            settings.boardPanelSeeded = opened.seeded;
            if (opened.saveLayout) settings.boardPanelLayout = layoutParaGravar(opened.layout);
            void Promise.resolve(this.plugin.saveSettings()).catch(() => new Notice('⚠️ Não foi possível gravar o layout do painel.'));
        }
        return opened.layout;
    }

    getViewType(): string { return VIEW_TYPE_DFM_BOARD_PANEL; }
    getDisplayText(): string { return 'Mission Control'; }
    getIcon(): string { return 'layout-dashboard'; }

    async onOpen(): Promise<void> {
        const root = this.contentEl;
        root.empty();
        root.addClass('dfm-bp');
        this.rootEl = root;

        const bar = root.createDiv('dfm-bp-bar');
        this.iconButton(bar, 'Navegação: mostrar ou recolher a coluna da esquerda', 'panel-left', () => {
            this.navGesto = !this.navIsCollapsed();
            this.layout = { ...this.layout, navCollapsed: this.navGesto };
            this.save();
            this.applyNavState();
        });
        const titles = bar.createDiv('dfm-bp-titles');
        titles.createDiv({ cls: 'dfm-bp-title', text: 'Mission Control' });
        this.subEl = titles.createDiv('dfm-bp-sub');
        const actions = bar.createDiv('dfm-bp-actions');
        this.button(actions, 'Adicionar', 'plus', () => this.openCatalog());
        this.iconButton(actions, 'Reler', 'refresh-cw', () => this.reread());
        this.iconButton(actions, 'Mais', 'more-horizontal', e => this.panelMenu(e));

        // As abas: uma lista de abas (← → Home End), com o sinal de que há mais para o lado.
        this.tabsRowEl = root.createDiv('dfm-bp-tabsrow');
        this.tabsEl = this.tabsRowEl.createDiv({ cls: 'dfm-bp-tabs', attr: { role: 'tablist', 'aria-label': 'Páginas do Mission Control' } });
        this.tabsEl.addEventListener('scroll', () => this.updateTabsOverflow(), { passive: true });
        this.tabsEl.addEventListener('keydown', e => this.tabKey(e));
        this.tabsActionsEl = this.tabsRowEl.createDiv('dfm-bp-tabs-actions');
        this.iconButton(this.tabsActionsEl, 'Reler', 'refresh-cw', () => this.reread());
        this.iconButton(this.tabsActionsEl, 'Mais', 'more-horizontal', e => this.panelMenu(e));
        const body = root.createDiv('dfm-bp-body');
        this.missaoEl = root.createDiv('dfm-bp-missao');
        this.navEl = body.createDiv('dfm-bp-nav');
        const main = body.createDiv('dfm-bp-main');
        this.gridEl = main.createDiv('dfm-pc-grid');

        this.sizer = new ResizeObserver(() => { this.applyNavState(); this.updateTabsOverflow(); });
        this.sizer.observe(root);
        this.applyNavState();
        this.drawTabs();
        this.unsubscribe = this.board.store.subscribe(() => { this.requestDraw(); this.scheduleNav(300); });
        // A vista ficou ativa na página da Missão: o foco vem para ela (nunca de um campo).
        this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
            if (leaf === this.leaf && this.page.tela) window.setTimeout(() => this.missaoHost?.api.tomarFoco(), 0);
        }));
        this.queryScopeState = await this.board.queryScope('');
        this.drawGrid();
        this.scheduleNav(0);
    }

    async onClose(): Promise<void> {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.missaoHost?.destruir();
        this.missaoHost = null;
        if (this.paginaTimer !== null) { window.clearTimeout(this.paginaTimer); this.paginaTimer = null; this.gravarPagina(); }
        this.masonry.disconnect();
        this.sizer?.disconnect();
        this.sizer = null;
        if (this.packFrame !== null) window.cancelAnimationFrame(this.packFrame);
        if (this.navTimer !== null) window.clearTimeout(this.navTimer);
        if (this.saveTimer !== null) { window.clearTimeout(this.saveTimer); this.flushSave(); }
    }

    /* ------------------------------------------------------------ utilidades */

    /** O botão com rótulo: abaixo de 760 px o rótulo some, e a dica dá o nome (pelo mouse, teclado e toque). */
    private button(parent: HTMLElement, label: string, icon: string, onClick: (e: MouseEvent) => void, cls = 'dfm-bp-btn'): HTMLButtonElement {
        const btn = parent.createEl('button', { cls, attr: { type: 'button' } });
        setIcon(btn.createSpan('dfm-bp-btn-icon'), icon);
        btn.createSpan({ text: label, cls: 'dfm-bp-btn-label' });
        dica(btn, label);
        btn.addEventListener('click', onClick);
        return btn;
    }

    private iconButton(parent: HTMLElement, label: string, icon: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
        const btn = parent.createEl('button', { cls: 'dfm-bp-icon clickable-icon', attr: { type: 'button' } });
        setIcon(btn, icon);
        dica(btn, label);
        btn.addEventListener('click', event => { event.stopPropagation(); onClick(event); });
        return btn;
    }

    private openPath(path: string | null): void {
        if (path) this.board.openAny(path, undefined);
    }

    private save(): void {
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.flushSave(), 400);
    }

    private flushSave(): void {
        this.saveTimer = null;
        (this.plugin.settings as any).boardPanelLayout = layoutParaGravar(this.layout);
        void Promise.resolve(this.plugin.saveSettings()).catch(() => new Notice('⚠️ Não foi possível gravar o layout do painel.'));
    }

    /** Troca o layout; grava só a mudança de verdade (a aba ativa sozinha não vai ao `data.json`). */
    private setLayout(next: PanelLayoutState, redraw = true): void {
        const previous = this.layout;
        this.layout = next;
        if (precisaGravar(previous, next)) this.save();
        this.drawTabs();
        if (redraw) this.drawGrid(true);
    }

    private reread(): void {
        void this.board.store.refreshNow();
        this.board.missao.agendar();
        this.scheduleNav(0);
    }

    private navIsCollapsed(): boolean {
        return navRecolhida(this.rootEl?.clientWidth ?? 0, this.layout.navCollapsed, this.navGesto);
    }

    private applyNavState(): void {
        if (!this.rootEl) return;
        this.rootEl.toggleClass('is-nav-collapsed', this.navIsCollapsed());
    }

    /** O sinal de que há mais abas para o lado (o degradê na borda). */
    private updateTabsOverflow(): void {
        const el = this.tabsEl;
        if (!el || !this.tabsRowEl) return;
        const over = el.scrollWidth > el.clientWidth + 1;
        this.tabsRowEl.toggleClass('can-l', over && el.scrollLeft > 2);
        this.tabsRowEl.toggleClass('can-r', over && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    }

    /** ← → Home End nas abas: leva o foco e abre a página (a lista de abas do teclado). */
    private tabKey(event: KeyboardEvent): void {
        const target = abaPelaTecla(this.layout.pages.map(p => p.id), this.page.id, event.key);
        if (!target) return;
        event.preventDefault();
        this.selectPage(target);
        (this.tabsEl.querySelector(`[data-page="${target}"]`) as HTMLElement | null)?.focus();
    }

    /** Abre uma página: só na memória da vista (trocar de aba não grava o layout). */
    private selectPage(id: string): void {
        if (this.layout.activePage === id) return;
        this.setLayout({ ...this.layout, activePage: id });
    }

    private requestDraw(): void {
        // A Missão tem o leitor próprio: os avisos do quadro não a redesenham (§3.4).
        if (this.page.tela) return;
        if (this.gesture) { this.pendingDraw = true; return; }
        this.drawGrid();
    }

    private panelMenu(event: MouseEvent): void {
        const menu = new Menu();
        menu.addItem(i => i.setTitle('Nova página').setIcon('file-plus').onClick(() => this.promptNewPage()));
        menu.addItem(i => i.setTitle('Recolher o que a Missão já mostra…').setIcon('archive').onClick(() => this.conferirRecolher()));
        menu.addItem(i => i.setTitle('Agrupar as páginas em 5…').setIcon('layout-list').onClick(() => this.conferirAgrupamento()));
        menu.addItem(i => i.setTitle('Restaurar layout padrão').setIcon('rotate-ccw').onClick(() => {
            const previous = this.layout;
            this.setLayout(defaultPanelLayout());
            this.undoNotice('Layout padrão restaurado.', previous);
        }));
        menu.showAtMouseEvent(event);
    }

    /**
     * O Desfazer do layout entra na pilha única (`board.desfazer`, a mesma da Missão e das
     * setas do canvas): o aviso traz "Desfazer", e o ⌘Z da Missão também o alcança. Só desfaz
     * o que ainda está lá: as páginas e os cartões como o gesto os deixou, com a vista aberta.
     */
    private undoNotice(message: string, previous: PanelLayoutState): void {
        const after = JSON.stringify(this.layout.pages);
        this.board.desfazer.registrar({
            rotulo: message.replace(/\.$/, ''),
            desfazer: async () => {
                if (!this.containerEl.isConnected) return { feito: false, texto: `Nada a desfazer: o painel foi fechado (${message})` };
                if (JSON.stringify(this.layout.pages) !== after) return { feito: false, texto: `Nada a desfazer: o layout mudou depois (${message})` };
                this.setLayout(previous);
                return { feito: true, texto: `Desfeito: ${message}` };
            },
        });
    }

    /**
     * O que faz: a lista do Recolher no layout de agora (só lê): os cartões que a Missão já
     * mostra (§7), onde estão e o que ela mostra no lugar.
     */
    planoDoRecolher(): CartaoParaRecolher[] {
        return cartoesParaRecolher(this.layout);
    }

    /** O que faz: o agrupamento em 5 do layout de agora (só lê): as páginas, o catálogo, o que entra e sai. */
    planoDoAgrupamento(): Agrupamento {
        return agruparEmCinco(this.layout);
    }

    /**
     * O que faz: aplica o agrupamento conferido, como o botão "Agrupar" da lista: grava o layout
     * novo e registra o Desfazer exato na pilha única. Nada a mudar → `false`, sem gravar.
     * Entra → sai: o agrupamento (o de `planoDoAgrupamento`) → se aplicou.
     */
    aplicarAgrupamento(a: Agrupamento): boolean {
        if (a.igual) return false;
        const previous = this.layout;
        this.setLayout(a.layout);
        this.undoNotice('Páginas agrupadas em 5.', previous);
        return true;
    }

    /**
     * "Recolher o que a Missão já mostra" (§7): a lista, com cada cartão marcado (o operador
     * desmarca o que quer manter), e o Recolher só no clique, com uma entrada na pilha única
     * do Desfazer. Os cartões continuam no catálogo.
     */
    private conferirRecolher(): void {
        const lista = this.planoDoRecolher();
        if (!lista.length) { new Notice('Nada a recolher: nenhum dos cartões que a Missão já mostra está no layout.'); return; }
        const marcados = new Set(lista.map(c => c.id));
        new ConferirLayout(this.app, 'Recolher o que a Missão já mostra', el => {
            el.createEl('p', { text: `${lista.length} ${lista.length === 1 ? 'cartão' : 'cartões'} do layout mostram o que a Missão já mostra. Os marcados saem das páginas e continuam no catálogo (Adicionar). O aviso traz Desfazer.` });
            for (const c of lista) {
                const row = el.createEl('label', { cls: 'dfm-bp-lista-item' });
                const box = row.createEl('input', { attr: { type: 'checkbox' } });
                box.checked = true;
                box.addEventListener('change', () => { if (box.checked) marcados.add(c.id); else marcados.delete(c.id); });
                row.createSpan({ text: `${c.rotulo} · ${c.pagina}` });
                row.createSpan({ cls: 'dfm-bp-lista-nota', text: `na Missão: ${c.naMissao}` });
                if (c.aviso) row.createSpan({ cls: 'dfm-bp-lista-aviso', text: c.aviso });
            }
        }, 'Recolher', () => {
            const previous = this.layout;
            const next = recolher(previous, [...marcados]);
            if (next === previous) return;
            this.setLayout(next);
            const n = cartoesParaRecolher(previous).length - cartoesParaRecolher(next).length;
            this.undoNotice(`${n} ${n === 1 ? 'cartão recolhido' : 'cartões recolhidos'} (a Missão já mostra).`, previous);
        }).open();
    }

    /**
     * As páginas em cinco (aprovadas em 29/10/2026): o agrupamento proposto, para
     * conferir, e o clique aplica; o Desfazer volta ao layout de antes, exato.
     */
    private conferirAgrupamento(): void {
        const a = this.planoDoAgrupamento();
        if (a.igual) { new Notice('As páginas já estão agrupadas: nada a mudar.'); return; }
        new ConferirLayout(this.app, 'Agrupar as páginas em 5', el => {
            el.createEl('p', { text: 'Dentro de cada página, os cartões ficam na ordem do uso: Olhada → Plano → Durante → Fechar. Largura e altura de cada cartão ficam. O aviso traz Desfazer.' });
            for (const p of a.paginas) {
                el.createEl('h4', { text: p.cartoes.length || p.id !== 'missao' ? `${p.label} · ${p.cartoes.length}` : `${p.label} · a tela principal` });
                for (const c of p.cartoes) el.createDiv({ cls: 'dfm-bp-lista-item', text: `${ROTULO_DA_FASE[c.fase] ?? c.fase} · ${c.rotulo}${c.de !== p.label ? ` (de ${c.de})` : ''}` });
            }
            if (a.catalogo.length) {
                el.createEl('h4', { text: 'Para o catálogo' });
                for (const c of a.catalogo) el.createDiv({ cls: 'dfm-bp-lista-item', text: `${c.rotulo} (de ${c.de}): ${c.porque}` });
            }
            if (a.entram.length) el.createEl('p', { cls: 'dfm-bp-lista-nota', text: `Entra: ${a.entram.join(', ')}.` });
            if (a.saem.length) el.createEl('p', { cls: 'dfm-bp-lista-nota', text: `Deixam de existir as páginas ${a.saem.join(', ')} (os cartões delas foram para as cinco ou para o catálogo).` });
        }, 'Agrupar', () => { this.aplicarAgrupamento(a); }).open();
    }

    /* ---------------------------------------------------------------- abas */

    private get page() {
        return this.layout.pages.find(p => p.id === this.layout.activePage) ?? this.layout.pages[0];
    }

    private drawTabs(): void {
        const el = this.tabsEl;
        el.empty();
        for (const page of this.layout.pages) {
            const active = page.id === this.page.id;
            const tab = el.createEl('button', {
                cls: 'dfm-bp-tab',
                attr: { type: 'button', 'data-page': page.id, role: 'tab', 'aria-selected': String(active), tabindex: active ? '0' : '-1' },
            });
            if (active) tab.addClass('is-active');
            setIcon(tab.createSpan('dfm-bp-tab-icon'), page.icon);
            tab.createSpan({ text: page.label });
            if (page.cards.length) tab.createSpan({ cls: 'dfm-bp-tab-count', text: String(page.cards.length) });
            dica(tab, `${page.label}${page.cards.length ? ` · ${page.cards.length} ${page.cards.length === 1 ? 'cartão' : 'cartões'}` : ''} (duplo clique renomeia)`);
            tab.addEventListener('click', () => this.selectPage(page.id));
            tab.addEventListener('dblclick', () => this.promptRename(page.id, page.label));
            tab.addEventListener('contextmenu', e => {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem(i => i.setTitle('Renomear').setIcon('pencil').onClick(() => this.promptRename(page.id, page.label)));
                menu.addItem(i => i.setTitle('Mover para a esquerda').setIcon('arrow-left').onClick(() => this.setLayout(movePage(this.layout, page.id, -1))));
                menu.addItem(i => i.setTitle('Mover para a direita').setIcon('arrow-right').onClick(() => this.setLayout(movePage(this.layout, page.id, 1))));
                if (this.layout.pages.length > 1) {
                    menu.addItem(i => i.setTitle('Excluir página').setIcon('trash').onClick(() => {
                        const previous = this.layout;
                        this.setLayout(removePage(this.layout, page.id));
                        this.undoNotice(`Página "${page.label}" excluída.`, previous);
                    }));
                }
                menu.showAtMouseEvent(e);
            });
        }
        const add = el.createEl('button', { cls: 'dfm-bp-tab is-add', attr: { type: 'button', tabindex: '-1' } });
        setIcon(add, 'plus');
        dica(add, 'Nova página');
        add.addEventListener('click', () => this.promptNewPage());
        window.requestAnimationFrame(() => this.updateTabsOverflow());
    }

    private promptNewPage(): void {
        new TextPrompt(this.app, 'Nova página', 'Nova página', label => { if (label) this.setLayout(addPage(this.layout, label)); }).open();
    }

    private promptRename(pageId: string, current: string): void {
        new TextPrompt(this.app, 'Renomear página', current, label => { if (label) this.setLayout(renamePage(this.layout, pageId, label)); }).open();
    }

    /* ----------------------------------------------------------- catálogo */

    private openCatalog(): void {
        const page = this.page;
        const present = new Set(page.cards.filter(c => c.source.kind === 'painel').map(c => (c.source as any).id));
        const items: CatalogItem[] = [
            // A Missão não é cartão: é a primeira página (§3.4).
            ...BOARD_CATALOG.filter(e => e.kind !== 'projeto' && e.kind !== 'consulta' && e.kind !== 'missao')
                .map(e => ({ label: `Widget · ${e.label} — ${e.description}`, source: { kind: 'widget' as const, spec: { kind: e.kind } }, w: e.kind === 'numeros' ? 12 : 6 })),
            ...QUERY_PRESETS.map(p => ({ label: `Consulta · ${p.label.replace(' deste canvas', ' (vault)').replace(' neste canvas', ' (vault)')}`, source: { kind: 'widget' as const, spec: { ...p.spec, escopo: p.spec.escopo === 'canvas' ? 'vault' : p.spec.escopo } }, w: p.size.width > 600 ? 12 : 6 })),
            ...Object.entries(LEGACY_PANELS).filter(([id]) => !present.has(id) && this.hosted.has(id))
                .map(([id, meta]) => ({ label: `Visão · ${meta.label}`, source: { kind: 'painel' as const, id }, w: 6 })),
        ];
        new CardCatalog(this.app, items, item => {
            this.setLayout(addCard(this.layout, page.id, item.source, item.w));
            window.setTimeout(() => this.gridEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
        }).open();
    }

    /* -------------------------------------------------------------- grade */

    private actions(): BoardActions {
        return {
            open: (path, event) => this.board.openAny(path, event, '', event.metaKey || event.ctrlKey ? 'split' : 'tab'),
            hover: (path, event, target) => this.app.workspace.trigger('hover-link', {
                event, source: 'dfm-board', hoverParent: this, targetEl: target, linktext: path, sourcePath: '',
            }),
            complete: path => this.board.completeTask(path),
            habit: (path, date) => this.board.toggleHabit(path, date),
            reviewHabit: (path, event) => this.board.reviewHabit(path, event),
            project: name => this.board.projectCanvas?.factsFor(name) ?? null,
            protocols: this.board.protocolTools.actions(),
            scope: 'painel',
        };
    }

    /**
     * Desenha a grade. Sem mudança de forma (a mesma página, os mesmos cartões), não apaga
     * nada: cada cartão é desenhado à parte e só troca se o desenho mudou, e nunca com o
     * foco num campo dentro dele (proposta do Mission Control, 27/10/2026, item 4).
     * `force` refaz a grade inteira (troca de página, cartão novo, recolher, arrastar).
     */
    private drawGrid(force = false): void {
        if (!this.gridEl) return;
        this.pendingDraw = false;
        const snapshot = this.board.store.current();
        this.subEl?.setText(snapshot ? `${snapshot.today} · ${snapshot.week}` : 'Lendo o vault…');
        const page = this.page;
        if (page.tela) { this.showTela(); return; }
        this.telaMostrada = false;
        this.rootEl.removeClass('is-tela-missao');
        const shape = JSON.stringify([page.id, page.cards.map(c => [c.id, c.w, c.h, !!c.collapsed, c.source])]);
        if (!force && shape === this.drawnShape && page.cards.length > 0 && page.cards.every(c => this.drawn.has(c.id))) {
            this.refreshCards(snapshot);
            return;
        }
        this.drawnShape = shape;
        this.drawn.clear();
        const scrollTop = this.gridEl.parentElement?.scrollTop ?? 0;
        this.gridEl.empty();
        if (page.cards.length === 0) {
            const empty = this.gridEl.createDiv('dfm-pc-empty');
            empty.createDiv({ text: 'Página vazia.' });
            this.button(empty, 'Adicionar cartão', 'plus', () => this.openCatalog());
            return;
        }
        this.masonry.disconnect();
        for (const card of page.cards) this.drawCard(card, snapshot);
        for (const el of Array.from(this.gridEl.children) as HTMLElement[]) this.masonry.observe(el);
        this.masonry.observe(this.gridEl);
        this.packGrid();
        if (this.gridEl.parentElement) this.gridEl.parentElement.scrollTop = scrollTop;
    }

    /**
     * A página tela (a Missão): sem navegação nem grade, a região dela com a altura toda.
     * Monta uma vez; ao voltar à aba, a mesma Missão reaparece com o estado dela.
     */
    private showTela(): void {
        this.rootEl.addClass('is-tela-missao');
        this.drawnShape = '';
        if (!this.missaoHost) {
            // O jeito de ver volta como ficou (a escala, o Abrir tudo, o "Onde estou"), guardado no
            // aparelho (`saveLocalStorage`) e nunca no `data.json`; o foco é sempre o de hoje.
            let guardado: unknown = null;
            try { guardado = this.app.loadLocalStorage(CHAVE_DA_PAGINA); } catch { guardado = null; }
            // A chave antiga do ramo escolhido vale uma vez: volta gravada com a nova (30/10).
            const migrado = migrarChaveDoRamo(guardado);
            guardado = migrado.estado;
            if (migrado.migrou) { try { this.app.saveLocalStorage(CHAVE_DA_PAGINA, guardado); } catch (err) { console.warn('DFM Missão: o estado da página não foi regravado', err); } }
            this.missaoHost = montarNoLugar(this.board, this.app, this.missaoEl, {
                lugar: 'pagina',
                estado: estadoGuardado(guardado),
                abrirEmOutraAba: estado => void this.board.openMissao(estado),
                aoMudar: estado => this.guardarPagina(estadoParaGuardar(estado)),
            });
        } else {
            this.missaoHost.api.redimensionar();
        }
        // A página acabou de ser escolhida (e não um redesenho dela): o foco vem para a Missão.
        if (!this.telaMostrada && (this.app.workspace as any).activeLeaf === this.leaf) window.setTimeout(() => this.missaoHost?.api.tomarFoco(), 0);
        this.telaMostrada = true;
    }

    /** A página da Missão está à vista desde o último desenho (o foco só vem quando ela é escolhida). */
    private telaMostrada = false;

    private paginaTimer: number | null = null;
    private paginaGuardada = '';
    private paginaPendente: ReturnType<typeof estadoParaGuardar> | null = null;
    /** Guarda o jeito de ver da página, uma vez depois da rajada (600 ms), só quando mudou. */
    private guardarPagina(e: ReturnType<typeof estadoParaGuardar>): void {
        if (JSON.stringify(e) === this.paginaGuardada) return;
        this.paginaPendente = e;
        if (this.paginaTimer !== null) window.clearTimeout(this.paginaTimer);
        this.paginaTimer = window.setTimeout(() => { this.paginaTimer = null; this.gravarPagina(); }, 600);
    }
    private gravarPagina(): void {
        const e = this.paginaPendente;
        this.paginaPendente = null;
        if (!e) return;
        this.paginaGuardada = JSON.stringify(e);
        try { this.app.saveLocalStorage(CHAVE_DA_PAGINA, e); } catch (err) { console.warn('DFM Missão: o estado da página não foi guardado', err); }
    }

    /**
     * Redesenha só os cartões cujo desenho mudou. O cartão com o foco num campo espera o
     * foco sair; o texto digitado num campo que não tem o foco passa para o desenho novo.
     */
    private refreshCards(snapshot: ReturnType<MissionBoard['store']['current']>): void {
        let changed = false;
        for (const card of this.page.cards) {
            const drawn = this.drawn.get(card.id);
            if (!drawn || card.collapsed) continue;
            const body = drawn.el.querySelector(':scope > .dfm-pc-body') as HTMLElement | null;
            if (!body) continue;
            const active = drawn.el.ownerDocument.activeElement as HTMLElement | null;
            const typing = !!active && body.contains(active) && active.matches('input, textarea, select, [contenteditable="true"]');
            if (typing) {
                if (!drawn.el.dataset.waitFocus) {
                    drawn.el.dataset.waitFocus = '1';
                    drawn.el.addEventListener('focusout', () => {
                        delete drawn.el.dataset.waitFocus;
                        window.setTimeout(() => { if (!drawn.el.contains(drawn.el.ownerDocument.activeElement)) this.requestDraw(); }, 0);
                    }, { once: true });
                }
                continue;
            }
            const fresh = drawn.el.ownerDocument.createElement('div');
            fresh.className = 'dfm-pc-body';
            this.drawBody(fresh, card, snapshot);
            const html = fresh.innerHTML;
            if (!podeRedesenharCartao({ focoEmCampoDentro: false, desenhoMudou: html !== drawn.html })) continue;
            const before = Array.from(body.querySelectorAll('input, textarea')) as Array<HTMLInputElement | HTMLTextAreaElement>;
            const after = Array.from(fresh.querySelectorAll('input, textarea')) as Array<HTMLInputElement | HTMLTextAreaElement>;
            if (before.length === after.length) before.forEach((old, i) => { if (old.value && !after[i].value && old.type !== 'checkbox') after[i].value = old.value; });
            body.className = fresh.className;
            body.replaceChildren(...Array.from(fresh.childNodes));
            drawn.html = html;
            changed = true;
        }
        if (changed) this.packGrid();
    }

    private schedulePack(): void {
        if (this.packFrame !== null) return;
        this.packFrame = window.requestAnimationFrame(() => { this.packFrame = null; this.packGrid(); });
    }

    /**
     * Encaixe em mural, na ordem salva: cada cartão vai para as colunas onde
     * fica mais alto (empate: mais à esquerda) e ocupa só as linhas da sua
     * altura. O posicionamento automático da grade não faz isso — ele nunca põe
     * um cartão antes do anterior, e sobra vão embaixo de cartão baixo.
     */
    private packGrid(): void {
        if (!this.gridEl) return;
        const items = (Array.from(this.gridEl.children) as HTMLElement[])
            .filter(el => (el.classList.contains('dfm-pc-card') && !el.classList.contains('is-lifted')) || el.classList.contains('dfm-pc-placeholder'));
        // Altura natural: tira o esticamento antes de medir, senão o cartão
        // esticado seria medido esticado e cresceria a cada passada.
        for (const el of items) el.removeClass('is-stretched');
        // Força o layout: as colunas vêm de container query, que só se resolve com ele.
        void this.gridEl.getBoundingClientRect();
        const cols = Math.max(1, getComputedStyle(this.gridEl).gridTemplateColumns.split(' ').filter(Boolean).length);
        const spans = items.map(el => {
            const w = Number(el.style.getPropertyValue('--w')) || 6;
            const w6 = Number(el.style.getPropertyValue('--w6')) || spanAt6(w);
            return Math.min(cols, cols >= GRID_COLUMNS ? w : cols === 1 ? 1 : w6);
        });
        // A altura depende da largura: primeiro cada cartão ganha a largura da
        // coluna atual (sem posição, sem linhas), só então se mede.
        items.forEach((el, i) => { el.style.gridColumn = `span ${spans[i]}`; el.style.gridRow = 'auto'; });
        const heights = items.map(el => el.classList.contains('dfm-pc-placeholder')
            ? parseFloat(el.style.height) || el.getBoundingClientRect().height
            : el.getBoundingClientRect().height);
        const places = packMasonry(items.map((el, i) => ({
            span: spans[i],
            rows: Math.ceil((heights[i] + MASONRY_GAP) / MASONRY_ROW),
            stretchable: !el.classList.contains('dfm-pc-placeholder') && !el.classList.contains('has-height') && !el.classList.contains('is-collapsed'),
        })), cols);
        items.forEach((el, i) => {
            const p = places[i];
            el.style.gridColumn = `${p.col} / span ${p.span}`;
            el.style.gridRow = `${p.row} / span ${p.rows}`;
            el.toggleClass('is-stretched', p.stretched);
        });
    }

    private widgetLabel = (kind: string) => BOARD_CATALOG.find(e => e.kind === kind)?.label ?? kind;

    private drawCard(card: PanelCard, snapshot: ReturnType<MissionBoard['store']['current']>): void {
        const el = this.gridEl.createDiv('dfm-pc-card');
        el.dataset.id = card.id;
        el.style.setProperty('--w', String(card.w));
        el.style.setProperty('--w6', String(spanAt6(card.w)));
        if (card.h) el.style.setProperty('--h', `${card.h}px`);
        el.toggleClass('has-height', !!card.h);
        el.toggleClass('is-collapsed', !!card.collapsed);
        el.toggleClass('is-legacy', card.source.kind === 'painel');

        const head = el.createDiv('dfm-pc-head');
        const grip = head.createDiv({ cls: 'dfm-pc-grip', attr: { tabindex: '0', role: 'button', 'aria-label': `Mover ${cardLabel(card, this.widgetLabel)} (Alt+setas)`, title: 'Arrastar para mover (solte numa aba para mudar de página)' } });
        setIcon(grip, 'grip-vertical');
        grip.addEventListener('pointerdown', e => this.startDrag(e, el, card));
        grip.addEventListener('keydown', e => this.keyMove(e, card));
        head.createDiv({ cls: 'dfm-pc-title', text: cardLabel(card, this.widgetLabel) });
        const tools = head.createDiv('dfm-pc-tools');
        this.iconButton(tools, 'Largura e altura', 'move-horizontal', e => this.sizeMenu(e, card));
        this.iconButton(tools, card.collapsed ? 'Expandir' : 'Recolher', card.collapsed ? 'chevron-down' : 'chevron-up', () => this.setLayout(updateCard(this.layout, card.id, { collapsed: !card.collapsed })));
        this.iconButton(tools, 'Remover do painel', 'x', () => {
            const previous = this.layout;
            this.setLayout(removeCard(this.layout, card.id));
            this.undoNotice(`"${cardLabel(card, this.widgetLabel)}" removido.`, previous);
        });

        const body = el.createDiv('dfm-pc-body');
        if (!card.collapsed) this.drawBody(body, card, snapshot);
        this.drawn.set(card.id, { el, html: body.innerHTML });

        const resize = el.createDiv({ cls: 'dfm-pc-resize', attr: { title: 'Arrastar: largura e altura · duplo clique: altura automática' } });
        resize.addEventListener('pointerdown', e => this.startResize(e, el, card));
        resize.addEventListener('dblclick', () => this.setLayout(resizeCard(this.layout, card.id, { h: null })));
    }

    private drawBody(body: HTMLElement, card: PanelCard, snapshot: ReturnType<MissionBoard['store']['current']>): void {
        try {
            if (card.source.kind === 'painel') {
                body.addClass('dfm-mission-control', 'dfm-pc-legacy');
                if (!snapshot) { body.createDiv({ cls: 'dfm-pc-loading', text: 'Lendo o vault…' }); return; }
                if (!this.hosted.renderPanel(card.source.id, body, snapshot)) body.createDiv({ cls: 'dfm-pc-loading', text: `Visão "${card.source.id}" não existe mais.` });
                return;
            }
            const spec = { limite: BOARD_CATALOG.find(e => e.kind === (card.source as any).spec.kind)?.defaultLimit ?? 8, ...card.source.spec } as any;
            const host = body.createDiv();
            if (spec.kind === 'consulta') {
                const scope = this.queryScopeState;
                renderConsulta(host, spec, scope ? evaluateQuery(spec, this.board.tasks.all(), scope) : null, this.actions(), scope?.today ?? '');
            } else {
                renderBoardWidget(host, spec, snapshot, this.actions());
            }
        } catch (error) {
            console.error('DFM Painel: cartão falhou ao desenhar', card, error);
            body.createDiv({ cls: 'dfm-pc-loading', text: 'Este cartão falhou ao desenhar (detalhes no console).' });
        }
    }

    private sizeMenu(event: MouseEvent, card: PanelCard): void {
        const menu = new Menu();
        for (const [w, label] of WIDTHS) {
            menu.addItem(i => i.setTitle(`Largura ${label}`).setChecked(card.w === w).onClick(() => this.setLayout(resizeCard(this.layout, card.id, { w }))));
        }
        menu.addSeparator();
        menu.addItem(i => i.setTitle('Altura automática').setChecked(!card.h).onClick(() => this.setLayout(resizeCard(this.layout, card.id, { h: null }))));
        for (const h of [240, 360, 480, 640]) {
            menu.addItem(i => i.setTitle(`Altura ${h}px`).setChecked(card.h === h).onClick(() => this.setLayout(resizeCard(this.layout, card.id, { h }))));
        }
        if (this.layout.pages.length > 1) {
            menu.addSeparator();
            for (const p of this.layout.pages.filter(p => p.id !== this.page.id)) {
                menu.addItem(i => i.setTitle(`Mover para "${p.label}"`).setIcon('corner-up-right').onClick(() => this.setLayout(moveCard(this.layout, card.id, p.id, Infinity))));
            }
        }
        menu.showAtMouseEvent(event);
    }

    /* -------------------------------------------------------- arrastar */

    /**
     * Arrastar um cartão pela alça.
     *
     * O cartão sai do fluxo e segue o ponteiro (fantasma, sem receber eventos);
     * um espaço reservado do mesmo tamanho marca onde ele vai cair e é a única
     * coisa que anda na grade — por isso os vizinhos não ficam trocando de lugar.
     * Soltar numa aba muda o cartão de página; Esc cancela; perto da borda de
     * cima ou de baixo a área rola sozinha.
     */
    private startDrag(event: PointerEvent, el: HTMLElement, card: PanelCard): void {
        if (event.button !== 0) return;
        event.preventDefault();
        const grip = event.currentTarget as HTMLElement;
        const doc = el.ownerDocument;
        const win = doc.defaultView ?? window;
        const startX = event.clientX, startY = event.clientY;
        const before = Array.from(this.gridEl.children).map(c => (c as HTMLElement).dataset.id).filter(Boolean);
        let started = false;
        let placeholder: HTMLElement | null = null;
        let offset = { x: 0, y: 0 };
        let targetPage: string | null = null;
        let lastPointer = { x: startX, y: startY };
        let scrollFrame: number | null = null;
        try { grip.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }

        const scroller = (): HTMLElement | null => {
            const main = this.gridEl.closest('.dfm-bp-main') as HTMLElement | null;
            if (main && main.scrollHeight > main.clientHeight + 1 && getComputedStyle(main).overflowY !== 'visible') return main;
            return this.gridEl.closest('.dfm-bp-body') as HTMLElement | null;
        };

        const begin = () => {
            started = true;
            this.gesture = true;
            const r = el.getBoundingClientRect();
            offset = { x: startX - r.left, y: startY - r.top };
            placeholder = doc.createElement('div');
            placeholder.className = 'dfm-pc-placeholder';
            placeholder.style.setProperty('--w', el.style.getPropertyValue('--w'));
            placeholder.style.setProperty('--w6', el.style.getPropertyValue('--w6'));
            placeholder.style.height = `${r.height}px`;
            this.gridEl.insertBefore(placeholder, el);
            this.packGrid();
            el.addClass('is-lifted');
            el.style.width = `${r.width}px`;
            el.style.height = `${r.height}px`;
            this.gridEl.addClass('is-sorting');
            follow(startX, startY);
            autoScroll();
        };

        const follow = (x: number, y: number) => {
            el.style.left = `${x - offset.x}px`;
            el.style.top = `${y - offset.y}px`;
        };

        const place = (x: number, y: number) => {
            const under = doc.elementFromPoint(x, y) as HTMLElement | null;
            const tab = under?.closest?.('.dfm-bp-tab:not(.is-add)') as HTMLElement | null;
            this.tabsEl.querySelectorAll('.is-drop').forEach(t => t.removeClass('is-drop'));
            targetPage = tab && tab.dataset.page !== this.page.id ? tab.dataset.page ?? null : null;
            if (targetPage) { tab!.addClass('is-drop'); return; }
            if (!placeholder) return;
            const target = under?.closest?.('.dfm-pc-card') as HTMLElement | null;
            if (target && target !== el && target.parentElement === this.gridEl) {
                const r = target.getBoundingClientRect();
                const oneColumn = getComputedStyle(this.gridEl).gridTemplateColumns.split(' ').filter(Boolean).length === 1;
                const after = oneColumn ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
                const ref = after ? target.nextSibling : target;
                if (ref !== placeholder && ref !== placeholder.nextSibling) { this.gridEl.insertBefore(placeholder, ref); this.packGrid(); }
                return;
            }
            // Abaixo do último cartão: vai para o fim.
            const cards = Array.from(this.gridEl.querySelectorAll(':scope > .dfm-pc-card:not(.is-lifted)')) as HTMLElement[];
            const last = cards[cards.length - 1];
            if (last && y > last.getBoundingClientRect().bottom && this.gridEl.lastElementChild !== placeholder) { this.gridEl.appendChild(placeholder); this.packGrid(); }
        };

        const autoScroll = () => {
            if (!started) return;
            const box = scroller();
            if (box) {
                const r = box.getBoundingClientRect();
                const edge = 56;
                const dy = lastPointer.y < r.top + edge ? -Math.ceil((r.top + edge - lastPointer.y) / 4)
                    : lastPointer.y > r.bottom - edge ? Math.ceil((lastPointer.y - (r.bottom - edge)) / 4) : 0;
                if (dy) { box.scrollTop += dy; place(lastPointer.x, lastPointer.y); }
            }
            scrollFrame = win.requestAnimationFrame(autoScroll);
        };

        const move = (ev: PointerEvent) => {
            lastPointer = { x: ev.clientX, y: ev.clientY };
            if (!started) {
                if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
                begin();
            }
            follow(ev.clientX, ev.clientY);
            place(ev.clientX, ev.clientY);
        };

        const finish = (cancel: boolean) => {
            doc.removeEventListener('pointermove', move);
            doc.removeEventListener('pointerup', up);
            doc.removeEventListener('pointercancel', cancelled);
            doc.removeEventListener('keydown', key, true);
            try { grip.releasePointerCapture(event.pointerId); } catch { /* já solto */ }
            if (scrollFrame !== null) win.cancelAnimationFrame(scrollFrame);
            if (!started) return;
            el.removeClass('is-lifted');
            el.style.removeProperty('left');
            el.style.removeProperty('top');
            el.style.removeProperty('width');
            el.style.removeProperty('height');
            if (placeholder) {
                if (!cancel) this.gridEl.insertBefore(el, placeholder);
                placeholder.remove();
            }
            this.packGrid();
            this.gridEl.removeClass('is-sorting');
            this.tabsEl.querySelectorAll('.is-drop').forEach(t => t.removeClass('is-drop'));
            this.gesture = false;
            if (cancel) { this.drawGrid(true); return; }
            if (targetPage) {
                const page = targetPage;
                this.setLayout(moveCard(this.layout, card.id, page, Infinity));
                new Notice(`Cartão movido para "${this.layout.pages.find(p => p.id === page)?.label}".`);
                return;
            }
            const after = Array.from(this.gridEl.children).map(c => (c as HTMLElement).dataset.id).filter((id): id is string => !!id);
            if (after.join() !== before.join()) this.setLayout(reorderPage(this.layout, this.page.id, after), false);
            if (this.pendingDraw) this.drawGrid();
        };
        const up = () => finish(false);
        const cancelled = () => finish(true);
        const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(true); } };

        doc.addEventListener('pointermove', move);
        doc.addEventListener('pointerup', up);
        doc.addEventListener('pointercancel', cancelled);
        doc.addEventListener('keydown', key, true);
    }

    private keyMove(event: KeyboardEvent, card: PanelCard): void {
        if (!event.altKey) return;
        const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
        if (!delta) return;
        event.preventDefault();
        const index = this.page.cards.findIndex(c => c.id === card.id);
        this.setLayout(moveCard(this.layout, card.id, this.page.id, index + delta));
        window.setTimeout(() => (this.gridEl.querySelector(`[data-id="${card.id}"] .dfm-pc-grip`) as HTMLElement | null)?.focus(), 0);
    }

    /* ---------------------------------------------------- redimensionar */

    private startResize(event: PointerEvent, el: HTMLElement, card: PanelCard): void {
        if (event.button !== 0) return;
        event.preventDefault();
        this.gesture = true;
        el.addClass('is-resizing');
        const doc = el.ownerDocument;
        const handle = event.currentTarget as HTMLElement;
        try { handle.setPointerCapture(event.pointerId); } catch { /* ponteiro sintético */ }
        const start = { x: event.clientX, y: event.clientY, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height };
        const style = getComputedStyle(this.gridEl);
        const cols = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
        const gap = parseFloat(style.columnGap) || 16;
        const colW = (this.gridEl.getBoundingClientRect().width - gap * (cols - 1)) / cols;
        let w = card.w;
        let h: number | null = card.h;

        const move = (ev: PointerEvent) => {
            if (cols > 1) {
                const span = Math.max(1, Math.min(cols, Math.round((start.width + ev.clientX - start.x + gap) / (colW + gap))));
                w = Math.round(span * (GRID_COLUMNS / cols));
                el.style.setProperty('--w', String(Math.min(GRID_COLUMNS, w)));
                el.style.setProperty('--w6', String(spanAt6(w)));
            }
            h = Math.max(MIN_H, Math.round(start.height + ev.clientY - start.y));
            el.style.setProperty('--h', `${h}px`);
            el.addClass('has-height');
            this.packGrid();
        };
        const up = () => {
            doc.removeEventListener('pointermove', move);
            doc.removeEventListener('pointerup', up);
            doc.removeEventListener('pointercancel', up);
            el.removeClass('is-resizing');
            this.gesture = false;
            this.setLayout(resizeCard(this.layout, card.id, { w, h }), false);
            if (this.pendingDraw) this.drawGrid();
        };
        doc.addEventListener('pointermove', move);
        doc.addEventListener('pointerup', up);
        doc.addEventListener('pointercancel', up);
    }

    /* -------------------------------------------------------- navegação */

    private scheduleNav(delay: number): void {
        if (this.navTimer !== null) window.clearTimeout(this.navTimer);
        this.navTimer = window.setTimeout(() => {
            this.navTimer = null;
            void this.board.navInput().then(input => { this.nav = buildNav(input); this.drawNav(); })
                .catch(error => console.error('DFM Painel: falha ao montar navegação', error));
        }, delay);
    }

    private row(parent: HTMLElement, icon: string, title: string, sub: string, tone?: string): HTMLElement {
        const row = parent.createDiv('dfm-bp-row');
        if (tone) row.setAttribute('data-tone', tone);
        setIcon(row.createDiv('dfm-bp-row-icon'), icon);
        const text = row.createDiv('dfm-bp-row-text');
        text.createDiv({ cls: 'dfm-bp-row-title', text: title });
        if (sub) text.createDiv({ cls: 'dfm-bp-row-sub', text: sub });
        return row.createDiv('dfm-bp-row-actions');
    }

    private drawNav(): void {
        const el = this.navEl;
        const nav = this.nav;
        if (!el) return;
        el.empty();
        if (!nav) { el.createDiv({ cls: 'dfm-bp-empty', text: 'Lendo o vault…' }); return; }
        const pc = this.board.projectCanvas;

        const time = el.createDiv('dfm-bp-section');
        time.createDiv({ cls: 'dfm-bp-section-title', text: 'Tempo' });
        const lt = nav.time.longTerm;
        const ltAct = this.row(time, 'telescope', 'Longo prazo', lt.label);
        if (lt.canvas) this.iconButton(ltAct, 'Abrir canvas', 'layout-dashboard', () => this.openPath(lt.canvas));
        if (lt.note) this.iconButton(ltAct, 'Abrir nota', 'file-text', () => this.openPath(lt.note));

        const q = nav.time.quarter;
        // O canvas do trimestre se aposentou em 02/11/2026: o trimestre abre na Missão (as 14 semanas, as SMART).
        const qAct = this.row(time, 'calendar-range', `Trimestre ${q.id}`, q.note ? 'na Missão' : 'nota do trimestre não criada', q.note ? undefined : 'muted');
        const qPorta = portaDoPeriodo(q.id);
        if (qPorta) this.iconButton(qAct, 'Abrir na Missão', 'compass', () => void this.board.abrirMissaoNoPeriodo(qPorta));
        if (q.note) this.iconButton(qAct, 'Abrir nota', 'file-text', () => this.openPath(q.note));

        const f = nav.time.focus;
        // A forma de mostrar da semana (a função única), a mesma da célula do trimestre.
        const fAct = this.row(time, 'compass', f.label, f.grammar, f.note ? undefined : 'warn');
        const fPorta = portaDoPeriodo(f.week);
        if (fPorta) this.iconButton(fAct, 'Abrir na Missão', 'compass', () => void this.board.abrirMissaoNoPeriodo(fPorta));
        if (f.note) this.iconButton(fAct, 'Abrir nota da semana', 'file-text', () => this.openPath(f.note));
        // A semana da linha vai junto: sem ela, o alvo saía do relógio (de sexta a domingo,
        // a semana seguinte) ou da Week/canvas ativo, e a linha seguia "nota não criada".
        // O 🌳 pelo papel: sem protocolo para planejar a semana, o botão não aparece (D1 do mapa da v0).
        else if (this.board.idDoPapel('planejar_semana')) this.iconButton(fAct, `Planejar a ${f.week}`, 'calendar-plus', () => void this.board.runPapel('planejar_semana', { _target_week_pin: f.week }));

        const d = nav.time.day;
        const dAct = this.row(time, 'sun', `Hoje · ${d.date}`, d.comando ? `Comando: ${d.comando}` : 'Comando do Dia não definido', d.comando ? undefined : 'warn');
        // A data vai junto: com a nota da semana (ou outra) ativa, o ▶️ ainda é o de hoje.
        if (this.board.idDoPapel('abrir_dia')) this.iconButton(dAct, 'Comando do Dia', 'crosshair', () => void this.board.runPapel('abrir_dia', { _context_date: d.date }));
        if (d.note) this.iconButton(dAct, 'Abrir nota do dia', 'file-text', () => this.openPath(d.note));

        // A Temporada (25/10/2026): as centrais do trimestre e, sob cada uma, os
        // auxiliares que a apontam em `projects`, com a mesma linha de projeto da lista.
        if (nav.temporada.length) {
            const season = el.createDiv('dfm-bp-section');
            season.createDiv({ cls: 'dfm-bp-section-title', text: `Temporada · ${nav.temporada.length}` });
            for (const t of nav.temporada) {
                if (t.central) this.projectRow(season, t.central, 'star');
                else this.row(season, 'star', t.name, 'não está no portfólio: confira o nome na nota do trimestre', 'warn');
                if (t.auxiliares.length === 0) continue;
                const list = season.createDiv('dfm-bp-sublist');
                for (const aux of t.auxiliares) this.projectRow(list, aux);
            }
        }

        const p = nav.pending;
        const pendingCount = p.orphans.length + p.orphanSmarts.length + p.staleSmarts.length + p.missingCanvas.length;
        const org = el.createDiv('dfm-bp-section');
        org.createDiv({ cls: 'dfm-bp-section-title', text: pendingCount ? `Organizar · ${pendingCount}` : 'Organizar' });
        if (pendingCount === 0) org.createDiv({ cls: 'dfm-bp-empty', text: 'Nada pendente: toda ação tem casa, nenhuma SMART ficou para trás.' });
        if (p.orphans.length) {
            const a = this.row(org, 'unlink', `${p.orphans.length} ações sem vínculo`, 'Sem projeto ou SMART: ficam fora dos canvas de projeto; com semana, só em "Outros" na grade dela.', 'warn');
            this.button(a, 'Triar', 'list-checks', () => {
                const names = (this.nav?.areas ?? []).flatMap(x => x.projects.map(pp => pp.name)).sort((x, y) => x.localeCompare(y, 'pt-BR'));
                new TriageModal(this.app, this.board, p.orphans, names).open();
            }, 'dfm-bp-btn mod-small');
        }
        if (p.orphanSmarts.length) {
            const a = this.row(org, 'unlink', `${p.orphanSmarts.length} SMART sem projeto`, 'Sem projeto (ou ligada a um que não existe): fica fora dos canvas de projeto e do "quanto falta".', 'warn');
            this.button(a, 'Triar', 'list-checks', () => {
                const names = (this.nav?.areas ?? []).flatMap(x => x.projects.map(pp => pp.name)).sort((x, y) => x.localeCompare(y, 'pt-BR'));
                new TriageModal(this.app, this.board, p.orphanSmarts, names).open();
            }, 'dfm-bp-btn mod-small');
        }
        if (p.staleSmarts.length) {
            const a = this.row(org, 'history', `${p.staleSmarts.length} SMART de semanas passadas`, 'Abertas depois que a semana acabou. Feche, traga ou cancele.', 'warn');
            this.button(a, this.showStale ? 'Ocultar' : 'Ver', this.showStale ? 'chevron-up' : 'chevron-down', () => { this.showStale = !this.showStale; this.drawNav(); }, 'dfm-bp-btn mod-small');
            if (this.showStale) {
                const list = org.createDiv('dfm-bp-sublist');
                const week = (window as any).moment?.().format('GGGG-[W]WW');
                for (const s of p.staleSmarts) {
                    const item = list.createDiv('dfm-bp-subitem');
                    const link = item.createEl('a', { cls: 'dfm-bp-subitem-title', text: s.title, href: '#' });
                    link.addEventListener('click', e => { e.preventDefault(); void this.board.openTask(s.path, e); });
                    item.createSpan({ cls: 'dfm-bp-chip', text: s.week });
                    const acts = item.createDiv('dfm-bp-row-actions');
                    this.iconButton(acts, 'Concluir', 'check-circle', () => void this.board.completeTask(s.path));
                    if (week) this.iconButton(acts, `Trazer para ${week}`, 'calendar-plus', () => void this.board.updateTask(s.path, { week }));
                    this.iconButton(acts, 'Cancelar', 'x-circle', () => void this.board.setStatus(s.path, 'cancelled'));
                }
            }
        }
        if (p.missingCanvas.length && pc) {
            const a = this.row(org, 'layout-dashboard', `${p.missingCanvas.length} projetos sem canvas`, p.missingCanvas.slice(0, 3).join(', ') + (p.missingCanvas.length > 3 ? '…' : ''));
            this.button(a, 'Criar', 'plus', () => void pc.createMissing(), 'dfm-bp-btn mod-small');
        }

        const space = el.createDiv('dfm-bp-section');
        space.createDiv({ cls: 'dfm-bp-section-title', text: 'Projetos' });
        for (const area of nav.areas) {
            const details = space.createEl('details', { cls: 'dfm-bp-area' });
            if (this.openAreas.has(area.area) || nav.areas.length === 1) details.open = true;
            details.addEventListener('toggle', () => { if (details.open) this.openAreas.add(area.area); else this.openAreas.delete(area.area); });
            const active = area.projects.filter(x => /^2/.test(x.stage)).length;
            details.createEl('summary', { text: `${area.area} · ${area.projects.length}${active ? ` (${active} ativos)` : ''}` });
            for (const project of area.projects) this.projectRow(details, project);
        }
    }

    private projectRow(parent: HTMLElement, project: ProjectNav, icon?: string): void {
        const stage = project.stage.replace(/^\d+\s*-\s*/, '');
        // A forma de mostrar do projeto no trimestre (a mesma do canvas); o que organizar vem depois.
        const counts = [
            project.grammar,
            project.loose && `${project.loose} sem SMART`,
            project.overdue && `${project.overdue} vencidas`,
        ].filter(Boolean).join(' · ');
        const acts = this.row(parent, icon ?? (project.canvasExists ? 'layout-dashboard' : 'square-dashed'), project.name, `${stage} · ${counts}`, project.overdue ? 'bad' : undefined);
        const pc = this.board.projectCanvas;
        if (!pc) return;
        const find = async () => (await pc.projects()).find(x => fold(x.name) === fold(project.name));
        // Repositório git próprio: o canvas mora na área (`100 - AREAS/<área>/Canvases/`), fora do repositório.
        if (project.submodule && !project.canvasExists) acts.createSpan({ cls: 'dfm-bp-chip', text: 'repositório próprio' });
        const createLabel = project.submodule ? 'Criar canvas na área' : 'Criar canvas';
        this.iconButton(acts, project.canvasExists ? 'Abrir canvas' : createLabel, project.canvasExists ? 'arrow-up-right' : 'plus', async () => {
            const p = await find();
            if (p) await pc.openOrCreate(p);
            else new Notice(`${project.name} não está no portfólio.`);
        });
        if (project.canvasExists) {
            this.iconButton(acts, 'Sincronizar', 'refresh-cw', async () => { const p = await find(); if (p) await pc.sync(p, { notify: true }); });
        }
    }
}

