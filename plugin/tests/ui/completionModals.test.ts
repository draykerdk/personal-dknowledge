import { describe, expect, it, vi } from 'vitest';
import * as momentNs from 'moment';
const moment: any = (momentNs as any).default ?? momentNs;

/**
 * A tela "Quando terminou?" (arquitetura 4.6): a conclusão dita depois ("Mais cedo
 * hoje", "Ontem", "Outro dia") pergunta numa segunda linha onde foi e quanto levou,
 * com o provável marcado; um toque confirma, "Pular" segue sem o dado. "Agora" não
 * pergunta. O vitest roda em `node` (sem DOM): o elemento é um shim mínimo, só com o
 * que a tela usa. Falha sem a segunda linha.
 */
type El = {
    tag: string; text: string; cls: string; value: string; type: string; max: string; style: Record<string, string>;
    children: El[]; listeners: Record<string, Array<(e: any) => void>>;
    createEl(tag: string, opts?: { text?: string; cls?: string; value?: string }): El;
    createDiv(opts?: { text?: string; cls?: string }): El;
    createSpan(opts?: { text?: string; cls?: string }): El;
    empty(): void; addClass(c: string): void; focus(): void;
    addEventListener(type: string, fn: (e: any) => void): void;
};

function el(tag: string, opts: { text?: string; cls?: string; value?: string } = {}): El {
    const node: El = {
        tag, text: opts.text ?? '', cls: opts.cls ?? '', value: opts.value ?? '', type: '', max: '', style: {}, children: [], listeners: {},
        createEl(t, o) { const c = el(t, o); node.children.push(c); return c; },
        createDiv(o) { return node.createEl('div', o); },
        createSpan(o) { return node.createEl('span', o); },
        empty() { node.children = []; },
        addClass(c) { node.cls = `${node.cls} ${c}`.trim(); },
        focus() {},
        addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    };
    return node;
}

const all = (root: El): El[] => [root, ...root.children.flatMap(all)];
const button = (root: El, text: string) => all(root).find(n => n.tag === 'button' && n.text === text)!;
const click = (node: El) => node.listeners.click?.forEach(fn => fn({}));
const selects = (root: El) => all(root).filter(n => n.tag === 'select');

vi.mock('obsidian', () => ({
    App: class {},
    Notice: class {},
    Modal: class {
        contentEl: any;
        constructor() { this.contentEl = (globalThis as any).__makeEl('div'); }
        open() { (this as any).onOpen(); }
        close() { (this as any).onClose(); }
    },
}));
(globalThis as any).__makeEl = el;

import { askCompletionWhen } from '../../src/ui/completionModals';
import { COMPLETION_PLACE_CONFIRM, COMPLETION_PLACE_PROMPT, COMPLETION_PLACE_SKIP } from '../../src/board/taskCompletion';

function open(probable?: { lugar: string; bloco_min: number }) {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 19, 17, 40, 0) });
    (globalThis as any).window = { moment, setTimeout: () => 0 };
    let modalEl: El | null = null;
    const original = (globalThis as any).__makeEl;
    (globalThis as any).__makeEl = (tag: string) => { const made = original(tag); modalEl ??= made; return made; };
    const pending = askCompletionWhen({} as any, 'Gravar', probable);
    (globalThis as any).__makeEl = original;
    return { root: modalEl!, pending };
}

describe('"Quando terminou?" com a segunda linha', () => {
    it('"Ontem": abre onde foi e quanto levou, com o provável marcado; um toque confirma', async () => {
        const { root, pending } = open({ lugar: '🎬 Criação', bloco_min: 60 });
        click(button(root, 'Ontem'));
        expect(all(root).some(n => n.text === COMPLETION_PLACE_PROMPT)).toBe(true);
        const [place, size] = selects(root);
        expect(place.value).toBe('🎬 Criação');
        expect(size.value).toBe('60');
        click(button(root, COMPLETION_PLACE_CONFIRM));
        expect(await pending).toEqual({ choice: 'ontem', date: '2026-10-18', time: null, lugar: '🎬 Criação', bloco_min: 60 });
        vi.useRealTimers();
    });

    it('mudar o marcado e confirmar grava o escolhido; "Pular" segue sem o dado', async () => {
        const a = open({ lugar: '🎬 Criação', bloco_min: 60 });
        click(button(a.root, 'Ontem'));
        const [place, size] = selects(a.root);
        place.value = '📱 Celular'; place.listeners.change.forEach(fn => fn({}));
        size.value = '15'; size.listeners.change.forEach(fn => fn({}));
        click(button(a.root, COMPLETION_PLACE_CONFIRM));
        expect(await a.pending).toMatchObject({ lugar: '📱 Celular', bloco_min: 15 });

        const b = open({ lugar: '🎬 Criação', bloco_min: 60 });
        click(button(b.root, 'Ontem'));
        click(button(b.root, COMPLETION_PLACE_SKIP));
        expect(await b.pending).toEqual({ choice: 'ontem', date: '2026-10-18', time: null });
        vi.useRealTimers();
    });

    it('"Agora" não pergunta a segunda linha; sem o provável (a seleção de várias), também não', async () => {
        const a = open({ lugar: '🎬 Criação', bloco_min: 60 });
        click(button(a.root, 'Agora'));
        expect(await a.pending).toEqual({ choice: 'agora', date: '2026-10-19', time: '17:40' });
        const b = open();
        click(button(b.root, 'Ontem'));
        expect(await b.pending).toEqual({ choice: 'ontem', date: '2026-10-18', time: null });
        vi.useRealTimers();
    });
});
