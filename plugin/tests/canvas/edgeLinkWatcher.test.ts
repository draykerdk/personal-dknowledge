import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    TFile: class { path = ''; },
    Notice: class { hide() {} },
    Platform: { isMobile: false },
}));

import { DEBOUNCE_MS, EdgeLinkWatcher } from '../../src/canvas/edgeLinkWatcher';
import type { WatcherDeps } from '../../src/canvas/edgeLinkWatcher';
import type { CanvasLike, EdgeContext, LinkTask, Patch } from '../../src/canvas/edgeLinks';

/**
 * O observador com dublês: relógio manual, vista de canvas falsa com os
 * métodos que o embrulho troca (`requestSave`, `applyHistory`, `setData`) e
 * um vault de frontmatters em memória. Cada teste é uma lacuna do §10 do plano.
 */

// Dois canvas de projeto. As pontas de semana e de dia são as notas (nós de arquivo): a célula da semana e o
// bloco do dia dos canvas aposentados do trimestre e da semana saíram em 06/11/2026.
const Q = '100 - AREAS/Venda/Venda.canvas';
const W = '100 - AREAS/Livro/Livro.canvas';
const WEEK43 = '300 - RUNTIME/302 - Daymiss/Week/2026-W43.md';
const DAY13 = '300 - RUNTIME/302 - Daymiss/Day/2026-10-13.md';
const DAY14 = '300 - RUNTIME/302 - Daymiss/Day/2026-10-14.md';
const acao = (basename: string): LinkTask => ({ path: `TaskNotes/Tasks/${basename}.md`, basename, type: 'task', projects: [] });
const A = acao('Editar vídeo');
const B = acao('Gravar vídeo');
const smartTask = (basename: string): LinkTask => ({ path: `TaskNotes/Tasks/${basename}.md`, basename, type: 'tarefa_smart', projects: ['Venda'] });
const S1 = smartTask('Publicar 2 vídeos (W42)');
const S2 = smartTask('Cadastrar lojas (W42)');

const ctx: EdgeContext = {
    taskAt: p => [A, B, S1, S2].find(t => t.path === p) ?? null,
    noteAt: p => (p === WEEK43 ? { kind: 'week', week: '2026-W43' } : p === DAY13 ? { kind: 'day', date: '2026-10-13' } : p === DAY14 ? { kind: 'day', date: '2026-10-14' } : null),
    isSmartName: name => [S1, S2].some(t => t.basename === name),
};

const NODES = [
    { id: 'semana-43', type: 'file', file: WEEK43 },
    { id: 'dfm-pc-a', type: 'file', file: A.path },
    { id: 'dfm-pc-b', type: 'file', file: B.path },
    { id: 'dia-13', type: 'file', file: DAY13 },
    { id: 'dfm-pc-s1', type: 'file', file: S1.path },
    { id: 'dfm-pc-s2', type: 'file', file: S2.path },
    { id: 'minha-nota', type: 'text', text: 'pensamento do operador' },
];

