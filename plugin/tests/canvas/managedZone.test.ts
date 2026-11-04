import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platform } = vi.hoisted(() => ({ platform: { isMobile: false } }));

vi.mock('obsidian', () => ({
    TFile: class { path = ''; },
    Platform: platform,
}));

import { TFile } from 'obsidian';
import { MAX_RETRIES, applyCanvasPlan, applyRoute, canvasWritesAllowed, isCanvasOpen } from '../../src/canvas/managedZone';
import type { CanvasData } from '../../src/project/projectCanvasModel';

const PATH = 'Quarterly/Canvases/2026-Q4.canvas';

const operator = { id: 'norte', type: 'text', text: 'Norte', x: 0, y: 0, width: 300, height: 100 };
const zoneOld = { id: 'dfm-qs-zone', type: 'group', x: 0, y: 400, width: 600, height: 300 };
const zoneNew = { id: 'dfm-qs-zone', type: 'group', x: 0, y: 400, width: 900, height: 300 };

/** O plano de teste: troca a zona pela nova, mantém o resto. */
const plan = (current: CanvasData): CanvasData => ({
    ...current,
    nodes: [...current.nodes.filter(n => !n.id.startsWith('dfm-q')), { ...zoneNew }],
});

function canvasFile(): any {
    const f = new (TFile as any)();
    f.path = PATH;
    return f;
}

interface Setup {
    view?: any;
    disk?: CanvasData | string;
}

function setup({ view, disk }: Setup = {}) {
    const file = canvasFile();
    const raw = typeof disk === 'string' ? disk : JSON.stringify(disk ?? { nodes: [operator, zoneOld], edges: [] });
    const app: any = {
        vault: {
            getAbstractFileByPath: vi.fn(() => file),
            read: vi.fn(async () => raw),
            process: vi.fn(async (_f: any, fn: (raw: string) => string) => fn(raw)),
        },
        workspace: { getLeavesOfType: vi.fn(() => (view ? [{ view }] : [])) },
    };
    const engine = { acceptCanvasState: vi.fn(), setIgnoreModifyFor: vi.fn() };
    const wait = vi.fn(async () => undefined);
    return { app, engine, wait, file };
}

function liveView(data: CanvasData | (() => CanvasData), extra: Record<string, unknown> = {}) {
    const classes = new Set<string>();
    const getData = vi.fn(typeof data === 'function' ? data : () => JSON.parse(JSON.stringify(data)));
    return {
        file: { path: PATH },
        dirty: false,
        saving: false,
        ...extra,
        canvas: {
            getData,
            setData: vi.fn(),
            requestSave: vi.fn(),
            nodes: new Map<string, any>(),
            isDragging: false,
            canvasEl: { classList: { contains: (c: string) => classes.has(c) } },
            classes,
        },
    };
}

beforeEach(() => {
    platform.isMobile = false;
});

describe('applyRoute (decisão pura)', () => {
    it('sem vista aberta: arquivo', () => {
        expect(applyRoute({ hasView: false, liveNodes: 0 })).toBe('file');
    });

    it('vista aberta e vazia: espera, nunca grava o arquivo', () => {
        expect(applyRoute({ hasView: true, liveNodes: 0 })).toBe('retry');
    });

    it('vista ocupada por um gesto (seta em curso, arrasto, nó em edição): espera', () => {
        expect(applyRoute({ hasView: true, liveNodes: 5, connecting: true })).toBe('retry');
        expect(applyRoute({ hasView: true, liveNodes: 5, dragging: true })).toBe('retry');
        expect(applyRoute({ hasView: true, liveNodes: 5, editing: true })).toBe('retry');
    });

    it('vista carregada e livre: ao vivo', () => {
        expect(applyRoute({ hasView: true, liveNodes: 5 })).toBe('live');
    });
});

