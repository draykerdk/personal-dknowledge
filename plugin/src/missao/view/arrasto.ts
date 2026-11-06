/**
 * O arrasto da Missão (P6): mover a tarefa, a alça de ligar e a ideia da triagem, com o fantasma, a
 * dica perto do ponteiro, o laço da borda (anda no tempo e entre as asas, no mapa) e o soltar, que vira
 * a intenção de sempre (`intencaoDeSoltar`) ou a ligação dos dois cartões (`ligar`, a interação do
 * cartão, view/interacao.ts), e a gravação do componente. A tarefa solta num cartão que não é do plano (o
 * tempo, o projeto, a SMART, outra tarefa), como a cidade ou o país, faz o Ligar dos dois: o campo que os
 * modelos dos tipos declaram entre eles (o acabamento, item 8 do roteiro, 05/11); sem campo, vale a linha. Vale em toda vista com cartões (o mapa, o
 * ramo, o Sistema; desde 30/10, os ramos também oferecem fazer conexões).
 *
 * Por quê: o passo `arrasto` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). O arrasto
 * morava no componente, e começava acima de 6 px; a casa usa `DRAG_THRESHOLD` (4 px,
 * missao/movimento.ts desde 02/11/2026) no painel e no canvas. Aqui (vista.entrada) ele tem um lugar só, com o
 * limiar da casa: a única mudança que se vê é o arrasto começar 2 px antes.
 *
 * Os elementos, o modelo e as gravações chegam pelo contexto (`ContextoDoArrasto`), do componente;
 * nada aqui grava. Prova: tests/missao/componenteMovimento.test.ts, tests/missao/componenteGrava.test.ts
 * e tests/missao/arrasto.test.ts.
 */
import { intencaoDeSoltar, type IntencaoDaTela } from '../intencoes';
import { DRAG_THRESHOLD, intervaloDaBorda, pixelsDaBorda, velocidadeDaBorda } from '../movimento';
import { idDoPeriodo, periodoDoId, type Escala } from '../tempo';
import type { ItemDaTriagem, MissaoModelo } from '../tipos';
import { el } from './dom';

/** Onde se solta na tela da triagem (Algum dia, Cancelar). */
export type SoltarNaTriagem = 'algum-dia' | 'cancelar';

/** O que o arrasto recebe do componente: os elementos, o estado de agora e o que fazer ao soltar. */
export interface ContextoDoArrasto {
    doc: Document;
    root: HTMLElement;
    app: HTMLElement;
    track: HTMLElement;
    tri: HTMLElement;
    map: HTMLElement;
    vp: HTMLElement;
    linkLine: HTMLElement;
    linkPath: HTMLElement;
    dropTip: HTMLElement;
    /** As vistas com cartões à vista (o mapa, o ramo, o Sistema): onde o arrasto começa e onde se solta. */
    superficies(): HTMLElement[];
    /** A alça solta noutro cartão: liga os dois (a interação do cartão). */
    ligar(de: string, para: string): void;
    /** O que a alça sobre outro cartão faria, em palavras (a dica perto do ponteiro). */
    previaDoLigar(de: string, para: string): string;
    /**
     * A tarefa solta num cartão que não é do plano: a prévia do Ligar dos dois quando ele tem o que gravar
     * (um campo dos modelos entre os dois tipos); `null` = nada, e o soltar fica com a linha.
     */
    soltarLiga(de: string, para: string): string | null;
    modelo(): MissaoModelo | null;
    escala(): Escala;
    destruido(): boolean;
    podeArrastar(): boolean;
    agora(): number;
    raf(fn: () => void): void;
    andar(d: 1 | -1): void;
    on(alvo: EventTarget, tipo: string, fn: (ev: any) => void): void;
    itemDaTriagem(): ItemDaTriagem | null;
    /** A ideia da triagem solta numa SMART. */
    soltarIdeia(item: ItemDaTriagem, smart: string): void;
    /** A tarefa solta em Algum dia ou em Cancelar, na tela da triagem. */
    soltarNaTriagem(id: string, item: ItemDaTriagem | null, onde: SoltarNaTriagem): void;
    triarPorIntencao(item: ItemDaTriagem, i: IntencaoDaTela, depois: () => void): void;
    gravarIntencao(i: IntencaoDaTela, depois: () => void): void;
    aposSoltar(id: string, alvoId: string | null): void;
}