function harness(opts: { nodes?: any[]; writes?: boolean; path?: string } = {}) {
    const timers = new Map<number, () => void>();
    let next = 1;
    const fm: Record<string, Record<string, any>> = { [A.path]: {}, [B.path]: {} };
    const notes: Array<{ text: string; undo?: () => void }> = [];
    const emitted: any[] = [];
    const deps: WatcherDeps = {
        context: vi.fn(async () => ctx),
        write: vi.fn(async (task: string, fn: (fm: Record<string, any>) => Patch | null) => {
            const patch = fn({ ...fm[task] });
            if (!patch) return null;
            const before: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(patch)) { before[k] = fm[task][k]; if (v === null) delete fm[task][k]; else fm[task][k] = v; }
            return before;
        }),
        restore: vi.fn(async (task: string, before: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(before)) { if (v === undefined) delete fm[task][k]; else fm[task][k] = v; }
        }),
        notify: vi.fn((text: string, undo?: () => void) => { notes.push({ text, undo }); }),
        emit: vi.fn((c: any) => { emitted.push(c); }),
        writesAllowed: () => opts.writes !== false,
        setTimer: (fn: () => void, _ms: number) => { const id = next++; timers.set(id, fn); return id; },
        clearTimer: (id: number) => { timers.delete(id); },
    };
    const classes = new Set<string>();
    let data: CanvasLike = { nodes: JSON.parse(JSON.stringify(opts.nodes ?? NODES)), edges: [] };
    const canvas: any = {
        getData: () => JSON.parse(JSON.stringify(data)),
        requestSave: vi.fn(),
        applyHistory: vi.fn((state: CanvasLike) => { data = JSON.parse(JSON.stringify(state)); }),
        setData: vi.fn((state: CanvasLike) => { data = JSON.parse(JSON.stringify(state)); }),
        removeEdge: vi.fn((edge: { id: string }) => { data = { ...data, edges: (data.edges ?? []).filter(e => e.id !== edge.id) }; }),
        isDragging: false,
        canvasEl: { classList: { contains: (c: string) => classes.has(c) } },
    };
    const view: any = { file: { path: opts.path ?? Q }, canvas };
    const watcher = new EdgeLinkWatcher(deps);
    /** Um gesto na vista: muda os dados e chama o `requestSave` (embrulhado). */
    const gesture = (edges: Array<[string, string, string]>) => {
        data = { ...data, edges: [...(data.edges ?? []), ...edges.map(([id, fromNode, toNode]) => ({ id, fromNode, toNode }))] };
        canvas.requestSave();
    };
    /** Roda as esperas vencidas (300 ms) e deixa as promessas assentarem. */
    const tick = async () => {
        const due = [...timers.entries()];
        timers.clear();
        for (const [, fn] of due) fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    /** Um gesto que apaga setas (ou nós, com as setas deles) e chama o `requestSave`. */
    const erase = (ids: string[]) => {
        const gone = new Set(ids);
        const nodes = (data.nodes ?? []).filter(n => !gone.has(String(n.id)));
        const left = new Set(nodes.map(n => String(n.id)));
        data = { nodes, edges: (data.edges ?? []).filter(e => !gone.has(String(e.id)) && left.has(String(e.fromNode)) && left.has(String(e.toNode))) };
        canvas.requestSave();
    };
    /** O estado que a zona acabou de sincronizar: vira a linha de base (`accept`). */
    const synced = (edges: Array<[string, string, string]>) => {
        const state = { nodes: JSON.parse(JSON.stringify(opts.nodes ?? NODES)), edges: edges.map(([id, fromNode, toNode]) => ({ id, fromNode, toNode })) };
        data = JSON.parse(JSON.stringify(state));
        watcher.accept(view.file.path, state);
        return state;
    };
    return { deps, watcher, view, canvas, fm, notes, emitted, timers, classes, gesture, erase, synced, tick, setRaw: (d: CanvasLike) => { data = d; }, getRaw: () => data };
}

