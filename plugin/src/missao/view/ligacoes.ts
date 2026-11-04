/**
 * As ligações da Missão, um dono só para as curvas de toda vista (o mapa e o ramo da pinça): onde o
 * SVG mora, como as pontas se medem, quando se redesenha, e o realce da linhagem por classe.
 *
 * Por quê: as curvas quebravam de novo a cada remendo (30/10: curtas depois da pinça; no ramo, paradas
 * no meio do caminho, com tocos na borda de fora dos pais). A prova no navegador de verdade
 * (tests/navegador/prova.mjs) achou as causas, todas de um desenho feito uma vez e nunca refeito:
 * - o tamanho da vista mudava por dentro (o painel do nó abre ao lado com `padding-right`, a gaveta, a
 *   triagem) e só o mapa se redesenhava em alguns desses caminhos; o ramo ficava com a medida velha
 *   (a captura de 30/10: ~198 px para a esquerda, a metade do painel);
 * - a medida saía da caixa da borda do conteúdo, e o SVG mora na caixa de dentro (a borda de 1 px da
 *   linha aberta deixava todas as curvas do mapa 1 px abaixo do meio dos cartões);
 * - a medida saía no meio da animação das células (o `translateY` de 4 px) e não se refazia no fim;
 * - no ramo, a ponta era o invólucro (`data-cartao`) e não o cartão (a tarefa, com a margem de 10 px
 *   que o `.card` do Obsidian dava, ficava a 10 px da curva).
 *
 * O desenho certo, num lugar só:
 * - o SVG mora no mesmo conteúdo que rola com os cartões (`svg.edges` em `inset: 0`), e cada ponta é a
 *   caixa do cartão nas coordenadas desse conteúdo (`caixaNoConteudo`: a tela menos a origem da caixa de
 *   dentro, mais a rolagem, sem a escala do conteúdo), nunca dois espaços misturados;
 * - a curva vai da borda direita de um cartão à borda esquerda do outro; o par na mesma coluna, por um
 *   colchete pela esquerda (`curvaEntre`);
 * - um agendador só (`ligarCurvas`): o `ResizeObserver` no conteúdo e nos cartões, o fim das animações
 *   e transições, e os pedidos explícitos (depois da pintura, do centrar e do fim da pinça), juntos num
 *   desenho por quadro.
 *
 * Prova: tests/missao/ligacoes.test.ts (a conta, pura, e o agendador) e tests/navegador/prova.mjs (as
 * pontas na tela de um navegador de verdade).
 */
import type { Ligacao } from '../tipos';
import type { RamoPrincipal } from '../ramoPrincipal';
import type { Caixa } from '../movimento';
import { svg } from './dom';

/** P6: as ligações que se desligam (a mãe, o projeto, o bloqueio) e a escolhida. */
export interface OpcoesDasLigacoes {
    desligavel?: (l: Ligacao) => boolean;
    escolhida?: { de: string; para: string } | null;
    /** Dá o nome e a dica ao × da ligação escolhida (o `marcar` do Contexto). */
    marcar?: (el: HTMLElement, texto: string, tecla?: string) => void;
    /** O atributo que dá a ponta de cada curva (o mapa do ramo usa `data-cartao`); sem ele, `data-node`. */
    atributo?: string;
    /**
     * Desenha também a ligação entre dois nós da mesma coluna, como um colchete pela esquerda (o par no
     * mapa do ramo, 30/10); sem a opção, a curva para trás não se desenha, como sempre.
     */
    emColuna?: boolean;
}

/** Uma superfície de curvas: o conteúdo que rola com os cartões (com o `svg.edges` dentro) e o que desenhar nele. */
export interface SuperficieDasLigacoes {
    /** A linha aberta do mapa, o mapa do ramo: o pai do `svg.edges` e dos cartões. */
    conteudo: HTMLElement;
    ligacoes: readonly Ligacao[];
    ramoPrincipal: Pick<RamoPrincipal, 'ligacoes'>;
    realce: ReadonlySet<string> | null;
    soLinhagem: boolean;
    opcoes?: OpcoesDasLigacoes;
}

/** Um retângulo na tela, como `getBoundingClientRect` o dá. */
export interface RetanguloNaTela { left: number; top: number; width: number; height: number }

/** O que o conteúdo diz do próprio espaço: a caixa sem escala (`offset*`), a borda (`client*`) e a rolagem. */
export interface EspacoDoConteudo { offsetWidth: number; offsetHeight: number; clientLeft: number; clientTop: number; scrollLeft: number; scrollTop: number }

