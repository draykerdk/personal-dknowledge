/**
 * Um DOM falso, pequeno e local, para montar componentes nos testes.
 *
 * Por quê: o vitest roda em `node`, sem jsdom nem happy-dom, e dependência nova está
 * fora do contrato do plugin (ver tests/ui/widgetMission.test.ts). Este arquivo faz só
 * o que os componentes da Missão e a dica usam: criar e encaixar elementos, classes,
 * atributos, `dataset`, `style`, eventos com propagação, o seletor simples (tag, classe,
 * id, atributo, descendente, lista) e `closest`/`matches`. Medidas são zero, a não ser
 * que o teste as declare em `medidas`.
 *
 * É um gravador, não um navegador: o que o componente passar a usar além disso quebra
 * aqui, e a dependência nova aparece na revisão.
 */

type Ouvinte = (ev: EventoFalso) => void;

export interface EventoFalso {
    type: string;
    target: ElementoFalso | null;
    currentTarget: ElementoFalso | null;
    bubbles: boolean;
    defaultPrevented: boolean;
    propagationStopped: boolean;
    key?: string;
    button?: number;
    pointerType?: string;
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    deltaX?: number;
    deltaY?: number;
    deltaMode?: number;
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
    [k: string]: unknown;
}

export function evento(type: string, extra: Partial<EventoFalso> = {}): EventoFalso {
    const ev: EventoFalso = {
        type, target: null, currentTarget: null, bubbles: true, defaultPrevented: false, propagationStopped: false,
        preventDefault() { ev.defaultPrevented = true; },
        stopPropagation() { ev.propagationStopped = true; },
        stopImmediatePropagation() { ev.propagationStopped = true; },
        ...extra,
    };
    return ev;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class ListaDeClasses {
    constructor(private readonly el: ElementoFalso) {}
    private get itens(): string[] { return (this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean); }
    private set itens(v: string[]) { this.el.setAttribute('class', [...new Set(v)].join(' ')); }
    add(...c: string[]) { this.itens = [...this.itens, ...c.filter(Boolean)]; }
    remove(...c: string[]) { this.itens = this.itens.filter(x => !c.includes(x)); }
    contains(c: string) { return this.itens.includes(c); }
    toggle(c: string, force?: boolean) {
        const on = force === undefined ? !this.contains(c) : force;
        if (on) this.add(c); else this.remove(c);
        return on;
    }
    get length() { return this.itens.length; }
}

export class ElementoFalso {
    readonly tagName: string;
    readonly children: ElementoFalso[] = [];
    parentElement: ElementoFalso | null = null;
    readonly attrs = new Map<string, string>();
    readonly ouvintes = new Map<string, Array<{ fn: Ouvinte; captura: boolean }>>();
    readonly style: Record<string, any>;
    readonly classList: ListaDeClasses;
    readonly dataset: Record<string, string>;
    private texto = '';
    value = '';
    scrollLeft = 0;
    scrollTop = 0;

    constructor(readonly ownerDocument: DocumentoFalso, tag: string, readonly namespaceURI: string | null = null) {
        this.tagName = tag.toUpperCase();
        this.classList = new ListaDeClasses(this);
        const props: Record<string, string> = {};
        this.style = new Proxy(props, {
            get: (t, k: string) => {
                if (k === 'setProperty') return (n: string, v: string) => { t[n] = String(v); };
                if (k === 'removeProperty') return (n: string) => { delete t[n]; };
                if (k === 'getPropertyValue') return (n: string) => t[n] ?? '';
                return t[k] ?? '';
            },
            set: (t, k: string, v) => { t[k] = String(v); return true; },
        }) as any;
        const self = this;
        this.dataset = new Proxy({}, {
            get: (_t, k: string | symbol) => (typeof k === 'string' ? self.attrs.get(`data-${kebab(k)}`) : undefined),
            set: (_t, k: string, v) => { self.attrs.set(`data-${kebab(k)}`, String(v)); return true; },
            deleteProperty: (_t, k: string) => { self.attrs.delete(`data-${kebab(k)}`); return true; },
            has: (_t, k: string) => self.attrs.has(`data-${kebab(k)}`),
            ownKeys: () => [...self.attrs.keys()].filter(a => a.startsWith('data-')).map(a => camel(a.slice(5))),
            getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
        });
    }

    /* ---------------------------------------------------------- atributos */
    setAttribute(n: string, v: unknown) { this.attrs.set(n, String(v)); }
    getAttribute(n: string): string | null { return this.attrs.has(n) ? this.attrs.get(n)! : null; }
    removeAttribute(n: string) { this.attrs.delete(n); }
    hasAttribute(n: string) { return this.attrs.has(n); }
    toggleAttribute(n: string, force?: boolean) { const on = force ?? !this.attrs.has(n); if (on) this.attrs.set(n, ''); else this.attrs.delete(n); return on; }
    get id() { return this.getAttribute('id') ?? ''; }
    set id(v: string) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') ?? ''; }
    set className(v: string) { this.setAttribute('class', v); }
    get hidden() { return this.attrs.has('hidden'); }
    set hidden(v: boolean) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
    get type() { return this.getAttribute('type') ?? ''; }
    set type(v: string) { this.setAttribute('type', v); }
    get tabIndex() { return Number(this.getAttribute('tabindex') ?? -1); }
    set tabIndex(v: number) { this.setAttribute('tabindex', String(v)); }
    get disabled() { return this.attrs.has('disabled'); }
    set disabled(v: boolean) { if (v) this.attrs.set('disabled', ''); else this.attrs.delete('disabled'); }
    get placeholder() { return this.getAttribute('placeholder') ?? ''; }
    set placeholder(v: string) { this.setAttribute('placeholder', v); }

    /* ---------------------------------------------------------- árvore */
    get parentNode() { return this.parentElement; }
    get firstElementChild() { return this.children[0] ?? null; }
    get lastElementChild() { return this.children[this.children.length - 1] ?? null; }
    get firstChild() { return this.firstElementChild; }
    get nextElementSibling() {
        const p = this.parentElement;
        if (!p) return null;
        return p.children[p.children.indexOf(this) + 1] ?? null;
    }
    get nextSibling() { return this.nextElementSibling; }
    get childElementCount() { return this.children.length; }
    get isConnected(): boolean {
        let n: ElementoFalso | null = this;
        while (n) { if (n === this.ownerDocument.documentElement) return true; n = n.parentElement; }
        return false;
    }
    appendChild<T extends ElementoFalso>(c: T): T {
        c.remove();
        c.parentElement = this;
        this.children.push(c);
        return c;
    }
    append(...cs: Array<ElementoFalso | string>) {
        for (const c of cs) {
            if (typeof c === 'string') { const t = this.ownerDocument.createElement('#text'); t.textContent = c; this.appendChild(t); } else this.appendChild(c);
        }
    }
    prepend(c: ElementoFalso) { this.insertBefore(c, this.children[0] ?? null); }
    insertBefore<T extends ElementoFalso>(c: T, ref: ElementoFalso | null): T {
        if (c === ref) return c;
        c.remove();
        const i = ref ? this.children.indexOf(ref) : -1;
        c.parentElement = this;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
    }
    insertAdjacentElement(where: string, c: ElementoFalso) {
        if (where === 'afterend' && this.parentElement) this.parentElement.insertBefore(c, this.nextElementSibling);
        else if (where === 'beforebegin' && this.parentElement) this.parentElement.insertBefore(c, this);
        else if (where === 'beforeend') this.appendChild(c);
        else this.prepend(c);
        return c;
    }
    removeChild(c: ElementoFalso) { c.remove(); return c; }
    remove() {
        const p = this.parentElement;
        if (!p) return;
        const i = p.children.indexOf(this);
        if (i >= 0) p.children.splice(i, 1);
        this.parentElement = null;
        if (this.ownerDocument.activeElement && !this.ownerDocument.activeElement.isConnected) this.ownerDocument.activeElement = this.ownerDocument.body;
    }
    replaceWith(c: ElementoFalso) {
        const p = this.parentElement;
        if (!p) return;
        p.insertBefore(c, this);
        this.remove();
    }
    replaceChildren(...cs: ElementoFalso[]) {
        for (const c of [...this.children]) c.remove();
        for (const c of cs) this.appendChild(c);
    }
    contains(n: ElementoFalso | null): boolean {
        for (let x = n; x; x = x.parentElement) if (x === this) return true;
        return false;
    }
    get textContent(): string { return this.children.length ? this.children.map(c => c.textContent).join('') : this.texto; }
    set textContent(v: string) { for (const c of [...this.children]) c.remove(); this.texto = String(v ?? ''); }
    get innerText() { return this.textContent; }

    /* ---------------------------------------------------------- seletores */
    matches(sel: string): boolean { return casaLista(this, sel); }
    closest(sel: string): ElementoFalso | null {
        for (let x: ElementoFalso | null = this; x; x = x.parentElement) if (x.matches(sel)) return x;
        return null;
    }
    querySelectorAll(sel: string): ElementoFalso[] {
        const out: ElementoFalso[] = [];
        const walk = (n: ElementoFalso) => { for (const c of n.children) { if (casaLista(c, sel, this)) out.push(c); walk(c); } };
        walk(this);
        return out;
    }
    querySelector(sel: string): ElementoFalso | null { return this.querySelectorAll(sel)[0] ?? null; }
    getElementsByClassName(c: string) { return this.querySelectorAll(`.${c}`); }

    /* ---------------------------------------------------------- eventos */
    addEventListener(t: string, fn: Ouvinte, opt?: boolean | { capture?: boolean; passive?: boolean }) {
        const captura = typeof opt === 'boolean' ? opt : !!opt?.capture;
        const list = this.ouvintes.get(t) ?? [];
        list.push({ fn, captura });
        this.ouvintes.set(t, list);
    }
    removeEventListener(t: string, fn: Ouvinte) {
        const list = this.ouvintes.get(t);
        if (list) this.ouvintes.set(t, list.filter(x => x.fn !== fn));
    }
    dispatchEvent(ev: EventoFalso): boolean {
        ev.target = ev.target ?? this;
        const path: ElementoFalso[] = [];
        for (let x: ElementoFalso | null = this; x; x = x.parentElement) path.push(x);
        for (const n of [...path].reverse()) {
            if (ev.propagationStopped) break;
            ev.currentTarget = n;
            for (const o of [...(n.ouvintes.get(ev.type) ?? [])]) if (o.captura) o.fn(ev);
        }
        for (const n of path) {
            if (ev.propagationStopped) break;
            ev.currentTarget = n;
            for (const o of [...(n.ouvintes.get(ev.type) ?? [])]) if (!o.captura) o.fn(ev);
            if (!ev.bubbles) break;
        }
        return !ev.defaultPrevented;
    }
    /** A cópia do elemento (a transição da pinça copia a vista que sai): os atributos, o estilo, o texto e, funda, os filhos. */
    cloneNode(fundo = false): ElementoFalso {
        const c = new ElementoFalso(this.ownerDocument, this.tagName.toLowerCase(), this.namespaceURI);
        for (const [k, v] of this.attrs) c.attrs.set(k, v);
        for (const k of Object.keys(this.style)) c.style[k] = this.style[k];
        c.texto = this.texto;
        if (fundo) for (const f of this.children) c.appendChild(f.cloneNode(true));
        return c;
    }
    click() { this.dispatchEvent(evento('click', { button: 0 })); }
    focus() { this.ownerDocument.activeElement = this; this.dispatchEvent(evento('focusin', { bubbles: true })); }
    blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
    select() { /* nada a selecionar */ }
    scrollTo(o: { left?: number; top?: number }) { if (o.left !== undefined) this.scrollLeft = o.left; if (o.top !== undefined) this.scrollTop = o.top; }
    scrollIntoView() { /* sem rolagem */ }
    setPointerCapture() { /* sem ponteiro */ }
    releasePointerCapture() { /* sem ponteiro */ }

    /* ---------------------------------------------------------- medidas */
    private medida(k: string): number { return this.ownerDocument.medidas.get(this)?.[k] ?? 0; }
    get offsetWidth() { return this.medida('width'); }
    get offsetHeight() { return this.medida('height'); }
    get clientWidth() { return this.medida('width'); }
    get clientHeight() { return this.medida('height'); }
    get scrollWidth() { return this.medida('scrollWidth') || this.medida('width'); }
    get scrollHeight() { return this.medida('scrollHeight') || this.medida('height'); }
    get offsetTop() { return this.medida('top'); }
    get offsetLeft() { return this.medida('left'); }
    get offsetParent() { return this.parentElement; }
    getBoundingClientRect() {
        const w = this.medida('width'), h = this.medida('height'), l = this.medida('left'), t = this.medida('top');
        return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t };
    }
}

