/**
 * Desenho dos módulos da página "Protocolos" (widgets `protocolos-*`).
 *
 * Só DOM padrão e classes `dfm-bw-pr-*` (aparência no `styles.css`, só variáveis de tema).
 * A conta é toda de `protocolModel.ts` e `routerTreeModel.ts`; os gestos que gravam ou
 * rodam algo chegam por `actions.protocols` (os fios ficam em `protocolActions.ts`). Sem
 * eles, o módulo só mostra.
 *
 * O estado de tela (filtro do catálogo, ramos abertos do mapa, protocolo em foco) vive
 * por escopo (o painel ou o canvas) e sobrevive às releituras: um número da saúde
 * filtra o catálogo da mesma página; "no mapa" abre a árvore até o protocolo.
 */
import type { MissionSnapshot } from '../engine/missionControl';
import type { ProtocolCatalogInput } from '../engine/protocolCatalog';
import { USO_RECENTE_DIAS } from '../engine/protocolRank';
import type { BoardActions } from './boardRender';
import type { BoardWidgetSpec, ProtocolWidgetKind } from './boardSpec';
import { shortDate } from './boardModel';
import type { Tone } from './boardModel';
import {
    EMPTY_FILTER, FASES_USO, FASE_LABEL, FASE_TONE, buildProtocolPanel, filterRows, hasWarning, healthTiles,
    parallelPairs, usageModel, warningGroups,
    type CatalogFilter, type CatalogFlag, type CatalogRow, type FaseKey, type ProtocolPanelModel,
} from './protocolModel';
import { pathToProtocol, type OptionLink, type RouterQuestion } from './routerTreeModel';

/** Um trabalho de desktop (bancada, mapa do 🧭): o estado que o módulo mostra. */
export interface ProtocolJobState {
    running: boolean;
    /** A linha do último resultado ("✅ Bancada limpa", "❌ 2 juízes falharam"…); `null` antes de rodar. */
    summary: string | null;
    ok: boolean | null;
    /** As linhas que importam do resultado (os juízes que falharam, a saída do script). */
    detail: string[];
}

/** Os gestos da página. Ausente = só leitura (sem botões). */
export interface ProtocolPanelActions {
    /** Por que as gravações e os scripts estão desligados (celular), por escrito; `null` = ligados. */
    readOnlyReason: string | null;
    run(id: string): void;
    openFile(path: string, event: MouseEvent): void;
    chooseFase(id: string, event: MouseEvent): void;
    writeObjetivo(id: string): void;
    runBench(): void;
    regenerateMap(): void;
    openMapCanvas(): void;
    openInventory(): void;
    bench(): ProtocolJobState;
    map(): ProtocolJobState;
    /** Ícone do Obsidian num elemento (opcional). */
    icon?(el: HTMLElement, name: string): void;
}

interface ProtocolUiState {
    filter: CatalogFilter;
    /** Ramos abertos do mapa, pelo caminho de chaves (`raiz>pergunta>…`). */
    expanded: Set<string>;
    /** O protocolo que o "no mapa" pediu para mostrar. */
    focus: string | null;
    showAll: boolean;
    usageDays: 14 | 30;
}

const UI = new Map<string, ProtocolUiState>();
const REDRAW = new WeakMap<HTMLElement, () => void>();
const MODELS = new WeakMap<ProtocolCatalogInput, ProtocolPanelModel>();

function uiOf(actions: BoardActions): ProtocolUiState {
    const key = actions.scope ?? 'canvas';
    let state = UI.get(key);
    if (!state) {
        state = { filter: { ...EMPTY_FILTER }, expanded: new Set(), focus: null, showAll: false, usageDays: 14 };
        UI.set(key, state);
    }
    return state;
}

function modelOf(input: ProtocolCatalogInput): ProtocolPanelModel {
    let model = MODELS.get(input);
    if (!model) {
        model = buildProtocolPanel(input);
        MODELS.set(input, model);
    }
    return model;
}

/* ------------------------------------------------------------ ajudantes */

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = parent.ownerDocument.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node);
    return node;
}

function tone(node: HTMLElement, value: Tone): void {
    node.setAttribute('data-tone', value);
}

