/**
 * Primitivas de DOM do Mission Control.
 *
 * Tudo é construído com `createEl`/`setIcon` nativos e pintado por variável
 * CSS. Nenhum componente guarda estado: cada painel re-renderiza a partir do
 * snapshot, então a tela nunca mostra um número que o motor já não sustenta.
 */
import { setIcon } from 'obsidian';
import { MissionTone, toneColor } from './tokens';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof HTMLElementTagNameMap>(
    parent: HTMLElement,
    tag: K,
    cls?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = parent.createEl(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.setText(text);
    return node;
}

export function icon(parent: HTMLElement, name: string, cls = 'mc-icon'): HTMLElement {
    const holder = el(parent, 'span', cls);
    setIcon(holder, name);
    return holder;
}

/** Aplica o tom via custom property — o CSS decide onde ela pinta. */
export function applyTone(node: HTMLElement, tone: MissionTone): HTMLElement {
    node.style.setProperty('--mc-tone', toneColor(tone));
    node.addClass(`mc-tone-${tone}`);
    return node;
}

export function pill(parent: HTMLElement, text: string, tone: MissionTone, iconName?: string): HTMLElement {
    const node = applyTone(el(parent, 'span', 'mc-pill'), tone);
    if (iconName) icon(node, iconName, 'mc-pill-icon');
    el(node, 'span', 'mc-pill-label', text);
    return node;
}

export function metric(
    parent: HTMLElement,
    opts: { label: string; value: string | number; unit?: string; tone?: MissionTone; icon?: string; hint?: string; delta?: string },
): HTMLElement {
    const root = applyTone(el(parent, 'div', 'mc-metric'), opts.tone ?? 'muted');
    const head = el(root, 'div', 'mc-metric-head');
    if (opts.icon) icon(head, opts.icon, 'mc-metric-icon');
    el(head, 'span', 'mc-metric-label', opts.label);
    const valueRow = el(root, 'div', 'mc-metric-value-row');
    el(valueRow, 'span', 'mc-metric-value', String(opts.value));
    if (opts.unit) el(valueRow, 'span', 'mc-metric-unit', opts.unit);
    if (opts.delta) {
        const delta = el(valueRow, 'span', 'mc-metric-delta', opts.delta);
        if (opts.delta.startsWith('-')) delta.addClass('is-negative');
    }
    if (opts.hint) el(root, 'div', 'mc-metric-hint', opts.hint);
    return root;
}

export function kv(
    parent: HTMLElement,
    key: string,
    value: HTMLElement | string,
    opts: { tone?: MissionTone; icon?: string; title?: string } = {},
): HTMLElement {
    const row = el(parent, 'div', 'mc-kv');
    const keyCell = el(row, 'div', 'mc-kv-key');
    if (opts.icon) icon(keyCell, opts.icon, 'mc-kv-icon');
    el(keyCell, 'span', 'mc-kv-label', key);
    const valueCell = el(row, 'div', 'mc-kv-value');
    if (opts.tone) applyTone(valueCell, opts.tone);
    if (typeof value === 'string') valueCell.setText(value);
    else valueCell.appendChild(value);
    if (opts.title) row.setAttribute('title', opts.title);
    return row;
}

export interface MissionCard {
    root: HTMLElement;
    header: HTMLElement;
    body: HTMLElement;
    actions: HTMLElement;
}

export function card(
    parent: HTMLElement,
    opts: { title: string; icon: string; tone?: MissionTone; badge?: string; subtitle?: string; wide?: boolean; span?: number },
): MissionCard {
    const root = el(parent, 'section', `mc-card${opts.wide ? ' is-wide' : ''}`);
    if (opts.span) root.style.gridColumn = `span ${opts.span}`;
    const header = applyTone(el(root, 'header', 'mc-card-header'), opts.tone ?? 'accent');
    const headIcon = icon(header, opts.icon, 'mc-card-icon');
    void headIcon;
    const titleBox = el(header, 'div', 'mc-card-titlebox');
    el(titleBox, 'h3', 'mc-card-title', opts.title);
    if (opts.subtitle) el(titleBox, 'p', 'mc-card-subtitle', opts.subtitle);
    const actions = el(header, 'div', 'mc-card-actions');
    if (opts.badge) el(actions, 'span', 'mc-card-badge', opts.badge);
    const body = el(root, 'div', 'mc-card-body');
    return { root, header, body, actions };
}

export function emptyState(parent: HTMLElement, text: string, iconName = 'circle-dashed'): HTMLElement {
    const root = el(parent, 'div', 'mc-empty');
    icon(root, iconName, 'mc-empty-icon');
    el(root, 'p', 'mc-empty-text', text);
    return root;
}

/** Barra proporcional. Segmentos de valor zero nunca aparecem — não há fatia fantasma. */
export function stackedBar(
    parent: HTMLElement,
    segments: Array<{ value: number; tone: MissionTone; label: string }>,
    opts: { onPick?: (label: string) => void } = {},
): HTMLElement {
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const root = el(parent, 'div', 'mc-stack');
    if (total <= 0) {
        el(root, 'div', 'mc-stack-empty');
        return root;
    }
    for (const segment of segments) {
        if (segment.value <= 0) continue;
        const slice = applyTone(el(root, 'div', 'mc-stack-slice'), segment.tone);
        slice.style.flexGrow = String(segment.value);
        slice.setAttribute('title', `${segment.label}: ${segment.value}`);
        if (opts.onPick) {
            slice.addClass('is-clickable');
            slice.addEventListener('click', () => opts.onPick?.(segment.label));
        }
    }
    return root;
}

/** Sparkline em SVG puro. Série vazia desenha a linha de base, nunca um pico inventado. */
export function sparkline(
    parent: HTMLElement,
    values: number[],
    opts: { tone?: MissionTone; width?: number; height?: number; label?: string } = {},
): HTMLElement {
    const width = opts.width ?? 240;
    const height = opts.height ?? 44;
    const root = applyTone(el(parent, 'div', 'mc-spark'), opts.tone ?? 'accent');
    if (opts.label) el(root, 'div', 'mc-spark-label', opts.label);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('mc-spark-svg');

    const series = values.length > 0 ? values : [0, 0];
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const span = Math.max(1, max - min);
    const step = series.length > 1 ? width / (series.length - 1) : width;
    const points = series.map((value, index) => {
        const x = series.length > 1 ? index * step : width / 2;
        const y = height - ((value - min) / span) * (height - 6) - 3;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    if (series.length > 1) {
        const area = document.createElementNS(SVG_NS, 'polygon');
        area.setAttribute('points', `0,${height} ${points.join(' ')} ${width},${height}`);
        area.setAttribute('class', 'mc-spark-area');
        svg.appendChild(area);
    }
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', points.join(' '));
    line.setAttribute('class', 'mc-spark-line');
    svg.appendChild(line);

    if (series.length === 1) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(width / 2));
        dot.setAttribute('cy', String(height - ((series[0] - min) / span) * (height - 6) - 3));
        dot.setAttribute('r', '2.5');
        dot.setAttribute('class', 'mc-spark-dot');
        svg.appendChild(dot);
    }

    root.appendChild(svg);
    return root;
}

/** Barra por eixo (C.A.O.S./E.C.H.) com delta opcional. */
export function axisBar(
    parent: HTMLElement,
    opts: { label: string; short?: string; value: number; max: number; tone: MissionTone; delta?: number },
): HTMLElement {
    const root = applyTone(el(parent, 'div', 'mc-axis'), opts.tone);
    const head = el(root, 'div', 'mc-axis-head');
    el(head, 'span', 'mc-axis-label', opts.short ?? opts.label);
    el(head, 'span', 'mc-axis-value', String(Math.round(opts.value)));
    if (opts.delta !== undefined && opts.delta !== 0) {
        const delta = el(head, 'span', 'mc-axis-delta', `${opts.delta > 0 ? '+' : ''}${Math.round(opts.delta)}`);
        if (opts.delta < 0) delta.addClass('is-negative');
    }
    const track = el(root, 'div', 'mc-axis-track');
    const fill = el(track, 'div', 'mc-axis-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (opts.value / Math.max(1, opts.max)) * 100))}%`;
    root.setAttribute('title', `${opts.label}: ${Math.round(opts.value)}`);
    return root;
}

/** Botão de ação compacto, com ícone opcional. */
export function actionButton(
    parent: HTMLElement,
    opts: { label: string; icon?: string; tone?: MissionTone; primary?: boolean; onClick: () => void; title?: string },
): HTMLElement {
    const button = applyTone(el(parent, 'button', `mc-action${opts.primary ? ' is-primary' : ''}`), opts.tone ?? 'accent');
    if (opts.icon) icon(button, opts.icon, 'mc-action-icon');
    el(button, 'span', 'mc-action-label', opts.label);
    if (opts.title) button.setAttribute('title', opts.title);
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        opts.onClick();
    });
    return button;
}

/** Linha clicável que abre uma nota ou dispara uma ação. */
export function rowLink(
    parent: HTMLElement,
    opts: { onClick?: () => void; classes?: string[]; title?: string },
): HTMLElement {
    const row = el(parent, 'div', `mc-row${opts.classes ? ` ${opts.classes.join(' ')}` : ''}`);
    if (opts.title) row.setAttribute('title', opts.title);
    if (opts.onClick) {
        row.addClass('is-clickable');
        row.addEventListener('click', event => {
            event.preventDefault();
            opts.onClick?.();
        });
    }
    return row;
}