/** Uma curva pronta: o caminho e as pontas, nas coordenadas do conteúdo. */
export interface Curva { d: string; ax: number; ay: number; bx: number; by: number; colchete: boolean }

/**
 * O que faz: a caixa de um cartão nas coordenadas do conteúdo, que são as do SVG das curvas (ele mora
 * no conteúdo, em `inset: 0`, a partir da caixa de dentro dele): o retângulo do cartão na tela menos o
 * do conteúdo, sem a escala do conteúdo (a da pinça), menos a borda dele, mais a rolagem dele.
 * Por quê: a curva tem de estar no espaço em que o SVG desenha. A rolagem de quem contém o conteúdo
 * move o conteúdo e o cartão juntos (some na diferença); a do próprio conteúdo move o cartão e o SVG
 * juntos, e entra aqui; a borda do conteúdo fica fora do SVG (a linha aberta tem 1 px em cima).
 * Entra → sai: o retângulo do cartão e o do conteúdo na tela, e o espaço do conteúdo → a caixa.
 * Erro e ataque: o conteúdo sem tamanho (escondido, o DOM dos testes) vale escala 1; nada aqui lê o DOM.
 * Prova: tests/missao/ligacoes.test.ts ("a conta").
 */
export function caixaNoConteudo(cartao: RetanguloNaTela, conteudo: RetanguloNaTela, espaco: EspacoDoConteudo): Caixa {
    const ex = espaco.offsetWidth > 0 && conteudo.width > 0 ? conteudo.width / espaco.offsetWidth : 1;
    const ey = espaco.offsetHeight > 0 && conteudo.height > 0 ? conteudo.height / espaco.offsetHeight : 1;
    return {
        left: (cartao.left - conteudo.left) / ex - (espaco.clientLeft || 0) + (espaco.scrollLeft || 0),
        top: (cartao.top - conteudo.top) / ey - (espaco.clientTop || 0) + (espaco.scrollTop || 0),
        width: cartao.width / ex,
        height: cartao.height / ey,
    };
}

const f1 = (n: number) => n.toFixed(1);

/**
 * O que faz: a curva entre dois cartões: da borda direita de `a` à borda esquerda de `b`, no meio da
 * altura de cada um; os dois na mesma coluna (com `emColuna`), um colchete pela esquerda, da borda
 * esquerda de um à do outro; `b` atrás de `a` (o centro empilhado no celular), nenhuma.
 * Por quê: a curva liga borda com borda, sempre do cartão (nunca do invólucro).
 * Entra → sai: as caixas no conteúdo e se o colchete vale → a curva, ou `null`.
 * Erro e ataque: a caixa sem largura (o painel escondido, o cartão fora da tela) não tem curva; dois
 * pixels de folga contam como "à direita" (o arredondamento da grade).
 * Prova: tests/missao/ligacoes.test.ts ("a conta").
 */
export function curvaEntre(a: Caixa, b: Caixa, emColuna = false): Curva | null {
    if (!a.width || !b.width) return null;
    const ax = a.left + a.width, ay = a.top + a.height / 2;
    const bx = b.left, by = b.top + b.height / 2;
    if (bx >= ax - 2) {
        const dx = Math.max(16, (bx - ax) * 0.5);
        return { d: `M${f1(ax)},${f1(ay)} C${f1(ax + dx)},${f1(ay)} ${f1(bx - dx)},${f1(by)} ${f1(bx)},${f1(by)}`, ax, ay, bx, by, colchete: false };
    }
    if (emColuna && a.left < b.left + b.width && b.left < a.left + a.width) {
        const x0 = Math.min(a.left, b.left);
        const dx = Math.min(36, Math.max(12, Math.abs(by - ay) * 0.25));
        return { d: `M${f1(x0)},${f1(ay)} C${f1(x0 - dx)},${f1(ay)} ${f1(x0 - dx)},${f1(by)} ${f1(x0)},${f1(by)}`, ax: x0, ay, bx: x0, by, colchete: true };
    }
    return null;
}

/**
 * O que faz: o cartão de uma ponta: o próprio elemento quando ele é o nó (`data-node`, o mapa); no
 * invólucro do ramo (`data-cartao`), o cartão de dentro.
 * Por quê: a curva toca o cartão; o invólucro só posiciona, e a caixa dele não é a do cartão.
 */
export function cartaoDaPonta(e: Element): Element {
    if (e.hasAttribute('data-node')) return e;
    return e.querySelector('[data-node], .node') ?? e;
}