/** Cliques dentro do widget não viram seleção/arrasto do nó do canvas. */
function guard(node: HTMLElement): void {
    node.addEventListener('pointerdown', event => event.stopPropagation());
    node.addEventListener('mousedown', event => event.stopPropagation());
}

function head(root: HTMLElement, title: string, sub?: string): HTMLElement {
    const header = el(root, 'header', 'dfm-bw-head');
    el(header, 'span', 'dfm-bw-title', title);
    if (sub) el(header, 'span', 'dfm-bw-sub', sub);
    return header;
}

function empty(parent: HTMLElement, text: string): void {
    el(parent, 'div', 'dfm-bw-empty', text);
}

function button(parent: HTMLElement, label: string, onClick: (event: MouseEvent) => void, opts: { cls?: string; title?: string; disabled?: string | null } = {}): HTMLButtonElement {
    const btn = el(parent, 'button', `dfm-bw-pr-btn${opts.cls ? ` ${opts.cls}` : ''}`, label);
    btn.type = 'button';
    if (opts.title) btn.title = opts.title;
    if (opts.disabled) {
        btn.disabled = true;
        btn.title = opts.disabled;
    }
    guard(btn);
    btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!btn.disabled) onClick(event);
    });
    return btn;
}

function pill(parent: HTMLElement, fase: FaseKey, raw?: string | null): HTMLElement {
    const node = el(parent, 'span', 'dfm-bw-pr-pill', fase === 'desconhecida' && raw ? `fase ${raw}?` : FASE_LABEL[fase]);
    tone(node, FASE_TONE[fase]);
    return node;
}

function usesText(row: CatalogRow, today: string): string {
    if (row.aliasOf) return `alias de ${row.aliasOf}: o uso conta no destino`;
    if (row.uses14 === null) return 'uso: sem leitura';
    const last = row.lastUsed ? ` · último ${shortDate(row.lastUsed, today)}` : ' · nenhum em 30 dias';
    return `${row.uses14}× em ${USO_RECENTE_DIAS} dias · ${row.uses30}× em 30${last}`;
}

/** O que faz: redesenha os módulos `kinds` do mesmo painel ou canvas; devolve quantos achou. */
function redrawKinds(from: HTMLElement, kinds: ProtocolWidgetKind[]): HTMLElement[] {
    const scope: ParentNode = from.closest('.dfm-pc-grid') ?? from.closest('.canvas') ?? from.ownerDocument;
    const found: HTMLElement[] = [];
    for (const kind of kinds) {
        scope.querySelectorAll<HTMLElement>(`.dfm-bw[data-kind="${kind}"]`).forEach(node => {
            const redraw = REDRAW.get(node);
            if (redraw) { redraw(); found.push(node); }
        });
    }
    return found;
}

function sameFilter(a: CatalogFilter, b: CatalogFilter): boolean {
    return a.query === b.query && a.fase === b.fase && a.group === b.group && a.flag === b.flag;
}

/* ------------------------------------------------------------ 1. saúde */

