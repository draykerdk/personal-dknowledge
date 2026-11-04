/**
 * Prova do relógio do lugar (passo `hoje` da divisão da Missão, H5): o dia local, com dois dígitos,
 * lido a cada chamada; e o mesmo relógio para o leitor e para o componente montado no lugar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hojeLocal } from '../../src/missao/hosts/relogio';

afterEach(() => { vi.useRealTimers(); });

describe('o relógio do lugar', () => {
    it('o dia pelo fuso da máquina (o construtor local), com mês e dia de dois dígitos', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
        expect(hojeLocal()).toBe('2026-01-05');
        vi.setSystemTime(new Date(2026, 9, 29, 0, 1));
        expect(hojeLocal()).toBe('2026-10-29');
    });
    it('lê o relógio a cada chamada: passar da meia-noite muda o dia', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 29, 23, 59, 59));
        const antes = hojeLocal();
        vi.setSystemTime(new Date(2026, 9, 30, 0, 0, 1));
        expect([antes, hojeLocal()]).toEqual(['2026-10-29', '2026-10-30']);
    });
});
