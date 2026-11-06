import { describe, expect, it } from 'vitest';
import {
    annotationEdge, diffLinks, endOf, freshEdges, goneEdges, linkFor, linkKey, linkLabel, linksOf, meaninglessLabel, motherLink, patchFor,
    unlinkLabel, unpatchFor,
} from '../../src/canvas/edgeLinks';
import type { CanvasLike, EdgeContext, End, Link, LinkTask, NoteRef } from '../../src/canvas/edgeLinks';

// As pontas de 06/11/2026: o canvas de projeto (o cabeçalho `dfm-pc-proj` e os nós de arquivo da zona
// `dfm-pc-*`) e os nós de arquivo do operador. A célula da semana, o bloco do dia e o "sem dia" dos canvas
// aposentados do trimestre e da semana (`dfm-qw-*`, `dfm-pc-*`) saíram com eles; as relações que eles
// davam (semana, dia, projeto) seguem provadas pela nota da semana, a nota do dia e o cabeçalho do projeto.

/* ------------------------------------------------------------ fixture */

const task = (basename: string, over: Partial<LinkTask> = {}): LinkTask => ({
    path: `TaskNotes/Tasks/${basename}.md`, basename, type: 'task', projects: [], ...over,
});

const venda = { name: 'Venda de afiliados', keys: ['venda de afiliados', 'venda'] };
const smart = task('Publicar 2 vídeos (W42)', { type: 'tarefa_smart', projects: ['Venda de afiliados'], week: '2026-W42', impacto: 8 });
const smart2 = task('Cadastrar lojas (W41)', { type: 'tarefa_smart', projects: ['Venda de afiliados'], week: '2026-W41' });
const gravar = task('Gravar vídeo', { projects: ['Publicar 2 vídeos (W42)'], week: '2026-W42' });
const editar = task('Editar vídeo', { projects: ['Venda de afiliados'] });

const TASKS = new Map([smart, smart2, gravar, editar].map(t => [t.path, t]));
const WEEK_NOTE = '300 - RUNTIME/302 - Daymiss/Week/2026-W42.md';
const WEEK43_NOTE = '300 - RUNTIME/302 - Daymiss/Week/2026-W43.md';
const DAY_NOTE = '300 - RUNTIME/302 - Daymiss/Day/2026-10-13.md';
const DAY14_NOTE = '300 - RUNTIME/302 - Daymiss/Day/2026-10-14.md';
const NOTES: Record<string, NoteRef> = {
    [WEEK_NOTE]: { kind: 'week', week: '2026-W42' },
    [WEEK43_NOTE]: { kind: 'week', week: '2026-W43' },
    [DAY_NOTE]: { kind: 'day', date: '2026-10-13' },
    [DAY14_NOTE]: { kind: 'day', date: '2026-10-14' },
};
const INDEX = '100 - AREAS/Venda/Venda de afiliados.md';

const ctx: EdgeContext = {
    taskAt: p => TASKS.get(p) ?? null,
    noteAt: p => NOTES[p] ?? null,
    projectsByFile: { [INDEX]: venda },
    projectNodes: { 'dfm-pc-proj': venda },
};

const fileNode = (id: string, file: string) => ({ id, type: 'file', file, x: 0, y: 0, width: 300, height: 120 });
const textNode = (id: string, text = '') => ({ id, type: 'text', text, x: 0, y: 0, width: 300, height: 120 });

/** Um canvas de projeto, no essencial: o cabeçalho do projeto, SMART e ações na zona, notas de semana e de dia. */
const NODES = [
    fileNode('semana-43', WEEK43_NOTE),
    fileNode('dia-13', DAY_NOTE),
    fileNode('dia-14', DAY14_NOTE),
    textNode('dfm-pc-proj', '## Venda'),
    fileNode('dfm-pc-s1', smart.path),
    fileNode('dfm-pc-s2', smart2.path),
    fileNode('dfm-pc-a1', gravar.path),
    fileNode('dfm-pc-a2', editar.path),
    fileNode('nota-semana', WEEK_NOTE),
    fileNode('indice', INDEX),
    textNode('minha-nota', 'pensamento do operador'),
];
const node = (id: string) => NODES.find(n => n.id === id)!;
const end = (id: string) => endOf(node(id), ctx)!;

