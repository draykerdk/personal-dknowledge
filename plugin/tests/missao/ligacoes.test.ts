/**
 * Prova das ligações (view/ligacoes.ts), o dono único das curvas: a conta das pontas (pura: as caixas
 * do cartão e do conteúdo na tela, a borda e a escala do conteúdo e a rolagem dão a ponta exata) e o
 * agendador (um desenho por quadro; o observador do tamanho, o fim das animações e o pedido do casco
 * redesenham; desligado, nada mais).
 *
 * O que estes testes não provam: o layout de verdade (o DOM falso não tem layout). Isso é da prova no
 * navegador, tests/navegador/prova.mjs, que monta a Missão num Chrome sem janela e mede as pontas na tela.
 */
import { describe, expect, it } from 'vitest';
import { caixaNoConteudo, cartaoDaPonta, curvaEntre, desenharLigacoes, ligarCurvas, pontasDaSuperficie, type SuperficieDasLigacoes } from '../../src/missao/view/ligacoes';
import { svg } from '../../src/missao/view/dom';
import { documentoFalso, evento, type DocumentoFalso, type ElementoFalso } from '../fixtures/domFalso';

const SEM_ESPACO = { offsetWidth: 0, offsetHeight: 0, clientLeft: 0, clientTop: 0, scrollLeft: 0, scrollTop: 0 };
const pontas = (d: string) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number); return [n[0], n[1], n[n.length - 2], n[n.length - 1]]; };

describe('a conta das pontas (pura)', () => {
    it('a caixa do cartão no conteúdo: a tela menos a origem do conteúdo, menos a borda dele, mais a rolagem dele', () => {
        const cartao = { left: 110, top: 60, width: 100, height: 40 };
        const conteudo = { left: 10, top: 20, width: 1000, height: 600 };
        // Sem borda nem rolagem: a diferença.
        expect(caixaNoConteudo(cartao, conteudo, { ...SEM_ESPACO, offsetWidth: 1000, offsetHeight: 600 })).toEqual({ left: 100, top: 40, width: 100, height: 40 });
        // A linha aberta tem 1 px de borda em cima: o SVG começa na caixa de dentro (a captura de 30/10: tudo 1 px abaixo).
        expect(caixaNoConteudo(cartao, conteudo, { ...SEM_ESPACO, offsetWidth: 1000, offsetHeight: 600, clientTop: 1 })).toEqual({ left: 100, top: 39, width: 100, height: 40 });
        // O conteúdo rolado por dentro: o SVG rola com os cartões, a ponta soma a rolagem.
        expect(caixaNoConteudo(cartao, conteudo, { ...SEM_ESPACO, offsetWidth: 1000, offsetHeight: 600, clientLeft: 2, clientTop: 1, scrollLeft: 30, scrollTop: 15 }))
            .toEqual({ left: 128, top: 54, width: 100, height: 40 });
    });

    it('o conteúdo em escala (a pinça): a conta volta ao espaço sem escala do SVG', () => {
        // O conteúdo de 1000 px aparece com 500 na tela (escala 0,5): o cartão a 50 px na tela está a 100 no SVG.
        const r = caixaNoConteudo({ left: 60, top: 30, width: 50, height: 20 }, { left: 10, top: 10, width: 500, height: 300 }, { ...SEM_ESPACO, offsetWidth: 1000, offsetHeight: 600 });
        expect(r).toEqual({ left: 100, top: 40, width: 100, height: 40 });
        // O conteúdo sem tamanho (escondido, o DOM falso): escala 1.
        expect(caixaNoConteudo({ left: 60, top: 30, width: 50, height: 20 }, { left: 10, top: 10, width: 0, height: 0 }, SEM_ESPACO)).toEqual({ left: 50, top: 20, width: 50, height: 20 });
    });

    it('a curva vai da borda direita de um cartão à borda esquerda do outro, no meio da altura de cada um', () => {
        const c = curvaEntre({ left: 0, top: 0, width: 100, height: 40 }, { left: 200, top: 100, width: 80, height: 20 })!;
        expect([c.ax, c.ay, c.bx, c.by]).toEqual([100, 20, 200, 110]);
        expect(pontas(c.d)).toEqual([100, 20, 200, 110]);
        expect(c.d).toBe('M100.0,20.0 C150.0,20.0 150.0,110.0 200.0,110.0');
        expect(c.colchete).toBe(false);
        // Dois pixels de folga ainda contam como à direita (o arredondamento da grade); a folga mínima da curva é 16.
        expect(curvaEntre({ left: 0, top: 0, width: 100, height: 40 }, { left: 99, top: 0, width: 80, height: 40 })!.d).toBe('M100.0,20.0 C116.0,20.0 83.0,20.0 99.0,20.0');
    });

    it('o par na mesma coluna é um colchete pela esquerda; atrás, sem o colchete, ou sem largura, não há curva', () => {
        const a = { left: 50, top: 0, width: 100, height: 40 }, b = { left: 50, top: 100, width: 100, height: 40 };
        const c = curvaEntre(a, b, true)!;
        expect(c.colchete).toBe(true);
        expect(pontas(c.d)).toEqual([50, 20, 50, 120]);
        expect(c.d).toBe('M50.0,20.0 C25.0,20.0 25.0,120.0 50.0,120.0');
        expect(curvaEntre(a, b)).toBeNull();
        expect(curvaEntre({ ...a, width: 0 }, b, true)).toBeNull();
        // De colunas diferentes, para trás: nada, nem com o colchete.
        expect(curvaEntre({ left: 300, top: 0, width: 100, height: 40 }, { left: 0, top: 0, width: 100, height: 40 }, true)).toBeNull();
    });
});