describe('applyCanvasPlan', () => {
    it('canvas fechado: grava pelo arquivo', async () => {
        const { app, engine, wait } = setup();
        const result = await applyCanvasPlan(app, engine, PATH, plan, { wait });
        expect(result).toBe('aplicado');
        expect(app.vault.process).toHaveBeenCalledTimes(1);
        expect(engine.acceptCanvasState).toHaveBeenCalled();
    });

    it('vista aberta e vazia não grava o arquivo: tenta de novo e desiste com log', async () => {
        const view = liveView({ nodes: [], edges: [] });
        const { app, engine, wait } = setup({ view });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await applyCanvasPlan(app, engine, PATH, plan, { wait });
        expect(result).toBe('adiado');
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(view.canvas.setData).not.toHaveBeenCalled();
        expect(wait).toHaveBeenCalledTimes(MAX_RETRIES);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('vista que termina de carregar durante a espera recebe o plano ao vivo', async () => {
        let calls = 0;
        const loaded = { nodes: [operator, zoneOld], edges: [] };
        const view = liveView(() => (calls++ < 1 ? { nodes: [], edges: [] } : JSON.parse(JSON.stringify(loaded))));
        const { app, engine, wait } = setup({ view });
        const result = await applyCanvasPlan(app, engine, PATH, plan, { wait });
        expect(result).toBe('aplicado');
        expect(wait).toHaveBeenCalledTimes(1);
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(view.canvas.setData).toHaveBeenCalledTimes(1);
    });

    it('seta sendo puxada: espera o gesto acabar antes do setData', async () => {
        const view = liveView({ nodes: [operator, zoneOld], edges: [] });
        view.canvas.classes.add('is-connecting');
        const { app, engine } = setup({ view });
        const wait = vi.fn(async () => { view.canvas.classes.delete('is-connecting'); });
        const result = await applyCanvasPlan(app, engine, PATH, plan, { wait });
        expect(wait).toHaveBeenCalledTimes(1);
        expect(result).toBe('aplicado');
        expect(view.canvas.setData).toHaveBeenCalledTimes(1);
    });

    it('arrasto e nó em edição também esperam', async () => {
        const dragging = liveView({ nodes: [operator, zoneOld], edges: [] });
        dragging.canvas.isDragging = true;
        let s = setup({ view: dragging });
        expect(await applyCanvasPlan(s.app, s.engine, PATH, plan, { wait: s.wait })).toBe('adiado');
        expect(dragging.canvas.setData).not.toHaveBeenCalled();

        const editing = liveView({ nodes: [operator, zoneOld], edges: [] });
        editing.canvas.nodes.set('norte', { isEditing: true });
        s = setup({ view: editing });
        expect(await applyCanvasPlan(s.app, s.engine, PATH, plan, { wait: s.wait })).toBe('adiado');
        expect(editing.canvas.setData).not.toHaveBeenCalled();
    });

    it('vista em dia: aplica ao vivo com os dados lidos depois da leitura do disco', async () => {
        const before = { nodes: [operator, zoneOld], edges: [] };
        const added = { id: 'nova', type: 'text', text: 'nova', x: 0, y: 200, width: 100, height: 60 };
        let calls = 0;
        // As leituras antes do await veem o estado antigo; a de depois, um nó que entrou no meio.
        const view = liveView(() => JSON.parse(JSON.stringify(calls++ < 1 ? before : { nodes: [operator, added, zoneOld], edges: [] })));
        view.dirty = true; // o nó novo ainda não foi salvo
        const { app, engine, wait } = setup({ view });
        const seen: CanvasData[] = [];
        const result = await applyCanvasPlan(app, engine, PATH, c => { seen.push(c); return plan(c); }, { wait });
        expect(result).toBe('aplicado');
        expect(seen).toHaveLength(1);
        expect(seen[0].nodes.map(n => n.id)).toContain('nova');
        const written = view.canvas.setData.mock.calls[0][0] as CanvasData;
        expect(written.nodes.map(n => n.id)).toEqual(['norte', 'nova', 'dfm-qs-zone']);
        expect(view.canvas.requestSave).toHaveBeenCalled();
    });

    it('vista desatualizada (fora da zona diverge do disco, sem mudança por salvar): não grava e registra', async () => {
        const mapa = { id: 'map-1', type: 'text', text: 'Mapa DFM', x: 0, y: 120, width: 300, height: 100 };
        const view = liveView({ nodes: [operator, zoneOld], edges: [] }); // cópia velha, sem o mapa
        const { app, engine, wait } = setup({ view, disk: { nodes: [operator, mapa, zoneOld], edges: [] } });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await applyCanvasPlan(app, engine, PATH, plan, { wait });
        expect(result).toBe('vista-desatualizada');
        expect(view.canvas.setData).not.toHaveBeenCalled();
        expect(app.vault.process).not.toHaveBeenCalled();
        expect(engine.acceptCanvasState).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('divergência com mudança por salvar na vista é edição do operador: aplica', async () => {
        const meu = { id: 'meu-novo', type: 'text', text: 'acabei de criar', x: 0, y: 120, width: 300, height: 100 };
        const view = liveView({ nodes: [operator, meu, zoneOld], edges: [] }, { dirty: true });
        const { app, engine, wait } = setup({ view });
        expect(await applyCanvasPlan(app, engine, PATH, plan, { wait })).toBe('aplicado');
        expect(view.canvas.setData).toHaveBeenCalledTimes(1);
    });

    it('divergência só dentro da zona não conta como vista velha', async () => {
        const view = liveView({ nodes: [operator, zoneOld], edges: [] });
        const { app, engine, wait } = setup({ view, disk: { nodes: [operator, { ...zoneOld, width: 123 }], edges: [] } });
        expect(await applyCanvasPlan(app, engine, PATH, plan, { wait })).toBe('aplicado');
    });

    it('plano igual ao que está aberto: nada é gravado', async () => {
        const view = liveView({ nodes: [operator, zoneNew], edges: [] });
        const { app, engine, wait } = setup({ view, disk: { nodes: [operator, zoneNew], edges: [] } });
        expect(await applyCanvasPlan(app, engine, PATH, plan, { wait })).toBe('igual');
        expect(view.canvas.setData).not.toHaveBeenCalled();
    });

    it('no celular nenhuma zona é gravada, aberta ou fechada', async () => {
        platform.isMobile = true;
        expect(canvasWritesAllowed()).toBe(false);
        const closed = setup();
        expect(await applyCanvasPlan(closed.app, closed.engine, PATH, plan, { wait: closed.wait })).toBe('somente-leitura');
        expect(closed.app.vault.process).not.toHaveBeenCalled();
        const view = liveView({ nodes: [operator, zoneOld], edges: [] });
        const open = setup({ view });
        expect(await applyCanvasPlan(open.app, open.engine, PATH, plan, { wait: open.wait })).toBe('somente-leitura');
        expect(view.canvas.setData).not.toHaveBeenCalled();
    });

    it('canvas que não existe: sem-canvas', async () => {
        const { app, engine, wait } = setup();
        app.vault.getAbstractFileByPath.mockReturnValue(null);
        expect(await applyCanvasPlan(app, engine, PATH, plan, { wait })).toBe('sem-canvas');
    });

    describe('setas que gravam (observador injetado)', () => {
        const links = (over: Partial<{ flush: boolean; pending: boolean[] }> = {}) => {
            const pending = [...(over.pending ?? [])];
            return {
                flush: vi.fn(async () => over.flush ?? false),
                hasPending: vi.fn(() => pending.shift() ?? false),
                accept: vi.fn(),
            };
        };

        it('a comparação gravou um campo: o plano é adiado e a vista não é regravada', async () => {
            const view = liveView({ nodes: [operator, zoneOld], edges: [] });
            const { app, engine, wait } = setup({ view });
            const hooks = links({ flush: true });
            const seen = vi.fn(plan);
            expect(await applyCanvasPlan(app, engine, PATH, seen, { wait, links: hooks })).toBe('adiado');
            expect(hooks.flush).toHaveBeenCalledWith(PATH);
            expect(seen).not.toHaveBeenCalled();
            expect(view.canvas.setData).not.toHaveBeenCalled();
        });

        it('nada gravado: aplica e a nova linha de base é o que foi aplicado', async () => {
            const view = liveView({ nodes: [operator, zoneOld], edges: [] });
            const { app, engine, wait } = setup({ view });
            const hooks = links();
            expect(await applyCanvasPlan(app, engine, PATH, plan, { wait, links: hooks })).toBe('aplicado');
            const written = view.canvas.setData.mock.calls[0][0] as CanvasData;
            expect(hooks.accept).toHaveBeenCalledWith(PATH, written);
        });

        it('sincronização igual também vira linha de base (L1)', async () => {
            const view = liveView({ nodes: [operator, zoneNew], edges: [] });
            const { app, engine, wait } = setup({ view, disk: { nodes: [operator, zoneNew], edges: [] } });
            const hooks = links();
            expect(await applyCanvasPlan(app, engine, PATH, plan, { wait, links: hooks })).toBe('igual');
            expect(hooks.accept).toHaveBeenCalledTimes(1);
            expect((hooks.accept.mock.calls[0] as any[])[1].nodes.map((n: any) => n.id)).toEqual(['norte', 'dfm-qs-zone']);
        });

        it('gesto que chega durante a leitura do disco é comparado antes do setData', async () => {
            const view = liveView({ nodes: [operator, zoneOld], edges: [] });
            const { app, engine, wait } = setup({ view });
            const hooks = links({ pending: [true, false] });
            expect(await applyCanvasPlan(app, engine, PATH, plan, { wait, links: hooks })).toBe('aplicado');
            expect(hooks.flush).toHaveBeenCalledTimes(2);
            expect(view.canvas.setData).toHaveBeenCalledTimes(1);
        });

        it('canvas fechado não passa pelo observador', async () => {
            const { app, engine, wait } = setup();
            const hooks = links({ flush: true });
            expect(await applyCanvasPlan(app, engine, PATH, plan, { wait, links: hooks })).toBe('aplicado');
            expect(hooks.flush).not.toHaveBeenCalled();
        });
    });

    it('isCanvasOpen olha as abas de canvas pelo caminho', () => {
        const view = liveView({ nodes: [operator], edges: [] });
        const { app } = setup({ view });
        expect(isCanvasOpen(app, PATH)).toBe(true);
        expect(isCanvasOpen(app, 'outro.canvas')).toBe(false);
    });
});