const canvas = (edges: Array<[string, string, string]>): CanvasLike => ({
    nodes: NODES,
    edges: edges.map(([id, fromNode, toNode]) => ({ id, fromNode, toNode })),
});

/* ------------------------------------------------------------- pontas */

describe('endOf: o que cada ponta é', () => {
    it('o cabeçalho do canvas de projeto é o projeto', () => {
        expect(end('dfm-pc-proj')).toEqual({ kind: 'project', project: venda });
    });

    // Regressão de 06/11/2026: os canvas do trimestre e da semana se aposentaram (02/11) e estão no
    // Arquivo. Os ids deles deixaram de ser pontas: lá o canvas abre, e a seta fica só como desenho.
    it('a célula da semana, o bloco do dia e o "sem dia" dos canvas aposentados não são mais pontas', () => {
        for (const id of ['dfm-qw-2026-W43', 'dfm-qs-week', 'dfm-qs-nodate', 'dfm-qs-day-2026-10-14', 'dfm-qk-day-2026-10-14', 'dfm-qs-pj-abc']) {
            expect(endOf(textNode(id), ctx), id).toBeNull();
        }
    });

    it('nós de arquivo: SMART, ação, nota da semana, nota do dia e índice do projeto', () => {
        expect(end('dfm-pc-s1')).toMatchObject({ kind: 'smart', task: { basename: smart.basename } });
        expect(end('dfm-pc-a1')).toMatchObject({ kind: 'action', task: { basename: gravar.basename } });
        expect(end('nota-semana')).toEqual({ kind: 'week', week: '2026-W42' });
        expect(end('dia-13')).toEqual({ kind: 'day', date: '2026-10-13', week: '2026-W42' });
        expect(end('semana-43')).toEqual({ kind: 'week', week: '2026-W43' });
        expect(end('indice')).toEqual({ kind: 'project', project: venda });
    });

    it('nó do operador, texto gerido sem sentido e cabeçalho sem projeto: null (anotação)', () => {
        expect(endOf(node('minha-nota'), ctx)).toBeNull();
        expect(endOf(textNode('dfm-pc-legend'), ctx)).toBeNull();
        expect(endOf(textNode('dfm-pc-proj'), { ...ctx, projectNodes: {} })).toBeNull();
    });
});

/* -------------------------------------------------------------- pares */

describe('linkFor: a tabela da decisão 1, nos dois sentidos', () => {
    const both = (a: string, b: string) => [linkFor(end(a), end(b)), linkFor(end(b), end(a))];

    it('semana ↔ SMART e semana ↔ ação = week', () => {
        for (const l of both('semana-43', 'dfm-pc-s1')) expect(l).toMatchObject({ kind: 'week', task: smart.path, value: '2026-W43', taskKind: 'smart' });
        for (const l of both('nota-semana', 'dfm-pc-a2')) expect(l).toMatchObject({ kind: 'week', task: editar.path, value: '2026-W42', taskKind: 'action' });
    });

    it('dia ↔ ação = scheduled e a semana do dia', () => {
        for (const l of both('dia-14', 'dfm-pc-a2')) expect(l).toMatchObject({ kind: 'scheduled', task: editar.path, value: '2026-10-14', week: '2026-W42' });
    });

    it('SMART ↔ ação = SMART mãe da ação', () => {
        for (const l of both('dfm-pc-s1', 'dfm-pc-a2')) expect(l).toMatchObject({ kind: 'mother', task: editar.path, value: smart.basename });
    });

    it('projeto ↔ SMART e projeto ↔ ação = projeto', () => {
        for (const l of both('dfm-pc-proj', 'dfm-pc-s2')) expect(l).toMatchObject({ kind: 'project', task: smart2.path, value: venda.name });
        for (const l of both('indice', 'dfm-pc-a1')) expect(l).toMatchObject({ kind: 'project', task: gravar.path, value: venda.name });
    });

    it('tarefa → tarefa do mesmo nível = blockedBy na de destino (a direção importa)', () => {
        expect(linkFor(end('dfm-pc-a1'), end('dfm-pc-a2'))).toMatchObject({ kind: 'blockedBy', task: editar.path, value: gravar.basename });
        expect(linkFor(end('dfm-pc-a2'), end('dfm-pc-a1'))).toMatchObject({ kind: 'blockedBy', task: gravar.path, value: editar.basename });
        expect(linkFor(end('dfm-pc-s1'), end('dfm-pc-s2'))).toMatchObject({ kind: 'blockedBy', task: smart2.path, value: smart.basename });
        expect(linkFor(end('dfm-pc-a1'), end('dfm-pc-a1'))).toBeNull();
    });

    it('par sem sentido: null (dia ↔ SMART não grava; semana ↔ dia; projeto ↔ semana)', () => {
        for (const [a, b] of [['dia-14', 'dfm-pc-s1'], ['semana-43', 'dia-14'], ['indice', 'nota-semana'], ['semana-43', 'nota-semana']]) {
            expect(linkFor(end(a), end(b))).toBeNull();
            expect(linkFor(end(b), end(a))).toBeNull();
        }
    });
});

