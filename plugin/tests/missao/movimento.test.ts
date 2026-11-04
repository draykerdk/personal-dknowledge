/** Prova do movimento da Missão (P7c): a roda e o trackpad em passos de linha, e a velocidade da borda do arrasto. */
import { describe, expect, it } from 'vitest';
import {
    DURACAO_DO_PASSO, MAX_POR_GESTO, PAUSA_DO_GESTO, RODA_PARADA, ehEntalhe, rolarNoBloco, linhasDoPico, intervaloDaBorda, passoDaRoda, pixelsDaBorda, transicaoDoPasso, velocidadeDaBorda,
    type EstadoDaRoda, type EventoDaRoda,
} from '../../src/missao/movimento';

/** Roda uma sequência de deltas verticais (16 ms entre eles) e devolve as linhas andadas. */
function gesto(deltas: number[], o: Partial<EventoDaRoda> = {}, inicio = 1000, estado: EstadoDaRoda = RODA_PARADA) {
    let s = estado, linhas = 0, t = inicio;
    for (const d of deltas) {
        const r = passoDaRoda(s, { deltaX: 0, deltaY: d, deltaMode: 0, t, ...o });
        s = r.estado;
        linhas += r.passos;
        t += 16;
    }
    return { linhas, estado: s, fim: t };
}
/** Um deslize de trackpad: sobe até o pico e decai (a inércia), em pixels fracionários. */
const deslize = (pico: number, subida = 6, descida = 18) => [
    ...Array.from({ length: subida }, (_, i) => +(pico * (i + 1) / subida).toFixed(2) + 0.37),
    ...Array.from({ length: descida }, (_, i) => +(pico * (1 - (i + 1) / (descida + 1))).toFixed(2) + 0.13),
];

describe('a roda e o trackpad', () => {
    it('um deslize leve anda uma linha só, mesmo com a cauda longa da inércia', () => {
        expect(gesto(deslize(14)).linhas).toBe(1);
        expect(gesto(deslize(22, 4, 40)).linhas).toBe(1);
        // Para cima, o mesmo.
        expect(gesto(deslize(14).map(d => -d)).linhas).toBe(-1);
    });
    it('um deslize forte anda mais, mas nunca mais que MAX_POR_GESTO', () => {
        const forte = gesto(deslize(160, 8, 30)).linhas;
        expect(forte).toBeGreaterThanOrEqual(2);
        expect(forte).toBeLessThanOrEqual(MAX_POR_GESTO);
        expect(gesto(deslize(400, 12, 40)).linhas).toBe(MAX_POR_GESTO);
        expect(gesto(deslize(70, 6, 24)).linhas).toBeLessThanOrEqual(2);
        expect([linhasDoPico(20), linhasDoPico(60), linhasDoPico(300)]).toEqual([1, 2, MAX_POR_GESTO]);
    });
    it('o que fica abaixo do limiar não anda; a pausa começa um gesto novo', () => {
        expect(gesto([3, 5, 6, 5, 3]).linhas).toBe(0);
        const a = gesto(deslize(14));
        const b = gesto(deslize(14), {}, a.fim + 400, a.estado);
        expect(a.linhas + b.linhas).toBe(2);
    });
    it('cada entalhe da roda do mouse é uma linha: em linhas, pelo wheelDelta, ou 100 px redondos', () => {
        expect(gesto([3, 3, 3, 3], { deltaMode: 1 }).linhas).toBe(4);
        expect(gesto([100, 100, 100]).linhas).toBe(3);
        expect(gesto([-4, -4], { wheelDeltaY: 120 }).linhas).toBe(-2);
        expect(ehEntalhe({ deltaX: 0, deltaY: 40, deltaMode: 0, wheelDeltaY: -120 })).toBe(false); // trackpad: −3 × delta
        expect(ehEntalhe({ deltaX: 0, deltaY: 37.5, deltaMode: 0 })).toBe(false);
    });
    it('o gesto que começa de lado fica de lado (os painéis), e Shift + roda é de lado', () => {
        let s = RODA_PARADA;
        const r1 = passoDaRoda(s, { deltaX: 30, deltaY: 2, deltaMode: 0, t: 0 });
        expect(r1.eixo).toBe('x');
        s = r1.estado;
        const r2 = passoDaRoda(s, { deltaX: 3, deltaY: 90, deltaMode: 0, t: 16 });
        expect([r2.eixo, r2.passos]).toEqual(['x', 0]);
        expect(passoDaRoda(RODA_PARADA, { deltaX: 0, deltaY: 100, deltaMode: 0, t: 0, shiftKey: true }).eixo).toBe('x');
    });
    it('trocar de sentido zera o que estava acumulado', () => {
        expect(gesto([40, -40, 40, -40]).linhas).toBe(0);
    });
});

