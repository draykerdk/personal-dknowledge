import { describe, expect, it, vi } from 'vitest';

/**
 * O duplo clique no nó de tarefa: o motor de canvas ouvia no `document`, em captura,
 * e parava o evento (`stopImmediatePropagation`) antes de ele chegar ao ouvinte do
 * cartão. Um duplo clique rápido em ⏭️, 🤝 ou na bolinha abria também o editor do
 * TaskNotes por cima da ação, e no celular o duplo toque abria o editor. Agora o
 * motor só abre o editor quando o nó não tem o cartão (que cuida disso), fora dos
 * botões e fora do celular. Falha sem a mudança.
 */
const { isMobile } = vi.hoisted(() => ({ isMobile: { value: false } }));

vi.mock('obsidian', () => ({
    TFile: class { path = ''; basename = ''; extension = 'md'; },
    TFolder: class {},
    Notice: class {},
    debounce: (fn: any) => fn,
    Modal: class { open() {} close() {} },
    App: class {},
    Platform: { get isMobile() { return isMobile.value; } },
    Keymap: {},
}));

import { TFile } from 'obsidian';
import { CanvasEngine, engineOpensTaskOnDblclick } from '../../src/engine/canvasengine/canvasEngine';

const TASK = Object.assign(new (TFile as any)(), { path: 'TaskNotes/Tasks/Gravar.md', basename: 'Gravar', extension: 'md' });

function harness() {
    (globalThis as any).document = (globalThis as any).document ?? {};
    let dblclick: ((evt: any) => void) | null = null;
    const openTaskEditModal = vi.fn();
    const plugin: any = {
        app: {
            workspace: { layoutReady: true, activeLeaf: null as any, on: vi.fn(), onLayoutReady: vi.fn(), getLeavesOfType: () => [] },
            vault: { on: vi.fn(), getAbstractFileByPath: () => TASK },
            metadataCache: { getFileCache: () => ({ frontmatter: { type: 'task' } }) },
            plugins: { plugins: { tasknotes: { openTaskEditModal, api: { tasks: { get: vi.fn(async () => ({ path: TASK.path })) } } } } },
        },
        settings: {},
        registerEvent: vi.fn(),
        registerInterval: vi.fn(),
        registerDomEvent: vi.fn((_target: any, name: string, handler: any) => { if (name === 'dblclick') dblclick = handler; }),
    };
    const engine = new CanvasEngine(plugin);
    engine.registerEvents();
    const node = { file: TASK };
    plugin.app.workspace.activeLeaf = { view: { getViewType: () => 'canvas', canvas: { nodes: new Map([['n1', node]]) } } };
    return { fire: (evt: any) => dblclick!(evt), openTaskEditModal };
}

function event(opts: { onButton?: boolean; card?: boolean }) {
    const nodeEl: any = { getAttribute: () => 'n1', __dfmTaskDbl: opts.card === true };
    const target = {
        closest: (sel: string) => (sel === '.canvas-node' ? nodeEl : sel === '.dfm-tc button' && opts.onButton ? {} : null),
    };
    return { target, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
}

describe('o duplo clique no nó de tarefa', () => {
    it('a regra: o motor só abre o editor fora do celular, fora dos botões do cartão e sem o cartão montado', () => {
        const target = { closest: () => null };
        expect(engineOpensTaskOnDblclick(target, {}, true)).toBe(true);
        expect(engineOpensTaskOnDblclick(target, {}, false)).toBe(false);
        expect(engineOpensTaskOnDblclick({ closest: (s: string) => (s === '.dfm-tc button' ? {} : null) }, {}, true)).toBe(false);
        expect(engineOpensTaskOnDblclick(target, { __dfmTaskDbl: true }, true)).toBe(false);
    });

    it('num botão do cartão (⏭️, 🤝, a bolinha), o motor não abre o editor nem para o evento', async () => {
        isMobile.value = false;
        const h = harness();
        const evt = event({ onButton: true, card: true });
        h.fire(evt);
        await Promise.resolve();
        expect(evt.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(h.openTaskEditModal).not.toHaveBeenCalled();
    });

    it('no nó com o cartão, o evento segue para o ouvinte do cartão', () => {
        isMobile.value = false;
        const h = harness();
        const evt = event({ card: true });
        h.fire(evt);
        expect(evt.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it('no celular, o nó fica com o comportamento nativo', () => {
        isMobile.value = true;
        const h = harness();
        const evt = event({});
        h.fire(evt);
        expect(evt.stopImmediatePropagation).not.toHaveBeenCalled();
        isMobile.value = false;
    });

    it('sem o cartão (fora do celular), o motor ainda abre o editor do TaskNotes', async () => {
        isMobile.value = false;
        const h = harness();
        const evt = event({});
        h.fire(evt);
        expect(evt.stopImmediatePropagation).toHaveBeenCalled();
        await vi.waitFor(() => expect(h.openTaskEditModal).toHaveBeenCalled());
    });
});