/* -------------------------------------------------------------- diff */

describe('diffLinks: o que os gestos pedem', () => {
    const base = canvas([['dfm-pc-ew-1', 'nota-semana', 'dfm-pc-s1'], ['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a1']]);

    it('seta nova do operador entre pontas reconhecidas vira relação', () => {
        const cur = canvas([...base.edges!.map(e => [e.id, e.fromNode, e.toNode] as [string, string, string]), ['e1', 'semana-43', 'dfm-pc-a2']]);
        const diff = diffLinks(base, cur, ctx);
        expect(diff.added).toHaveLength(1);
        expect(diff.added[0]).toMatchObject({ kind: 'week', task: editar.path, value: '2026-W43' });
    });

    it('seta dfm-* nova nunca é gesto', () => {
        const cur = canvas([['dfm-pc-ew-1', 'nota-semana', 'dfm-pc-s1'], ['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a1'], ['dfm-pc-ea-2', 'dfm-pc-s1', 'dfm-pc-a2']]);
        expect(diffLinks(base, cur, ctx)).toEqual({ added: [], removed: [], meaningless: [] });
        expect(freshEdges(base, cur)).toEqual([]);
    });

    it('seta dupla no mesmo par: a relação que já está desenhada não grava de novo; duas novas iguais contam uma vez', () => {
        const again = canvas([['dfm-pc-ew-1', 'nota-semana', 'dfm-pc-s1'], ['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a1'], ['e1', 'dfm-pc-s1', 'dfm-pc-a1']]);
        expect(diffLinks(base, again, ctx).added).toEqual([]);
        const twice = canvas([...base.edges!.map(e => [e.id, e.fromNode, e.toNode] as [string, string, string]), ['e1', 'dfm-pc-s1', 'dfm-pc-a2'], ['e2', 'dfm-pc-a2', 'dfm-pc-s1']]);
        expect(diffLinks(base, twice, ctx).added).toHaveLength(1);
    });

    it('duas semanas para a mesma tarefa na mesma leva: vence a última', () => {
        const cur = canvas([['e1', 'nota-semana', 'dfm-pc-a2'], ['e2', 'semana-43', 'dfm-pc-a2']]);
        const diff = diffLinks(canvas([]), cur, ctx);
        expect(diff.added).toHaveLength(1);
        expect(diff.added[0].value).toBe('2026-W43');
    });

    it('mover a ponta de uma seta (mesmo id, outra ponta) conta como gesto', () => {
        const before = canvas([['e1', 'semana-43', 'dfm-pc-a1']]);
        const after = canvas([['e1', 'semana-43', 'dfm-pc-a2']]);
        expect(diffLinks(before, after, ctx).added.map(l => l.task)).toEqual([editar.path]);
    });

    it('seta sem sentido entre pontas reconhecidas: aviso; anotação do operador: nada', () => {
        const cur = canvas([['e1', 'dia-14', 'dfm-pc-s1'], ['e2', 'minha-nota', 'dfm-pc-a1']]);
        const diff = diffLinks(canvas([]), cur, ctx);
        expect(diff.added).toEqual([]);
        expect(diff.meaningless).toHaveLength(1);
        expect(meaninglessLabel(diff.meaningless[0].from, diff.meaningless[0].to)).toBe(`Seta qua 14 → SMART ${smart.basename} fica só como desenho: a SMART é da semana; o dia vai na ação.`);
    });

    it('linksOf lê as relações de todas as setas, geridas inclusive', () => {
        const keys = [...linksOf(base, ctx).keys()];
        expect(keys).toEqual([`week|${smart.path}|2026-W42`, `mother|${gravar.path}|${smart.basename}`]);
    });
});

