/** Prova da semana e do trimestre escritos (engine/periodo.ts, 02/11/2026): a forma estrita, os números e as leituras num texto maior. */
import { describe, expect, it } from 'vitest';
import {
    diaMais, ehSemana, ehTrimestre, partesDaSemana, partesDoTrimestre, segundaDaSemana, semanaNoTexto, semanaOuVazio, trimestreDoCanvas, trimestreNoTexto, trimestreOuVazio,
} from '../../src/engine/periodo';

describe('a semana escrita', () => {
    it('só AAAA-Www inteira, de W01 a W53', () => {
        for (const ok of ['2026-W01', '2026-W45', '2026-W53']) expect(ehSemana(ok), ok).toBe(true);
        for (const nao of ['', '2026-W00', '2026-W54', '2026-W5', '[[2026-W45]]', ' 2026-W45', '2026-w45', null, undefined]) expect(ehSemana(nao), String(nao)).toBe(false);
    });
    it('os números, a semana ou vazio e a semana num texto maior', () => {
        expect(partesDaSemana('2026-W09')).toEqual({ ano: 2026, semana: 9 });
        expect(partesDaSemana('2026-W60')).toBeNull();
        expect(semanaOuVazio('2026-W45')).toBe('2026-W45');
        expect(semanaOuVazio('W45')).toBe('');
        expect(semanaNoTexto('[[2026-W45]]')).toBe('2026-W45');
        expect(semanaNoTexto('2026-W45 - Review')).toBe('2026-W45');
        expect(semanaNoTexto('12026-W45')).toBe('');
        expect(semanaNoTexto('2026-W54')).toBe('');
    });
});

describe('o trimestre escrito', () => {
    it('só AAAA-Qn inteiro, de Q1 a Q4', () => {
        for (const ok of ['2026-Q1', '2026-Q4']) expect(ehTrimestre(ok), ok).toBe(true);
        for (const nao of ['', '2026-Q0', '2026-Q5', '2026-q4', '[[2026-Q4]]']) expect(ehTrimestre(nao), nao).toBe(false);
    });
    it('os números, o trimestre ou vazio, num texto maior e no nome do canvas', () => {
        expect(partesDoTrimestre('2026-Q4')).toEqual({ ano: 2026, trimestre: 4 });
        expect(partesDoTrimestre('2026-Q5')).toBeNull();
        expect(trimestreOuVazio('2026-Q4')).toBe('2026-Q4');
        expect(trimestreOuVazio('Q4')).toBe('');
        expect(trimestreNoTexto('2026-Q4 - Revisão')).toBe('2026-Q4');
        expect(trimestreDoCanvas('300 - RUNTIME/302 - Daymiss/Quarterly/Canvases/2026-Q4.canvas')).toBe('2026-Q4');
        expect(trimestreDoCanvas('2026-Q4.md')).toBe('');
    });
});

describe('a segunda-feira da semana', () => {
    it('a segunda ISO de cada semana, na virada do ano também', () => {
        expect(segundaDaSemana('2026-W45')).toBe('2026-11-02');
        expect(segundaDaSemana('2026-W01')).toBe('2025-12-29');
        expect(segundaDaSemana('2020-W53')).toBe('2020-12-28');
        expect(segundaDaSemana('2027-W13')).toBe('2027-03-29');
    });
    it('fora da forma, null; a W53 de um ano com 52 dá a W01 seguinte (quem recusa confere pelo ano)', () => {
        for (const nao of ['', '2026-W00', '2026-W54', '[[2026-W45]]', null]) expect(segundaDaSemana(nao), String(nao)).toBeNull();
        expect(segundaDaSemana('2026-W53')).toBe('2026-12-28');
        expect(segundaDaSemana('2025-W53')).toBe(segundaDaSemana('2026-W01'));
    });
    it('o dia mais n dias, pelo mês e pelo ano', () => {
        expect(diaMais('2026-11-02', 6)).toBe('2026-11-08');
        expect(diaMais('2026-12-28', 7)).toBe('2027-01-04');
        expect(diaMais('2026-03-01', -1)).toBe('2026-02-28');
        expect(diaMais('nada', 1)).toBeNull();
    });
});