/** O que faz: o espaço do conteúdo, lido do DOM (as medidas que `caixaNoConteudo` usa). */
function espacoDe(conteudo: HTMLElement): EspacoDoConteudo {
    return {
        offsetWidth: conteudo.offsetWidth || 0, offsetHeight: conteudo.offsetHeight || 0,
        clientLeft: conteudo.clientLeft || 0, clientTop: conteudo.clientTop || 0,
        scrollLeft: conteudo.scrollLeft || 0, scrollTop: conteudo.scrollTop || 0,
    };
}

/**
 * O que faz: as pontas de uma superfície: a chave (o `data-node`, ou o atributo da superfície) de cada
 * uma, com o cartão dela (o primeiro com a chave).
 */
export function pontasDaSuperficie(conteudo: HTMLElement, atributo = 'data-node'): Map<string, Element> {
    const out = new Map<string, Element>();
    for (const n of Array.from(conteudo.querySelectorAll(`[${atributo}]`))) {
        const id = n.getAttribute(atributo);
        if (id && !out.has(id)) out.set(id, cartaoDaPonta(n));
    }
    return out;
}

/**
 * O que faz: desenha as curvas de uma superfície no SVG dela; devolve quantas desenhou.
 * Entra → sai: o conteúdo (a linha aberta, o mapa do ramo), as ligações do modelo, o ramo, a
 * linhagem acesa e se é para desenhar só a linhagem (Abrir tudo) → o número de curvas.
 * Erro e ataque: ponta que não está no conteúdo, ou sem tamanho (painel escondido), não desenha; o tipo
 * que o ramo não declara não se desenha; a curva para trás só como colchete, onde a superfície pede.
 * Prova: tests/missao/ligacoes.test.ts e tests/navegador/prova.mjs.
 */
export function desenharLigacoes(conteudo: HTMLElement, ligacoes: readonly Ligacao[], ramoPrincipal: Pick<RamoPrincipal, 'ligacoes'>, realce: ReadonlySet<string> | null, soLinhagem: boolean, opcoes: OpcoesDasLigacoes = {}): number {
    const host = conteudo.querySelector(':scope > svg.edges') as SVGElement | null;
    if (!host) return 0;
    while (host.firstChild) host.removeChild(host.firstChild);
    for (const x of Array.from(conteudo.querySelectorAll(':scope > .ex'))) x.remove();
    const doc = conteudo.ownerDocument;
    const nos = pontasDaSuperficie(conteudo, opcoes.atributo ?? 'data-node');
    const r0 = conteudo.getBoundingClientRect();
    const espaco = espacoDe(conteudo);
    const caixas = new Map<string, Caixa>();
    const caixa = (id: string): Caixa | null => {
        const e = nos.get(id);
        if (!e) return null;
        if (!caixas.has(id)) caixas.set(id, caixaNoConteudo(e.getBoundingClientRect(), r0, espaco));
        return caixas.get(id)!;
    };
    let feitas = 0;
    for (const lig of ligacoes) {
        const tipo = ramoPrincipal.ligacoes[lig.tipo];
        if (!tipo) continue;
        if (soLinhagem && !(realce && realce.has(lig.de) && realce.has(lig.para))) continue;
        const a = caixa(lig.de), b = caixa(lig.para);
        const c = a && b ? curvaEntre(a, b, !!opcoes.emColuna) : null;
        if (!c) continue;
        const sel = !!opcoes.escolhida && opcoes.escolhida.de === lig.de && opcoes.escolhida.para === lig.para;
        host.appendChild(svg(doc, 'path', { class: `e-${lig.tipo} t-${tipo.traco}${sel ? ' sel' : ''}`, 'data-a': lig.de, 'data-b': lig.para, d: c.d }));
        // A ligação que é campo da tarefa se escolhe com um clique (Delete ou × desliga).
        if (opcoes.desligavel?.(lig)) {
            host.appendChild(svg(doc, 'path', { class: 'hit', 'data-edge': lig.tipo, 'data-a': lig.de, 'data-b': lig.para, d: c.d }));
            if (sel) {
                const x = doc.createElement('button');
                x.type = 'button';
                x.className = 'ex';
                x.textContent = '×';
                x.setAttribute('data-act', 'desligar-escolhida');
                opcoes.marcar?.(x, 'Desligar esta ligação', 'Delete');
                // O × mora no conteúdo, no mesmo espaço das curvas (`absolute` parte da caixa de dentro, como o SVG).
                x.style.left = `${f1((c.ax + c.bx) / 2)}px`;
                x.style.top = `${f1((c.ay + c.by) / 2)}px`;
                conteudo.appendChild(x);
            }
        }
        feitas++;
    }
    return feitas;
}

