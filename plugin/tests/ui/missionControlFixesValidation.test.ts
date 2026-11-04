import { describe, expect, it, vi } from 'vitest';
import { openVaultPath, openVaultLink } from '../../src/ui/mission/context';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('obsidian', () => ({
    TFile: class TFile { constructor(public path: string) {} },
    TFolder: class TFolder {},
    Notice: class Notice { constructor(public message?: string) {} },
    Platform: { isMobile: false, isDesktopApp: true },
}));

import { TFile } from 'obsidian';

class FakeEl {
    className = '';
    textContent = '';
    children: FakeEl[] = [];
    listeners: Record<string, Function[]> = {};
    constructor(public tagName: string) {}
    appendChild(c: FakeEl) { this.children.push(c); return c; }
    createEl(tag: string) { const el = new FakeEl(tag); this.appendChild(el); return el; }
    setText(t: string) { this.textContent = t; }
    setAttribute(k: string, v: string) { if (k === 'class') this.className = v; }
    addClass(c: string) { this.className += ` ${c}`; }
    addEventListener(t: string, fn: Function) { (this.listeners[t] ??= []).push(fn); }
    dispatchEvent(ev: any) { for (const fn of this.listeners[ev.type] ?? []) fn(ev); }
    querySelectorAll(sel: string): FakeEl[] {
        const res: FakeEl[] = [];
        const check = (node: FakeEl) => {
            if (sel.includes('.is-clickable') && node.className.includes('is-clickable')) res.push(node);
            for (const child of node.children) check(child);
        };
        check(this);
        return res;
    }
}

(globalThis as any).document = {
    createElement: (tag: string) => new FakeEl(tag),
};

describe('Validação das Correções do Mission Control e Canvas Fractal', () => {
    describe('1. openVaultPath e openVaultLink abrem em nova aba', () => {
        it('openVaultPath chama getLeaf com tab para não colidir com o Mission Control', async () => {
            const openFile = vi.fn().mockResolvedValue(undefined);
            const getLeaf = vi.fn().mockReturnValue({ openFile });
            const dummyFile = Object.create(TFile.prototype);
            dummyFile.path = 'TaskNotes/Tasks/Minha Tarefa.md';
            const app: any = {
                vault: {
                    getAbstractFileByPath: vi.fn((path: string) => path.includes('Minha Tarefa') ? dummyFile : null),
                },
                workspace: { getLeaf },
            };

            await openVaultPath(app, 'TaskNotes/Tasks/Minha Tarefa.md');

            expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('TaskNotes/Tasks/Minha Tarefa.md');
            expect(getLeaf).toHaveBeenCalledWith('tab');
            expect(openFile).toHaveBeenCalledWith(dummyFile);
        });

        it('openVaultLink resolve wikilink e abre em nova aba via getLeaf(tab)', async () => {
            const openFile = vi.fn().mockResolvedValue(undefined);
            const getLeaf = vi.fn().mockReturnValue({ openFile });
            const resolvedFile = Object.create(TFile.prototype);
            resolvedFile.path = '000 - OPERAÇÃO/001 - DFM System.md';
            const app: any = {
                metadataCache: {
                    getFirstLinkpathDest: vi.fn((link: string) => link === 'DFM System' ? resolvedFile : null),
                },
                vault: {
                    getAbstractFileByPath: vi.fn(),
                },
                workspace: { getLeaf },
            };

            await openVaultLink(app, '[[DFM System]]');

            expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('DFM System', '');
            expect(getLeaf).toHaveBeenCalledWith('tab');
            expect(openFile).toHaveBeenCalledWith(resolvedFile);
        });
    });

    describe('3. Estilos CSS (a paleta e o pegador de widget saíram em 02/11/2026; o menu do canvas da vista antiga, em 03/11/2026)', () => {
        it('styles.css mantém o campo clicável', () => {
            const cssPath = resolve(__dirname, '../../styles.css');
            const css = readFileSync(cssPath, 'utf8');

            // Estilo clicável para itens de conteúdo
            expect(css).toContain('.dfm-mission-control .mc-field.is-clickable');
        });
    });
});
