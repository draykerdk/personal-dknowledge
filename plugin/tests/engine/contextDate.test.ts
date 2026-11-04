import { describe, expect, it } from 'vitest';
import {
    periodOf, } from '../../src/engine/contextDate';
import { isoWeekOf } from '../../src/engine/calendario';

describe('canvas temporal', () => {

    it('período: semana ISO de segunda a domingo; trimestre por meses', () => {
        expect(periodOf({ kind: 'week', id: '2026-W42' })).toEqual({ start: '2026-10-12', end: '2026-10-18' });
        expect(periodOf({ kind: 'week', id: '2026-W01' })).toEqual({ start: '2025-12-29', end: '2026-01-04' });
        expect(periodOf({ kind: 'week', id: '2027-W13' })).toEqual({ start: '2027-03-29', end: '2027-04-04' });
        expect(periodOf({ kind: 'quarter', id: '2026-Q4' })).toEqual({ start: '2026-10-01', end: '2026-12-31' });
        expect(periodOf({ kind: 'quarter', id: '2028-Q1' })).toEqual({ start: '2028-01-01', end: '2028-03-31' });
    });

    it('a segunda-feira calculada é da própria semana (confere com isoWeekOf)', () => {
        for (const week of ['2026-W01', '2026-W40', '2026-W53', '2027-W01', '2020-W53']) {
            const p = periodOf({ kind: 'week', id: week })!;
            expect(isoWeekOf(p.start)).toBe(week);
            expect(isoWeekOf(p.end)).toBe(week);
        }
    });
});