/** Um conteúdo com o SVG e três cartões: dois no mapa (`data-node`) e um invólucro do ramo (`data-cartao`). */
function montarConteudo(doc: DocumentoFalso) {
    const conteudo = doc.body.appendChild(doc.createElement('div'));
    conteudo.appendChild(svg(doc as unknown as Document, 'svg', { class: 'edges' }) as unknown as ElementoFalso);
    const a = conteudo.appendChild(doc.createElement('button'));
    a.setAttribute('data-node', 'p:a');
    a.className = 'node';
    const invólucro = conteudo.appendChild(doc.createElement('div'));
    invólucro.setAttribute('data-cartao', 's:b');
    const b = invólucro.appendChild(doc.createElement('button'));
    b.setAttribute('data-node', 's:b');
    b.className = 'node';
    doc.medir(conteudo, { left: 0, top: 0, width: 800, height: 400 });
    doc.medir(a, { left: 20, top: 40, width: 160, height: 40 });
    doc.medir(b, { left: 300, top: 140, width: 160, height: 60 });
    return { conteudo, a, b, invólucro };
}

describe('as pontas são os cartões, nunca os invólucros', () => {
    it('no mapa a ponta é o próprio nó; no ramo, o cartão de dentro do invólucro', () => {
        const doc = documentoFalso();
        const { conteudo, a, b, invólucro } = montarConteudo(doc);
        expect(cartaoDaPonta(a as unknown as Element)).toBe(a);
        expect(cartaoDaPonta(invólucro as unknown as Element)).toBe(b);
        const doRamo = pontasDaSuperficie(conteudo as unknown as HTMLElement, 'data-cartao');
        expect([...doRamo.keys()]).toEqual(['s:b']);
        expect(doRamo.get('s:b')).toBe(b);
    });

    it('a curva do ramo toca o cartão, mesmo com o invólucro maior que ele (a tarefa a 10 px da curva, 30/10)', () => {
        const doc = documentoFalso();
        const { conteudo, a, invólucro } = montarConteudo(doc);
        a.setAttribute('data-cartao', 'p:a');
        // O invólucro mais largo que o cartão, à esquerda dele: a curva vai ao cartão.
        doc.medir(invólucro, { left: 290, top: 130, width: 190, height: 80 });
        const n = desenharLigacoes(conteudo as unknown as HTMLElement, [{ de: 'p:a', para: 's:b', tipo: 'estrutura' }], { ligacoes: { estrutura: { traco: 'continuo', rotulo: '' } } }, null, false, { atributo: 'data-cartao' });
        expect(n).toBe(1);
        expect(pontas(conteudo.querySelector('svg.edges path')!.getAttribute('d')!)).toEqual([180, 60, 300, 170]);
    });
});

