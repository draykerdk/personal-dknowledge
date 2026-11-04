/**
 * O layout do painel do Mission Control: páginas (abas) de cartões numa grade.
 *
 * Um cartão é um widget do quadro (`dfm-widget`, inclusive consultas) ou uma
 * das visões do console antigo (captura, fábrica de notas, mapa, kanban,
 * portfólio, bancada…), hospedada como está. Largura em colunas de uma grade de
 * 12; altura em pixels ou automática. Arrastar, redimensionar, adicionar e
 * remover mexem só aqui, e o layout é gravado nas configurações do plugin.
 *
 * Módulo puro: sem Obsidian, sem DOM.
 */
import type { BoardWidgetSpec } from './boardSpec';

export type CardSource =
    | { kind: 'widget'; spec: Partial<BoardWidgetSpec> & { kind: BoardWidgetSpec['kind'] } }
    | { kind: 'painel'; id: string };

export interface PanelCard {
    id: string;
    source: CardSource;
    /** Colunas ocupadas na grade de 12. */
    w: number;
    /** Altura em px; `null` = cresce com o conteúdo. */
    h: number | null;
    collapsed?: boolean;
}

/**
 * Uma página do painel. Com `tela`, a página não é grade de cartões: é a vista inteira de
 * um componente (a Missão, arquitetura de 27/10/2026, §3.4), sem navegação nem cartões.
 */
export interface PanelPage { id: string; label: string; icon: string; cards: PanelCard[]; tela?: PanelTela }

/** As telas que uma página pode ser (hoje, só a Missão). */
export type PanelTela = 'missao';
export const TELAS: readonly PanelTela[] = ['missao'];

export interface PanelLayoutState {
    version: 1;
    pages: PanelPage[];
    navCollapsed: boolean;
    activePage: string;
}

export const GRID_COLUMNS = 12;
export const MIN_W = 3;
export const MIN_H = 120;
export const MAX_H = 2000;

/** As visões do console antigo, com o nome que aparece no catálogo. */
export const LEGACY_PANELS: Record<string, { label: string; icon: string }> = {
    capture: { label: 'Captura rápida', icon: 'inbox' },
    noteFactory: { label: 'Criar nota a partir de modelo', icon: 'file-plus' },
    intent: { label: 'Agora (intenção)', icon: 'zap' },
    day: { label: 'Dia (comando do dia)', icon: 'sun' },
    planPressure: { label: 'Pressão do plano', icon: 'gauge' },
    pressure: { label: 'Pressão', icon: 'activity' },
    drift: { label: 'Intenção e comportamento', icon: 'wind' },
    inbox: { label: 'Inbox', icon: 'inbox' },
    triage: { label: 'Triagem da inbox', icon: 'filter' },
    plan: { label: 'Plano da semana', icon: 'calendar-range' },
    matrix: { label: 'Matriz de ação', icon: 'layout-grid' },
    timeline: { label: 'Linha do tempo', icon: 'gantt-chart' },
    radar: { label: 'Radar do trimestre', icon: 'radar' },
    habits: { label: 'Rotinas (hábitos)', icon: 'flame' },
    funnel: { label: 'A escolha', icon: 'filter' },
    week: { label: 'Semana (ciclo)', icon: 'calendar-days' },
    waiting: { label: 'Esperando terceiros', icon: 'hourglass' },
    protocols: { label: 'Protocolos DFM', icon: 'list-checks' },
    mapModes: { label: 'Modos do mapa', icon: 'toggle-left' },
    missionGraph: { label: 'Grafo da missão', icon: 'git-fork' },
    map: { label: 'Mapa de canvas', icon: 'map' },
    portfolioBoard: { label: 'Quadro de projetos', icon: 'folder-kanban' },
    kanban: { label: 'Kanban de tarefas', icon: 'columns-3' },
    portfolioActions: { label: 'Movimentar projeto', icon: 'move' },
    projects: { label: 'Projetos por tarefa', icon: 'folders' },
    trees: { label: 'Árvores de progressão', icon: 'network' },
    portfolioCompliance: { label: 'Conformidade do portfólio', icon: 'shield-check' },
    areas: { label: 'Áreas e ciclo de vida', icon: 'layers' },
    canvasTools: { label: 'Ferramentas de canvas', icon: 'wrench' },
    canvases: { label: 'Canvas do vault', icon: 'layout-dashboard' },
    quarter: { label: 'Trimestre (ciclo)', icon: 'calendar-range' },
    operatorCard: { label: 'Operador DSH', icon: 'bot' },
    bench: { label: 'Bancada DFM', icon: 'shield-check' },
    integrity: { label: 'Integridade', icon: 'check-circle' },
};

