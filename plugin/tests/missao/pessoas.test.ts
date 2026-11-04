/**
 * As pessoas do dia (P9, §8.9): quem está no `pessoas` de cada Day, os dias de uma pessoa (o
 * último primeiro: o painel dela, calculado, sem gravar o "Último encontro" do 👤), as pessoas
 * de uma passagem e a lista do campo com a pessoa nova.
 */
import { describe, expect, it } from 'vitest';
import { comNotaNoCampo, diasDaPessoa, idDaPessoa, pessoasDaPassagem, pessoasDaMissao, pessoasDoDia } from '../../src/missao/pessoas';

const dia = (pessoas: unknown) => ({ caminho: 'x.md', campos: { pessoas } });
const DIAS = {
    '2026-10-24': dia(['[[Bruno]]']),
    '2026-10-26': dia(['[[500 - RESOURCES/Pessoas/Ana.md|Aninha]]', '[[Carla]]']),
    '2026-10-27': dia('[[Ana]]'),
    '2026-10-28': dia([]),
};
const CONHECIDAS = pessoasDaMissao([
    { caminho: '500 - RESOURCES/Pessoas/Bruno.md', nome: 'Bruno', campos: {} },
    { caminho: '500 - RESOURCES/Pessoas/Ana.md', nome: 'Ana', campos: {} },
]);

describe('as pessoas', () => {
    it('em ordem de nome, com o id do painel pelo caminho', () => {
        expect(CONHECIDAS.map(p => [p.id, p.nome])).toEqual([[idDaPessoa('500 - RESOURCES/Pessoas/Ana.md'), 'Ana'], [idDaPessoa('500 - RESOURCES/Pessoas/Bruno.md'), 'Bruno']]);
    });
    it('do dia: o link com caminho e alias, o texto solto; o nome sem nota fica sem id', () => {
        expect(pessoasDoDia(DIAS, '2026-10-26', CONHECIDAS).map(p => [p.nome, !!p.id])).toEqual([['Ana', true], ['Carla', false]]);
        expect(pessoasDoDia(DIAS, '2026-10-27', CONHECIDAS).map(p => p.nome)).toEqual(['Ana']);
        expect(pessoasDoDia(DIAS, '2026-10-28', CONHECIDAS)).toEqual([]);
        expect(pessoasDoDia(DIAS, '2026-10-29', CONHECIDAS)).toEqual([]);
    });
    it('os dias de uma pessoa, o mais novo primeiro', () => {
        expect(diasDaPessoa(DIAS, 'ana')).toEqual(['2026-10-27', '2026-10-26']);
        expect(diasDaPessoa(DIAS, 'Ninguém')).toEqual([]);
        expect(diasDaPessoa(DIAS, '')).toEqual([]);
    });
    it('da passagem: os dias dela, sem repetir; a aberta vai até hoje', () => {
        const e = { id: 'l:x', cidade: 'Sapa', pais: null, nota: null, de: '2026-10-26', ate: null, fonte: 'dia' as const };
        expect(pessoasDaPassagem(DIAS, e, '2026-10-27', CONHECIDAS).map(p => p.nome)).toEqual(['Ana', 'Carla']);
        expect(pessoasDaPassagem(DIAS, { ...e, de: '2026-10-24', ate: '2026-10-25' }, '2026-10-27', CONHECIDAS).map(p => p.nome)).toEqual(['Bruno']);
        expect(pessoasDaPassagem(DIAS, { ...e, de: 'ontem' }, '2026-10-27', CONHECIDAS)).toEqual([]);
    });
});

describe('a pessoa nova no dia', () => {
    it('entra no fim, como link; os que estão ficam como estão; a que já está não se repete', () => {
        expect(comNotaNoCampo(undefined, 'Carla')).toEqual(['[[Carla]]']);
        expect(comNotaNoCampo(['[[Ana|Aninha]]', 'Bruno'], 'Carla')).toEqual(['[[Ana|Aninha]]', '[[Bruno]]', '[[Carla]]']);
        expect(comNotaNoCampo('[[Ana]]', 'ana')).toBeNull();
        expect(comNotaNoCampo([], '  ')).toBeNull();
    });
});