/** Um ResizeObserver falso: guarda o que observa e avisa quando o teste manda. */
class ObservadorFalso {
    static ultimo: ObservadorFalso | null = null;
    readonly vistos = new Set<unknown>();
    desligado = false;
    constructor(readonly fn: () => void) { ObservadorFalso.ultimo = this; }
    observe(e: unknown) { this.vistos.add(e); }
    unobserve(e: unknown) { this.vistos.delete(e); }
    disconnect() { this.desligado = true; this.vistos.clear(); }
    avisar() { if (!this.desligado) this.fn(); }
}

describe('o agendador (um desenho por quadro, de todas as superfícies)', () => {
    const preparar = (comObservador: boolean) => {
        const doc = documentoFalso();
        if (comObservador) doc.defaultView.ResizeObserver = ObservadorFalso;
        const { conteudo, a, b } = montarConteudo(doc);
        const superficie = (): SuperficieDasLigacoes => ({
            conteudo: conteudo as unknown as HTMLElement, ligacoes: [{ de: 'p:a', para: 's:b', tipo: 'estrutura' }],
            ramoPrincipal: { ligacoes: { estrutura: { traco: 'continuo', rotulo: '' } } }, realce: null, soLinhagem: false,
        });
        let desenhos = 0;
        const curvas = ligarCurvas(doc.defaultView, doc.body as unknown as HTMLElement, () => [superficie()], () => { desenhos++; });
        const d = () => pontas(conteudo.querySelector('svg.edges path')?.getAttribute('d') ?? '');
        return { doc, conteudo, a, b, curvas, desenhos: () => desenhos, d };
    };

    it('vários pedidos no mesmo quadro dão um desenho só; o agora desenha já', () => {
        const t = preparar(false);
        t.curvas.pedir();
        t.curvas.pedir();
        t.curvas.pedir();
        expect(t.desenhos()).toBe(0);
        t.doc.rodarQuadros();
        expect(t.desenhos()).toBe(1);
        expect(t.d()).toEqual([180, 60, 300, 170]);
        t.curvas.agora();
        expect(t.desenhos()).toBe(2);
    });

    it('o observador do tamanho vigia o conteúdo e os cartões, e o aviso dele redesenha com a medida nova', () => {
        const t = preparar(true);
        t.curvas.agora();
        const ro = ObservadorFalso.ultimo!;
        expect(ro.vistos.has(t.conteudo)).toBe(true);
        expect(ro.vistos.has(t.a)).toBe(true);
        expect(ro.vistos.has(t.b)).toBe(true);
        // O painel abre ao lado: os cartões andam 198 px para a esquerda, e só o tamanho do conteúdo avisa.
        t.doc.medir(t.a, { left: -178 });
        t.doc.medir(t.b, { left: 102 });
        ro.avisar();
        expect(t.d()).toEqual([-18, 60, 102, 170]);
    });

    it('o fim de uma animação ou de uma transição que mexe nas pontas pede um desenho; a da cor, não', () => {
        const t = preparar(false);
        t.doc.body.dispatchEvent(evento('transitionend', { propertyName: 'opacity' }));
        t.doc.body.dispatchEvent(evento('transitionend', { propertyName: 'box-shadow' }));
        t.doc.rodarQuadros();
        expect(t.desenhos()).toBe(0);
        t.doc.body.dispatchEvent(evento('animationend', { animationName: 'dfm-missao-rise' }));
        t.doc.rodarQuadros();
        expect(t.desenhos()).toBe(1);
        t.doc.body.dispatchEvent(evento('transitionend', { propertyName: 'transform' }));
        t.doc.rodarQuadros();
        expect(t.desenhos()).toBe(2);
    });

    it('desligado, nada mais desenha: nem o pedido, nem o observador, nem as animações', () => {
        const t = preparar(true);
        t.curvas.agora();
        const ro = ObservadorFalso.ultimo!;
        t.curvas.desligar();
        expect(ro.desligado).toBe(true);
        t.curvas.pedir();
        t.doc.body.dispatchEvent(evento('animationend', {}));
        ro.avisar();
        t.doc.rodarQuadros();
        expect(t.desenhos()).toBe(1);
    });
});