let seq = 0;
export function cardId(prefix = 'c'): string {
    seq = (seq + 1) % 1e6;
    return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

const legacy = (id: string, w: number, h: number | null = null): PanelCard => ({ id: `p-${id}`, source: { kind: 'painel', id }, w, h });
const widget = (id: string, spec: Extract<CardSource, { kind: 'widget' }>['spec'], w: number, h: number | null = null): PanelCard => ({ id: `w-${id}`, source: { kind: 'widget', spec }, w, h });

/**
 * O que faz: o layout de partida, o mesmo que "Restaurar layout padrão" põe de volta: as
 * cinco páginas aprovadas em 29/10 (commit `0827bbee`), Missão · Projetos · Análise ·
 * Protocolos · Sistema, com os cartões, a ordem e as larguras do layout do dono depois do
 * agrupamento.
 * Por quê: o de partida ainda era o das 11 páginas do console antigo; restaurar trazia de
 * volta as páginas aposentadas (Início, Hoje, Plano, Rotinas, Executar, Mapa, Ferramentas) e
 * os cartões que a Missão já mostra. O que saiu do layout continua no catálogo de cartões.
 * Entra → sai: nada → um layout novo a cada chamada (quem recebe pode mudar à vontade).
 * Erro e ataque: o cartão "vitals" do layout gravado não entra (não há visão com esse nome, e a
 * conferência do salvo já o tira); a Missão é a primeira e a de abrir.
 * Prova: tests/board/panelLayout.test.ts ("layout do painel: partida").
 */
export function defaultPanelLayout(): PanelLayoutState {
    return {
        version: 1,
        navCollapsed: false,
        activePage: MISSAO_PAGE_ID,
        pages: [
            missaoPage(),
            {
                id: 'projetos', label: 'Projetos', icon: 'folder-kanban', cards: [
                    widget('projetos', { kind: 'projetos' }, 6),
                    legacy('portfolioBoard', 12), legacy('trees', 6), legacy('areas', 12), legacy('portfolioActions', 8),
                    legacy('kanban', 12), legacy('projects', 6), legacy('portfolioCompliance', 4),
                ],
            },
            {
                id: 'analise', label: 'Análise', icon: 'bar-chart-3', cards: [
                    widget('numeros', { kind: 'numeros' }, 12), widget('habitos', { kind: 'habitos' }, 6),
                    legacy('funnel', 8), legacy('matrix', 4), legacy('habits', 12), legacy('waiting', 6),
                ],
            },
            {
                id: PROTOCOLS_PAGE_ID, label: 'Protocolos', icon: 'workflow', cards: [
                    widget('pr-saude', { kind: 'protocolos-saude' }, 12),
                    widget('pr-avisos', { kind: 'protocolos-avisos' }, 4),
                    widget('pr-mapa', { kind: 'protocolos-mapa' }, 8),
                    widget('pr-catalogo', { kind: 'protocolos-catalogo' }, 8),
                    widget('pr-ferramentas', { kind: 'protocolos-ferramentas' }, 6),
                    widget('pr-uso', { kind: 'protocolos-uso' }, 4),
                    widget('pr-versoes', { kind: 'protocolos-versoes' }, 6),
                ],
            },
            {
                id: 'sistema', label: 'Sistema', icon: 'cpu', cards: [
                    legacy('canvases', 4), legacy('canvasTools', 8), legacy('operatorCard', 4), legacy('bench', 8), legacy('integrity', 4),
                ],
            },
        ],
    };
}

/**
 * O que faz: a página "Protocolos" (26/10/2026): a saúde do catálogo, o catálogo, o
 * mapa dos routers, o uso recente, as versões em paralelo, os avisos e as ferramentas.
 * Por quê: o catálogo simples da página Executar ("Protocolos DFM") não dizia fase, uso,
 * caminho no 🧭 nem o que está quebrado; a página é a porta para o que existe.
 */
export function protocolsPage(): PanelPage {
    return {
        id: PROTOCOLS_PAGE_ID, label: 'Protocolos', icon: 'workflow', cards: [
            widget('pr-saude', { kind: 'protocolos-saude' }, 12),
            widget('pr-catalogo', { kind: 'protocolos-catalogo' }, 8),
            widget('pr-avisos', { kind: 'protocolos-avisos' }, 4),
            widget('pr-mapa', { kind: 'protocolos-mapa' }, 8),
            widget('pr-uso', { kind: 'protocolos-uso' }, 4),
            widget('pr-versoes', { kind: 'protocolos-versoes' }, 6),
            widget('pr-ferramentas', { kind: 'protocolos-ferramentas' }, 6),
        ],
    };
}

export const PROTOCOLS_PAGE_ID = 'protocolos';

/**
 * O que faz: a página "Missão": a tela principal do Mission Control (arquitetura de
 * 27/10/2026, §3.4): a vista inteira da Missão, sem navegação nem cartões.
 */
export function missaoPage(): PanelPage {
    return { id: MISSAO_PAGE_ID, label: 'Missão', icon: 'compass', tela: 'missao', cards: [] };
}

export const MISSAO_PAGE_ID = 'missao';
/** A semente de uma vez que faz da Missão a primeira página e a de abrir (§3.4). */
export const MISSAO_PRINCIPAL_SEED = 'missao-principal';

interface SeedEntry {
    id: string;
    page: () => PanelPage;
    retireFrom: Array<{ page: string; panel: string }>;
    /** A página vira a primeira (e a de abrir), em vez de entrar no fim. */
    primeira?: boolean;
    /** A página que já existe é convertida (o id é o mesmo; ficam o nome e o ícone dela). */
    converter?: (page: PanelPage) => PanelPage;
}

/**
 * As páginas que o painel acrescenta uma vez a um layout já salvo. A semeada fica
 * registrada nas configurações (`boardPanelSeeded`): se o operador apagar a página
 * depois, ela não volta.
 */
export const SEEDED_PAGES: ReadonlyArray<SeedEntry> = [
    // O catálogo novo substitui o cartão "Protocolos DFM" da página Executar (ele
    // continua no catálogo de cartões, para quem quiser de volta).
    { id: PROTOCOLS_PAGE_ID, page: protocolsPage, retireFrom: [{ page: 'executar', panel: 'protocols' }] },
    { id: MISSAO_PAGE_ID, page: missaoPage, retireFrom: [] },
    // A Missão vira a tela principal (§3.4): a página semeada por `81095a6d` (a última,
    // com o cartão do widget recusado) vira a tela, em primeiro e a de abrir. Depois, o
    // gesto do operador (mover, apagar) vale.
    { id: MISSAO_PRINCIPAL_SEED, page: missaoPage, retireFrom: [], primeira: true, converter: p => ({ ...p, tela: 'missao', cards: [] }) },
];

/**
 * O que faz: a migração de uma vez de um layout salvo: cada página semeada que ainda não
 * foi semeada entra no fim (ou em primeiro, quando a semente pede) se não existe, ou é
 * convertida se a semente converte; os cartões que ela substitui saem da página de
 * origem; a semente fica registrada.
 * Por quê: `reconcilePanelLayout` não acrescenta páginas novas ao layout do operador, e
 * uma página apagada por ele não pode voltar sozinha.
 * Entra → sai: layout conferido e ids já semeados → { layout, seeded, changed }.
 * Erro e ataque: lista de semeadas ilegível vale vazia; rodar de novo não muda nada
 * (idempotente); cartão que o operador levou para outra página fica onde está.
 * Prova: tests/board/panelLayout.test.ts ("migração da página Protocolos", "a Missão principal").
 */
export function seedPanelPages(state: PanelLayoutState, seeded: unknown): { layout: PanelLayoutState; seeded: string[]; changed: boolean } {
    const done = Array.isArray(seeded) ? seeded.filter((id): id is string => typeof id === 'string') : [];
    const todo = SEEDED_PAGES.filter(entry => !done.includes(entry.id));
    if (todo.length === 0) return { layout: state, seeded: done, changed: false };
    const next = clone(state);
    for (const entry of todo) {
        const fresh = entry.page();
        let at = next.pages.findIndex(p => p.id === fresh.id);
        if (at < 0) { next.pages.push(fresh); at = next.pages.length - 1; }
        else if (entry.converter) next.pages[at] = entry.converter(next.pages[at]);
        if (entry.primeira) {
            const [page] = next.pages.splice(at, 1);
            next.pages.unshift(page);
            next.activePage = page.id;
        }
        for (const retire of entry.retireFrom) {
            const page = next.pages.find(p => p.id === retire.page);
            if (page) page.cards = page.cards.filter(c => !(c.source.kind === 'painel' && c.source.id === retire.panel));
        }
    }
    return { layout: next, seeded: [...done, ...todo.map(entry => entry.id)], changed: true };
}

/**
 * O que faz: o layout com que o painel abre: o salvo conferido, com as páginas novas
 * semeadas uma vez; e o que precisa ser gravado nas configurações. Quando a primeira
 * página é uma tela (a Missão), a vista abre nela (§3.4); trocar de aba vale até fechar.
 * Por quê: sem layout salvo, o de partida já traz as páginas (ficam registradas como
 * semeadas, para não voltarem se o operador as apagar depois); com layout salvo, a
 * migração de uma vez (`seedPanelPages`) acrescenta o que falta.
 * Entra → sai: `boardPanelLayout` e `boardPanelSeeded` das configurações → { layout,
 * seeded, save (gravar a lista), saveLayout (gravar também o layout) }.
 * Prova: tests/board/panelLayout.test.ts ("migração da página Protocolos", "a Missão principal").
 */
export function panelLayoutOnOpen(stored: unknown, seeded: unknown): { layout: PanelLayoutState; seeded: string[]; save: boolean; saveLayout: boolean } {
    const hasStored = !!stored;
    const seed = seedPanelPages(reconcilePanelLayout(stored), seeded);
    const before = Array.isArray(seeded) ? seeded : null;
    const save = seed.changed || JSON.stringify(before) !== JSON.stringify(seed.seeded);
    const first = seed.layout.pages[0];
    const layout = first?.tela ? { ...seed.layout, activePage: first.id } : seed.layout;
    return { layout, seeded: seed.seeded, save, saveLayout: hasStored && seed.changed };
}

const clampW = (w: unknown) => Math.max(MIN_W, Math.min(GRID_COLUMNS, Math.round(Number(w)) || GRID_COLUMNS));
const clampH = (h: unknown) => (h === null || h === undefined || !Number.isFinite(Number(h)) ? null : Math.max(MIN_H, Math.min(MAX_H, Math.round(Number(h)))));

/**
 * O que veio salvo, conferido: cartão de visão que não existe mais sai; largura
 * e altura voltam para a faixa; página vazia de nome continua (é do operador).
 * Nada salvo (ou ilegível) = layout de partida.
 */
export function reconcilePanelLayout(stored: unknown, knownPanels: ReadonlySet<string> = new Set(Object.keys(LEGACY_PANELS))): PanelLayoutState {
    const s = stored as Partial<PanelLayoutState> | null;
    if (!s || s.version !== 1 || !Array.isArray(s.pages) || s.pages.length === 0) return defaultPanelLayout();
    const seen = new Set<string>();
    const pages: PanelPage[] = s.pages
        .filter(p => p && typeof p.id === 'string')
        .map(p => ({
            id: p.id,
            label: String(p.label || p.id),
            icon: String(p.icon || 'layout-dashboard'),
            // A página tela não tem cartões (§3.4): o que vier nela sai.
            ...(TELAS.includes((p as PanelPage).tela as PanelTela) ? { tela: (p as PanelPage).tela } : {}),
            cards: (TELAS.includes((p as PanelPage).tela as PanelTela) ? [] : Array.isArray(p.cards) ? p.cards : [])
                .filter(c => {
                    const valid = c && typeof c.id === 'string' && !seen.has(c.id) && c.source &&
                        (c.source.kind === 'widget' ? !!(c.source as any).spec?.kind : c.source.kind === 'painel' && knownPanels.has((c.source as any).id));
                    if (valid) seen.add(c.id);
                    return valid;
                })
                // O padrão não se grava: só o cartão recolhido leva `collapsed` (P7d).
                .map(c => ({ id: c.id, source: c.source, w: clampW(c.w), h: clampH(c.h), ...(c.collapsed ? { collapsed: true } : {}) })),
        }));
    if (pages.length === 0) return defaultPanelLayout();
    const active = pages.some(p => p.id === s.activePage) ? String(s.activePage) : pages[0].id;
    return { version: 1, navCollapsed: !!s.navCollapsed, activePage: active, pages };
}

/**
 * O que faz: o layout na forma em que se grava: as chaves sempre na mesma ordem (a do arquivo:
 * `version`, `navCollapsed`, `activePage`, `pages`; na página `id`, `label`, `icon`, `cards`,
 * `tela`; no cartão `id`, `source`, `w`, `h`) e sem o valor padrão (o `collapsed: false`).
 * Por quê: a reconciliação gravava `"collapsed": false` em todo cartão e trocava a ordem das
 * chaves: ~500 linhas a mais no `data.json`, que está no git, sem mudança nenhuma de verdade
 * (revisão de 29/10). Um layout que não mudou se grava igual, byte a byte.
 * Entra → sai: o layout → um objeto novo, só com os dados (a entrada não é mutada).
 * Prova: tests/board/panelLayout.test.ts ("a forma gravada").
 */
export function layoutParaGravar(state: PanelLayoutState): PanelLayoutState {
    return {
        version: 1,
        navCollapsed: !!state.navCollapsed,
        activePage: state.activePage,
        pages: state.pages.map(p => ({
            id: p.id, label: p.label, icon: p.icon,
            cards: p.cards.map(c => ({ id: c.id, source: c.source, w: c.w, h: c.h, ...(c.collapsed ? { collapsed: true } : {}) })),
            ...(p.tela ? { tela: p.tela } : {}),
        })),
    };
}

function clone(state: PanelLayoutState): PanelLayoutState {
    return JSON.parse(JSON.stringify(state));
}

function locate(state: PanelLayoutState, cardIdValue: string): { page: PanelPage; index: number } | null {
    for (const page of state.pages) {
        const index = page.cards.findIndex(c => c.id === cardIdValue);
        if (index !== -1) return { page, index };
    }
    return null;
}

/** Move o cartão para a posição `toIndex` da página `toPage` (a mesma ou outra). */
export function moveCard(state: PanelLayoutState, cardIdValue: string, toPage: string, toIndex: number): PanelLayoutState {
    const next = clone(state);
    const from = locate(next, cardIdValue);
    const target = next.pages.find(p => p.id === toPage);
    if (!from || !target) return state;
    const [card] = from.page.cards.splice(from.index, 1);
    const index = Math.max(0, Math.min(target.cards.length, Math.round(toIndex)));
    target.cards.splice(index, 0, card);
    return next;
}

/** Reordena a página inteira pela sequência de ids vista na tela depois do arrasto. */
export function reorderPage(state: PanelLayoutState, pageId: string, ids: string[]): PanelLayoutState {
    const next = clone(state);
    const page = next.pages.find(p => p.id === pageId);
    if (!page) return state;
    const byId = new Map(page.cards.map(c => [c.id, c]));
    const ordered = ids.map(id => byId.get(id)).filter((c): c is PanelCard => !!c);
    const rest = page.cards.filter(c => !ids.includes(c.id));
    page.cards = [...ordered, ...rest];
    return next;
}

export function resizeCard(state: PanelLayoutState, cardIdValue: string, size: { w?: number; h?: number | null }): PanelLayoutState {
    const next = clone(state);
    const at = locate(next, cardIdValue);
    if (!at) return state;
    const card = at.page.cards[at.index];
    if (size.w !== undefined) card.w = clampW(size.w);
    if (size.h !== undefined) card.h = clampH(size.h);
    return next;
}

export function updateCard(state: PanelLayoutState, cardIdValue: string, patch: Partial<Pick<PanelCard, 'collapsed' | 'source'>>): PanelLayoutState {
    const next = clone(state);
    const at = locate(next, cardIdValue);
    if (!at) return state;
    const card = at.page.cards[at.index];
    Object.assign(card, patch);
    // Expandir volta ao padrão: sem a chave (o padrão não se grava).
    if (!card.collapsed) delete card.collapsed;
    return next;
}

export function addCard(state: PanelLayoutState, pageId: string, source: CardSource, w = 6): PanelLayoutState {
    const next = clone(state);
    const page = next.pages.find(p => p.id === pageId);
    if (!page) return state;
    page.cards.push({ id: cardId(source.kind === 'painel' ? 'p' : 'w'), source, w: clampW(w), h: null });
    return next;
}

export function removeCard(state: PanelLayoutState, cardIdValue: string): PanelLayoutState {
    const next = clone(state);
    const at = locate(next, cardIdValue);
    if (!at) return state;
    at.page.cards.splice(at.index, 1);
    return next;
}

export function addPage(state: PanelLayoutState, label: string): PanelLayoutState {
    const next = clone(state);
    const id = cardId('pg');
    next.pages.push({ id, label: label.trim() || 'Nova página', icon: 'layout-dashboard', cards: [] });
    next.activePage = id;
    return next;
}

export function renamePage(state: PanelLayoutState, pageId: string, label: string): PanelLayoutState {
    const next = clone(state);
    const page = next.pages.find(p => p.id === pageId);
    if (page && label.trim()) page.label = label.trim();
    return next;
}

/** Remove a página; a última nunca sai. */
export function removePage(state: PanelLayoutState, pageId: string): PanelLayoutState {
    if (state.pages.length <= 1) return state;
    const next = clone(state);
    next.pages = next.pages.filter(p => p.id !== pageId);
    if (next.activePage === pageId) next.activePage = next.pages[0].id;
    return next;
}

export function movePage(state: PanelLayoutState, pageId: string, delta: -1 | 1): PanelLayoutState {
    const next = clone(state);
    const i = next.pages.findIndex(p => p.id === pageId);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= next.pages.length) return state;
    [next.pages[i], next.pages[j]] = [next.pages[j], next.pages[i]];
    return next;
}

