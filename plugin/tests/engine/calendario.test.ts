/**
 * O calendário da semana e do trimestre (engine/calendario.ts). As provas vieram dos testes dos canvas da
 * semana e do trimestre, que se aposentaram em 02/11/2026 (aposentadoria, fase 2): as contas ficaram e mudaram
 * de casa; as provas vão com elas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    chooseFocusWeek, currentQuarter, dayLabel, isoWeekOf, plannedWeekOf, quarterOf, quarterOfWeek, quarterWeeks, weekDates,
} from '../../src/engine/calendario';

describe('calendário ISO', () => {
    it('semana ISO pela quinta-feira, inclusive na virada do ano', () => {
        expect(isoWeekOf('2026-09-25')).toBe('2026-W39');
        expect(isoWeekOf('2026-09-14')).toBe('2026-W38');
        expect(isoWeekOf('2026-01-01')).toBe('2026-W01');
        expect(isoWeekOf('2027-01-01')).toBe('2026-W53');
        expect(isoWeekOf('2024-12-30')).toBe('2025-W01');
        expect(quarterOf('2026-09-25')).toBe('2026-Q3');
    });

    it('o trimestre tem as semanas cuja quinta cai nele', () => {
        const q3 = quarterWeeks('2026-Q3');
        expect(q3[0]).toBe('2026-W27');
        expect(q3.at(-1)).toBe('2026-W39');
        expect(q3).toHaveLength(13);
        expect(quarterWeeks('lixo')).toEqual([]);
    });
});

describe('trimestre da semana pela quinta-feira (D6, E7)', () => {
    it('W40/2026 é do Q4; W13/2027 (segunda 29/03, quinta 01/04) é do Q2', () => {
        expect(quarterOfWeek('2026-W40')).toBe('2026-Q4');
        expect(quarterOfWeek('2026-W39')).toBe('2026-Q3');
        expect(quarterOfWeek('2027-W13')).toBe('2027-Q2');
        expect(quarterOfWeek('2026-W53')).toBe('2026-Q4');
        expect(quarterOfWeek('lixo')).toBeNull();
        for (const q of ['2026-Q4', '2027-Q1', '2027-Q2']) for (const w of quarterWeeks(q)) expect(quarterOfWeek(w), w).toBe(q);
    });

});

describe('semana em foco', () => {
    const notes = [
        { week: '2026-W37', path: 'W/2026-W37.md', status: 'closed' },
        { week: '2026-W38', path: 'W/2026-W38.md', status: 'open' },
    ];
    it('atual com nota', () => {
        expect(chooseFocusWeek('2026-Q3', '2026-09-16', notes)).toMatchObject({ week: '2026-W38', path: 'W/2026-W38.md', label: 'Semana 2026-W38' });
    });
    it('atual sem nota cai na última aberta e diz isso', () => {
        const f = chooseFocusWeek('2026-Q3', '2026-09-25', notes);
        expect(f.week).toBe('2026-W38');
        expect(f.label).toContain('2026-W39 não foi planejada');
    });
    it('nada aberto: a atual, dita "não criada"', () => {
        const f = chooseFocusWeek('2026-Q3', '2026-09-25', [notes[0]]);
        expect(f).toMatchObject({ week: '2026-W39', path: null });
        expect(f.label).toContain('não criada');
    });
});

describe('trimestre de hoje na virada', () => {
    it('é o da semana de hoje (quinta-feira), não o do calendário', () => {
        expect(currentQuarter('2027-03-29')).toBe('2027-Q2');
        expect(currentQuarter('2026-09-30')).toBe('2026-Q4');
        expect(currentQuarter('2026-10-15')).toBe('2026-Q4');
        expect(currentQuarter('2026-12-28')).toBe('2026-Q4');
        // A semana em foco do trimestre de hoje acha a nota da W13/2027.
        const focus = chooseFocusWeek(currentQuarter('2027-03-29'), '2027-03-29', [{ week: '2027-W13', path: 'W/2027-W13.md', status: 'open' }]);
        expect(focus).toMatchObject({ week: '2027-W13', path: 'W/2027-W13.md' });
    });

    it('o painel usa a regra da semana', () => {
        const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
        for (const file of ['src/board/boardPlugin.ts']) {
            expect(src(file), file).not.toMatch(/quarterOf\((?:today\(\)|date)\)/);
        }
    });
});

describe('calendário da semana', () => {
    it('7 datas de segunda a domingo, período e rótulo do dia', () => {
        expect(weekDates('2026-W42')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
        expect(weekDates('2026-W53').at(-1)).toBe('2027-01-03');
        expect(weekDates('2026-W01')[0]).toBe('2025-12-29');
        expect(weekDates('lixo')).toEqual([]);
        expect(dayLabel('2026-10-14')).toBe('qua 14');
    });
});

describe('a semana que o 🌳 acabou de planejar', () => {
    it('a week da nota vence; sem ela, a semana-alvo da rodada; sem as duas, vazio', () => {
        expect(plannedWeekOf({ week: '2026-W43' }, { _target_week: '2026-W44' })).toBe('2026-W43');
        expect(plannedWeekOf({}, { _target_week: '2026-W43' })).toBe('2026-W43');
        expect(plannedWeekOf({}, { week: '2026-W43' })).toBe('');
        expect(plannedWeekOf({}, undefined)).toBe('');
    });
});
