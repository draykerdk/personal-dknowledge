/**
 * Os blocos de montar do DOM da Missão: o elemento, o SVG e os ícones do protótipo.
 *
 * Por quê: o componente monta tudo pelas APIs do DOM (nada de `innerHTML` com texto do
 * cofre, nada dos ajudantes do Obsidian), para valer em qualquer lugar e no DOM falso
 * dos testes. Os ícones são os do protótipo aprovado (template, 910).
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | boolean | null | undefined>;

/** O que faz: um elemento com classe, atributos e texto. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string | null, attrs?: Attrs | null, text?: string | null): HTMLElementTagNameMap[K] {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : String(v));
    if (text !== null && text !== undefined && text !== '') e.textContent = text;
    return e;
}

/** O que faz: um botão (`type=button`). */
export function botao(doc: Document, cls: string | null, text?: string | null, attrs?: Attrs | null): HTMLButtonElement {
    return el(doc, 'button', cls, { type: 'button', ...(attrs ?? {}) }, text);
}

/**
 * O que faz: um botão de corrente (as conexões, a linhagem, os links de um campo): o texto num
 * `span` em bloco dentro dele, para as reticências valerem na largura do painel.
 * Por quê: o diagnóstico do painel do nó (29/10, C1): o botão do Obsidian é um flex centralizado,
 * e no flex as reticências do próprio botão não valem; o texto longo cortava dos dois lados.
 */
export function botaoDeCorrente(doc: Document, cls: string | null, text: string, attrs?: Attrs | null): HTMLButtonElement {
    const b = botao(doc, cls, null, attrs);
    b.appendChild(el(doc, 'span', 'bt', null, text));
    return b;
}

/** O que faz: um elemento SVG com atributos. */
export function svg(doc: Document, tag: string, attrs: Attrs = {}): SVGElement {
    const e = doc.createElementNS(SVG_NS, tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, String(v));
    return e;
}

type Forma = [string, Attrs];
const C = 'currentColor';
/** Os ícones do protótipo, por tipo de nó (12 × 12). */
export const ICONES: Record<string, Forma[]> = {
    area: [['path', { d: 'M6 1 10.5 3.5v5L6 11 1.5 8.5v-5Z', fill: 'none', stroke: C, 'stroke-width': 1.3 }]],
    projeto: [['circle', { cx: 6, cy: 6, r: 4.4, fill: 'none', stroke: C, 'stroke-width': 1.4 }], ['circle', { cx: 6, cy: 6, r: 1.8, fill: C }]],
    smart: [['path', { d: 'M6 1 11 6 6 11 1 6Z', fill: 'none', stroke: C, 'stroke-width': 1.4 }]],
    acao: [['rect', { x: 2, y: 2, width: 8, height: 8, rx: 1, fill: 'none', stroke: C, 'stroke-width': 1.4 }]],
    acaoFeita: [['rect', { x: 2, y: 2, width: 8, height: 8, rx: 1, fill: C }]],
    dia: [['circle', { cx: 6, cy: 6, r: 2.4, fill: C }], ['circle', { cx: 6, cy: 6, r: 4.6, fill: 'none', stroke: C, 'stroke-width': 1 }]],
    semana: [['path', { d: 'M1 9V3M2.7 9V3M4.4 9V3M6 9V3M7.6 9V3M9.3 9V3M11 9V3', stroke: C, 'stroke-width': 1 }]],
    trimestre: [['path', { d: 'M6 6V1A5 5 0 0 1 11 6Z', fill: C }], ['circle', { cx: 6, cy: 6, r: 5, fill: 'none', stroke: C, 'stroke-width': 1 }]],
    ano: [['circle', { cx: 6, cy: 6, r: 5, fill: 'none', stroke: C, 'stroke-width': 1.2 }], ['path', { d: 'M6 1v10M1 6h10', stroke: C, 'stroke-width': 1 }]],
    visao: [['path', { d: 'M1 8h10M3 8a3 3 0 0 1 6 0', fill: 'none', stroke: C, 'stroke-width': 1.3 }]],
    pessoa: [['circle', { cx: 6, cy: 4, r: 2.2, fill: 'none', stroke: C, 'stroke-width': 1.3 }], ['path', { d: 'M2 11a4 4 0 0 1 8 0', fill: 'none', stroke: C, 'stroke-width': 1.3 }]],
    lugar: [['path', { d: 'M6 11S2 7 2 4.6a4 4 0 0 1 8 0C10 7 6 11 6 11Z', fill: 'none', stroke: C, 'stroke-width': 1.3 }]],
    prateleira: [['path', { d: 'M1 4h10M1 8h10', stroke: C, 'stroke-width': 1.2 }]],
    nota: [['path', { d: 'M3 1h4.5L10 3.5V11H3Z', fill: 'none', stroke: C, 'stroke-width': 1.2 }]],
    trecho: [['circle', { cx: 2.5, cy: 6, r: 1.5, fill: C }], ['circle', { cx: 9.5, cy: 6, r: 1.5, fill: 'none', stroke: C, 'stroke-width': 1.2 }], ['path', { d: 'M4.5 6h3', stroke: C, 'stroke-width': 1.2, 'stroke-dasharray': '1.2 1' }]],
    canvas: [['rect', { x: 1, y: 1, width: 4, height: 4, rx: 0.6, fill: 'none', stroke: C, 'stroke-width': 1.1 }], ['rect', { x: 7, y: 7, width: 4, height: 4, rx: 0.6, fill: 'none', stroke: C, 'stroke-width': 1.1 }], ['path', { d: 'M5 3h3.5V7', fill: 'none', stroke: C, 'stroke-width': 1.1 }]],
};

/** O que faz: o ícone de um tipo de nó, dentro do `span.ic`. */
export function icone(doc: Document, tipo: string): HTMLElement {
    const span = el(doc, 'span', 'ic', { 'aria-hidden': 'true' });
    const s = svg(doc, 'svg', { viewBox: '0 0 12 12' });
    for (const [tag, attrs] of ICONES[tipo] ?? ICONES.acao) s.appendChild(svg(doc, tag, attrs));
    span.appendChild(s);
    return span;
}

/** O que faz: o ícone de lupa do botão Buscar no celular (protótipo, 728). */
export function lupa(doc: Document): SVGElement {
    const s = svg(doc, 'svg', { class: 'ico', viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    s.appendChild(svg(doc, 'circle', { cx: 8.5, cy: 8.5, r: 5.5, fill: 'none', stroke: C, 'stroke-width': 2 }));
    s.appendChild(svg(doc, 'path', { d: 'M13 13l4.5 4.5', stroke: C, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    return s;
}

/** O que faz: a janela do documento (os quadros, os temporizadores, os estilos calculados). */
export function janela(doc: Document): any {
    return (doc as any).defaultView ?? globalThis;
}