describe('linha de base (L1)', () => {
    it('é tirada ao instalar o embrulho: seta que já existia não grava; o primeiro gesto depois grava', async () => {
        const h = harness();
        h.setRaw({ nodes: NODES, edges: [{ id: 'velha', fromNode: 'semana-43', toNode: 'dfm-pc-b' }] });
        h.watcher.attach(h.view);
        expect(h.watcher.hasBaseline(Q)).toBe(true);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        expect(h.timers.size).toBe(1);
        await h.tick();
        expect(h.fm[A.path]).toEqual({ week: '2026-W43' });
        expect(h.fm[B.path]).toEqual({});
        expect(h.notes.map(n => n.text)).toEqual(['Ação Editar vídeo → W43']);
        expect(h.emitted).toEqual([{ kind: 'week', task: A.path, value: '2026-W43', op: 'add', canvas: Q }]);
    });

    it('accept (toda sincronização, inclusive a igual) troca a base sem gravar', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        const synced = { nodes: NODES, edges: [{ id: 'dfm-pc-ew-a', fromNode: 'semana-43', toNode: 'dfm-pc-a' }, { id: 'do-operador', fromNode: 'dfm-pc-a', toNode: 'dfm-pc-b' }] };
        h.setRaw(synced);
        h.watcher.accept(Q, synced);
        h.canvas.requestSave();
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('a vista ainda vazia não vira base; a primeira leitura com nós vira base sem gravar', async () => {
        const h = harness();
        h.setRaw({ nodes: [], edges: [] });
        h.watcher.attach(h.view);
        expect(h.watcher.hasBaseline(Q)).toBe(false);
        h.setRaw({ nodes: NODES, edges: [{ id: 'e', fromNode: 'semana-43', toNode: 'dfm-pc-a' }] });
        h.canvas.requestSave();
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
        expect(h.watcher.hasBaseline(Q)).toBe(true);
    });
});

describe('comparação presa ao caminho (L2)', () => {
    it('a vista trocou de arquivo antes da espera terminar: a comparação é descartada', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        h.view.file = { path: W }; // mesma instância de canvas, outro arquivo (navegar na mesma aba)
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('o setData do arquivo novo na mesma instância vira a base dele, não gesto', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.view.file = { path: W };
        h.canvas.setData({ nodes: NODES, edges: [{ id: 'da-semana', fromNode: 'semana-43', toNode: 'dfm-pc-a' }] });
        h.canvas.requestSave();
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
        expect(h.watcher.hasBaseline(W)).toBe(true);
    });
});

describe('recarga externa (L3)', () => {
    it('setData por mudança de fora (Sync, git) refaz a base sem gravar, e o requestSave seguinte não vê gesto', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.canvas.setData({ nodes: NODES, edges: [{ id: 'de-outro-aparelho', fromNode: 'semana-43', toNode: 'dfm-pc-a' }] });
        h.canvas.requestSave(); // mover um nó, por exemplo
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('recarga durante a leitura do contexto: a base mudou, nada é gravado', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        (h.deps.context as any).mockImplementationOnce(async () => {
            h.canvas.setData({ nodes: NODES, edges: [{ id: 'nova', fromNode: 'semana-43', toNode: 'dfm-pc-a' }, { id: 'externa', fromNode: 'dfm-pc-a', toNode: 'dfm-pc-b' }] });
            return ctx;
        });
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });
});

describe('espera (L4, L11)', () => {
    it('is-connecting é lido no fim da espera: ainda conectando, espera de novo; depois, compara', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        h.classes.add('is-connecting'); // o fim da conexão chama requestSave antes de tirar a classe
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
        expect(h.timers.size).toBe(1);
        h.classes.delete('is-connecting');
        await h.tick();
        expect(h.deps.write).toHaveBeenCalledTimes(1);
        expect(h.fm[A.path].week).toBe('2026-W43');
    });

    it('a espera é de 300 ms por caminho; gestos seguidos reagendam uma comparação só', () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.gesture([['e1', 'semana-43', 'dfm-pc-a']]);
        h.gesture([['e2', 'semana-43', 'dfm-pc-b']]);
        expect(DEBOUNCE_MS).toBe(300);
        expect(h.timers.size).toBe(1);
    });

    it('flush roda a comparação pendente na hora e diz se gravou', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.gesture([['nova', 'dfm-pc-a', 'dfm-pc-b']]);
        expect(h.watcher.hasPending(Q)).toBe(true);
        expect(await h.watcher.flush(Q)).toBe(true);
        expect(h.fm[B.path]).toEqual({ blockedBy: [`[[${A.basename}]]`] });
        expect(h.timers.size).toBe(0);
        expect(await h.watcher.flush(Q)).toBe(false);
    });
});