/* ------------------------------------------------------------- patch */

const L = (a: string, b: string): Link => linkFor(end(a), end(b))!;

describe('patchFor: o campo que cada relação grava', () => {
    it('semana: grava; segunda semana substitui; a mesma semana não grava', () => {
        expect(patchFor({}, L('semana-43', 'dfm-pc-a2'))).toEqual({ week: '2026-W43' });
        expect(patchFor({ week: '2026-W42' }, L('semana-43', 'dfm-pc-a2'))).toEqual({ week: '2026-W43' });
        expect(patchFor({ week: '2026-W43' }, L('semana-43', 'dfm-pc-a2'))).toBeNull();
    });

    it('dia: scheduled preserva a hora e leva a semana do dia; o mesmo dia não grava', () => {
        expect(patchFor({ week: '2026-W41' }, L('dia-14', 'dfm-pc-a2'))).toEqual({ scheduled: '2026-10-14', week: '2026-W42' });
        expect(patchFor({ scheduled: '2026-10-09T09:30', week: '2026-W42' }, L('dia-14', 'dfm-pc-a2'))).toEqual({ scheduled: '2026-10-14T09:30' });
        expect(patchFor({ scheduled: '2026-10-14T09:30', week: '2026-W42' }, L('dia-14', 'dfm-pc-a2'))).toBeNull();
    });

    it('mãe acrescenta: sai o vínculo direto com o projeto da SMART, as outras mães ficam', () => {
        const fm = { projects: ['[[Venda de afiliados]]', '[[Outra SMART (W40)]]'] };
        expect(patchFor(fm, L('dfm-pc-s1', 'dfm-pc-a2'))).toEqual({
            projects: ['[[Outra SMART (W40)]]', `[[${smart.basename}]]`], week: '2026-W42', impacto: 8,
        });
        expect(patchFor({ projects: [`[[${smart.basename}]]`], week: '2026-W42', impacto: 8 }, L('dfm-pc-s1', 'dfm-pc-a2'))).toBeNull();
    });

    it('herança de week e impacto só quando vazios', () => {
        const patch = patchFor({ projects: [], week: '2026-W40', impacto: 3 }, L('dfm-pc-s1', 'dfm-pc-a2'))!;
        expect(patch).toEqual({ projects: [`[[${smart.basename}]]`] });
        expect(patchFor({ projects: [], week: '' }, L('dfm-pc-s1', 'dfm-pc-a2'))).toMatchObject({ week: '2026-W42', impacto: 8 });
    });

    it('projeto acrescenta, pelo nome ou pela nota-índice', () => {
        expect(patchFor({ projects: ['[[Outro]]'] }, L('dfm-pc-proj', 'dfm-pc-s2'))).toEqual({ projects: ['[[Outro]]', '[[Venda de afiliados]]'] });
        expect(patchFor({ projects: ['[[100 - AREAS/Venda/Venda|Venda]]'] }, L('indice', 'dfm-pc-a1'))).toBeNull();
    });

    it('blockedBy entende [[x]] e {uid}; acrescenta só o que falta', () => {
        const link = L('dfm-pc-a1', 'dfm-pc-a2');
        expect(patchFor({}, link)).toEqual({ blockedBy: [`[[${gravar.basename}]]`] });
        expect(patchFor({ blockedBy: [`[[${gravar.basename}]]`] }, link)).toBeNull();
        expect(patchFor({ blockedBy: [{ uid: `[[${gravar.basename}]]`, reltype: 'FINISHTOSTART' }] }, link)).toBeNull();
        const other = { uid: '[[Outra]]', reltype: 'FINISHTOSTART' };
        expect(patchFor({ blockedBy: [other] }, link)).toEqual({ blockedBy: [other, `[[${gravar.basename}]]`] });
    });
});

