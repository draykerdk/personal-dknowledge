/**
 * O leitor das notas de período (temporal/periodNotes.ts, 02/11/2026): a nota do trimestre, a da semana (e um
 * campo dela) e a semana em foco, as mesmas leituras que o gerente do canvas do trimestre fazia antes de se
 * aposentar. Só lê.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    TFile: class { path = ''; basename = ''; extension = 'md'; parent: any = null; },
}));

import { TFile } from 'obsidian';
import { PeriodNotes } from '../../src/temporal/periodNotes';

function arquivo(path: string): any {
    const f = new (TFile as any)();
    f.path = path;
    f.basename = path.split('/').pop()!.replace(/\.md$/, '');
    return f;
}

function leitor(notas: Record<string, Record<string, unknown>>, hoje = '2026-11-04') {
    const files = Object.keys(notas).map(arquivo);
    const app: any = {
        vault: {
            getMarkdownFiles: () => files,
            getAbstractFileByPath: (p: string) => files.find(f => f.path === p) ?? null,
            create: vi.fn(), process: vi.fn(), modify: vi.fn(),
        },
        metadataCache: { getFileCache: (f: any) => ({ frontmatter: notas[f.path] }) },
    };
    return { notas: new PeriodNotes(app, () => hoje), app };
}

const W = '300 - RUNTIME/302 - Daymiss/Week';
const Q = '300 - RUNTIME/302 - Daymiss/Quarterly';

describe('o leitor das notas de período', () => {
    it('a nota do trimestre, fora de P&D', () => {
        const { notas } = leitor({
            '300 - RUNTIME/305 - P&D/rascunho.md': { type: 'quarterly_note', quarter: '2026-Q4' },
            [`${Q}/2026-Q4.md`]: { type: 'quarterly_note', quarter: '2026-Q4' },
        });
        expect(notas.quarterNote('2026-Q4')?.path).toBe(`${Q}/2026-Q4.md`);
        expect(notas.quarterNote('2027-Q1')).toBeNull();
    });

    it('a nota da semana (a de menor caminho, se houver duas) e um campo dela', () => {
        const { notas } = leitor({
            [`${W}/2026-W45.md`]: { type: 'weekly_note', week: '2026-W45', bloco_sagrado: '7h–9h' },
            [`${W}/Arquivo/2026-W45.md`]: { type: 'weekly_note', week: '2026-W45' },
        });
        expect(notas.weekNotePath('2026-W45')).toBe(`${W}/2026-W45.md`);
        expect(notas.weekNoteField('2026-W45', 'bloco_sagrado')).toBe('7h–9h');
        expect(notas.weekNoteField('2026-W46', 'bloco_sagrado')).toBeUndefined();
    });

    it('a semana em foco: a de hoje com nota; sem ela, a última aberta; o rótulo diz o caso', () => {
        const com = leitor({ [`${W}/2026-W45.md`]: { type: 'weekly_note', week: '2026-W45', status: 'open' } }).notas;
        expect(com.focus('2026-Q4')).toMatchObject({ week: '2026-W45', path: `${W}/2026-W45.md` });
        const sem = leitor({ [`${W}/2026-W44.md`]: { type: 'weekly_note', week: '2026-W44', status: 'open' } }).notas;
        expect(sem.focusWeek('2026-Q4')).toBe('2026-W44');
        expect(sem.focus('2026-Q4').label).toContain('2026-W45 não foi planejada');
    });

    it('só lê: nada grava no cofre', () => {
        const { notas, app } = leitor({ [`${Q}/2026-Q4.md`]: { type: 'quarterly_note', quarter: '2026-Q4' } });
        notas.quarterNote('2026-Q4');
        notas.focus('2026-Q4');
        notas.weekNoteField('2026-W45', 'x');
        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(app.vault.modify).not.toHaveBeenCalled();
    });
});
