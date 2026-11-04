/** Prova das conferências do plano da semana (02/11): as quatro contas que o plano, o grafo e os sinais da Missão leem. */
import { describe, expect, it } from 'vitest';
import { agendadaForaDaSemana, chaveDoProjeto, diasUteisVazios, planejadaDepoisDoPrazo, projetoForaDoFoco } from '../../src/engine/conferenciasDoPlano';

describe('fora da semana', () => {
    it('o agendado antes da segunda ou depois do domingo está fora; dentro, não', () => {
        expect(agendadaForaDaSemana('2026-11-01', '2026-11-02', '2026-11-08')).toBe(true);
        expect(agendadaForaDaSemana('2026-11-09', '2026-11-02', '2026-11-08')).toBe(true);
        expect(agendadaForaDaSemana('2026-11-02', '2026-11-02', '2026-11-08')).toBe(false);
        expect(agendadaForaDaSemana('2026-11-08', '2026-11-02', '2026-11-08')).toBe(false);
    });
    it('a hora não conta: o último dia com hora ainda é da semana', () => {
        expect(agendadaForaDaSemana('2026-11-08T21:00', '2026-11-02', '2026-11-08')).toBe(false);
    });
    it('sem agendado ou sem a semana não há o que conferir', () => {
        expect(agendadaForaDaSemana('', '2026-11-02', '2026-11-08')).toBe(false);
        expect(agendadaForaDaSemana(undefined, '2026-11-02', '2026-11-08')).toBe(false);
        expect(agendadaForaDaSemana('2026-11-20', '', '')).toBe(false);
        expect(agendadaForaDaSemana('lixo', '2026-11-02', '2026-11-08')).toBe(false);
    });
});

describe('depois do prazo', () => {
    it('a data planejada depois do prazo; no mesmo dia (com hora) ou antes, não', () => {
        expect(planejadaDepoisDoPrazo('2026-11-10', '2026-11-06')).toBe(true);
        expect(planejadaDepoisDoPrazo('2026-11-06T18:00', '2026-11-06')).toBe(false);
        expect(planejadaDepoisDoPrazo('2026-11-04', '2026-11-06')).toBe(false);
    });
    it('sem uma das duas datas, não', () => {
        expect(planejadaDepoisDoPrazo('', '2026-11-06')).toBe(false);
        expect(planejadaDepoisDoPrazo('2026-11-10', null)).toBe(false);
    });
});

describe('dia útil vazio', () => {
    const semana = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    it('os dias de segunda a sexta sem nada marcado, na ordem; o fim de semana nunca entra', () => {
        expect(diasUteisVazios(semana, new Set(['2026-11-03', '2026-11-05']))).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
        expect(diasUteisVazios(semana, new Set(semana.slice(0, 5)))).toEqual([]);
    });
    it('a data malformada fica de fora e o dia repetido sai uma vez', () => {
        expect(diasUteisVazios(['2026-11-02', 'x', '2026-11-02'], new Set())).toEqual(['2026-11-02']);
    });
});

describe('fora do foco', () => {
    it('o projeto que não está na lista; [[X]], [[X|y]] e a caixa são o mesmo', () => {
        expect(projetoForaDoFoco('Projeto Beta', ['[[Projeto Alfa]]'])).toBe(true);
        expect(projetoForaDoFoco('projeto alfa', ['[[Projeto Alfa|alfa]]'])).toBe(false);
        expect(chaveDoProjeto(' [[Projeto Alfa|x]] ')).toBe('projeto alfa');
    });
    it('o nome vazio não está fora de nada; a lista vazia deixa todo projeto fora (quem chama decide)', () => {
        expect(projetoForaDoFoco('', ['A'])).toBe(false);
        expect(projetoForaDoFoco('A', [])).toBe(true);
    });
});