describe('textos', () => {
    it('o aviso diz o gesto: "Ação X → W43"', () => {
        expect(linkLabel(L('semana-43', 'dfm-pc-a2'))).toBe('Ação Editar vídeo → W43');
        expect(linkLabel(L('semana-43', 'dfm-pc-s1'))).toBe(`SMART ${smart.basename} → W43`);
        expect(linkLabel(L('dia-14', 'dfm-pc-a2'))).toBe('Ação Editar vídeo → qua 14 (W42)');
        expect(linkLabel(L('dfm-pc-a1', 'dfm-pc-a2'))).toBe('Gravar vídeo bloqueia Editar vídeo');
    });

    it('linkKey separa tipo, tarefa e valor', () => {
        expect(linkKey(L('dia-14', 'dfm-pc-a2'))).toBe(`scheduled|${editar.path}|2026-10-14`);
    });
});

describe('uma regra só: "Ligar a uma SMART…" e a seta SMART → ação', () => {
    it('motherLink (menu) e linkFor (seta) dão o mesmo patch', () => {
        const ends: [End, End] = [end('dfm-pc-s1'), end('dfm-pc-a2')];
        const arrow = linkFor(...ends)!;
        const menu = motherLink({ path: editar.path, basename: editar.basename }, smart);
        for (const fm of [{ projects: ['[[Venda de afiliados]]'] }, { projects: ['[[Outra SMART (W40)]]'], week: '2026-W40' }, {}]) {
            expect(patchFor(fm, menu)).toEqual(patchFor(fm, arrow));
        }
    });
});

/* ------------------------------------------------- Fase 3: seta apagada */

/** Uma seta de cada par da decisão 1, como a zona e o operador as desenham. */
const EACH: Array<[string, string, string]> = [
    ['op-semana', 'semana-43', 'dfm-pc-a2'],
    ['op-dia', 'dia-14', 'dfm-pc-a2'],
    ['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a2'],
    [`dfm-pc-ep-1`, 'dfm-pc-proj', 'dfm-pc-s2'],
    ['dfm-pc-d-1', 'dfm-pc-a1', 'dfm-pc-a2'],
];
const without = (data: CanvasLike, drop: (id: string) => boolean): CanvasLike => ({
    nodes: (data.nodes ?? []).filter(n => !drop(String(n.id))),
    edges: (data.edges ?? []).filter(e => !drop(String(e.id))),
});