describe('o que grava e o que não grava', () => {
    it('[Desfazer] regrava o valor anterior', async () => {
        const h = harness();
        h.fm[A.path] = { week: '2026-W41' };
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        await h.tick();
        expect(h.fm[A.path].week).toBe('2026-W43');
        h.notes[0].undo!();
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(h.fm[A.path].week).toBe('2026-W41');
        expect(h.emitted.map(e => e.op)).toEqual(['add', 'undo']);
    });

    it('[Desfazer] leva o patch gravado: a volta só desfaz o que ainda está lá (pilha única, P6)', async () => {
        const h = harness();
        h.fm[A.path] = { week: '2026-W41' };
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        await h.tick();
        const r = h.notes[0].undo!() as unknown;
        expect(r).toBeInstanceOf(Promise);
        await r;
        expect(h.deps.restore).toHaveBeenCalledWith(A.path, { week: '2026-W41' }, { week: '2026-W43' });
    });

    it('Ctrl+Z (applyHistory) também é observado', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.canvas.applyHistory({ nodes: NODES, edges: [{ id: 'refeita', fromNode: 'semana-43', toNode: 'dfm-pc-b' }] });
        await h.tick();
        expect(h.fm[B.path]).toEqual({ week: '2026-W43' });
    });

    it('seta sem sentido avisa uma vez, sem gravar', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dia-13']]);
        await h.tick();
        h.canvas.requestSave();
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
        expect(h.notes.map(n => n.text)).toEqual(['Seta W43 → ter 13 fica só como desenho: esse par não muda campo.']);
    });

    describe('canvas solto, sem zona gerida (Fase 6: o observador vale em todo canvas)', () => {
        const LOOSE = 'Areas/Canvas solto.canvas';
        const looseNodes = () => [
            { id: 'x', type: 'text', text: 'nota do operador' },
            { id: 'a', type: 'file', file: A.path },
            { id: 'b', type: 'file', file: B.path },
            { id: 's1', type: 'file', file: S1.path },
        ];

        it('SMART → ação liga a ação à SMART (mãe), sem bloqueio', async () => {
            const h = harness({ nodes: looseNodes(), path: LOOSE });
            h.watcher.attach(h.view);
            h.gesture([['nova', 's1', 'a']]);
            await h.tick();
            expect(h.fm[A.path]).toEqual({ projects: [`[[${S1.basename}]]`] });
            expect(h.fm[A.path].blockedBy).toBeUndefined();
            expect(Object.keys(h.fm[S1.path] ?? {})).not.toContain('blocking');
            expect(h.notes.map(n => n.text)).toEqual([`Ação ${A.basename} → SMART ${S1.basename}`]);
        });

        it('ação → ação: blockedBy só na de destino, e nada grava blocking', async () => {
            const h = harness({ nodes: looseNodes(), path: LOOSE });
            h.watcher.attach(h.view);
            h.gesture([['nova', 'a', 'b']]);
            await h.tick();
            expect(h.fm[B.path]).toEqual({ blockedBy: [`[[${A.basename}]]`] });
            expect(h.fm[A.path]).toEqual({});
            const written = (h.deps.write as any).mock.calls.map(([task, fn]: [string, (fm: any) => any]) => [task, fn({})]);
            expect(JSON.stringify(written)).not.toContain('blocking');
        });

        it('seta até uma nota que o DFM não reconhece fica só como desenho, sem gravar', async () => {
            const h = harness({ nodes: looseNodes(), path: LOOSE });
            h.watcher.attach(h.view);
            h.gesture([['nova', 'x', 'a']]);
            await h.tick();
            expect(h.deps.write).not.toHaveBeenCalled();
        });
    });

    it('no celular (L7) nada é gravado', async () => {
        const h = harness({ writes: false });
        h.watcher.attach(h.view);
        h.gesture([['nova', 'semana-43', 'dfm-pc-a']]);
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('detach devolve os métodos originais do canvas', () => {
        const h = harness();
        const original = h.canvas.requestSave;
        h.watcher.attach(h.view);
        expect(h.canvas.requestSave).not.toBe(original);
        h.watcher.detach();
        expect(h.canvas.requestSave).toBe(original);
    });
});

