import { afterEach, describe, expect, it, vi } from 'vitest';
import * as momentNs from 'moment';
const moment: any = (momentNs as any).default ?? momentNs;

/**
 * O serviço do diário com um vault em memória (2.28 e 2.29, plano de 22/10/2026):
 * - "📖 Pelo diário" (o 🌙, em teste) só oferece o que o texto do dia cita; com o toque,
 *   a tarefa conclui agora (sem a janela "Quando terminou?") e o hábito recebe a marca;
 * - o diário escrito conta como fechamento do dia (o "🌒 Fechar o dia"), lido na virada
 *   do dia ou na próxima abertura; o primeiro uso não marca dias passados.
 * Nenhuma nota real é tocada: o vault, o quadro e o tracker são de mentira.
 */
vi.mock('obsidian', () => {
    class Base { constructor(..._args: any[]) {} }
    return {
        App: Base, TFile: class {}, Notice: vi.fn(), Modal: Base, SuggestModal: Base, FuzzySuggestModal: Base,
        TextAreaComponent: Base, Setting: Base, MarkdownView: Base, MarkdownRenderChild: Base, Plugin: Base, Menu: Base,
        normalizePath: (p: string) => p, setIcon: () => undefined,
    };
});

import { TFile } from 'obsidian';
import {
    CLOSING_HABIT_PATH,
    CLOSING_STORAGE_KEY,
    DAY_MODEL_PATH,
    DiaryService,
    chosenDiaryLabels,
    closingDaysToCheck,
    diaryNoticeText,
    diaryOptions,
    diaryCompletionWhen,
} from '../../src/engine/diaryService';
import { JSONProtocol, withOptionsWhen } from '../../src/engine/jsonProtocol';
import { taskUnitFrom } from '../../src/engine/decisionWeights';

const MODEL = [
    '## ✍️ Diário', '',
    '*Um único percurso cronológico. Escrever é opcional; quando algo merecer uma nota própria, capture sem interromper o fluxo.*',
    '*Deslizou ou viu algo? Duas linhas: 📍 Aceito que… · 🤝 O compromisso é…*', '', '', '',
    '### 🌙 Noite', '*O fechamento do dia entra aqui, depois do que você escreveu.*',
].join('\n');
const day = (body: string) => `---\ntype: daily_note\n---\n${MODEL.replace('\n\n\n\n### 🌙 Noite', `\n\n${body}\n\n### 🌙 Noite`)}\n`;
const DAY = (d: string) => `300 - RUNTIME/302 - Daymiss/Day/${d}.md`;
const T = (name: string) => `TaskNotes/Tasks/${name}.md`;
const HAB = (name: string) => `200 - FUNCTIONS/Habits/Tracker/${name}.md`;

const file = (path: string) => {
    const name = path.split('/').pop()!;
    const dot = name.lastIndexOf('.');
    return Object.assign(new (TFile as any)(), { path, name, basename: name.slice(0, dot), extension: name.slice(dot + 1) });
};

afterEach(() => { vi.useRealTimers(); });

function setup(notes: Record<string, string>, frontmatter: Record<string, Record<string, any>>, storage: Record<string, string> = {}) {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 22, 22, 30, 0) });
    (globalThis as any).window = { moment };
    const all = new Set([...Object.keys(notes), ...Object.keys(frontmatter)]);
    const app: any = {
        vault: {
            getMarkdownFiles: () => [...all].filter(p => p.endsWith('.md')).map(file),
            getAbstractFileByPath: (path: string) => (all.has(path) ? file(path) : null),
            read: async (f: any) => notes[f.path] ?? '',
            adapter: { read: async (path: string) => { if (path === DAY_MODEL_PATH) return MODEL; throw new Error('não há'); } },
        },
        metadataCache: { getFileCache: (f: any) => ({ frontmatter: frontmatter[f?.path] }) },
        loadLocalStorage: vi.fn((key: string) => storage[key] ?? null),
        saveLocalStorage: vi.fn((key: string, value: string) => { storage[key] = value; }),
    };
    const units = () => Object.keys(frontmatter).filter(p => p.startsWith('TaskNotes/')).map(p => taskUnitFrom(frontmatter[p], p));
    const plugin: any = {
        app,
        nowTree: {
            taskUnits: units,
            decisionContext: async (list: any[]) => ({
                smartsDaVez: list.filter(u => u.type === 'tarefa_smart' && u.status === 'in-progress').map(u => u.name),
                linhagem: new Map(list.map(u => [u.name, u.projects])),
            }),
        },
        board: { completeTask: vi.fn(async () => true) },
        habitLog: { recordDailyHabitEntry: vi.fn(async () => true) },
        manager: { get: () => ({ def: { habitTrackerPath: CLOSING_HABIT_PATH } }) },
    };
    return { service: new DiaryService(plugin), plugin, app, storage };
}