describe('diffLinks: a seta apagada desliga (Fase 3)', () => {
    const full = canvas(EACH);

    it('remoção de cada par: semana, dia, mãe, projeto e bloqueio', () => {
        const diff = diffLinks(full, canvas([]), ctx);
        expect(diff.added).toEqual([]);
        expect(diff.removed.map(l => [l.kind, l.task, l.value])).toEqual([
            ['week', editar.path, '2026-W43'],
            ['scheduled', editar.path, '2026-10-14'],
            ['mother', editar.path, smart.basename],
            ['project', smart2.path, venda.name],
            ['blockedBy', editar.path, gravar.basename],
        ]);
    });

    it('nó apagado não desfaz: as setas dele somem junto e nada é desligado', () => {
        // O operador apagou o nó da ação: com ele, as 4 setas que a tocavam.
        const cur = without(full, id => id === 'dfm-pc-a2' || ['op-semana', 'op-dia', 'dfm-pc-ea-1', 'dfm-pc-d-1'].includes(id));
        expect(diffLinks(full, cur, ctx).removed).toEqual([]);
        // O nó do projeto saiu da zona (a SMART mudou de projeto): a seta dele some sem desligar.
        expect(diffLinks(full, without(full, id => id === 'dfm-pc-proj' || id === 'dfm-pc-ep-1'), ctx).removed).toEqual([]);
    });

    it('nó que agora mostra outra coisa (a tarefa mudou de arquivo) não desfaz', () => {
        const cur: CanvasLike = {
            nodes: NODES.map(n => (n.id === 'dfm-pc-a2' ? { ...n, file: 'TaskNotes/Archive/Editar vídeo.md' } : n)),
            edges: full.edges!.filter(e => e.id !== 'op-semana'),
        };
        expect(diffLinks(full, cur, ctx).removed).toEqual([]);
    });

    it('E10: soltar a ponta de uma seta no vazio apaga a seta e desliga o vínculo', () => {
        const base = canvas([['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a2']]);
        const diff = diffLinks(base, canvas([]), ctx);
        expect(diff.removed).toHaveLength(1);
        expect(diff.removed[0]).toMatchObject({ kind: 'mother', task: editar.path, value: smart.basename });
        expect(goneEdges(base, canvas([])).map(e => e.id)).toEqual(['dfm-pc-ea-1']);
    });

    it('mover a ponta de uma seta, gerida ou não, desliga a velha e liga a nova', () => {
        const op = diffLinks(canvas([['e1', 'semana-43', 'dfm-pc-a1']]), canvas([['e1', 'semana-43', 'dfm-pc-a2']]), ctx);
        expect(op.removed.map(l => l.task)).toEqual([gravar.path]);
        expect(op.added.map(l => l.task)).toEqual([editar.path]);
        const managed = diffLinks(canvas([['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a1']]), canvas([['dfm-pc-ea-1', 'dfm-pc-s2', 'dfm-pc-a1']]), ctx);
        expect(managed.removed).toEqual([expect.objectContaining({ kind: 'mother', value: smart.basename })]);
        expect(managed.added).toEqual([expect.objectContaining({ kind: 'mother', value: smart2.basename })]);
    });

    it('relação desenhada duas vezes: apagar uma das setas não desliga', () => {
        const twice = canvas([['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a2'], ['minha', 'dfm-pc-s1', 'dfm-pc-a2']]);
        expect(diffLinks(twice, without(twice, id => id === 'minha'), ctx).removed).toEqual([]);
    });

    it('L5: Ctrl+Z que só tira ou move setas dfm-* (a sincronização desfeita) não liga nem desliga', () => {
        const synced = canvas([['op-anotacao', 'minha-nota', 'dfm-pc-a1'], ['dfm-pc-d-1', 'dfm-pc-a1', 'dfm-pc-a2'], ['dfm-pc-ea-1', 'dfm-pc-s1', 'dfm-pc-a1']]);
        const undone = canvas([['op-anotacao', 'minha-nota', 'dfm-pc-a1'], ['dfm-pc-ea-1', 'dfm-pc-s2', 'dfm-pc-a1']]);
        expect(diffLinks(synced, undone, ctx, { fromHistory: true })).toEqual({ added: [], removed: [], meaningless: [] });
        expect(freshEdges(synced, undone, { fromHistory: true })).toEqual([]);
        // O mesmo apagar como gesto desliga.
        expect(diffLinks(synced, undone, ctx).removed.map(l => l.kind).sort()).toEqual(['blockedBy', 'mother']);
    });

    it('L5: Ctrl+Z da seta que o operador desenhou continua desligando', () => {
        const drawn = canvas([['minha', 'semana-43', 'dfm-pc-a2']]);
        expect(diffLinks(drawn, canvas([]), ctx, { fromHistory: true }).removed).toEqual([expect.objectContaining({ kind: 'week', task: editar.path })]);
    });

    it('seta-anotação apagada não desliga nada', () => {
        const notes = canvas([['a', 'minha-nota', 'dfm-pc-a1'], ['b', 'dia-14', 'dfm-pc-s1']]);
        expect(diffLinks(notes, canvas([]), ctx)).toEqual({ added: [], removed: [], meaningless: [] });
    });
});