/** O que o componente pergunta ao arrasto ligado. */
export interface ArrastoLigado {
    /** Há um arrasto em curso (começado ou só apertado). */
    ativo(): boolean;
    /** Desiste do arrasto (Escape), sem soltar. */
    cancelar(): void;
    /** O clique que segue o arrasto ainda não vale (até 400 ms depois de soltar). */
    suprimido(): boolean;
    /** O clique engolido: a supressão acaba. */
    soltarSupressao(): void;
}

/**
 * O que faz: diz se o ponteiro andou mais que o limiar da casa desde onde o gesto começou: aí o
 * aperto vira arrasto.
 * Por quê: o mesmo limiar do painel e do canvas (`DRAG_THRESHOLD`), num lugar só.
 * Entra → sai: o começo e o ponteiro de agora (px) → boolean.
 * Erro e ataque: exatamente no limiar ainda não é arrasto (como antes, `<=`).
 * Prova: tests/missao/arrasto.test.ts.
 */
export function passouDoLimiar(x0: number, y0: number, x: number, y: number): boolean {
    return Math.hypot(x - x0, y - y0) > DRAG_THRESHOLD;
}

/** Um arrasto em curso: o que se arrasta, de onde, e o alvo sob o ponteiro. */
interface Gesto {
    /** mover a tarefa, a alça de ligar (qualquer cartão), ou a ideia da triagem (solta numa SMART). */
    modo: 'mover' | 'ligar' | 'ideia';
    /** O alvo da tela da triagem (Algum dia, Cancelar), quando o soltar é ali. */
    soltarEm: 'algum-dia' | 'cancelar' | null;
    /** A SMART sob a ideia arrastada. */
    smartDaIdeia: string | null;
    /** O arrasto começou na tela da triagem (o item à vista anda depois de gravar). */
    daTriagem: boolean;
    id: string;
    el: HTMLElement;
    x0: number;
    y0: number;
    pid: number;
    iniciado: boolean;
    alvo: IntencaoDaTela | null;
    /** O cartão que não é do plano sob a tarefa, quando soltar nele é o Ligar dos dois (o campo dos modelos). */
    ligarCom: string | null;
    /** O id do alvo sob o ponteiro (a linha ou o nó), para trazer a linha ao foco depois. */
    alvoId: string | null;
    fantasma: HTMLElement | null;
    /** A última posição do ponteiro e as áreas medidas no começo (o laço da borda não mede nada). */
    px: number;
    py: number;
    vr: { top: number; bottom: number } | null;
    mr: { left: number; right: number } | null;
}

/**
 * O que faz: liga o arrasto na raiz do componente (o apertar, o mover, o soltar e o desistir) e
 * devolve o que o componente pergunta dele.
 * Por quê: o arrasto é uma parte da entrada (vista.entrada), com a mesma regra no toque e no mouse.
 * Entra → sai: o contexto → o arrasto ligado (os ouvintes saem com os do componente, pelo `on`).
 * Erro e ataque: só o botão principal, só onde se arrasta, só o mesmo ponteiro; o clique que segue o
 * soltar não abre o painel; nada grava sem soltar sobre um alvo que aceita.
 */