/* ------------------------------------------------------- a moldura do painel */

/**
 * O que faz: diz se a mudança de layout é de verdade e precisa ir para as configurações.
 * Por quê: trocar de aba gravava o `data.json` (que está no git) a cada clique; a aba
 * ativa vale até fechar a vista (proposta do Mission Control, 27/10/2026, item 4).
 * Entra → sai: o layout de antes e o de depois → grava ou não (só a aba ativa mudou: não).
 * Prova: tests/board/panelLayout.test.ts ("a moldura").
 */
export function precisaGravar(antes: PanelLayoutState, depois: PanelLayoutState): boolean {
    const sem = (s: PanelLayoutState) => JSON.stringify({ ...s, activePage: '' });
    return sem(antes) !== sem(depois);
}

/** A largura abaixo da qual a navegação lateral começa recolhida. */
export const NAV_LARGURA_MINIMA = 760;

/**
 * O que faz: a navegação lateral à vista numa largura: abaixo de 760 px começa recolhida;
 * acima, vale o que o operador gravou. O gesto dele na sessão vence a largura.
 * Prova: tests/board/panelLayout.test.ts ("a moldura").
 */
export function navRecolhida(largura: number, gravada: boolean, gestoDaSessao: boolean | null = null): boolean {
    if (gestoDaSessao !== null) return gestoDaSessao;
    if (largura > 0 && largura < NAV_LARGURA_MINIMA) return true;
    return gravada;
}

