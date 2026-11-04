/**
 * Prova dos formatos curtos da Missão (passo `formatos` da divisão, H5): o dia escrito por uma regex
 * só, a leitura de um campo cru e os textos curtos, os mesmos que as coleções, o dinheiro e a
 * borboleta mostravam antes.
 */
import { describe, expect, it } from 'vitest';
import { dataDoCampo, DIA, ehDia, marcaDePessoas, minutosTexto, reais, textoDoCampo } from '../../src/missao/formatos';

describe('o dia escrito', () => {
    it('só AAAA-MM-DD inteiro; a forma, não o calendário', () => {
        for (const sim of ['2026-10-29', '2026-02-31', '0000-00-00']) expect(ehDia(sim), sim).toBe(true);
        for (const nao of ['', '2026-10-29T10:00', ' 2026-10-29', '2026-10-29 ', '2026-1-29', '29/10/2026', '2026-W44']) expect(ehDia(nao), nao).toBe(false);
    });

    it('a regex não guarda estado entre chamadas (sem a flag g)', () => {
        expect(DIA.flags).toBe('');
        expect([ehDia('2026-10-29'), ehDia('2026-10-29'), DIA.test('2026-10-29')]).toEqual([true, true, true]);
    });
});

describe('a leitura de um campo cru', () => {
    it('a data: o começo de uma data com hora, o primeiro da lista; o resto, vazio', () => {
        expect(dataDoCampo('2026-10-29T08:30')).toBe('2026-10-29');
        expect(dataDoCampo(['2026-11-02', '2026-11-03'])).toBe('2026-11-02');
        expect(dataDoCampo(' 2026-10-29 ')).toBe('2026-10-29');
        for (const nada of [null, undefined, '', 'amanhã', [], 42]) expect(dataDoCampo(nada)).toBe('');
    });

    it('o texto: o link vira o nome, a lista se junta, o vazio é vazio', () => {
        expect(textoDoCampo('[[Sapa]]')).toBe('Sapa');
        expect(textoDoCampo(['[[Sapa]]', 'Hanói', ''])).toBe('Sapa, Hanói');
        expect(textoDoCampo(null)).toBe('');
        expect(textoDoCampo(7)).toBe('7');
    });
});

describe('os textos curtos', () => {
    it('os minutos', () => {
        expect([minutosTexto(45), minutosTexto(90), minutosTexto(120), minutosTexto(0), minutosTexto(null), minutosTexto(Number.NaN)]).toEqual(['45 min', '1h30', '2h', null, null, null]);
    });

    it('os reais', () => {
        expect([reais(1234.5), reais(52), reais(-10)]).toEqual(['R$ 1.234,50', 'R$ 52', '−R$ 10']);
    });

    it('a marca das pessoas', () => {
        expect(marcaDePessoas([])).toBeNull();
        expect(marcaDePessoas(['Ana', 'Bia'])).toEqual({ marca: '👥 2', dica: '👥 Ana, Bia' });
    });
});