function renderSaude(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel, actions: BoardActions): void {
    const state = uiOf(actions);
    head(root, spec.titulo ?? 'Saúde do catálogo', model.usageReadable ? `${model.daysRead} Days lidas` : 'Days: sem leitura');
    const grid = el(root, 'div', 'dfm-bw-stats dfm-bw-pr-tiles');
    const inline = el(root, 'div', 'dfm-bw-pr-inline');
    for (const tile of healthTiles(model)) {
        const node = el(grid, tile.filter ? 'button' : 'div', 'dfm-bw-stat dfm-bw-pr-tile');
        tone(node, tile.tone);
        node.title = tile.hint;
        el(node, 'div', 'dfm-bw-stat-value', tile.value);
        el(node, 'div', 'dfm-bw-stat-label', tile.label);
        if (!tile.filter) continue;
        const filter = tile.filter;
        (node as HTMLButtonElement).type = 'button';
        if (tile.key !== 'total' && sameFilter(state.filter, filter)) node.classList.add('is-active');
        guard(node);
        node.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            state.filter = { ...filter };
            state.showAll = false;
            const catalogs = redrawKinds(root, ['protocolos-catalogo']);
            REDRAW.get(root)?.();
            if (catalogs.length) catalogs[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    // Sem o catálogo nesta página (num canvas, por exemplo): os nomes contados ficam aqui.
    if (state.filter.flag !== 'todos' || state.filter.fase !== 'todas') {
        const hasCatalog = !!(root.closest('.dfm-pc-grid') ?? root.closest('.canvas') ?? root.ownerDocument).querySelector('.dfm-bw[data-kind="protocolos-catalogo"]');
        if (!hasCatalog) {
            const rows = filterRows(model.rows, state.filter);
            el(inline, 'div', 'dfm-bw-foot', rows.length ? rows.slice(0, 30).map(r => r.name).join(' · ') + (rows.length > 30 ? ` · + ${rows.length - 30}` : '') : 'Nenhum protocolo neste recorte.');
        }
    }
}

/* ------------------------------------------------------------ 2. catálogo */

const FLAG_LABEL: Record<CatalogFlag, string> = {
    todos: 'todas as marcas', sem_uso: `sem uso em ${USO_RECENTE_DIAS} dias`, sem_objetivo: 'sem objetivo', com_aviso: 'com aviso', orfao: 'órfão', beco: 'com beco',
};

function select(parent: HTMLElement, label: string, options: Array<[string, string]>, value: string, onChange: (value: string) => void): void {
    const node = el(parent, 'select', 'dfm-bw-pr-select dropdown');
    node.setAttribute('aria-label', label);
    for (const [v, text] of options) {
        const opt = el(node, 'option', undefined, text);
        opt.value = v;
        if (v === value) opt.selected = true;
    }
    guard(node);
    node.addEventListener('change', () => onChange(node.value));
}

function catalogRow(list: HTMLElement, row: CatalogRow, model: ProtocolPanelModel, actions: BoardActions): void {
    const p = actions.protocols;
    const node = el(list, 'div', 'dfm-bw-pr-row');
    if (hasWarning(row)) node.classList.add('has-warning');
    node.dataset.id = row.id;
    const top = el(node, 'div', 'dfm-bw-pr-row-top');
    const iconBox = el(top, 'span', 'dfm-bw-pr-icon');
    p?.icon?.(iconBox, row.icon);
    el(top, 'span', 'dfm-bw-pr-name', row.name);
    el(top, 'code', 'dfm-bw-pr-id', row.id);
    pill(top, row.fase, row.faseRaw);
    el(top, 'span', 'dfm-bw-pr-chip', row.group);
    el(node, 'div', 'dfm-bw-meta', usesText(row, model.today));
    el(node, 'div', 'dfm-bw-meta', row.openedBy.length ? `chega por: ${row.openedBy.join(', ')}` : row.id === model.central ? 'o primeiro menu' : 'nenhum protocolo leva até ele');
    const goal = el(node, 'div', row.objetivo ? 'dfm-bw-pr-goal' : 'dfm-bw-pr-goal is-missing', row.objetivo ?? 'sem objetivo');
    goal.title = row.objetivo ? 'objetivo (o texto escrito no JSON)' : 'o objetivo é escrito por você';
    const warnings = row.warnings.filter(w => !w.info);
    if (warnings.length || row.coverageException) {
        const box = el(node, 'div', 'dfm-bw-pr-warnings');
        for (const w of warnings) {
            const badge = el(box, 'span', 'dfm-bw-badge', w.text);
            tone(badge, w.kind === 'beco' ? 'bad' : 'warn');
        }
        if (row.coverageException) el(box, 'span', 'dfm-bw-pr-note', `exceção declarada: ${row.coverageException}`);
    }
    if (!p) return;
    const acts = el(node, 'div', 'dfm-bw-pr-actions');
    button(acts, '▶️ Rodar', () => p.run(row.id), { title: `Rodar ${row.id}` });
    if (row.path) button(acts, 'Abrir JSON', event => p.openFile(row.path!, event), { title: row.path });
    button(acts, 'Fase', event => p.chooseFase(row.id, event), { disabled: p.readOnlyReason ?? (row.path ? null : 'o arquivo deste protocolo não é conhecido'), title: 'Trocar a fase_uso' });
    button(acts, 'Objetivo', () => p.writeObjetivo(row.id), { disabled: p.readOnlyReason ?? (row.path ? null : 'o arquivo deste protocolo não é conhecido'), title: 'Escrever o objetivo' });
    button(acts, 'No mapa', () => showInMap(list, row.id, model, actions), { title: 'Mostrar no mapa dos routers' });
}

function showInMap(from: HTMLElement, id: string, model: ProtocolPanelModel, actions: BoardActions): void {
    const state = uiOf(actions);
    state.focus = id;
    const path = pathToProtocol(model.graph, model.defs, id);
    if (path) {
        for (let i = 1; i <= path.length; i++) state.expanded.add(path.slice(0, i).join('>'));
    }
    const maps = redrawKinds(from, ['protocolos-mapa']);
    const target = maps[0]?.querySelector('.dfm-bw-pr-opt.is-focus, .dfm-bw-pr-orphans .is-focus');
    (target ?? maps[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderCatalogo(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel, actions: BoardActions): void {
    const state = uiOf(actions);
    const header = head(root, spec.titulo ?? 'Catálogo de protocolos');
    const sub = el(header, 'span', 'dfm-bw-sub');
    const controls = el(root, 'div', 'dfm-bw-pr-controls');
    const search = el(controls, 'input', 'dfm-bw-pr-search');
    search.type = 'search';
    search.placeholder = 'buscar nome, id, grupo ou objetivo…';
    search.value = state.filter.query;
    search.setAttribute('aria-label', 'Buscar protocolos');
    guard(search);
    const redraw = () => REDRAW.get(root)?.();
    select(controls, 'Fase', [['todas', 'todas as fases'], ...[...FASES_USO, 'sem_fase', 'desconhecida'].map(f => [f, FASE_LABEL[f as FaseKey]] as [string, string])], state.filter.fase, v => { state.filter = { ...state.filter, fase: v as CatalogFilter['fase'] }; redraw(); });
    select(controls, 'Grupo', [['todos', 'todos os grupos'], ...model.groups.map(g => [g, g] as [string, string])], state.filter.group, v => { state.filter = { ...state.filter, group: v }; redraw(); });
    select(controls, 'Marca', (Object.keys(FLAG_LABEL) as CatalogFlag[]).map(f => [f, FLAG_LABEL[f]] as [string, string]), state.filter.flag, v => { state.filter = { ...state.filter, flag: v as CatalogFlag }; redraw(); });
    button(controls, 'Limpar', () => { state.filter = { ...EMPTY_FILTER }; state.showAll = false; redraw(); redrawKinds(root, ['protocolos-saude']); });
    if (actions.protocols?.readOnlyReason) el(root, 'div', 'dfm-bw-foot', actions.protocols.readOnlyReason);
    const list = el(root, 'div', 'dfm-bw-pr-list');
    const drawList = () => {
        list.textContent = '';
        const rows = filterRows(model.rows, state.filter);
        sub.textContent = `${rows.length} de ${model.rows.length}`;
        if (state.filter.flag === 'sem_uso' && !model.usageReadable) { empty(list, 'Uso: sem leitura (nenhuma Day dos últimos 30 dias foi lida).'); return; }
        if (!rows.length) { empty(list, 'Nenhum protocolo neste recorte.'); return; }
        const shown = state.showAll ? rows : rows.slice(0, Math.max(1, spec.limite));
        for (const row of shown) catalogRow(list, row, model, actions);
        if (shown.length < rows.length) button(list, `Mostrar todos (${rows.length})`, () => { state.showAll = true; drawList(); }, { cls: 'dfm-bw-pr-more' });
    };
    search.addEventListener('input', () => { state.filter = { ...state.filter, query: search.value }; drawList(); });
    drawList();
}

/* ------------------------------------------------------------ 3. mapa */

function optionRow(parent: HTMLElement, link: OptionLink, path: string[], model: ProtocolPanelModel, actions: BoardActions, byId: Map<string, CatalogRow>): void {
    const state = uiOf(actions);
    const node = el(parent, 'div', 'dfm-bw-pr-opt');
    const line = el(node, 'div', 'dfm-bw-pr-opt-line');
    const target = link.target;
    if (target.kind === 'question') {
        const question = model.graph.questions.get(target.key);
        const key = [...path, target.key].join('>');
        const loop = path.includes(target.key);
        const open = !loop && state.expanded.has(key);
        const toggle = button(line, loop ? '↺' : open ? '▾' : '▸', () => {
            if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
            REDRAW.get(parent.closest('.dfm-bw') as HTMLElement)?.();
        }, { cls: 'dfm-bw-pr-toggle', disabled: loop ? 'esta parada já aparece acima' : null });
        toggle.setAttribute('aria-expanded', String(open));
        el(line, 'span', 'dfm-bw-pr-opt-text', link.option);
        el(line, 'span', 'dfm-bw-pr-arrow', question ? `→ ${routerName(model, question)} · ${question.prompt}` : '→ outra parada');
        if (open && question) questionBody(node, question, [...path, target.key], model, actions, byId);
        return;
    }
    el(line, 'span', 'dfm-bw-pr-toggle-space');
    el(line, 'span', 'dfm-bw-pr-opt-text', link.option);
    if (target.kind === 'protocol') {
        const row = byId.get(target.id);
        const dest = el(line, 'span', 'dfm-bw-pr-arrow', `→ ${row?.name ?? target.id}`);
        dest.title = target.id;
        if (row) {
            pill(line, row.fase, row.faseRaw);
            if (row.aliasOf) el(line, 'span', 'dfm-bw-pr-chip', `alias → ${row.aliasOf}`);
            else if (row.uses14 !== null && row.uses14 > 0) el(line, 'span', 'dfm-bw-pr-chip', `${row.uses14}× em ${USO_RECENTE_DIAS} d`);
        }
        if (state.focus && (target.id === state.focus || row?.aliasOf === state.focus)) node.classList.add('is-focus');
    } else if (target.kind === 'missing') {
        const badge = el(line, 'span', 'dfm-bw-badge', `beco: ${target.id} não existe`);
        tone(badge, 'bad');
    } else {
        el(line, 'span', 'dfm-bw-pr-arrow is-muted', target.kind === 'end' ? '→ fim' : '→ segue no protocolo');
    }
    if (link.note) line.title = `ordem do 🧭: ${link.note}`;
}

function routerName(model: ProtocolPanelModel, question: RouterQuestion): string {
    return String(model.defs.get(question.router)?.name ?? question.router);
}

function questionBody(parent: HTMLElement, question: RouterQuestion, path: string[], model: ProtocolPanelModel, actions: BoardActions, byId: Map<string, CatalogRow>): void {
    const body = el(parent, 'div', 'dfm-bw-pr-branch');
    if (question.prompt) el(body, 'div', 'dfm-bw-pr-prompt', question.ranked ? `${question.prompt} · na ordem do 🧭 (pesos)` : question.prompt);
    if (!question.options.length) { empty(body, 'Sem opções além de ❔ e 🔙.'); return; }
    for (const link of question.options) optionRow(body, link, path, model, actions, byId);
}

function renderMapa(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel, actions: BoardActions): void {
    const state = uiOf(actions);
    const graph = model.graph;
    head(root, spec.titulo ?? 'Mapa dos routers', `${graph.roots.length} routers · ${graph.questions.size} paradas`);
    el(root, 'div', 'dfm-bw-foot', '❔ Não sei e 🔙 Voltar estão em toda parada e ficam fora. Abra um router para ver as opções na ordem do 🧭.');
    const byId = new Map(model.rows.map(r => [r.id, r]));
    const tree = el(root, 'div', 'dfm-bw-pr-tree');
    if (!graph.roots.length) empty(tree, 'Nenhum router com passo de escolha.');
    for (const rootEntry of graph.roots) {
        const question = graph.questions.get(rootEntry.key);
        if (!question) continue;
        const node = el(tree, 'div', 'dfm-bw-pr-root');
        const line = el(node, 'div', 'dfm-bw-pr-opt-line');
        const open = state.expanded.has(rootEntry.key);
        const toggle = button(line, open ? '▾' : '▸', () => {
            if (state.expanded.has(rootEntry.key)) state.expanded.delete(rootEntry.key); else state.expanded.add(rootEntry.key);
            REDRAW.get(root)?.();
        }, { cls: 'dfm-bw-pr-toggle' });
        toggle.setAttribute('aria-expanded', String(open));
        el(line, 'span', 'dfm-bw-pr-name', routerName(model, question));
        el(line, 'code', 'dfm-bw-pr-id', rootEntry.router);
        const row = byId.get(rootEntry.router);
        if (row) pill(line, row.fase, row.faseRaw);
        if (state.focus === rootEntry.router) node.classList.add('is-focus');
        if (open) questionBody(node, question, [rootEntry.key], model, actions, byId);
    }
    const orphans = model.rows.filter(r => r.orphan);
    const foot = el(root, 'div', 'dfm-bw-pr-orphans');
    el(foot, 'div', 'dfm-bw-pr-subhead', `Órfãos · ${orphans.length}`);
    if (!orphans.length) el(foot, 'div', 'dfm-bw-foot', 'Todo protocolo (fora alias e aposentadas) tem caminho a partir do 🧭.');
    for (const o of orphans) {
        const item = el(foot, 'div', state.focus === o.id ? 'dfm-bw-pr-item is-focus' : 'dfm-bw-pr-item', `${o.name} (${o.id})`);
        if (o.coverageException) item.title = `exceção declarada: ${o.coverageException}`;
    }
    el(foot, 'div', 'dfm-bw-pr-subhead', `Becos · ${model.deadEnds.length}`);
    if (!model.deadEnds.length) el(foot, 'div', 'dfm-bw-foot', 'Nenhuma opção aponta para protocolo que não existe.');
    for (const end of model.deadEnds) el(foot, 'div', 'dfm-bw-pr-item', `${end.from} · "${end.option}" → ${end.target}`);
}

/* ------------------------------------------------------------ 4. uso */

function renderUso(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel, actions: BoardActions): void {
    const state = uiOf(actions);
    const usage = usageModel(model, spec.limite);
    const header = head(root, spec.titulo ?? 'Uso recente');
    const switcher = el(header, 'span', 'dfm-bw-pr-switch');
    for (const days of [14, 30] as const) {
        const b = button(switcher, `${days} dias`, () => { state.usageDays = days; REDRAW.get(root)?.(); }, { cls: state.usageDays === days ? 'is-active' : '' });
        b.setAttribute('aria-pressed', String(state.usageDays === days));
    }
    if (!usage.readable) {
        empty(root, 'Sem leitura: nenhuma Day dos últimos 30 dias pôde ser lida. Ausência de leitura não é zero.');
        return;
    }
    const bars = state.usageDays === 14 ? usage.top14 : usage.top30;
    const max = state.usageDays === 14 ? usage.max14 : usage.max30;
    const list = el(root, 'div', 'dfm-bw-pr-bars');
    if (!bars.length) empty(list, `Nenhuma linha do motor nas Days dos últimos ${state.usageDays} dias.`);
    for (const bar of bars) {
        const line = el(list, 'div', 'dfm-bw-pr-bar-row');
        el(line, 'span', 'dfm-bw-pr-bar-name', bar.name).title = bar.id;
        const track = el(line, 'span', 'dfm-bw-pr-bar-track');
        const fill = el(track, 'span', 'dfm-bw-pr-bar-fill');
        fill.style.setProperty('--w', String(max ? bar.count / max : 0));
        el(line, 'span', 'dfm-bw-pr-bar-count', `${bar.count}×`);
    }
    const unused = el(root, 'details', 'dfm-bw-pr-unused');
    el(unused, 'summary', undefined, `Sem uso em ${USO_RECENTE_DIAS} dias · ${usage.unused14.length}`);
    el(unused, 'div', 'dfm-bw-foot', usage.unused14.length ? usage.unused14.map(u => `${u.name}${u.fase === 'aposentada' ? ' (aposentada)' : ''}`).join(' · ') : 'Todas rodaram ao menos uma vez.');
    el(root, 'div', 'dfm-bw-foot', `Conta as ferramentas pelas linhas que o motor grava nas Days (${usage.daysRead} Days de ${shortDate(usage.window.desde, model.today)} a hoje). Alias contam no destino.`);
}

/* ------------------------------------------------------------ 5. versões */

function versionSide(parent: HTMLElement, label: string, row: CatalogRow | null, id: string, model: ProtocolPanelModel): void {
    const side = el(parent, 'div', 'dfm-bw-pr-side');
    el(side, 'div', 'dfm-bw-pr-subhead', label);
    if (!row) {
        const badge = el(side, 'span', 'dfm-bw-badge', `${id} não existe`);
        tone(badge, 'bad');
        return;
    }
    const top = el(side, 'div', 'dfm-bw-pr-row-top');
    el(top, 'span', 'dfm-bw-pr-name', row.name);
    pill(top, row.fase, row.faseRaw);
    el(side, 'code', 'dfm-bw-pr-id', row.id);
    el(side, 'div', 'dfm-bw-meta', usesText(row, model.today));
}

function renderVersoes(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel): void {
    const pairs = parallelPairs(model);
    head(root, spec.titulo ?? 'Versões em paralelo', String(pairs.length));
    if (!pairs.length) { empty(root, 'Nenhum protocolo declara versaoParalelaDe.'); return; }
    for (const pair of pairs.slice(0, spec.limite)) {
        const box = el(root, 'div', 'dfm-bw-pr-pair');
        versionSide(box, 'Em uso', pair.atual, pair.atualId, model);
        versionSide(box, 'Versão nova', pair.nova, pair.nova.id, model);
    }
    el(root, 'div', 'dfm-bw-foot', 'Trocar uma pela outra é decisão sua: nada é promovido sozinho.');
}

/* ------------------------------------------------------------ 6. avisos */

function jobBox(parent: HTMLElement, job: ProtocolJobState | null): void {
    if (!job) return;
    if (job.running) { el(parent, 'div', 'dfm-bw-foot', 'rodando…'); return; }
    if (!job.summary) return;
    const line = el(parent, 'div', 'dfm-bw-pr-job', job.summary);
    tone(line, job.ok === null ? 'muted' : job.ok ? 'good' : 'bad');
    if (job.detail.length) {
        const details = el(parent, 'details', 'dfm-bw-pr-unused');
        el(details, 'summary', undefined, `Detalhe · ${job.detail.length} linha(s)`);
        el(details, 'pre', 'dfm-bw-pr-pre', job.detail.join('\n'));
    }
}

function renderAvisos(root: HTMLElement, spec: BoardWidgetSpec, model: ProtocolPanelModel, actions: BoardActions): void {
    const groups = warningGroups(model);
    const real = groups.filter(g => !g.info).reduce((n, g) => n + g.items.length, 0) + model.failures.length;
    head(root, spec.titulo ?? 'Avisos', real ? `${real} a ver` : 'nada quebrado');
    const p = actions.protocols;
    const byId = new Map(model.rows.map(r => [r.id, r]));
    if (model.failures.length) {
        el(root, 'div', 'dfm-bw-pr-subhead', `JSON que não carregou · ${model.failures.length}`);
        for (const f of model.failures) {
            const item = el(root, 'div', 'dfm-bw-pr-item');
            if (p) {
                const a = el(item, 'a', 'is-link', f.path);
                a.href = '#';
                guard(a);
                a.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); p.openFile(f.path, event); });
            } else el(item, 'span', undefined, f.path);
            el(item, 'div', 'dfm-bw-meta', f.error);
        }
    }
    if (!groups.length && !model.failures.length) empty(root, 'Nenhum aviso nas checagens rápidas.');
    for (const group of groups) {
        const box = el(root, 'details', group.info ? 'dfm-bw-pr-group is-info' : 'dfm-bw-pr-group');
        if (!group.info && group.items.length <= spec.limite) box.open = true;
        el(box, 'summary', undefined, `${group.label} · ${group.items.length}`);
        for (const w of group.items.slice(0, group.info ? 400 : spec.limite * 4)) {
            const row = byId.get(w.id);
            const item = el(box, 'div', 'dfm-bw-pr-item');
            if (p && row?.path) {
                const a = el(item, 'a', 'is-link', row.name);
                a.href = '#';
                a.title = row.path;
                guard(a);
                a.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); p.openFile(row.path!, event); });
            } else el(item, 'span', undefined, row?.name ?? w.id);
            if (!group.info) el(item, 'span', 'dfm-bw-meta', ` · ${w.text}`);
        }
    }
    const bench = el(root, 'div', 'dfm-bw-pr-tool');
    if (p) button(bench, 'Rodar a bancada completa', () => p.runBench(), { disabled: p.readOnlyReason ?? (p.bench().running ? 'a bancada está rodando' : null), title: 'run_judges.py: as checagens somente leitura do vault' });
    el(bench, 'span', 'dfm-bw-meta', 'A auditoria completa: as checagens somente leitura do vault.');
    if (p?.readOnlyReason) el(root, 'div', 'dfm-bw-foot', p.readOnlyReason);
    jobBox(root, p ? p.bench() : null);
}