/* ------------------------------------------------------------ quando se redesenha */

/** O que o casco pergunta das curvas ligadas. */
export interface CurvasLigadas {
    /** Pede um redesenho: vários pedidos no mesmo quadro dão um desenho só. */
    pedir(): void;
    /** Desenha já (o layout está pronto: um gesto que muda a escolha, o fim da pinça, o lugar que mediu). */
    agora(): void;
    /** Desliga o observador e os ouvintes. */
    desligar(): void;
}

/**
 * As propriedades cuja transição ou animação move ou muda o tamanho de um cartão (as outras, como a
 * cor e a sombra, não mexem nas pontas e não pedem redesenho).
 */
const MEXE_NA_PONTA = /^(transform|translate|scale|rotate|width|height|min-|max-|padding|margin|top|left|right|bottom|inset|flex|grid|gap|font|line-height|all$)/;

/**
 * O que faz: liga o desenho das curvas a um agendador só: o `ResizeObserver` no conteúdo de cada
 * superfície e em cada cartão das pontas (o tamanho que muda por dentro: o painel ao lado, a triagem, o
 * texto que chega, a fonte), o fim das animações e das transições que mexem nas pontas (a célula que
 * sobe ao abrir, a pinça) e os pedidos do casco; tudo vira um desenho por quadro, de todas as
 * superfícies à vista, e depois o `depois` (o realce da linhagem).
 * Por quê: o desenho é uma medida do layout de agora; ele só fica certo se for refeito sempre que o
 * layout muda, e quem sabe disso é o navegador, não uma lista de lugares no casco (30/10).
 * Entra → sai: a janela, o elemento que recebe os eventos de animação (a área do mapa), as superfícies
 * à vista (lidas a cada desenho) e o que fazer depois → as curvas ligadas.
 * Erro e ataque: sem `ResizeObserver` (o DOM dos testes, um lugar antigo), valem os pedidos e o
 * redimensionar do lugar; sem quadros (a janela em segundo plano), o temporizador desenha; o
 * observador só mede o que está à vista e solta o que saiu; desligado, nada mais desenha.
 * Prova: tests/missao/ligacoes.test.ts ("o agendador").
 */
export function ligarCurvas(win: any, eventos: HTMLElement, superficies: () => SuperficieDasLigacoes[], depois?: () => void): CurvasLigadas {
    let pendente = false;
    let desligado = false;
    const vistos = new Set<Element>();
    const RO = win?.ResizeObserver as (typeof ResizeObserver) | undefined;
    // O que o observador avisa já está medido (ele roda depois do layout e antes da pintura): desenha ali mesmo.
    const observador = typeof RO === 'function' ? new RO(() => { if (!desligado) desenhar(true); }) : null;
    /**
     * O que faz: o observador passa a medir o conteúdo e as pontas de agora, e solta os que saíram.
     * Dentro do aviso do observador, os novos entram no quadro seguinte (observar ali mesmo deixaria
     * avisos para trás, e o navegador reclama do laço).
     */
    function vigiar(atuais: Set<Element>, doObservador: boolean): void {
        if (!observador) return;
        for (const e of [...vistos]) if (!atuais.has(e)) { observador.unobserve(e); vistos.delete(e); }
        const novos = [...atuais].filter(e => !vistos.has(e));
        if (!novos.length) return;
        const entrar = () => { if (desligado) return; for (const e of novos) if (!vistos.has(e) && e.isConnected) { observador.observe(e); vistos.add(e); } };
        if (!doObservador) entrar();
        else if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(entrar);
        else win.setTimeout?.(entrar, 0);
    }
    function desenhar(doObservador: boolean): void {
        if (desligado) return;
        pendente = false;
        const atuais = new Set<Element>();
        for (const s of superficies()) {
            desenharLigacoes(s.conteudo, s.ligacoes, s.ramoPrincipal, s.realce, s.soLinhagem, s.opcoes ?? {});
            atuais.add(s.conteudo);
            // O cartão e o invólucro dele: a fila das ferramentas abre dentro do invólucro e empurra os de baixo
            // sem mudar o tamanho do cartão (02/11: depois de uma rolagem, o mouse parado sobre um cartão abria a
            // fila e as curvas ficavam ~24 px fora); o invólucro muda de altura, e o observador redesenha.
            for (const e of pontasDaSuperficie(s.conteudo, s.opcoes?.atributo ?? 'data-node').values()) {
                atuais.add(e);
                if (e.parentElement && e.parentElement !== s.conteudo) atuais.add(e.parentElement);
            }
        }
        vigiar(atuais, doObservador);
        depois?.();
    }
    const agora = () => desenhar(false);
    const rodar = () => { if (pendente) agora(); };
    function pedir(): void {
        if (pendente || desligado) return;
        pendente = true;
        if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(rodar);
        // Sem quadros (a janela em segundo plano), o temporizador desenha; o que chegar primeiro vale.
        win?.setTimeout?.(rodar, 60);
    }
    const aoAcabar = (ev: { propertyName?: string; type: string }) => {
        if (ev.type.startsWith('transition') && !MEXE_NA_PONTA.test(String(ev.propertyName ?? ''))) return;
        pedir();
    };
    const tipos = ['animationend', 'animationcancel', 'transitionend', 'transitioncancel'];
    for (const t of tipos) eventos.addEventListener(t, aoAcabar as EventListener);
    return {
        pedir,
        agora,
        desligar: () => {
            desligado = true;
            observador?.disconnect();
            vistos.clear();
            for (const t of tipos) eventos.removeEventListener(t, aoAcabar as EventListener);
        },
    };
}