/* ------------------------------------------------------------ o seletor */

interface Simples { tag?: string; ids: string[]; classes: string[]; attrs: Array<{ n: string; op?: string; v?: string }>; nots: string[] }

function lerSimples(s: string): Simples {
    const out: Simples = { ids: [], classes: [], attrs: [], nots: [] };
    let rest = s;
    rest = rest.replace(/:not\(([^)]*)\)/g, (_, inner) => { out.nots.push(inner); return ''; });
    rest = rest.replace(/:(?:hover|focus-visible|focus|focus-within|scope)\b/g, '');
    rest = rest.replace(/\[([\w-]+)(?:([\^$*~]?=)"?([^"\]]*)"?)?\]/g, (_, n, op, v) => { out.attrs.push({ n, op, v }); return ''; });
    rest = rest.replace(/#([\w-]+)/g, (_, id) => { out.ids.push(id); return ''; });
    rest = rest.replace(/\.([\w-]+)/g, (_, c) => { out.classes.push(c); return ''; });
    rest = rest.trim();
    if (rest && rest !== '*') out.tag = rest.toUpperCase();
    return out;
}

function casaSimples(el: ElementoFalso, s: Simples): boolean {
    if (el.tagName === '#TEXT') return false;
    if (s.tag && el.tagName !== s.tag) return false;
    if (s.ids.some(id => el.id !== id)) return false;
    if (s.classes.some(c => !el.classList.contains(c))) return false;
    for (const a of s.attrs) {
        const v = el.getAttribute(a.n);
        if (v === null) return false;
        if (a.op === '=' && v !== a.v) return false;
        if (a.op === '^=' && !v.startsWith(a.v ?? '')) return false;
        if (a.op === '*=' && !v.includes(a.v ?? '')) return false;
    }
    if (s.nots.some(n => casaLista(el, n))) return false;
    return true;
}