/* ------------------------------------------------------------ 7. ferramentas */

function renderFerramentas(root: HTMLElement, spec: BoardWidgetSpec, actions: BoardActions): void {
    head(root, spec.titulo ?? 'Ferramentas');
    const p = actions.protocols;
    if (!p) { empty(root, 'As ferramentas abrem no painel do Mission Control.'); return; }
    if (p.readOnlyReason) el(root, 'div', 'dfm-bw-foot', p.readOnlyReason);
    const tool = (label: string, what: string, onClick: () => void, disabled: string | null, job: ProtocolJobState | null) => {
        const box = el(root, 'div', 'dfm-bw-pr-tool');
        button(box, label, onClick, { disabled });
        el(box, 'span', 'dfm-bw-meta', what);
        jobBox(root, job);
    };
    const map = p.map();
    const bench = p.bench();
    tool('Gerar o mapa do 🧭', 'Reescreve só o canvas gerado do 🧭 a partir dos JSON; nenhum protocolo muda.', () => p.regenerateMap(), p.readOnlyReason ?? (map.running ? 'o mapa está sendo gerado' : null), map);
    tool('Abrir o mapa do 🧭', 'Abre o canvas do mapa; não muda nada.', () => p.openMapCanvas(), null, null);
    tool('Abrir o inventário', 'Abre a nota do inventário de protocolos; não muda nada.', () => p.openInventory(), null, null);
    tool('Rodar a bancada', 'Roda as checagens somente leitura do vault; não muda nada.', () => p.runBench(), p.readOnlyReason ?? (bench.running ? 'a bancada está rodando' : null), bench);
}

