import { describe, expect, it, vi } from 'vitest';

/** No celular os canvas geridos só são lidos: a Nova Árvore não regrava o canvas do projeto. */
const { platform } = vi.hoisted(() => ({ platform: { isMobile: false } }));

vi.mock('obsidian', () => ({
    App: class {},
    Notice: class {},
    SuggestModal: class { open() {} close() {} },
    Modal: class { open() {} close() {} },
    FuzzySuggestModal: class { open() {} close() {} },
    TFile: class { path = ''; basename = ''; extension = 'canvas'; },
    TFolder: class {},
    Keymap: { isModEvent: () => false },
    Platform: platform,
    normalizePath: (p: string) => p,
}));

import { TFile } from 'obsidian';
import { embedArvoreNodeInProjectCanvas } from '../../src/ui/arvoreModals';

function harness() {
    const canvas = Object.assign(new (TFile as any)(), { path: 'A/P/Projeto.canvas', basename: 'Projeto' });
    const app: any = {
        vault: {
            getAbstractFileByPath: (path: string) => (path === canvas.path ? canvas : null),
            read: vi.fn(async () => JSON.stringify({ nodes: [], edges: [] })),
            modify: vi.fn(async () => undefined),
        },
        workspace: { getLeavesOfType: () => [] },
    };
    const plugin: any = { board: { projectCanvas: { canvasPathOfFolder: () => canvas.path } } };
    return { app, plugin, folder: { path: 'A/P', name: 'Projeto' } as any };
}

describe('Nova Árvore: embutir no canvas do projeto', () => {
    it('no celular não grava o canvas', async () => {
        const { app, plugin, folder } = harness();
        platform.isMobile = true;
        try {
            await embedArvoreNodeInProjectCanvas(app, plugin, folder, 'A/P/Projeto — Árvore.canvas');
            expect(app.vault.modify).not.toHaveBeenCalled();
            expect(app.vault.read).not.toHaveBeenCalled();
        } finally {
            platform.isMobile = false;
        }
    });

    it('controle: no computador embute o nó da Árvore', async () => {
        const { app, plugin, folder } = harness();
        await embedArvoreNodeInProjectCanvas(app, plugin, folder, 'A/P/Projeto — Árvore.canvas');
        expect(app.vault.modify).toHaveBeenCalledTimes(1);
        expect(JSON.parse(app.vault.modify.mock.calls[0][1]).nodes[0]).toMatchObject({ id: 'arvore_embed', file: 'A/P/Projeto — Árvore.canvas' });
    });
});
