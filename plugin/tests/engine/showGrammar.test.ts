import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    SMART_HORIZON, grammarCounts, grammarText, showGrammar, timeHorizon, workHorizon, type GrammarUnit,
} from '../../src/engine/showGrammar';

/**
 * A forma de mostrar numa função só (plano da Fase B, 22/10/2026): os mesmos rótulos, na
 * mesma ordem, em toda escala (arquitetura universal 2.2); os estados da 3.3.
 */
const W42 = { weeks: ['2026-W42'], dates: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'] };

describe('a linha (grammarText)', () => {
    it('ordem e rótulos fixos; o zerado não aparece; sem porcentagem', () => {
        expect(grammarText({ feitas: 7, planoFeitas: 3, plano: 5, faltam: 2, fora: 4, algumDia: 1 }))
            .toBe('7 feitas · 3/5 do plano · faltam 2 · +4 fora do plano · +1 algum dia');
        expect(grammarText({ feitas: 1, planoFeitas: 1, plano: 1, faltam: 0, fora: 0, algumDia: 0 })).toBe('1 feita · 1/1 do plano');
        expect(grammarText({ feitas: 0, planoFeitas: 0, plano: 3, faltam: 3, fora: 0, algumDia: 0 })).toBe('0/3 do plano · faltam 3');
        expect(grammarText({ feitas: 0, planoFeitas: 0, plano: 0, faltam: 0, fora: 0, algumDia: 2 })).toBe('+2 algum dia');
        for (const text of [grammarText({ feitas: 3, planoFeitas: 1, plano: 4, faltam: 3, fora: 2, algumDia: 1 })]) {
            expect(text).not.toMatch(/%|🏅|🥇/);
        }
    });

    it('sem nada para contar, o texto de ausência (o do cartão da SMART por padrão)', () => {
        const zero = { feitas: 0, planoFeitas: 0, plano: 0, faltam: 0, fora: 0, algumDia: 0 };
        expect(grammarText(zero)).toBe('sem ações');
        expect(grammarText(zero, 'sem planejamento')).toBe('sem planejamento');
        expect(showGrammar([], timeHorizon(W42), '')).toEqual({ counts: zero, text: '', shown: false });
    });
});

describe('o horizonte da SMART (de trabalho, sem janela): a regra do cartão, igual à de antes', () => {
    it('aberta é do plano; feita com horizonte é do plano; feita sem horizonte é fora; algum dia à parte; cancelada neutra', () => {
        const units: GrammarUnit[] = [
            { status: 'done', week: '2026-W39' }, { status: 'done' }, { status: 'next-action' },
            { status: 'someday' }, { status: 'cancelled', week: '2026-W39' }, { status: 'DONE', scheduled: '2026-09-24' },
        ];
        expect(grammarCounts(units, SMART_HORIZON)).toEqual({ feitas: 3, planoFeitas: 2, plano: 3, faltam: 1, fora: 1, algumDia: 1 });
        expect(grammarCounts(units)).toEqual(grammarCounts(units, workHorizon(null)));
    });
});

describe('horizontes de tempo (a semana, o dia, o trimestre)', () => {
    const units: GrammarUnit[] = [
        { status: 'next-action', week: '2026-W42' },
        { status: 'done', week: '2026-W42', completedDate: '2026-10-20' },
        { status: 'next-action', scheduled: '2026-10-14' },
        { status: 'done', completedDate: '2026-10-13' },
        { status: 'done', week: '2026-W41', completedDate: '2026-10-15' },
        { status: 'done', completedDate: '2026-10-05' },
        { status: 'next-action', week: '2026-W43' },
        { status: 'someday', week: '2026-W42' },
        { status: 'someday' },
        { status: 'cancelled', week: '2026-W42' },
    ];

    it('semana: do plano é o que tem `week` ou `scheduled` nela; fora do plano, a feita nela sem estar nela', () => {
        const c = grammarCounts(units, timeHorizon(W42));
        expect(c).toEqual({ feitas: 3, planoFeitas: 1, plano: 3, faltam: 2, fora: 2, algumDia: 1 });
        expect(grammarText(c)).toBe('3 feitas · 1/3 do plano · faltam 2 · +2 fora do plano · +1 algum dia');
    });

    it('dia: o horizonte é só o `scheduled` daquela data', () => {
        expect(showGrammar(units, timeHorizon({ weeks: [], dates: ['2026-10-14'] })).text).toBe('0/1 do plano · faltam 1');
        expect(showGrammar(units, timeHorizon({ weeks: [], dates: ['2026-10-13'] })).text).toBe('1 feita · +1 fora do plano');
        expect(showGrammar(units, timeHorizon({ weeks: [], dates: ['2026-10-19'] }), '').shown).toBe(false);
    });

    it('a aberta fora do período não conta; a conta não muta a entrada', () => {
        const copy = structuredClone(units);
        grammarCounts(units, timeHorizon({ weeks: ['2026-W40'], dates: [] }));
        expect(units).toEqual(copy);
        expect(grammarCounts(units, timeHorizon({ weeks: ['2026-W40'], dates: [] }))).toEqual({ feitas: 0, planoFeitas: 0, plano: 0, faltam: 0, fora: 0, algumDia: 0 });
    });
});

describe('o projeto no trimestre (de trabalho, com o período)', () => {
    it('as abertas contam sempre; a feita conta só no período (com horizonte nele = do plano; sem = fora)', () => {
        const units: GrammarUnit[] = [
            { status: 'next-action', week: '2026-W30' },
            { status: 'in-progress' },
            { status: 'done', week: '2026-W42', completedDate: '2026-10-14' },
            { status: 'done', completedDate: '2026-10-14' },
            { status: 'done', week: '2026-W30', completedDate: '2026-07-22' },
            { status: 'someday' },
        ];
        expect(showGrammar(units, workHorizon(W42)).text).toBe('2 feitas · 1/3 do plano · faltam 2 · +1 fora do plano · +1 algum dia');
        // Sem período, a regra da SMART: as três feitas contam.
        expect(showGrammar(units, workHorizon(null)).text).toBe('3 feitas · 2/4 do plano · faltam 2 · +1 fora do plano · +1 algum dia');
    });
});

describe('uma função só', () => {
    const src = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

    it('o cartão da SMART, as exposições, o canvas e o painel usam a função; nenhum monta a linha', () => {
        for (const path of ['canvas/taskCardModel.ts', 'engine/exposicoes.ts', 'project/projectCanvasModel.ts', 'board/panelNav.ts']) {
            const text = src(path);
            expect(text, path).toMatch(/showGrammar|grammarText|weekGrammar|progressText/);
            expect(text, path).not.toMatch(/\$\{[^}]+\}\/\$\{[^}]+\} do plano|faltam \$\{/);
        }
        expect(src('engine/showGrammar.ts')).toContain('do plano`');
        // O painel mostra o que a navegação calculou pela função (a semana em foco e cada projeto).
        const panel = src('board/boardPanel.ts');
        expect(panel).toContain("this.row(time, 'compass', f.label, f.grammar");
        expect(panel).toContain('project.grammar,');
        expect(panel).not.toContain('ações abertas`');
    });
});