/* ------------------------------------------------------------ o realce */

/**
 * O que faz: o que acende numa superfície: a linhagem do alvo (já dita nas pontas desta superfície), o
 * próprio alvo e a outra ponta de cada curva desenhada que sai dele ou chega nele; sem alvo, `null`.
 * Por quê: com o cursor sobre o nó, ele e as suas conexões se destacam no mapa, e nos ramos não era assim
 * (02/11/2026): o mesmo realce em toda superfície (o mapa, qualquer ramo).
 * Entra → sai: o conteúdo, a ponta do alvo, a linhagem nas pontas e o atributo das pontas → o conjunto.
 */
export function acesoNaSuperficie(conteudo: HTMLElement, alvo: string | null, linhagem: ReadonlySet<string> | null): Set<string> | null {
    if (!alvo) return null;
    const out = new Set<string>(linhagem ?? []);
    out.add(alvo);
    for (const p of Array.from(conteudo.querySelectorAll('svg.edges path:not(.hit)'))) {
        const a = p.getAttribute('data-a') ?? '', b = p.getAttribute('data-b') ?? '';
        if (a === alvo) out.add(b);
        else if (b === alvo) out.add(a);
    }
    return out;
}

/**
 * O que faz: acende a linhagem numa superfície (o mapa, o mapa de qualquer ramo): o cartão do alvo fica
 * como está (o destaque dele é o do mouse ou do foco), o que se liga a ele acende (`lit`), o resto apaga
 * (`dim`); as curvas entre dois acesos acendem (`on`), as outras apagam. Sem alvo, tudo volta ao normal.
 * O `escolhido` marca `selected` (o mapa); `undefined` deixa a marca como está (o ramo marca pelo nó).
 * Por quê: o realce por classe, sem redesenhar (§9.2); um só realce para o mapa e os ramos (02/11).
 * Entra → sai: o conteúdo, a ponta do alvo, a linhagem nas pontas, o escolhido e o atributo das pontas
 * (`data-node` no mapa, `data-cartao` no ramo) → as classes nos cartões e nas curvas.
 * Prova: tests/missao/interacao.test.ts ("o realce") e tests/navegador/prova.mjs.
 */
export function acenderLinhagem(conteudo: HTMLElement, alvo: string | null, linhagem: ReadonlySet<string> | null, escolhido?: string | null, atributo = 'data-node'): void {
    const aceso = acesoNaSuperficie(conteudo, alvo, linhagem);
    for (const n of Array.from(conteudo.querySelectorAll(`[${atributo}]`))) {
        const id = n.getAttribute(atributo) ?? '';
        const c = cartaoDaPonta(n);
        c.classList.toggle('dim', !!aceso && !aceso.has(id));
        c.classList.toggle('lit', !!aceso && aceso.has(id) && id !== alvo);
        if (escolhido !== undefined) c.classList.toggle('selected', !!escolhido && id === escolhido);
    }
    for (const p of Array.from(conteudo.querySelectorAll('svg.edges path:not(.hit)'))) {
        const on = !!aceso && aceso.has(p.getAttribute('data-a') ?? '') && aceso.has(p.getAttribute('data-b') ?? '');
        p.classList.toggle('on', on);
        p.classList.toggle('dim', !!aceso && !on);
    }
}