/** Corta o seletor nas partes (descendente e filho), sem cortar dentro de [atributo="com espaço"]. */
function partesDoSeletor(sel: string): { parts: string[]; filhos: boolean[] } {
    const parts: string[] = [], filhos: boolean[] = [];
    let cur = '', dentro = 0, aspas = false, filho = false;
    const fechar = () => { if (cur.trim()) { parts.push(cur.trim()); filhos.push(filho); filho = false; } cur = ''; };
    for (const ch of sel.trim()) {
        if (ch === '"') aspas = !aspas;
        if (!aspas && ch === '[') dentro++;
        if (!aspas && ch === ']') dentro--;
        if (!aspas && !dentro && (ch === ' ' || ch === '>')) { fechar(); if (ch === '>') filho = true; continue; }
        cur += ch;
    }
    fechar();
    return { parts, filhos };
}

function casaComposto(el: ElementoFalso, sel: string, raiz?: ElementoFalso): boolean {
    const { parts, filhos } = partesDoSeletor(sel);
    if (!parts.length) return false;
    if (!casaSimples(el, lerSimples(parts[parts.length - 1]))) return false;
    let cur: ElementoFalso | null = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
        const s = lerSimples(parts[i]);
        const direto = filhos[i + 1];
        if (direto) {
            if (!cur || !casaSimples(cur, s)) return false;
            cur = cur.parentElement;
            continue;
        }
        while (cur && !casaSimples(cur, s)) cur = cur.parentElement;
        if (!cur) return false;
        cur = cur.parentElement;
    }
    void raiz;
    return true;
}