export function ligarArrasto(c: ContextoDoArrasto): ArrastoLigado {
    let gesto: Gesto | null = null;
    /** O clique que segue o arrasto (no trilho) não abre o painel: até este instante. */
    let suprimirClique = 0;
    let autoT = 0;
    const naVista = (e: Element | null) => !!e && c.superficies().some(s => s.contains(e));
    const limparQuentes = () => { for (const q of Array.from(c.root.querySelectorAll('.hot, .hot-link'))) q.classList.remove('hot', 'hot-link'); };
    const dica = (x: number, y: number, texto: string) => {
        c.dropTip.hidden = !texto;
        c.dropTip.textContent = texto;
        c.dropTip.style.left = `${Math.round(x + 14)}px`;
        c.dropTip.style.top = `${Math.round(y + 16)}px`;
    };
    /** O nó do plano: o que recebe a tarefa pela tabela das setas (o projeto, a SMART, o período). */
    const doPlano = (id: string) => id.startsWith('p:') || id.startsWith('s:') || !!periodoDoId(id);
    /** O alvo sob o ponteiro: um nó que recebe (projeto, SMART, período) ou uma linha que recebe. */
    function alvoDoSoltar(sob: Element | null): { id: string; el: Element } | null {
        const no = sob?.closest?.('[data-node]');
        if (no && naVista(no)) {
            const id = no.getAttribute('data-node') ?? '';
            if (doPlano(id)) return { id, el: no };
        }
        const row = sob?.closest?.('.row[data-drop]');
        if (row && c.track.contains(row)) return { id: idDoPeriodo(c.escala(), row.getAttribute('data-row') ?? ''), el: row };
        return null;
    }
    /**
     * O que faz: o cartão sob a tarefa arrastada que não é do plano nem outra tarefa (a cidade, o país, a
     * candidata), quando soltar nele grava o campo que os modelos declaram entre os dois tipos (o Ligar).
     * Por quê: o gesto com o sentido do tipo de destino (item 8 do roteiro): a tarefa solta na cidade a põe no
     * lugar dela, como o Ligar; antes, o soltar caía na linha do cartão e agendava para aquele dia. A outra
     * tarefa fica com a linha (o arrasto no tempo de sempre): soltar numa tarefa tem mais de um sentido.
     * Erro e ataque: o cartão fora da vista, a própria tarefa e o par sem campo entre os tipos dão `null`.
     */
    function cartaoQueLiga(sob: Element | null, id: string, modelo: MissaoModelo): { id: string; el: Element; previa: string } | null {
        const no = sob?.closest?.('[data-node]');
        if (!no || !naVista(no)) return null;
        const outro = no.getAttribute('data-node') ?? '';
        if (!outro || outro === id || doPlano(outro) || modelo.indice.porId.has(outro)) return null;
        const previa = c.soltarLiga(id, outro);
        return previa ? { id: outro, el: no, previa } : null;
    }
    /**
     * O laço da borda durante o arrasto: perto de cima ou de baixo anda no tempo, perto dos
     * lados anda entre as asas, mais depressa quanto mais perto (`velocidadeDaBorda`). Usa as
     * áreas medidas no começo e a última posição do ponteiro: nada se mede dentro do quadro.
     */
    function lacoDaBorda(): void {
        const g = gesto;
        if (!g || !g.iniciado || c.destruido() || !g.vr || !g.mr) return;
        const dentro = g.px >= g.mr.left && g.px <= g.mr.right;
        const vy = dentro ? velocidadeDaBorda(g.py, g.vr.top, g.vr.bottom) : 0;
        const vx = dentro && c.map.scrollWidth > c.map.clientWidth + 1 ? velocidadeDaBorda(g.px, g.mr.left, g.mr.right) : 0;
        const t = c.agora();
        if (vy && t - autoT >= intervaloDaBorda(vy)) { autoT = t; c.andar(vy > 0 ? 1 : -1); }
        if (vx) c.map.scrollLeft += pixelsDaBorda(vx);
        c.raf(lacoDaBorda);
    }
    function iniciarGesto(g: Gesto): void {
        g.iniciado = true;
        c.app.classList.add('dragging');
        // O laço da borda é do mapa (anda no tempo e entre as asas); no ramo e no Sistema, a vista rola sozinha.
        if (c.track.contains(g.el)) {
            const vr = c.vp.getBoundingClientRect(), mr = c.map.getBoundingClientRect();
            g.vr = { top: vr.top, bottom: vr.bottom };
            g.mr = { left: mr.left, right: mr.right };
            autoT = c.agora();
            c.raf(lacoDaBorda);
        }
        try { (g.el as any).setPointerCapture?.(g.pid); } catch { /* sem captura */ }
        if (g.modo === 'mover' || g.modo === 'ideia') {
            const f = el(c.doc, 'div', 'ghost node');
            f.textContent = g.el.querySelector('.tt')?.textContent ?? '';
            c.root.appendChild(f);
            g.fantasma = f;
            g.el.classList.add('ghosted');
        } else {
            c.linkLine.style.display = '';
        }
    }
    function moverGesto(g: Gesto, ev: PointerEvent): void {
        const modelo = c.modelo();
        if (!modelo) return;
        const rr = c.root.getBoundingClientRect();
        const x = ev.clientX - rr.left, y = ev.clientY - rr.top;
        limparQuentes();
        g.px = ev.clientX;
        g.py = ev.clientY;
        const sob = ((c.doc as any).elementFromPoint?.(ev.clientX, ev.clientY) as Element | null) ?? (ev.target as Element | null);
        if (g.fantasma) { g.fantasma.style.left = `${Math.round(x - 30)}px`; g.fantasma.style.top = `${Math.round(y - 14)}px`; }
        if (g.modo === 'ideia') {
            const sm = sob?.closest?.('[data-node^="s:"]');
            const s = sm && naVista(sm) ? modelo.indice.porId.get(sm.getAttribute('data-node') ?? '') : null;
            g.smartDaIdeia = s && s.tipo === 'smart' ? s.caminho : null;
            if (sm && g.smartDaIdeia) { sm.classList.add('hot'); dica(x, y, `Peça da SMART ${s!.titulo}`); }
            else dica(x, y, 'Solte a ideia numa SMART');
            return;
        }
        const zona = sob?.closest?.('[data-tri-soltar]');
        g.soltarEm = zona && c.tri.contains(zona) && g.modo === 'mover' ? (zona.getAttribute('data-tri-soltar') as Gesto['soltarEm']) : null;
        if (zona && g.soltarEm) { zona.classList.add('hot'); dica(x, y, g.soltarEm === 'algum-dia' ? 'Algum dia' : 'Cancelar'); g.alvo = null; return; }
        g.ligarCom = null;
        if (g.modo === 'mover') {
            const liga = cartaoQueLiga(sob, g.id, modelo);
            if (liga) { g.alvo = null; g.ligarCom = liga.id; g.alvoId = liga.id; liga.el.classList.add('hot-link'); dica(x, y, liga.previa); return; }
            const alvo = alvoDoSoltar(sob);
            g.alvo = alvo ? intencaoDeSoltar(modelo, g.id, alvo.id) : null;
            g.alvoId = alvo?.id ?? null;
            if (alvo && g.alvo && 'caminho' in g.alvo) { alvo.el.classList.add('hot'); dica(x, y, g.alvo.texto); }
            else dica(x, y, g.alvo && 'problema' in g.alvo ? g.alvo.problema : '');
        } else {
            const hr = g.el.getBoundingClientRect();
            const hx = hr.left - rr.left + hr.width / 2, hy = hr.top - rr.top + hr.height / 2;
            c.linkPath.setAttribute('d', `M${hx.toFixed(1)},${hy.toFixed(1)} C${(hx + 60).toFixed(1)},${hy.toFixed(1)} ${(x - 60).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`);
            // A alça sobre outro cartão de qualquer vista: a dica diz o que ligar os dois faria.
            const no = sob?.closest?.('[data-node]');
            const outro = no && naVista(no) ? no.getAttribute('data-node') : null;
            g.alvoId = outro && outro !== g.id ? outro : null;
            if (g.alvoId && no) { no.classList.add('hot-link'); dica(x, y, c.previaDoLigar(g.id, g.alvoId)); }
            else dica(x, y, 'Solte sobre outro cartão para ligar os dois');
        }
    }
    function terminarGesto(aplicar: boolean): void {
        const g = gesto;
        gesto = null;
        if (!g || !g.iniciado) return;
        g.fantasma?.remove();
        g.el.classList.remove('ghosted');
        c.linkLine.style.display = 'none';
        dica(0, 0, '');
        limparQuentes();
        c.app.classList.remove('dragging');
        suprimirClique = Date.now() + 400;
        if (!aplicar) return;
        const item = g.daTriagem ? c.itemDaTriagem() : null;
        if (g.modo === 'ideia') {
            if (item && g.smartDaIdeia) c.soltarIdeia(item, g.smartDaIdeia);
            return;
        }
        if (g.soltarEm) {
            c.soltarNaTriagem(g.id, item, g.soltarEm);
            return;
        }
        // A alça: liga os dois cartões (a interação diz o campo, a escolha ou o porquê de nenhum).
        if (g.modo === 'ligar') {
            if (g.alvoId) c.ligar(g.id, g.alvoId);
            return;
        }
        // A tarefa solta num cartão que não é do plano: o Ligar dos dois (o campo dos modelos).
        if (g.ligarCom) { c.ligar(g.id, g.ligarCom); return; }
        if (!g.alvo) return;
        const alvoId = g.alvoId;
        if (item && item.id === g.id) c.triarPorIntencao(item, g.alvo, () => c.aposSoltar(g.id, alvoId));
        else c.gravarIntencao(g.alvo, () => c.aposSoltar(g.id, alvoId));
    }
    c.on(c.root, 'pointerdown', (ev: PointerEvent) => {
        if (ev.button !== 0 || !c.podeArrastar() || !c.modelo()) return;
        const t = ev.target as HTMLElement;
        const h = t.closest?.('[data-handle]') as HTMLElement | null;
        const n = h ? null : (t.closest?.('[data-drag]') as HTMLElement | null);
        const alvo = h ?? n;
        const daTriagem = !!alvo && c.tri.contains(alvo);
        if (!alvo || !(naVista(alvo) || daTriagem)) return;
        const ideia = daTriagem && alvo.getAttribute('data-drag') === 'ideia';
        gesto = {
            modo: h ? 'ligar' : ideia ? 'ideia' : 'mover', id: ideia ? (alvo.getAttribute('data-tri-ideia') ?? '') : alvo.getAttribute(h ? 'data-handle' : 'data-node') ?? '', el: alvo,
            x0: ev.clientX, y0: ev.clientY, pid: ev.pointerId, iniciado: false, alvo: null, fantasma: null,
            soltarEm: null, smartDaIdeia: null, daTriagem, alvoId: null, ligarCom: null, px: ev.clientX, py: ev.clientY, vr: null, mr: null,
        };
        if (h) ev.preventDefault();
    });
    c.on(c.root, 'pointermove', (ev: PointerEvent) => {
        const g = gesto;
        if (!g || ev.pointerId !== g.pid) return;
        if (!g.iniciado) {
            if (!passouDoLimiar(g.x0, g.y0, ev.clientX, ev.clientY)) return;
            iniciarGesto(g);
        }
        ev.preventDefault();
        moverGesto(g, ev);
    });
    c.on(c.root, 'pointerup', (ev: PointerEvent) => { if (gesto && ev.pointerId === gesto.pid) terminarGesto(true); });
    c.on(c.root, 'pointercancel', () => terminarGesto(false));
    return {
        ativo: () => gesto !== null,
        cancelar: () => terminarGesto(false),
        suprimido: () => !!suprimirClique && Date.now() < suprimirClique,
        soltarSupressao: () => { suprimirClique = 0; },
    };
}
