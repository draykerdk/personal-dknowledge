import { afterEach, describe, expect, it, vi } from 'vitest';
import * as momentNs from 'moment';
const moment: any = (momentNs as any).default ?? momentNs;

/**
 * As duas chaves do `createTask` que a viagem nos ciclos pede (proposta de 29/10):
 * - `weekSemDia` (§6, "Duas travas de hoje saem"): a Partida e a mala aceitam só a semana; sem o dia,
 *   ficam na semana de hoje, e não sem semana;
 * - `naoRepetir` (§1, defeito 4): a mala da 🧳 e a do 🌍 Decidir eram duas tarefas; a aberta com o mesmo
 *   título já é a tarefa, e nenhuma nova nasce.
 */
vi.mock('obsidian', () => ({
    App: class {}, Notice: class {}, TFile: class {},
    Modal: class { open() {} close() {} },
    SuggestModal: class { open() {} close() {} },
    FuzzySuggestModal: class { open() {} close() {} },
    ItemView: class {}, Setting: class {}, PluginSettingTab: class {}, Plugin: class {},
}));

import { TFile } from 'obsidian';
import { JSONProtocol, modeloDaSemanaDaTarefa, tarefaAbertaDeMesmoTitulo } from '../../src/engine/jsonProtocol';
import { DEFAULT_SETTINGS } from '../../src/settings';

afterEach(() => vi.useRealTimers());

/** O motor com um vault em memória (só o que o createTask usa), com as tarefas que já existem. */
function motor(existentes: Record<string, string> = {}) {
    (globalThis as any).window = { moment };
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 29, 10, 0, 0) });
    const files = new Map<string, any>();
    const status = new Map<string, string>();
    const arquivo = (path: string) => Object.assign(new (TFile as any)(), { path, basename: path.split('/').pop()!.replace(/\.md$/, '') });
    for (const [path, st] of Object.entries(existentes)) { files.set(path, arquivo(path)); status.set(path, st); }
    const created: Array<{ path: string; content: string }> = [];
    const app: any = {
        vault: {
            getAbstractFileByPath: (path: string) => files.get(path) ?? null,
            getMarkdownFiles: () => [...files.values()],
            create: async (path: string, content: string) => {
                created.push({ path, content });
                const f = arquivo(path);
                files.set(path, f);
                return f;
            },
            adapter: { read: async () => { throw new Error('sem TaskNotes'); } },
        },
        workspace: { getActiveFile: () => null },
        metadataCache: { getFileCache: (f: any) => (status.has(f.path) ? { frontmatter: { status: status.get(f.path) } } : null) },
    };
    const p: any = new JSONProtocol({ app, settings: { ...DEFAULT_SETTINGS } } as any, { id: 'teste' });
    return { p, created };
}

const linha = (content: string, chave: string) => content.split('\n').find(l => l.startsWith(`${chave}:`)) ?? null;

describe('modeloDaSemanaDaTarefa: sem o dia, a semana de hoje', () => {
    it('com o dia, o `week` de sempre; sem o dia, o `weekSemDia`', () => {
        expect(modeloDaSemanaDaTarefa('{{scheduled:GGGG-[W]WW}}', '{{date:GGGG-[W]WW}}', '2026-11-04')).toBe('{{scheduled:GGGG-[W]WW}}');
        expect(modeloDaSemanaDaTarefa('{{scheduled:GGGG-[W]WW}}', '{{date:GGGG-[W]WW}}', '')).toBe('{{date:GGGG-[W]WW}}');
    });
    it('sem o `weekSemDia`, ou com o `week` que não depende do dia, nada muda', () => {
        expect(modeloDaSemanaDaTarefa('{{scheduled:GGGG-[W]WW}}', undefined, '')).toBe('{{scheduled:GGGG-[W]WW}}');
        expect(modeloDaSemanaDaTarefa('{{scheduled:GGGG-[W]WW}}', '   ', '')).toBe('{{scheduled:GGGG-[W]WW}}');
        expect(modeloDaSemanaDaTarefa('{{date:GGGG-[W]WW}}', '{{targetweek:GGGG-[W]WW}}', '')).toBe('{{date:GGGG-[W]WW}}');
        expect(modeloDaSemanaDaTarefa(undefined, '{{date:GGGG-[W]WW}}', '')).toBe('');
        expect(modeloDaSemanaDaTarefa(42, '{{date:GGGG-[W]WW}}', '')).toBe('');
    });
});