function casaLista(el: ElementoFalso, sel: string, raiz?: ElementoFalso): boolean {
    return sel.split(',').some(s => casaComposto(el, s, raiz));
}

/* ------------------------------------------------------------ o documento */

export class DocumentoFalso {
    readonly documentElement: ElementoFalso;
    readonly body: ElementoFalso;
    activeElement: ElementoFalso;
    /** As medidas que o teste declara (largura, altura, topo, esquerda). */
    readonly medidas = new Map<ElementoFalso, Record<string, number>>();
    readonly quadros: Array<() => void> = [];
    readonly defaultView: any;

    constructor() {
        this.documentElement = new ElementoFalso(this, 'html');
        this.body = this.documentElement.appendChild(new ElementoFalso(this, 'body'));
        this.activeElement = this.body;
        const doc = this;
        this.defaultView = {
            requestAnimationFrame: (fn: () => void) => { doc.quadros.push(fn); return doc.quadros.length; },
            cancelAnimationFrame: () => { /* o quadro roda ou não roda */ },
            setTimeout: (fn: () => void) => { doc.quadros.push(fn); return doc.quadros.length; },
            clearTimeout: () => { /* idem */ },
            getComputedStyle: (el: ElementoFalso) => ({
                display: el.hidden ? 'none' : 'block', scrollSnapAlign: el.style['scroll-snap-align'] || 'start',
                scrollPaddingLeft: '0px', getPropertyValue: (n: string) => el.style.getPropertyValue(n),
            }),
            matchMedia: () => ({ matches: false }),
            performance: { now: () => Date.now() },
        };
    }
    createElement(tag: string) { return new ElementoFalso(this, tag); }
    createElementNS(ns: string, tag: string) { return new ElementoFalso(this, tag, ns); }
    createDocumentFragment() { return new ElementoFalso(this, '#fragment'); }
    /** Roda os quadros e os temporizadores pendentes (até esvaziar). */
    rodarQuadros(limite = 50) {
        for (let i = 0; i < limite && this.quadros.length; i++) {
            const fila = this.quadros.splice(0);
            for (const fn of fila) fn();
        }
    }
    medir(el: ElementoFalso, m: Record<string, number>) { this.medidas.set(el, { ...(this.medidas.get(el) ?? {}), ...m }); }
}

export function documentoFalso() { return new DocumentoFalso(); }