describe('a borda do arrasto', () => {
    it('a velocidade cresce com a proximidade, com sinal: em cima e à esquerda negativa, embaixo e à direita positiva', () => {
        expect(velocidadeDaBorda(500, 0, 1000)).toBe(0);
        expect(velocidadeDaBorda(0, 0, 1000)).toBe(-1);
        expect(velocidadeDaBorda(32, 0, 1000)).toBeCloseTo(-0.5);
        expect(velocidadeDaBorda(1000 - 16, 0, 1000)).toBeCloseTo(0.75);
        expect(velocidadeDaBorda(1200, 0, 1000)).toBe(1);
        // Área pequena: a faixa encolhe para um terço; área sem tamanho, nada.
        expect(velocidadeDaBorda(50, 0, 90)).toBe(0);
        expect(velocidadeDaBorda(5, 0, 0)).toBe(0);
    });
    it('perto da borda o passo no tempo vem mais depressa, e o de lado anda mais pixels', () => {
        expect(intervaloDaBorda(0)).toBe(Infinity);
        expect(intervaloDaBorda(1)).toBeLessThan(intervaloDaBorda(0.3));
        expect(pixelsDaBorda(-1)).toBe(-22);
        expect(pixelsDaBorda(0.5)).toBe(11);
    });
    it('o passo anima em ease-out; com movimento reduzido, não anima', () => {
        expect(transicaoDoPasso(false)).toBe(`transform ${DURACAO_DO_PASSO}ms cubic-bezier(.2,.8,.2,1)`);
        expect(transicaoDoPasso(true)).toBe('none');
        expect(DURACAO_DO_PASSO).toBeGreaterThanOrEqual(220);
        expect(DURACAO_DO_PASSO).toBeLessThanOrEqual(300);
    });
});

describe('o bloco antes do passo (30/10: ver todas as tarefas antes de pular)', () => {
    /** Roda um gesto diante de um bloco com `altura` px escondidos: rola até a borda e devolve o que rolou e os passos. */
    function noBloco(deltas: number[], escondido: { px: number }, inicio: number, estado: EstadoDaRoda = RODA_PARADA) {
        let s = estado, t = inicio, rolado = 0, passos = 0;
        for (const d of deltas) {
            const b = rolarNoBloco(passoDaRoda(s, { deltaX: 0, deltaY: d, deltaMode: 0, t }), escondido.px > 0);
            s = b.estado;
            if (b.rolar) { const k = Math.min(escondido.px, d); escondido.px -= k; rolado += k; }
            passos += b.passos;
            t += 16;
        }
        return { s, t, rolado, passos };
    }
    it('enquanto o bloco tem conteúdo escondido, o gesto rola por dentro e não dá passo; na borda, o mesmo gesto também não', () => {
        const escondido = { px: 300 };
        const g = noBloco(deslize(60, 6, 30), escondido, 1000);
        expect(g.rolado).toBe(300);
        expect(escondido.px).toBe(0);
        expect(g.passos).toBe(0);
        // Um gesto novo, depois da pausa, na borda: o passo vem.
        const h = noBloco(deslize(14), escondido, g.t + PAUSA_DO_GESTO + 10, g.s);
        expect(h.passos).toBe(1);
    });
    it('o bloco que cabe na tela dá o passo como sempre; fora do eixo vertical, nada muda', () => {
        expect(noBloco(deslize(14), { px: 0 }, 1000).passos).toBe(1);
        const lado = passoDaRoda(RODA_PARADA, { deltaX: 30, deltaY: 0, deltaMode: 0, t: 0 });
        expect(rolarNoBloco(lado, true)).toEqual({ estado: lado.estado, rolar: false, passos: 0 });
    });
});