const HABITS = {
    [HAB('10 - Meditacao')]: { title: '🧘 Sentar para meditar', status: 'em_treino', tracking: 'manual', minutos: 10, palavras: ['meditei', 'zazen'], entries: [] },
    [HAB('03 - Exercicio')]: { title: '👟 Começar o exercício', status: 'em_treino', tracking: 'manual', minutos: 20, palavras: ['academia'], entries: ['2026-10-22'] },
    [HAB('01 - Uso intencional do celular')]: { title: '📵 Intenção', status: 'em_treino', tracking: 'manual', entries: [] },
};

describe('📖 Pelo diário: o que o texto do dia cita', () => {
    const TASKS = {
        [T('Traduzir o livro para o inglês')]: { status: 'next-action', week: '2026-W43' },
        [T('Revisar a tradução do livro')]: { status: 'done', week: '2026-W43' },
        [T('Gravar o vídeo do livro')]: { status: 'next-action', week: '2026-W44' },
        [T('Livro tradução recorrente')]: { status: 'next-action', week: '2026-W43', recurrence: 'FREQ=DAILY' },
        [T('Divulgar o livro na tradução')]: { status: 'next-action', projects: ['[[Publicar a tradução]]'] },
        [T('Publicar a tradução')]: { type: 'tarefa_smart', status: 'in-progress', week: '2026-W43' },
    };

    it('as tarefas abertas da semana ou da SMART da vez e os hábitos de ação sem a marca do dia', async () => {
        const { service } = setup({ [DAY('2026-10-22')]: day('Fechei a tradução do livro. Meditei cedo e fui à academia.') }, { [DAY('2026-10-22')]: {}, ...TASKS, ...HABITS });
        const r = await service.reading('2026-10-22');
        expect(r.tarefas.map(t => t.name).sort()).toEqual(['Divulgar o livro na tradução', 'Traduzir o livro para o inglês']);
        // A da W44, a concluída, a recorrente e a SMART ficam de fora; o exercício já tem a marca de hoje.
        expect(r.habitos.map(h => h.title)).toEqual(['🧘 Sentar para meditar']);
        const labels = diaryOptions(r).map(o => o.label);
        expect(labels).toContain('✅ Concluir: Traduzir o livro para o inglês');
        expect(labels).toContain('🔁 Marcar: 🧘 Sentar para meditar');
    });

    it('sem texto dele (só o modelo), ou sem a Day, nada aparece', async () => {
        const { service } = setup({ [DAY('2026-10-22')]: day('') }, { [DAY('2026-10-22')]: {}, ...TASKS, ...HABITS });
        expect(await service.reading('2026-10-22')).toMatchObject({ tarefas: [], habitos: [] });
        expect(await service.reading('2026-10-21')).toMatchObject({ tarefas: [], habitos: [] });
    });

    it('com o toque: a tarefa conclui agora, sem a janela; o hábito recebe a marca do dia', async () => {
        const { service, plugin } = setup({}, {});
        const done = await service.applyReading([
            { tipo: 'tarefa', path: T('Traduzir o livro para o inglês') },
            { tipo: 'habito', path: HAB('10 - Meditacao') },
        ], '2026-10-22', { date: '2026-10-22', time: '22:30' });
        expect(done).toEqual({ tarefas: 1, habitos: 1 });
        expect(plugin.board.completeTask).toHaveBeenCalledWith(T('Traduzir o livro para o inglês'), { when: { choice: 'agora', date: '2026-10-22', time: '22:30' } });
        expect(plugin.habitLog.recordDailyHabitEntry).toHaveBeenCalledWith(HAB('10 - Meditacao'), '2026-10-22');
        expect(diaryNoticeText(done)).toBe('📖 Pelo diário: 1 tarefa concluída · 1 hábito marcado.');
        expect(diaryNoticeText({ tarefas: 0, habitos: 0 })).toBe('📖 Pelo diário: nada foi marcado.');
    });

    it('a rodada às 00:30 na Day de ontem conclui ontem, sem hora; uma Day mais antiga, outro dia', async () => {
        const { service, plugin } = setup({}, {});
        await service.applyReading([{ tipo: 'tarefa', path: T('Traduzir o livro para o inglês') }], '2026-11-01', { date: '2026-11-02', time: '00:30' });
        expect(plugin.board.completeTask).toHaveBeenCalledWith(T('Traduzir o livro para o inglês'), { when: { choice: 'ontem', date: '2026-11-01', time: null } });
        expect(diaryCompletionWhen('2026-10-30', { date: '2026-11-02', time: '00:30' })).toEqual({ choice: 'outro_dia', date: '2026-10-30', time: null });
        expect(diaryCompletionWhen('2026-11-02', { date: '2026-11-02', time: '22:10' })).toEqual({ choice: 'agora', date: '2026-11-02', time: '22:10' });
        // Dia vazio ou no futuro: agora (não há conclusão no futuro).
        expect(diaryCompletionWhen('', { date: '2026-11-02', time: '22:10' }).choice).toBe('agora');
        expect(diaryCompletionWhen('2026-11-03', { date: '2026-11-02', time: '22:10' }).date).toBe('2026-11-02');
    });

    it('a escolha volta pela lista do modal; sem ela, pelo texto "A, B" (rótulo com vírgula não se perde na lista)', () => {
        const labels = ['✅ Concluir: A, B e C', '🔁 Marcar: D'];
        expect(chosenDiaryLabels({ values: ['✅ Concluir: A, B e C'] }, labels)).toEqual(['✅ Concluir: A, B e C']);
        expect(chosenDiaryLabels({ value: '🔁 Marcar: D' }, labels)).toEqual(['🔁 Marcar: D']);
        expect(chosenDiaryLabels({ value: 'Nenhum' }, labels)).toEqual([]);
    });
});

