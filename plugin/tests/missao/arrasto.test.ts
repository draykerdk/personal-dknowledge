/**
 * Prova do limiar do arrasto (passo `arrasto` da divisão da Missão, H5): o aperto vira arrasto acima
 * do limiar da casa (`DRAG_THRESHOLD`, 4 px, missao/movimento.ts), o mesmo do painel e do canvas;
 * exatamente no limiar ainda não. Antes do passo a Missão usava 6 px (a mudança aceita).
 */
import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD } from '../../src/missao/movimento';
import { passouDoLimiar } from '../../src/missao/view/arrasto';

describe('o limiar do arrasto', () => {
    it('é o da casa: 4 px', () => {
        expect(DRAG_THRESHOLD).toBe(4);
    });
    it('no limiar, ainda não; um pouco além, sim; em qualquer direção', () => {
        expect(passouDoLimiar(10, 10, 14, 10)).toBe(false);
        expect(passouDoLimiar(10, 10, 14.01, 10)).toBe(true);
        expect(passouDoLimiar(10, 10, 10, 5.9)).toBe(true);
        expect(passouDoLimiar(0, 0, 3, 3)).toBe(true);
        expect(passouDoLimiar(0, 0, 2, 2)).toBe(false);
    });
    it('5 px já arrasta (com os 6 px de antes, não arrastava)', () => {
        expect(passouDoLimiar(0, 0, 5, 0)).toBe(true);
        expect(Math.hypot(5, 0) <= 6).toBe(true);
    });
});