/* ------------------------------------------------------------ entrada */

/**
 * O que faz: desenha um módulo `protocolos-*` no `root` (já limpo e com `data-kind`).
 * Sem o catálogo no snapshot (registro ainda não carregado), diz isso em palavras.
 */
export function renderProtocolWidget(root: HTMLElement, spec: BoardWidgetSpec & { kind: ProtocolWidgetKind }, snapshot: MissionSnapshot, actions: BoardActions): void {
    REDRAW.set(root, () => {
        root.textContent = '';
        renderProtocolWidget(root, spec, snapshot, actions);
    });
    const input = snapshot.protocolCatalog;
    if (!input && spec.kind !== 'protocolos-ferramentas') {
        head(root, spec.titulo ?? 'Protocolos');
        empty(root, 'O catálogo de protocolos ainda não foi lido.');
        return;
    }
    const model = input ? modelOf(input) : null;
    switch (spec.kind) {
        case 'protocolos-saude': return renderSaude(root, spec, model!, actions);
        case 'protocolos-catalogo': return renderCatalogo(root, spec, model!, actions);
        case 'protocolos-mapa': return renderMapa(root, spec, model!, actions);
        case 'protocolos-uso': return renderUso(root, spec, model!, actions);
        case 'protocolos-versoes': return renderVersoes(root, spec, model!);
        case 'protocolos-avisos': return renderAvisos(root, spec, model!, actions);
        case 'protocolos-ferramentas': return renderFerramentas(root, spec, actions);
    }
}

/** O que faz: redesenha os módulos de protocolos já na tela (depois da bancada ou do mapa). */
export function redrawProtocolWidgets(doc: Document): void {
    doc.querySelectorAll<HTMLElement>('.dfm-bw[data-kind^="protocolos-"]').forEach(node => REDRAW.get(node)?.());
}