/**
 * O que faz: a aba vizinha pela tecla (← → Home End), na lista de abas; outra tecla, `null`.
 * Por quê: as abas são uma lista de abas (role=tablist) e andam pelo teclado.
 * Prova: tests/board/panelLayout.test.ts ("a moldura").
 */
export function abaPelaTecla(ids: readonly string[], atual: string, tecla: string): string | null {
    if (!ids.length) return null;
    const i = Math.max(0, ids.indexOf(atual));
    if (tecla === 'ArrowRight') return ids[(i + 1) % ids.length];
    if (tecla === 'ArrowLeft') return ids[(i - 1 + ids.length) % ids.length];
    if (tecla === 'Home') return ids[0];
    if (tecla === 'End') return ids[ids.length - 1];
    return null;
}

/**
 * O que faz: diz se um cartão pode ser redesenhado agora: nunca com o foco num campo
 * dentro dele (o texto digitado na Captura sobrevive), e só quando o desenho mudou.
 * Prova: tests/board/panelLayout.test.ts ("a moldura").
 */
export function podeRedesenharCartao(o: { focoEmCampoDentro: boolean; desenhoMudou: boolean }): boolean {
    return !o.focoEmCampoDentro && o.desenhoMudou;
}

/** Largura na grade de 6 (telas médias): metade, arredondada, nunca menos que 3. */
export function spanAt6(w: number): number {
    return w >= GRID_COLUMNS ? 6 : Math.max(3, Math.min(6, Math.round(w / 2)));
}