describe('unpatchFor: o campo que a seta apagada tira', () => {
    const isSmartName = (name: string) => [smart.basename, smart2.basename].includes(name);

    it('semana: apaga só se ainda é aquela semana', () => {
        expect(unpatchFor({ week: '2026-W43' }, L('semana-43', 'dfm-pc-a2'))).toEqual({ week: null });
        expect(unpatchFor({ week: '2026-W44' }, L('semana-43', 'dfm-pc-a2'))).toBeNull();
        expect(unpatchFor({}, L('semana-43', 'dfm-pc-a2'))).toBeNull();
    });

    it('dia: apaga scheduled (com ou sem hora) só se ainda é aquele dia; a semana fica', () => {
        expect(unpatchFor({ scheduled: '2026-10-14T09:30', week: '2026-W42' }, L('dia-14', 'dfm-pc-a2'))).toEqual({ scheduled: null });
        expect(unpatchFor({ scheduled: '2026-10-15', week: '2026-W42' }, L('dia-14', 'dfm-pc-a2'))).toBeNull();
    });

    it('mãe: sai a SMART; sem outra mãe, a ação volta ao projeto da SMART', () => {
        const link = L('dfm-pc-s1', 'dfm-pc-a2');
        expect(unpatchFor({ projects: [`[[${smart.basename}]]`] }, link, { isSmartName })).toEqual({ projects: ['[[Venda de afiliados]]'] });
        // Com outra SMART mãe, fica só ela.
        expect(unpatchFor({ projects: [`[[${smart.basename}]]`, `[[${smart2.basename}]]`] }, link, { isSmartName })).toEqual({ projects: [`[[${smart2.basename}]]`] });
        // Outro projeto não é mãe: o projeto da SMART volta junto, sem duplicar.
        expect(unpatchFor({ projects: ['[[Livro]]', `[[${smart.basename}]]`] }, link, { isSmartName })).toEqual({ projects: ['[[Livro]]', '[[Venda de afiliados]]'] });
        expect(unpatchFor({ projects: ['[[Venda de afiliados]]', `[[${smart.basename}|alias]]`] }, link, { isSmartName })).toEqual({ projects: ['[[Venda de afiliados]]'] });
        expect(unpatchFor({ projects: ['[[Outra]]'] }, link, { isSmartName })).toBeNull();
    });

    it('projeto: tira o link pelo nome ou pela nota-índice', () => {
        expect(unpatchFor({ projects: ['[[Outro]]', '[[Venda de afiliados]]'] }, L('dfm-pc-proj', 'dfm-pc-s2'))).toEqual({ projects: ['[[Outro]]'] });
        expect(unpatchFor({ projects: ['[[100 - AREAS/Venda/Venda|Venda]]'] }, L('indice', 'dfm-pc-a1'))).toEqual({ projects: null });
        expect(unpatchFor({ projects: ['[[Outro]]'] }, L('indice', 'dfm-pc-a1'))).toBeNull();
    });

    it('blockedBy: filtra [[x]] e {uid}; lista vazia sai', () => {
        const link = L('dfm-pc-a1', 'dfm-pc-a2');
        const other = { uid: '[[Outra]]', reltype: 'FINISHTOSTART' };
        expect(unpatchFor({ blockedBy: [`[[${gravar.basename}]]`, other] }, link)).toEqual({ blockedBy: [other] });
        expect(unpatchFor({ blockedBy: [{ uid: `[[${gravar.basename}]]`, reltype: 'FINISHTOSTART' }] }, link)).toEqual({ blockedBy: null });
        expect(unpatchFor({ blockedBy: [other] }, link)).toBeNull();
    });

    it('ligar e desligar se desfazem', () => {
        const link = L('dfm-pc-s1', 'dfm-pc-a2');
        const fm: Record<string, any> = { projects: ['[[Venda de afiliados]]'], week: '2026-W42', impacto: 8 };
        const on = { ...fm, ...patchFor(fm, link) };
        expect(on.projects).toEqual([`[[${smart.basename}]]`]);
        expect({ ...on, ...unpatchFor(on, link, { isSmartName }) }.projects).toEqual(fm.projects);
    });
});

describe('aviso e anotação', () => {
    it('"Desligado: X ↛ Y"', () => {
        expect(unlinkLabel(L('semana-43', 'dfm-pc-a2'))).toBe('Desligado: Ação Editar vídeo ↛ W43');
        expect(unlinkLabel(L('dia-14', 'dfm-pc-a2'))).toBe('Desligado: Ação Editar vídeo ↛ qua 14');
        expect(unlinkLabel(L('dfm-pc-s1', 'dfm-pc-a2'))).toBe(`Desligado: Ação Editar vídeo ↛ SMART ${smart.basename}`);
        expect(unlinkLabel(L('dfm-pc-proj', 'dfm-pc-s2'))).toBe(`Desligado: SMART ${smart2.basename} ↛ projeto Venda de afiliados`);
        expect(unlinkLabel(L('dfm-pc-a1', 'dfm-pc-a2'))).toBe('Desligado: Gravar vídeo ↛ Editar vídeo (não bloqueia mais)');
    });

    it('annotationEdge: fica a seta até nó do operador e a de par sem sentido; a com dado, não', () => {
        const keep = annotationEdge(ctx);
        expect(keep({}, node('minha-nota'), node('dfm-pc-a1'))).toBe(true);
        expect(keep({}, node('dia-14'), node('dfm-pc-s1'))).toBe(true);
        expect(keep({}, node('dfm-pc-s1'), node('dfm-pc-a2'))).toBe(false);
        expect(keep({}, node('semana-43'), node('dfm-pc-a1'))).toBe(false);
    });
});
