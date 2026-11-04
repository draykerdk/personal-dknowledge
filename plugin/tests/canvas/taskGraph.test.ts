import { describe, expect, it } from 'vitest';
import { CANVAS_COLOR, progressLine, taskColor } from '../../src/canvas/taskColor';
import { dependencyEdges } from '../../src/canvas/taskGraph';
import { buildGantt, buildMatrix } from '../../src/board/queryModel';
import { collectProjectTasks, isManaged, nodeIdFor, planProjectCanvas, ZONE_GROUP_ID } from '../../src/project/projectCanvasModel';
import type { TaskInfo } from '../../src/project/projectCanvasModel';
import type { TaskRecord } from '../../src/tasks/taskRecord';

const TODAY = '2026-09-25';

describe('cor da tarefa', () => {
    it('o que pede atenção vence: vencida > concluída > esperando > em execução > próxima > inbox', () => {
        expect(taskColor({ status: 'in-progress', due: '2026-09-20' }, TODAY)).toBe(CANVAS_COLOR.red);
        expect(taskColor({ status: 'done', due: '2026-09-20' }, TODAY)).toBe(CANVAS_COLOR.green);
        expect(taskColor({ status: 'waiting-on' }, TODAY)).toBe(CANVAS_COLOR.yellow);
        expect(taskColor({ status: 'in-progress' }, TODAY)).toBe(CANVAS_COLOR.orange);
        expect(taskColor({ status: 'next-action' }, TODAY)).toBe(CANVAS_COLOR.purple);
        expect(taskColor({ status: 'inbox' }, TODAY)).toBe(CANVAS_COLOR.cyan);
        expect(taskColor({ status: 'cancelled' }, TODAY)).toBeUndefined();
    });
    it('algum dia com prazo passado fica sem cor, como na grade (não é vencida)', () => {
        expect(taskColor({ status: 'someday', due: '2026-09-06' }, TODAY)).toBeUndefined();
        expect(taskColor({ status: 'someday' }, TODAY)).toBeUndefined();
        expect(taskColor({ status: 'next-action', due: '2026-09-06' }, TODAY)).toBe(CANVAS_COLOR.red);
    });
    it('prioridade não pinta mais (não esconde o progresso)', () => {
        expect(taskColor({ status: 'in-progress', priority: 'high' } as any, TODAY)).toBe(CANVAS_COLOR.orange);
    });
    it('SMART pelo avanço das ações', () => {
        const smart = { status: 'next-action', type: 'tarefa_smart' };
        expect(taskColor(smart, TODAY, { children: [{ status: 'next-action' }] })).toBe(CANVAS_COLOR.purple);
        expect(taskColor(smart, TODAY, { children: [{ status: 'done' }, { status: 'next-action' }] })).toBe(CANVAS_COLOR.orange);
        expect(taskColor(smart, TODAY, { children: [{ status: 'done' }, { status: 'cancelled' }] })).toBe(CANVAS_COLOR.green);
    });
    it('linha de progresso: a forma de mostrar da SMART (a função única), sem barra nem porcentagem', () => {
        // Feita com semana = do plano; feita sem horizonte = fora do plano; cancelada é neutra.
        const line = progressLine([{ status: 'done', week: '2026-W37' }, { status: 'done' }, { status: 'next-action', week: '2026-W37' }, { status: 'x' }, { status: 'cancelled' }], TODAY, '2026-09-30');
        expect(line).toBe('2 feitas · 1/3 do plano · faltam 2 · +1 fora do plano · vence 30/09');
        expect(line).not.toMatch(/[▰▱%]/);
        expect(progressLine([{ status: 'someday' }], TODAY)).toBe('+1 algum dia');
        expect(progressLine([], TODAY)).toBe('sem ações ainda');
        expect(progressLine([{ status: 'next-action' }], TODAY, '2026-09-20')).toContain('venceu 20/09');
        // SMART vencida sem nenhuma ação: "venceu", não "vence" no futuro.
        expect(progressLine([], '2026-10-15', '2026-09-30')).toBe('sem ações ainda · venceu 30/09');
        expect(progressLine([], '2026-10-15', '2026-10-20')).toBe('sem ações ainda · vence 20/10');
    });
});

describe('grafo', () => {
    it('seta bloqueadora → bloqueada só quando as duas pontas estão na zona; vermelha se o bloqueio está aberto', () => {
        const placed = new Map([['a', 'n-a'], ['b', 'n-b'], ['c', 'n-c']]);
        const edges = dependencyEdges(placed, [
            { basename: 'A', status: 'next-action' },
            { basename: 'B', status: 'next-action', blockedBy: ['A', 'Fora'] },
            { basename: 'C', status: 'next-action', blockedBy: ['B'] },
        ].map(t => ({ ...t })), 'p-');
        expect(edges.map(e => [e.fromNode, e.toNode, e.color])).toEqual([['n-a', 'n-b', '1'], ['n-b', 'n-c', '1']]);
        expect(dependencyEdges(placed, [{ basename: 'A', status: 'done' }, { basename: 'B', status: 'x', blockedBy: ['a'] }], 'p-')[0].color).toBeUndefined();
    });
    it('bloqueio entre SMART e ação não vira seta (a seta SMART ↔ ação é a de mãe)', () => {
        const placed = new Map([['s', 'n-s'], ['a', 'n-a'], ['b', 'n-b']]);
        const edges = dependencyEdges(placed, [
            { basename: 'S', status: 'next-action', type: 'tarefa_smart' },
            { basename: 'A', status: 'next-action', type: 'task', blockedBy: ['S'] },
            { basename: 'B', status: 'next-action', type: 'task', blockedBy: ['A'] },
        ], 'p-');
        expect(edges.map(e => [e.fromNode, e.toNode])).toEqual([['n-a', 'n-b']]);
    });
});

