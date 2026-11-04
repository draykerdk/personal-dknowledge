import { afterEach, describe, expect, it, vi } from 'vitest';
import * as momentNs from 'moment';
const moment: any = (momentNs as any).default ?? momentNs;

/**
 * `createTask.lugar` (proposta da viagem nos ciclos, 29/10, §5): a tarefa diz onde
 * acontece com `lugar: "[[cidade ou país]]"`; o `projects` continua sendo o pai. Desde 02/11
 * o ✈️, o 🤝 Decidir do 🌍 e o Reservar do 🏨 o usam (tests/contracts/viagemNomade.test.ts).
 */
vi.mock('obsidian', () => ({
    App: class {}, Notice: class {}, TFile: class {},
    Modal: class { open() {} close() {} },
    SuggestModal: class { open() {} close() {} },
    FuzzySuggestModal: class { open() {} close() {} },
    ItemView: class {}, Setting: class {}, PluginSettingTab: class {}, Plugin: class {},
}));

import { TFile } from 'obsidian';
import { JSONProtocol, buildTaskNoteContent, taskPlaceYaml } from '../../src/engine/jsonProtocol';
import { DEFAULT_SETTINGS } from '../../src/settings';

afterEach(() => vi.useRealTimers());

/** O motor com um vault em memória (só o que o createTask usa). */
function motor() {
    (globalThis as any).window = { moment };
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 29, 10, 0, 0) });
    const files = new Map<string, any>();
    const created: Array<{ path: string; content: string }> = [];
    const app: any = {
        vault: {
            getAbstractFileByPath: (path: string) => files.get(path) ?? null,
            create: async (path: string, content: string) => {
                created.push({ path, content });
                const f = Object.assign(new (TFile as any)(), { path, basename: path.split('/').pop()!.replace(/\.md$/, '') });
                files.set(path, f);
                return f;
            },
            adapter: { read: async () => { throw new Error('sem TaskNotes'); } },
        },
        workspace: { getActiveFile: () => null },
        metadataCache: { getFileCache: () => null },
    };
    const p: any = new JSONProtocol({ app, settings: { ...DEFAULT_SETTINGS } } as any, { id: 'teste' });
    return { p, created };
}

const linhas = (content: string, chave: string) => content.split('\n').filter(l => l.startsWith(`${chave}:`));

describe('taskPlaceYaml: o lugar como um link só, citado', () => {
    it('nome, link, link citado e link com apelido dão o mesmo formato', () => {
        expect(taskPlaceYaml('SaPa')).toBe('"[[SaPa]]"');
        expect(taskPlaceYaml(' [[SaPa]] ')).toBe('"[[SaPa]]"');
        expect(taskPlaceYaml('"[[SaPa]]"')).toBe('"[[SaPa]]"');
        expect(taskPlaceYaml('[[Hanói|Hanoi]]')).toBe('"[[Hanói|Hanoi]]"');
        // Mais de um link: só o primeiro.
        expect(taskPlaceYaml('[[Vietnã]], [[SaPa]]')).toBe('"[[Vietnã]]"');
    });

    it('sem nome não há lugar: vazio, só pontuação, o marcador do passo pulado', () => {
        for (const vazio of [undefined, null, '', '   ', '[[ ]]', '—', 'Sem conexão contextual', '[[Sem conexão contextual]]']) {
            expect(taskPlaceYaml(vazio), String(vazio)).toBe('');
        }
    });

    it('aspas no nome não quebram o YAML', () => {
        expect(taskPlaceYaml('O "Velho" Bairro')).toBe('"[[O \\"Velho\\" Bairro]]"');
    });
});

describe('buildTaskNoteContent grava o lugar depois do projects', () => {
    it('com lugar: a linha existe e o projects segue o pai', () => {
        const nota = buildTaskNoteContent({ title: 'Pedir o e-visa', projects: 'Viagem Vietnã', lugar: 'Vietnã' });
        const fm = nota.split('\n---\n')[0].split('\n');
        expect(linhas(nota, 'lugar')).toEqual(['lugar: "[[Vietnã]]"']);
        expect(linhas(nota, 'projects')).toEqual(['projects: ["[[Viagem Vietnã]]"]']);
        expect(fm.indexOf('lugar: "[[Vietnã]]"')).toBe(fm.indexOf('projects: ["[[Viagem Vietnã]]"]') + 1);
    });

    it('sem lugar, a chave não nasce (campo opcional omitido, não vazio)', () => {
        expect(linhas(buildTaskNoteContent({ title: 'Sem lugar' }), 'lugar')).toEqual([]);
        expect(linhas(buildTaskNoteContent({ title: 'Lugar vazio', lugar: '' }), 'lugar')).toEqual([]);
    });
});

describe('createTask.lugar: o modelo resolve pelas respostas da rodada', () => {
    it('o marcador de um passo vira o link da cidade', async () => {
        const { p, created } = motor();
        await p.createTaskFromVariable(
            { titleVar: 'acao', status: 'next-action', askContext: false, project: 'Viagem Vietnã', lugar: '{{cidade}}' },
            { acao: 'Achar os grupos de interesse', cidade: 'SaPa' },
            null,
        );
        expect(created).toHaveLength(1);
        expect(linhas(created[0].content, 'lugar')).toEqual(['lugar: "[[SaPa]]"']);
        expect(linhas(created[0].content, 'projects')).toEqual(['projects: ["[[Viagem Vietnã]]"]']);
    });

    it('a resposta de um passo de nota (link) e um valor fixo também servem', async () => {
        const { p, created } = motor();
        await p.createTaskFromVariable({ titleVar: 'a', status: 'next-action', askContext: false, lugar: '{{destino}}' }, { a: 'Reservar o hostel', destino: '[[SaPa]]' }, null);
        await p.createTaskFromVariable({ titleVar: 'a', status: 'next-action', askContext: false, lugar: '[[Vietnã]]' }, { a: 'Pedir o e-visa' }, null);
        expect(created.map(c => linhas(c.content, 'lugar'))).toEqual([['lugar: "[[SaPa]]"'], ['lugar: "[[Vietnã]]"']]);
    });

    it('passo sem resposta ou sem a chave: a tarefa nasce sem lugar', async () => {
        const { p, created } = motor();
        await p.createTaskFromVariable({ titleVar: 'a', status: 'next-action', askContext: false, lugar: '{{cidade}}' }, { a: 'Sem cidade ainda' }, null);
        await p.createTaskFromVariable({ titleVar: 'a', status: 'next-action', askContext: false, lugar: '[[{{cidade}}]]' }, { a: 'Link vazio', cidade: '' }, null);
        await p.createTaskFromVariable({ titleVar: 'a', status: 'next-action', askContext: false }, { a: 'Sem a chave' }, null);
        expect(created).toHaveLength(3);
        for (const c of created) expect(linhas(c.content, 'lugar'), c.path).toEqual([]);
    });
});
