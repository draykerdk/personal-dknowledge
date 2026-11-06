/**
 * A hora da marca do hábito numa linha da Day (06/11, a recomendação aprovada: "vamos completar tudo então"): a marca,
 * do sistema ou à mão, deixa na Day do dia marcado `**[HH:mm] Hábito marcado:** [[hábito]]` com a marca do id, pelo
 * escritor da Day (a mesma inserção do registro dos protocolos). O dia que não é hoje leva "marcado depois"; desmarcar
 * tira a linha (como o Desfazer); a Day de outro dia não nasce por uma marca. Falha sem a mudança: a marca só mudava
 * `entries`.
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('obsidian', () => ({ TFile: class {} }));

import { TFile } from 'obsidian';
import { HabitLog } from '../../src/engine/habitLog';
import { habitoDaMarca, inserirNaDay, linhaDaMarcaDoHabito, MARCADO_DEPOIS, marcaDoHabito, secaoDoRegistro, semAMarcaDoHabito } from '../../src/engine/escritorDaDay';
import { protocoloDaMarca } from '../../src/engine/protocolGroups';

// O arquivo vem do cofre (três pastas acima do plugin) ou, no pacote aberto, do `cofre-modelo/` ao lado do plugin;
// sem nenhum dos dois, o bloco fica de fora.
const raizCom = (rel: string) => [resolve(process.cwd(), '../../..'), resolve(process.cwd(), '../cofre-modelo')].find(r => existsSync(resolve(r, rel)));
const MODELO_DA_DAY = '200 - FUNCTIONS/Models/Day modelo.md';
const vault = raizCom(MODELO_DA_DAY);
const DAY_MODEL = vault ? readFileSync(resolve(vault, MODELO_DA_DAY), 'utf8') : '';
const HABITO = '200 - FUNCTIONS/Habits/Tracker/07 - Prática ACT diária.md';
const HOJE = '2026-11-06';

describe('a linha da marca (pura)', () => {
    it('com a hora e a marca do id; o título vai como rótulo do link; o dedupe é a marca', () => {
        const l = linhaDaMarcaDoHabito({ nome: '07 - Prática ACT diária', titulo: '🎈 Praticar ACT', hora: '09:41' });
        expect(l.entry).toBe('**[09:41] Hábito marcado:** [[07 - Prática ACT diária|🎈 Praticar ACT]] <!-- dfm-habito:07 - Prática ACT diária -->');
        expect(l.dedupe).toBe('<!-- dfm-habito:07 - Prática ACT diária -->');
        expect(habitoDaMarca(l.entry)).toBe('07 - Prática ACT diária');
        expect(protocoloDaMarca(l.entry)).toBe('');
    });

    it('sem hora, "marcado depois"; o nome que quebraria o comentário não gera marca', () => {
        expect(linhaDaMarcaDoHabito({ nome: 'X', hora: null }).entry).toBe(`**[${MARCADO_DEPOIS}] Hábito marcado:** [[X]] <!-- dfm-habito:X -->`);
        expect(marcaDoHabito('a -- b')).toBe('');
        expect(marcaDoHabito('a > b')).toBe('');
    });

    it('entra no ledger da Day (o modelo real), uma vez por dia, e sai ao desmarcar', () => {
        const { entry, dedupe } = linhaDaMarcaDoHabito({ nome: 'X', hora: '10:00' });
        const uma = inserirNaDay(DAY_MODEL, secaoDoRegistro(DAY_MODEL), entry, dedupe);
        expect(uma.inserted).toBe(true);
        expect(inserirNaDay(uma.content, secaoDoRegistro(uma.content), entry, dedupe).inserted).toBe(false);
        const sem = semAMarcaDoHabito(uma.content, 'X');
        expect(sem.removed).toBe(1);
        expect(sem.content).toBe(DAY_MODEL);
        expect(semAMarcaDoHabito(uma.content, 'Y').removed).toBe(0);
    });
});

/** O cofre de exemplo: a nota do hábito e as Days que existirem (o texto de cada uma). */
function cofre(days: Record<string, string>, fm: any = { title: '🎈 Praticar ACT', entries: [] }) {
    const tf = (path: string) => Object.assign(new (TFile as any)(), { path, name: path.split('/').pop(), basename: path.split('/').pop()!.replace(/\.md$/, '') });
    const habito = tf(HABITO);
    const textos: Record<string, string> = Object.fromEntries(Object.entries(days).map(([d, t]) => [`300 - RUNTIME/302 - Daymiss/Day/${d}.md`, t]));
    const files = new Map<string, any>([[HABITO, habito], ...Object.keys(textos).map(p => [p, tf(p)] as [string, any])]);
    const createDailyNote = vi.fn(async (d: string) => { const p = `300 - RUNTIME/302 - Daymiss/Day/${d}.md`; textos[p] = DAY_MODEL; const f = tf(p); files.set(p, f); return f; });
    const plugin: any = {
        createDailyNote,
        app: {
            vault: {
                getAbstractFileByPath: (p: string) => files.get(p) ?? null,
                getMarkdownFiles: () => [...files.values()],
                read: async (f: any) => textos[f.path],
                modify: async (f: any, t: string) => { textos[f.path] = t; },
            },
            fileManager: { processFrontMatter: async (_f: any, fn: (x: any) => void) => fn(fm) },
        },
    };
    return { log: new HabitLog(plugin), textos, fm, createDailyNote, day: (d: string) => textos[`300 - RUNTIME/302 - Daymiss/Day/${d}.md`] };
}

(globalThis as any).window = { moment: () => ({ format: (f: string) => (f === 'HH:mm' ? '09:41' : HOJE) }) };

describe('a porta única: o sistema e a mão', () => {
    it('a marca do sistema hoje põe a linha com a hora na Day de hoje', async () => {
        const c = cofre({ [HOJE]: DAY_MODEL });
        expect(await c.log.recordDailyHabitEntry(HABITO)).toBe(true);
        expect(c.day(HOJE)).toContain('**[09:41] Hábito marcado:** [[07 - Prática ACT diária|🎈 Praticar ACT]] <!-- dfm-habito:07 - Prática ACT diária -->');
        // O mesmo dia de novo: nem a lista nem a Day repetem.
        expect(await c.log.recordDailyHabitEntry(HABITO)).toBe(false);
        expect(c.day(HOJE).split('Hábito marcado').length).toBe(2);
    });

    it('à mão, um dia de antes: "marcado depois" na Day daquele dia; desmarcar tira a linha e o dia', async () => {
        const c = cofre({ '2026-11-04': DAY_MODEL });
        expect(await c.log.alternarDia(HABITO, '2026-11-04')).toBe('marcou');
        expect(c.fm.entries).toEqual(['2026-11-04']);
        expect(c.day('2026-11-04')).toContain(`**[${MARCADO_DEPOIS}] Hábito marcado:**`);
        expect(await c.log.alternarDia(HABITO, '2026-11-04')).toBe('desmarcou');
        expect(c.fm.entries).toEqual([]);
        expect(c.day('2026-11-04')).toBe(DAY_MODEL);
    });

    it('a Day de outro dia não nasce por uma marca; a de hoje nasce, como no registro dos protocolos', async () => {
        const c = cofre({});
        await c.log.alternarDia(HABITO, '2026-11-03');
        expect(c.createDailyNote).not.toHaveBeenCalled();
        expect(c.fm.entries).toEqual(['2026-11-03']);
        await c.log.alternarDia(HABITO, HOJE);
        expect(c.createDailyNote).toHaveBeenCalledWith(HOJE);
        expect(c.day(HOJE)).toContain('**[09:41] Hábito marcado:**');
    });
});