describe('o passo "📖 Pelo diário" no motor', () => {
    const run = (diario: any, multi: any) => {
        // As opções e a gravação do diário são métodos do motor (`opcoesDoDiario`, `aplicarDiario`, P12a).
        const self: any = Object.assign(Object.create(JSONProtocol.prototype), {
            plugin: { diario },
            getContextDate: () => moment('2026-10-22'),
            multiSelect: vi.fn(async () => multi),
        });
        return { self, go: () => (JSONProtocol.prototype as any).diaryStep.call(self, { prompt: '📖 Pelo diário (em teste)', info: 'i' }, true, undefined) };
    };

    it('sem nada citado, o passo não aparece (skip) e nada é marcado', async () => {
        const diario = { reading: vi.fn(async () => ({ tarefas: [], habitos: [] })), applyReading: vi.fn() };
        const { self, go } = run(diario, null);
        expect(await go()).toEqual({ status: 'skip' });
        expect(self.multiSelect).not.toHaveBeenCalled();
        expect(diario.applyReading).not.toHaveBeenCalled();
        expect(await (JSONProtocol.prototype as any).diaryStep.call(Object.assign(Object.create(JSONProtocol.prototype), { plugin: {}, getContextDate: () => moment() }), {}, false)).toEqual({ status: 'skip' });
    });

    it('só o marcado é aplicado; confirmar sem marcar não muda nada', async () => {
        const reading = { tarefas: [{ path: T('A'), name: 'A' }], habitos: [{ path: HAB('10 - Meditacao'), title: '🧘 Meditar' }] };
        const diario = { reading: vi.fn(async () => reading), applyReading: vi.fn(async () => ({ tarefas: 0, habitos: 1 })) };
        const { go } = run(diario, { status: 'submit', value: '🔁 Marcar: 🧘 Meditar', values: ['🔁 Marcar: 🧘 Meditar'] });
        expect(await go()).toMatchObject({ status: 'submit', value: '🔁 Marcar: 🧘 Meditar' });
        expect(diario.reading).toHaveBeenCalledWith('2026-10-22');
        expect(diario.applyReading).toHaveBeenCalledWith([{ tipo: 'habito', path: HAB('10 - Meditacao') }], '2026-10-22', expect.objectContaining({ date: expect.any(String) }));

        const nada = { reading: vi.fn(async () => reading), applyReading: vi.fn() };
        const vazio = run(nada, { status: 'submit', value: 'Nenhum', values: [] });
        expect(await vazio.go()).toMatchObject({ status: 'submit', value: 'Nenhum' });
        expect(nada.applyReading).not.toHaveBeenCalled();

        const voltar = run(nada, { status: 'back' });
        expect(await voltar.go()).toEqual({ status: 'back' });
    });
});

