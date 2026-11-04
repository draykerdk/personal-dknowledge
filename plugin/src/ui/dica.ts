/**
 * A dica: o nome de um botão, num mecanismo só, no mouse, no teclado e no toque.
 *
 * Por quê: a proposta do Mission Control e do canvas (27/10/2026, item 5, aprovada): o
 * painel usava o balão lento do navegador e as barras do canvas o do Obsidian, e nenhum
 * aparecia pelo teclado nem com toque longo. Aqui o texto é um só: vira o `aria-label`
 * (o nome que o leitor de tela lê) e a dica do Obsidian (`setTooltip`), que aparece ao
 * passar o mouse, ao chegar pelo teclado (`:focus-visible`) e depois de 450 ms com o
 * dedo parado, sem disparar o clique. A tecla de atalho, quando há, vai junto ("Hoje · H").
 *
 * Dois jeitos de ligar, com o mesmo resultado:
 * - `dica(el, texto)`: o botão solto (a barra do painel, as abas) ganha os ouvintes nele;
 * - `marcarDica(el, texto)` + `ligarDicas(raiz)`: um componente com muitos botões (a
 *   Missão) liga os ouvintes uma vez, na raiz dele. Nenhum ouvinte vai para `window` nem
 *   para `document` (arquitetura da Missão, 3.3).
 *
 * Prova: tests/ui/dica.test.ts.
 */
import { displayTooltip, setTooltip } from 'obsidian';

/** O toque longo que mostra a dica (o mesmo do protótipo aprovado). */
export const TOQUE_LONGO_MS = 450;
/** O dedo que anda mais do que isso desiste do toque longo (é rolagem). */
export const TOQUE_TOLERANCIA_PX = 10;

export interface OpcoesDaDica {
    /** A tecla de atalho, mostrada depois do texto ("· H"). */
    tecla?: string;
    posicao?: 'top' | 'bottom' | 'left' | 'right';
}

/** O que faz: o texto da dica, com a tecla quando há. Puro. */
export function textoDaDica(texto: string, tecla?: string): string {
    const t = String(texto ?? '').trim();
    return tecla ? `${t} · ${tecla}` : t;
}

/**
 * O que faz: dá ao elemento o nome e a dica do Obsidian (sem ouvintes próprios).
 * Entra → sai: o elemento, o texto e a tecla → o elemento com `aria-label` e `data-dica`.
 * Erro e ataque: texto vazio não apaga um nome que já havia; o texto é texto, nunca HTML.
 */
export function marcarDica<T extends HTMLElement>(el: T, texto: string, opcoes: OpcoesDaDica = {}): T {
    const t = textoDaDica(texto, opcoes.tecla);
    if (!t) return el;
    el.setAttribute('aria-label', t);
    el.setAttribute('data-dica', '');
    if (opcoes.posicao) el.setAttribute('data-tooltip-position', opcoes.posicao);
    try { setTooltip(el, t, { placement: opcoes.posicao ?? 'bottom' }); } catch { /* sem Obsidian: fica o aria-label */ }
    return el;
}

/** O que faz: mostra a dica de um elemento já marcado (pelo foco do teclado ou pelo toque longo). */
export function mostrarDica(el: HTMLElement): void {
    const t = el.getAttribute('aria-label');
    if (!t) return;
    const pos = (el.getAttribute('data-tooltip-position') as OpcoesDaDica['posicao']) || 'bottom';
    try { displayTooltip(el, t, { placement: pos }); } catch { /* sem Obsidian: nada a mostrar */ }
}

const ehFocoDoTeclado = (el: Element) => {
    try { return el.matches(':focus-visible'); } catch { return false; }
};

/**
 * O que faz: liga, numa raiz, a dica pelo foco do teclado e pelo toque longo de todo
 * descendente marcado (`[data-dica]`); devolve o desligar.
 * Por quê: um ouvinte por raiz, e não um por botão, nos componentes com centenas de nós.
 * Erro e ataque: o toque que anda mais de 10 px é rolagem e não mostra nada; o clique
 * que segue o toque longo é engolido (a dica não aciona o botão); o menu de contexto do
 * toque longo não abre por cima da dica.
 */
export function ligarDicas(raiz: HTMLElement): () => void {
    let toque: { x: number; y: number; timer: any; alvo: HTMLElement } | null = null;
    let engolir = false;
    const win: any = (raiz.ownerDocument as any)?.defaultView ?? globalThis;
    const marcado = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-dica]') as HTMLElement | null) ?? null;
    const cancelar = () => { if (toque) { win.clearTimeout(toque.timer); toque = null; } };

    const foco = (ev: Event) => {
        const el = marcado(ev.target);
        if (el && el === ev.target && ehFocoDoTeclado(el)) mostrarDica(el);
    };
    const baixo = (ev: PointerEvent) => {
        engolir = false;
        cancelar();
        if (ev.pointerType !== 'touch') return;
        const el = marcado(ev.target);
        if (!el) return;
        toque = { x: ev.clientX, y: ev.clientY, alvo: el, timer: win.setTimeout(() => { const alvo = toque?.alvo; toque = null; if (alvo) { engolir = true; mostrarDica(alvo); } }, TOQUE_LONGO_MS) };
    };
    const move = (ev: PointerEvent) => {
        if (toque && Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) > TOQUE_TOLERANCIA_PX) cancelar();
    };
    const cima = () => cancelar();
    const clique = (ev: Event) => {
        if (!engolir) return;
        engolir = false;
        ev.preventDefault();
        ev.stopPropagation();
    };
    const menu = (ev: Event) => { if (engolir || toque) ev.preventDefault(); };

    raiz.addEventListener('focusin', foco);
    raiz.addEventListener('pointerdown', baixo as EventListener, true);
    raiz.addEventListener('pointermove', move as EventListener, true);
    raiz.addEventListener('pointerup', cima, true);
    raiz.addEventListener('pointercancel', cima, true);
    raiz.addEventListener('click', clique, true);
    raiz.addEventListener('contextmenu', menu, true);
    return () => {
        cancelar();
        raiz.removeEventListener('focusin', foco);
        raiz.removeEventListener('pointerdown', baixo as EventListener, true);
        raiz.removeEventListener('pointermove', move as EventListener, true);
        raiz.removeEventListener('pointerup', cima, true);
        raiz.removeEventListener('pointercancel', cima, true);
        raiz.removeEventListener('click', clique, true);
        raiz.removeEventListener('contextmenu', menu, true);
    };
}

/**
 * O que faz: o botão solto ganha o nome, a dica e os ouvintes do foco e do toque longo nele.
 * Entra → sai: o elemento, o texto e a tecla → o elemento (ligar duas vezes não duplica).
 */
export function dica<T extends HTMLElement>(el: T, texto: string, opcoes: OpcoesDaDica = {}): T {
    marcarDica(el, texto, opcoes);
    if (!el.hasAttribute('data-dica-ligada')) {
        el.setAttribute('data-dica-ligada', '');
        ligarDicas(el);
    }
    return el;
}