describe('tarefaAbertaDeMesmoTitulo', () => {
    const tarefas = [
        { caminho: 'TaskNotes/Tasks/🧳 Fechar mala e documentos: SaPa.md', titulo: '🧳 Fechar mala e documentos: SaPa', status: 'next-action' },
        { caminho: 'TaskNotes/Tasks/🧳 Fechar mala e documentos: Kunming.md', titulo: '🧳 Fechar mala e documentos: Kunming', status: 'done' },
        { caminho: 'TaskNotes/Tasks/🧳 Fechar mala e documentos: Hanói (2).md', titulo: '🧳 Fechar mala e documentos: Hanói (2)', status: 'in-progress' },
        { caminho: 'TaskNotes/Tasks/🧳 Fechar mala e documentos: Lao Cai.md', titulo: '🧳 Fechar mala e documentos: Lao Cai', status: 'cancelled' },
    ];
    it('a aberta com o mesmo título (sem diferença de maiúsculas, sem o " (N)") é achada', () => {
        expect(tarefaAbertaDeMesmoTitulo('🧳 Fechar mala e documentos: SaPa', tarefas)).toBe(tarefas[0].caminho);
        expect(tarefaAbertaDeMesmoTitulo('🧳 fechar mala e documentos: sapa', tarefas)).toBe(tarefas[0].caminho);
        expect(tarefaAbertaDeMesmoTitulo('🧳 Fechar mala e documentos: Hanói', tarefas)).toBe(tarefas[2].caminho);
    });
    it('a feita e a cancelada não contam; o título vazio não acha nada', () => {
        expect(tarefaAbertaDeMesmoTitulo('🧳 Fechar mala e documentos: Kunming', tarefas)).toBeNull();
        expect(tarefaAbertaDeMesmoTitulo('🧳 Fechar mala e documentos: Lao Cai', tarefas)).toBeNull();
        expect(tarefaAbertaDeMesmoTitulo('', tarefas)).toBeNull();
        expect(tarefaAbertaDeMesmoTitulo('Outra coisa', [])).toBeNull();
    });
});

describe('createTask com as duas chaves', () => {
    const PARTIDA = { titleVar: 'cidade', prefix: '✈️ PARTIDA: ', scheduledVar: 'saida', status: 'next-action', askContext: false, week: '{{scheduled:GGGG-[W]WW}}', weekSemDia: '{{date:GGGG-[W]WW}}' };
    it('a Partida sem a data nasce na semana de hoje, sem dia; com a data, no dia e na semana dele', async () => {
        const { p, created } = motor();
        await p.createTaskFromVariable(PARTIDA, { cidade: 'Hanói', saida: '' }, null);
        await p.createTaskFromVariable(PARTIDA, { cidade: 'Hanói', saida: '2026-11-04' }, null);
        expect(created).toHaveLength(2);
        expect([linha(created[0].content, 'week'), linha(created[0].content, 'scheduled')]).toEqual(['week: 2026-W44', null]);
        expect([linha(created[1].content, 'week'), linha(created[1].content, 'scheduled')]).toEqual(['week: 2026-W45', 'scheduled: 2026-11-04']);
    });
    it('`naoRepetir`: a mala aberta com o mesmo título não nasce de novo; a fechada não impede', async () => {
        const MALA = { titleVar: 'cidade', prefix: '🧳 Fechar mala e documentos: ', status: 'next-action', askContext: false, naoRepetir: true };
        const { p, created } = motor({
            // O nome do arquivo troca o ':' por ' -' (sanitizeFilename), como no cofre.
            'TaskNotes/Tasks/🧳 Fechar mala e documentos - SaPa.md': 'next-action',
            'TaskNotes/Tasks/🧳 Fechar mala e documentos - Kunming.md': 'done',
        });
        await p.createTaskFromVariable(MALA, { cidade: 'SaPa' }, null);
        await p.createTaskFromVariable(MALA, { cidade: 'Kunming' }, null);
        expect(created.map(c => c.path)).toEqual(['TaskNotes/Tasks/🧳 Fechar mala e documentos - Kunming (2).md']);
    });
    it('sem `naoRepetir`, o mesmo título ganha o " (2)" de sempre', async () => {
        const { p, created } = motor({ 'TaskNotes/Tasks/🧳 Fechar mala e documentos - SaPa.md': 'next-action' });
        await p.createTaskFromVariable({ titleVar: 'cidade', prefix: '🧳 Fechar mala e documentos: ', status: 'next-action', askContext: false }, { cidade: 'SaPa' }, null);
        expect(created.map(c => c.path)).toEqual(['TaskNotes/Tasks/🧳 Fechar mala e documentos - SaPa (2).md']);
    });
});