describe('optionsWhen: as opções pela resposta anterior', () => {
    const quando = { id: 'quando', options: ['⚡ Agora', '📅 Hoje', '🌅 Amanhã'],
        optionsWhen: [{ condition: { variable: 'tarefa_agora_tipo', value: 'habito' }, options: ['⚡ Agora'] }] };
    it('hábito escolhido: só "⚡ Agora"; tarefa ou sem a chave: as de sempre', () => {
        expect(withOptionsWhen(quando, { tarefa_agora_tipo: 'habito' }).options).toEqual(['⚡ Agora']);
        expect(withOptionsWhen(quando, { tarefa_agora_tipo: 'tarefa' }).options).toEqual(['⚡ Agora', '📅 Hoje', '🌅 Amanhã']);
        expect(withOptionsWhen({ options: ['x'] }, {})).toEqual({ options: ['x'] });
        // Regra sem opções não esvazia o passo.
        expect(withOptionsWhen({ options: ['x'], optionsWhen: [{ condition: { variable: 'v', value: 1 }, options: [] }] }, { v: 1 }).options).toEqual(['x']);
    });
});

describe('o diário escrito conta como fechamento do dia', () => {
    it('os dias conferidos: do último lido até ontem, no máximo 7; primeiro uso, nenhum', () => {
        expect(closingDaysToCheck(null, '2026-10-22')).toEqual([]);
        expect(closingDaysToCheck('2026-10-22', '2026-10-22')).toEqual([]);
        expect(closingDaysToCheck('2026-10-20', '2026-10-22')).toEqual(['2026-10-20', '2026-10-21']);
        expect(closingDaysToCheck('2026-09-01', '2026-10-22')).toHaveLength(7);
        expect(closingDaysToCheck('2026-09-01', '2026-10-22')[0]).toBe('2026-10-15');
    });

    it('primeiro uso: só guarda o dia, não marca nada', async () => {
        const { service, plugin, storage } = setup({ [DAY('2026-10-21')]: day('Escrevi bastante hoje.') }, { [DAY('2026-10-21')]: {} });
        expect(await service.checkClosings('2026-10-22')).toEqual([]);
        expect(plugin.habitLog.recordDailyHabitEntry).not.toHaveBeenCalled();
        expect(storage[CLOSING_STORAGE_KEY]).toBe('2026-10-22');
    });

    it('na virada: a Day com texto dele marca o "🌒 Fechar o dia" daquele dia; a só com o modelo, não', async () => {
        const { service, plugin, storage } = setup({
            [DAY('2026-10-20')]: day(''),
            [DAY('2026-10-21')]: day('Hoje foi corrido. Amanhã eu traduzo.'),
        }, { [DAY('2026-10-20')]: {}, [DAY('2026-10-21')]: {} }, { [CLOSING_STORAGE_KEY]: '2026-10-19' });
        expect(await service.checkClosings('2026-10-22')).toEqual(['2026-10-21']);
        expect(plugin.habitLog.recordDailyHabitEntry).toHaveBeenCalledTimes(1);
        expect(plugin.habitLog.recordDailyHabitEntry).toHaveBeenCalledWith(CLOSING_HABIT_PATH, '2026-10-21');
        expect(storage[CLOSING_STORAGE_KEY]).toBe('2026-10-22');
        // No mesmo dia, ler de novo não marca outra vez.
        expect(await service.checkClosings('2026-10-22')).toEqual([]);
    });

    it('📝 Do diário de ontem: a última Day antes de hoje que existir', async () => {
        const { service } = setup({
            [DAY('2026-10-19')]: day('Amanhã eu gravo.'),
            [DAY('2026-10-22')]: day('Amanhã eu publico.'),
        }, { [DAY('2026-10-19')]: {}, [DAY('2026-10-22')]: {} });
        expect(await service.tomorrowFrom('2026-10-22')).toEqual({ dia: '2026-10-19', frases: ['Amanhã eu gravo.'] });
        expect(await service.tomorrowFrom('2026-10-19')).toEqual({ dia: null, frases: [] });
    });
});