/** Rótulo do cartão (catálogo, leitores de tela, cabeçalho). */
export function cardLabel(card: PanelCard, widgetLabel: (kind: string) => string): string {
    if (card.source.kind === 'painel') return LEGACY_PANELS[card.source.id]?.label ?? card.source.id;
    return card.source.spec.titulo ?? widgetLabel(card.source.spec.kind);
}

/* ------------------------------------------------------------------ mural */

export interface MasonryItem { span: number; rows: number; stretchable: boolean }
export interface MasonryPlace { col: number; span: number; row: number; rows: number; stretched: boolean }

/**
 * Encaixe em mural na ordem dada: cada item vai para as colunas onde minimiza
 * vãos verticais e altura da grade, respeitando a ordem e alinhamento de colunas.
 * Depois, o último item de cada coluna que termina antes do fim estica até o fim —
 * a grade não deixa vão.
 * Linhas e colunas começam em 1 (como no CSS grid).
 */
export function packMasonry(items: MasonryItem[], cols: number): MasonryPlace[] {
    const columns = Math.max(1, cols);
    if (items.length === 0) return [];
    if (columns === 1) {
        let r = 1;
        return items.map(it => {
            const p = { col: 1, span: 1, row: r, rows: it.rows, stretched: false };
            r += it.rows;
            return p;
        });
    }

    let bestPlaces: MasonryPlace[] | null = null;
    let bestHoles = Infinity;
    let bestHeight = Infinity;
    let iterations = 0;
    const MAX_ITER = 2500;

    function search(idx: number, bottom: number[], currentPlaces: MasonryPlace[]) {
        iterations++;
        if (iterations > MAX_ITER) return;
        if (idx === items.length) {
            const end = Math.max(0, ...bottom);
            const finalPlaces: MasonryPlace[] = currentPlaces.map((p, i) => {
                const item = items[i];
                const top = p.row - 1;
                const isLast = bottom.slice(p.col - 1, p.col - 1 + p.span).every(b => b === top + p.rows);
                if (!item.stretchable || !isLast || top + p.rows >= end) return { ...p };
                return { ...p, rows: end - top, stretched: true };
            });
            let free = 0;
            for (let c = 1; c <= columns; c++) {
                const inCol = finalPlaces.filter(p => p.col <= c && c < p.col + p.span).sort((a, b) => a.row - b.row);
                let cursor = 1;
                for (const p of inCol) { free = Math.max(free, p.row - cursor); cursor = p.row + p.rows; }
                free = Math.max(free, end - cursor);
            }
            if (free < bestHoles || (free === bestHoles && end < bestHeight)) {
                bestHoles = free;
                bestHeight = end;
                bestPlaces = finalPlaces;
            }
            return;
        }

        const item = items[idx];
        const span = Math.max(1, Math.min(columns, item.span));
        const itemRows = Math.max(1, item.rows);

        const candidateStarts = new Set<number>([0]);
        for (let c = 1; c + span <= columns; c++) {
            if (bottom[c] !== bottom[c - 1]) candidateStarts.add(c);
            if (c % span === 0 || c % 4 === 0 || c % 3 === 0) candidateStarts.add(c);
        }

        const candidatesWithTop = Array.from(candidateStarts)
            .filter(start => start + span <= columns)
            .map(start => ({ start, top: Math.max(...bottom.slice(start, start + span)) }))
            .sort((a, b) => a.top - b.top || a.start - b.start);

        for (const { start, top } of candidatesWithTop) {
            const nextBottom = [...bottom];
            for (let c = start; c < start + span; c++) nextBottom[c] = top + itemRows;

            currentPlaces.push({ col: start + 1, span, row: top + 1, rows: itemRows, stretched: false });
            search(idx + 1, nextBottom, currentPlaces);
            currentPlaces.pop();
            if (bestHoles === 0 && iterations > 100) break;
        }
    }

    search(0, new Array(columns).fill(0), []);

    if (!bestPlaces) {
        const bottom = new Array<number>(columns).fill(0);
        const out: MasonryPlace[] = [];
        for (const item of items) {
            const span = Math.max(1, Math.min(columns, item.span));
            const rows = Math.max(1, item.rows);
            let best = 0, bestTop = Infinity;
            for (let start = 0; start + span <= columns; start++) {
                const top = Math.max(...bottom.slice(start, start + span));
                if (top < bestTop) { bestTop = top; best = start; }
            }
            out.push({ col: best + 1, span, row: bestTop + 1, rows, stretched: false });
            for (let c = best; c < best + span; c++) bottom[c] = bestTop + rows;
        }
        const end = Math.max(0, ...bottom);
        items.forEach((item, i) => {
            const p = out[i];
            const top = p.row - 1;
            const isLast = bottom.slice(p.col - 1, p.col - 1 + p.span).every(b => b === top + p.rows);
            if (!item.stretchable || !isLast || top + p.rows >= end) return;
            p.rows = end - top;
            p.stretched = true;
        });
        return out;
    }

    return bestPlaces;
}