function rec(basename: string, over: Partial<TaskRecord> = {}): TaskRecord {
    return { path: `T/${basename}.md`, basename, title: basename, type: 'task', status: 'next-action', priority: 'normal', projects: [], week: '', due: '', scheduled: '', completedDate: '', contexts: [], tags: [], impacto: null, blockedBy: [], created: '', ...over };
}

describe('gantt e matriz', () => {
    it('gantt: barra do início ao prazo, janela limitada, sem data contada à parte', () => {
        const g = buildGantt([
            rec('A', { scheduled: '2026-09-20', due: '2026-09-28' }),
            rec('B', { created: '2026-01-01', due: '2026-09-22' }),
            rec('Sem data'),
            rec('S', { type: 'tarefa_smart', due: '2026-10-02', created: '2026-09-15' }),
        ], TODAY, 10);
        expect(g.rows.map(r => r.task.basename)).toEqual(['S', 'B', 'A']);
        expect(g.start).toBe('2026-07-27');
        expect(g.end).toBe('2026-10-02');
        expect(g.undated).toBe(1);
        expect(g.rows.find(r => r.task.basename === 'B')!.overdue).toBe(true);
    });
    it('matriz: regra canônica — só na mesa, urgência = prioridade alta, importante = impacto ≥ 7', () => {
        const m = buildMatrix([
            rec('agora', { priority: 'high', impacto: 9 }),
            rec('agendar', { impacto: 8 }),
            rec('rapido', { priority: 'urgent', impacto: 3 }),
            rec('soltar', { impacto: 2 }),
            rec('sem', {}),
            rec('inbox', { status: 'inbox', impacto: 9 }),
            rec('smart', { type: 'tarefa_smart', impacto: 9 }),
        ], 3);
        expect(m.cells.map(c => c.items.map(t => t.basename))).toEqual([['agora'], ['agendar'], ['rapido'], ['soltar']]);
        expect(m.unclassified).toBe(1);
    });
});

describe('zona do projeto como grafo', () => {
    const t = (basename: string, over: Partial<TaskInfo> = {}): TaskInfo => ({ path: `T/${basename}.md`, basename, type: 'task', status: 'next-action', projects: [], due: '', week: '', completedDate: '', ...over });
    const smart = t('S', { type: 'tarefa_smart', projects: ['P'], due: '2026-09-30' });
    const a = t('A', { projects: ['S'], status: 'done' });
    const b = t('B', { projects: ['S'], blockedBy: ['C'] });
    const c = t('C', { projects: ['S'], due: '2026-09-20' });
    const project = { name: 'P', path: 'P', index: null };
    const plan = planProjectCanvas({ nodes: [], edges: [] }, project, collectProjectTasks(project, [smart, a, b, c]), { today: TODAY }).data;
    const byFile = (x: TaskInfo) => plan.nodes.find(n => n.file === x.path)!;

    it('cores pela regra: SMART andando, ação feita verde, vencida vermelha', () => {
        expect(byFile(smart).color).toBe(CANVAS_COLOR.orange);
        expect(byFile(a).color).toBe(CANVAS_COLOR.green);
        expect(byFile(c).color).toBe(CANVAS_COLOR.red);
    });
    it('linha de progresso sob a SMART e seta de dependência C → B', () => {
        expect(plan.nodes.find(n => n.text === '1 feita · 0/2 do plano · faltam 2 · +1 fora do plano · vence 30/09')).toBeDefined();
        expect(plan.edges.some(e => e.fromNode === nodeIdFor(c.path) && e.toNode === nodeIdFor(b.path) && e.label === 'bloqueia')).toBe(true);
    });
    it('sem a fileira de widgets (aposentada em 02/11/2026, decisão 3): tudo dentro da zona, e nada sobrepõe', () => {
        const zone = plan.nodes.find(n => n.id === ZONE_GROUP_ID)!;
        expect(plan.nodes.filter(n => n.text?.includes('dfm-widget'))).toEqual([]);
        expect(plan.nodes.some(n => n.id.startsWith('dfm-pc-w-'))).toBe(false);
        const inner = plan.nodes.filter(n => isManaged(n.id) && n.id !== ZONE_GROUP_ID);
        for (const n of inner) expect(n.x + n.width <= zone.x + zone.width && n.y + n.height <= zone.y + zone.height, n.id).toBe(true);
        for (const p of inner) for (const q of inner) {
            if (p === q) continue;
            expect(p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height, `${p.id}×${q.id}`).toBe(false);
        }
    });
});