describe('seta apagada desfaz (Fase 3)', () => {
    it('apagar a seta gerida "bloqueia" tira o blockedBy, com o aviso "Desligado" e [Desfazer]', async () => {
        const h = harness();
        h.fm[B.path] = { blockedBy: [`[[${A.basename}]]`, '[[Outra]]'] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-d-1', 'dfm-pc-a', 'dfm-pc-b']]);
        h.erase(['dfm-pc-d-1']);
        await h.tick();
        expect(h.fm[B.path]).toEqual({ blockedBy: ['[[Outra]]'] });
        expect(h.notes.map(n => n.text)).toEqual(['Desligado: Editar vídeo ↛ Gravar vídeo (não bloqueia mais)']);
        expect(h.emitted).toEqual([{ kind: 'blockedBy', task: B.path, value: A.basename, op: 'remove', canvas: Q }]);
        h.notes[0].undo!();
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(h.fm[B.path]).toEqual({ blockedBy: [`[[${A.basename}]]`, '[[Outra]]'] });
        expect(h.emitted.map(e => e.op)).toEqual(['remove', 'undo']);
    });

    it('E10: soltar a ponta no vazio (a seta some) desliga a semana', async () => {
        const h = harness();
        h.fm[A.path] = { week: '2026-W43' };
        h.watcher.attach(h.view);
        h.synced([['minha', 'semana-43', 'dfm-pc-a']]);
        h.erase(['minha']);
        await h.tick();
        expect(h.fm[A.path]).toEqual({});
        expect(h.notes.map(n => n.text)).toEqual(['Desligado: Ação Editar vídeo ↛ W43']);
    });

    it('nó apagado não desfaz: as setas dele somem junto e nada é gravado', async () => {
        const h = harness();
        h.fm[B.path] = { blockedBy: [`[[${A.basename}]]`] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-d-1', 'dfm-pc-a', 'dfm-pc-b'], ['dfm-pc-ea-b', 'dfm-pc-s1', 'dfm-pc-b']]);
        h.erase(['dfm-pc-b']);
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('mover a ponta da seta de mãe para outra SMART: a ação troca de mãe sem voltar ao projeto no meio', async () => {
        const h = harness();
        h.fm[A.path] = { projects: [`[[${S1.basename}]]`] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-ea-a', 'dfm-pc-s1', 'dfm-pc-a']]);
        h.setRaw({ nodes: NODES, edges: [{ id: 'dfm-pc-ea-a', fromNode: 'dfm-pc-s2', toNode: 'dfm-pc-a' }] });
        h.canvas.requestSave();
        await h.tick();
        expect(h.fm[A.path]).toEqual({ projects: [`[[${S2.basename}]]`] });
        expect(h.emitted.map(e => e.op)).toEqual(['add', 'remove']);
    });

    it('apagar a única seta de mãe devolve a ação ao projeto da SMART', async () => {
        const h = harness();
        h.fm[A.path] = { projects: [`[[${S1.basename}]]`] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-ea-a', 'dfm-pc-s1', 'dfm-pc-a']]);
        h.erase(['dfm-pc-ea-a']);
        await h.tick();
        expect(h.fm[A.path]).toEqual({ projects: ['[[Venda]]'] });
    });
});

describe('Ctrl+Z de uma sincronização não grava (L5)', () => {
    it('applyHistory que tira só setas dfm-* não desliga nada, nem com um requestSave logo depois', async () => {
        const h = harness();
        h.fm[B.path] = { blockedBy: [`[[${A.basename}]]`] };
        h.watcher.attach(h.view);
        // A sincronização desenhou o "bloqueia" porque o blockedBy foi posto pelo TaskNotes.
        h.synced([['minha', 'minha-nota', 'dfm-pc-a'], ['dfm-pc-d-1', 'dfm-pc-a', 'dfm-pc-b']]);
        h.canvas.applyHistory({ nodes: NODES, edges: [{ id: 'minha', fromNode: 'minha-nota', toNode: 'dfm-pc-a' }] });
        h.canvas.requestSave(); // o canvas salva logo depois: a marca do histórico fica
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
        expect(h.fm[B.path]).toEqual({ blockedBy: [`[[${A.basename}]]`] });
        // A base agora é o estado desfeito: o próximo gesto qualquer não acha remoção velha.
        h.canvas.requestSave();
        await h.tick();
        expect(h.deps.write).not.toHaveBeenCalled();
    });

    it('applyHistory que tira a seta que o operador desenhou desliga', async () => {
        const h = harness();
        h.fm[A.path] = { week: '2026-W43' };
        h.watcher.attach(h.view);
        h.synced([['minha', 'semana-43', 'dfm-pc-a']]);
        h.canvas.applyHistory({ nodes: NODES, edges: [] });
        await h.tick();
        expect(h.fm[A.path]).toEqual({});
    });

    it('o mesmo apagar feito à mão (requestSave) desliga: a marca é só do histórico', async () => {
        const h = harness();
        h.fm[B.path] = { blockedBy: [`[[${A.basename}]]`] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-d-1', 'dfm-pc-a', 'dfm-pc-b']]);
        h.erase(['dfm-pc-d-1']);
        await h.tick();
        expect(h.fm[B.path]).toEqual({});
    });
});

describe('menu da seta: "DFM · Desligar vínculo"', () => {
    it('apaga a seta com sentido de dado, e a comparação desliga o campo', async () => {
        const h = harness();
        h.fm[A.path] = { projects: [`[[${S1.basename}]]`] };
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-ea-a', 'dfm-pc-s1', 'dfm-pc-a']]);
        expect(await h.watcher.unlinkEdge(h.view, { id: 'dfm-pc-ea-a' })).toBe(true);
        expect(h.canvas.removeEdge).toHaveBeenCalledTimes(1);
        await h.tick();
        expect(h.fm[A.path]).toEqual({ projects: ['[[Venda]]'] });
        expect(h.notes.map(n => n.text)).toEqual([`Desligado: Ação Editar vídeo ↛ SMART ${S1.basename}`]);
    });

    it('seta-anotação não é apagada: o aviso diz que ela não liga campo', async () => {
        const h = harness();
        h.watcher.attach(h.view);
        h.synced([['minha', 'minha-nota', 'dfm-pc-a']]);
        expect(await h.watcher.unlinkEdge(h.view, { id: 'minha' })).toBe(false);
        expect(h.canvas.removeEdge).not.toHaveBeenCalled();
        expect(h.notes.map(n => n.text)).toEqual(['Esta seta não liga nenhum campo: fica só como desenho.']);
    });

    it('no celular não faz nada', async () => {
        const h = harness({ writes: false });
        h.watcher.attach(h.view);
        h.synced([['dfm-pc-ea-a', 'dfm-pc-s1', 'dfm-pc-a']]);
        expect(await h.watcher.unlinkEdge(h.view, { id: 'dfm-pc-ea-a' })).toBe(false);
        expect(h.canvas.removeEdge).not.toHaveBeenCalled();
    });
});

describe('seta-anotação na sincronização (keepEdge)', () => {
    it('keepEdgeFor responde com o contexto do canvas: anotação fica, seta com dado não', async () => {
        const h = harness();
        const keep = await h.watcher.keepEdgeFor(Q);
        const n = (id: string) => NODES.find(x => x.id === id)!;
        expect(keep({}, n('minha-nota'), n('dfm-pc-a'))).toBe(true);
        expect(keep({}, n('dfm-pc-s1'), n('dfm-pc-a'))).toBe(false);
        expect(h.deps.context).toHaveBeenCalledWith(Q);
    });
});

describe('fluxo de criação: o aviso da seta dia → ação diz a carga do dia', () => {
    const nodes = [...NODES, { id: 'dia-14', type: 'file', file: DAY14 }];

    it('acrescenta o complemento de `linkNote` ao aviso da seta gravada', async () => {
        const h = harness({ nodes });
        h.deps.linkNote = vi.fn(() => ' · o dia passa de 2 h (3 h agendadas)');
        h.watcher.attach(h.view);
        h.gesture([['d', 'dia-14', 'dfm-pc-a']]);
        await h.tick();
        expect(h.fm[A.path].scheduled).toBe('2026-10-14');
        expect(h.notes.at(-1)!.text).toMatch(/→ qua 14 .* · o dia passa de 2 h \(3 h agendadas\)$/);
        expect(h.deps.linkNote).toHaveBeenCalledWith(expect.objectContaining({ kind: 'scheduled', value: '2026-10-14' }));
    });

    it('sem `linkNote`, ou com ele falhando, o aviso sai como sempre', async () => {
        const h = harness({ nodes });
        h.deps.linkNote = vi.fn(async () => { throw new Error('sem índice'); });
        h.watcher.attach(h.view);
        h.gesture([['d', 'dia-14', 'dfm-pc-a']]);
        await h.tick();
        expect(h.fm[A.path].scheduled).toBe('2026-10-14');
        expect(h.notes.at(-1)!.text).toMatch(/→ qua 14 \(W42\)$/);
    });
});
