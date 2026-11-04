import { describe, expect, it } from 'vitest';
import { evaluateQuery } from '../../src/board/queryModel';
import type { QueryScope } from '../../src/board/queryModel';
import { parseWidgetSpec, widgetBlock } from '../../src/board/boardSpec';
import type { BoardWidgetSpec } from '../../src/board/boardSpec';
import type { TaskRecord } from '../../src/tasks/taskRecord';

function r(basename: string, over: Partial<TaskRecord> = {}): TaskRecord {
    return {
        path: `T/${basename}.md`, basename, title: basename, type: 'task', status: 'next-action', priority: 'normal',
        projects: [], week: '', due: '', scheduled: '', completedDate: '', contexts: [], tags: ['task'], impacto: null, blockedBy: [], created: '', ...over,
    };
}
const smart = r('Publicar vídeo (W38)', { type: 'tarefa_smart', projects: ['Afiliados'], week: '2026-W38' });
const gravar = r('Gravar', { projects: ['Publicar vídeo (W38)'], week: '2026-W38', contexts: ['🚶 Campo'], due: '2026-09-20' });
const editar = r('Editar', { projects: ['Publicar vídeo (W38)'], status: 'done', week: '2026-W38' });
const hoje = r('Ligar banco', { projects: ['Finanças'], due: '2026-09-25', week: '2026-W39', tags: ['task', 'dinheiro'] });
const livre = r('Ler artigo', { status: 'inbox' });
const cancel = r('Descartada', { projects: ['Afiliados'], status: 'cancelled' });
const all = [smart, gravar, editar, hoje, livre, cancel];

const scope: QueryScope = { today: '2026-09-25', currentWeek: '2026-W39', canvasFiles: new Set([smart.path]), canvasProject: null, focusWeek: null, quarterWeeks: ['2026-W38', '2026-W39'] };
const spec = (src: string): BoardWidgetSpec => {
    const p = parseWidgetSpec(src);
    if (!('spec' in p)) throw new Error(p.error);
    return p.spec;
};

describe('consulta: especificação', () => {
    it('padrões: escopo canvas e mostrar lista; valores inválidos recusados em palavras', () => {
        expect(spec('tipo: consulta')).toMatchObject({ kind: 'consulta', escopo: 'canvas', mostrar: 'lista' });
        expect(spec('tipo: consulta\nmostrar: grupos').agrupar).toBe('status');
        expect(parseWidgetSpec('tipo: consulta\nescopo: galaxia')).toMatchObject({ ok: false });
    });
    it('serializa e relê igual', () => {
        const s = spec('tipo: consulta\nescopo: semana\nsemana: 2026-W38\nmostrar: kanban\ncontexto: campo\nlimite: 4');
        const body = widgetBlock(s).replace(/^```dfm-widget\n|\n```$/g, '');
        expect(spec(body)).toEqual(s);
    });
});

describe('consulta: escopos', () => {
    it('canvas: as tarefas desenhadas e as ações das SMART que estão ali', () => {
        const res = evaluateQuery(spec('tipo: consulta\nstatus: todas'), all, scope);
        expect(res.items.map(t => t.basename).sort()).toEqual(['Editar', 'Gravar', 'Publicar vídeo (W38)']);
    });
    it('canvas fora de canvas diz por quê, não mostra zero', () => {
        const res = evaluateQuery(spec('tipo: consulta'), all, { ...scope, canvasFiles: null });
        expect(res.unavailable).toContain('não há canvas');
    });
    it('projeto: inclui as ações que chegam pela SMART; usa o projeto do canvas quando não dito', () => {
        expect(evaluateQuery(spec('tipo: consulta\nescopo: projeto\nprojeto: afiliados\nstatus: todas'), all, scope).items.map(t => t.basename).sort())
            .toEqual(['Descartada', 'Editar', 'Gravar', 'Publicar vídeo (W38)']);
        expect(evaluateQuery(spec('tipo: consulta\nescopo: projeto'), all, { ...scope, canvasProject: 'Finanças' }).items.map(t => t.basename)).toEqual(['Ligar banco']);
    });
    it('semana: a atual, ou a em foco quando o canvas é de trimestre', () => {
        expect(evaluateQuery(spec('tipo: consulta\nescopo: semana'), all, scope).items.map(t => t.basename)).toEqual(['Ligar banco']);
        expect(evaluateQuery(spec('tipo: consulta\nescopo: semana'), all, { ...scope, focusWeek: '2026-W38' }).items.map(t => t.basename)).toEqual(['Gravar', 'Publicar vídeo (W38)']);
    });
});

describe('consulta: filtros e exibições', () => {
    const vault = (extra: string) => evaluateQuery(spec(`tipo: consulta\nescopo: vault\n${extra}`), all, scope);
    it('prazo, contexto, tag e tipo de tarefa', () => {
        expect(vault('prazo: hoje').items.map(t => t.basename)).toEqual(['Ligar banco']);
        expect(vault('prazo: vencidas').items.map(t => t.basename)).toEqual(['Gravar']);
        expect(vault('contexto: campo').items.map(t => t.basename)).toEqual(['Gravar']);
        expect(vault('tag: #dinheiro').items.map(t => t.basename)).toEqual(['Ligar banco']);
        expect(vault('tarefas: smart').items.map(t => t.basename)).toEqual(['Publicar vídeo (W38)']);
    });
    it('progresso: a forma de mostrar do recorte (a função única), sem porcentagem; canceladas neutras', () => {
        const res = evaluateQuery(spec('tipo: consulta\nescopo: projeto\nprojeto: Afiliados\nmostrar: progresso'), all, scope);
        expect(res.progress.text).toBe('1 feita · 1/3 do plano · faltam 2');
        expect(res.progress.text).not.toMatch(/%|concluídas/);
        // O projeto conta no trimestre: a feita de outro trimestre sai da conta, a aberta fica.
        const antiga = r('Antiga', { projects: ['Afiliados'], status: 'done', week: '2026-W20', completedDate: '2026-05-15' });
        expect(evaluateQuery(spec('tipo: consulta\nescopo: projeto\nprojeto: Afiliados\nmostrar: progresso'), [...all, antiga], scope).progress.text)
            .toBe('1 feita · 1/3 do plano · faltam 2');
        // Fora do escopo projeto, o recorte é o trabalho: a feita sem horizonte é fora do plano.
        const solta = r('Solta feita', { status: 'done' });
        expect(evaluateQuery(spec('tipo: consulta\nescopo: vault\nmostrar: progresso'), [livre, solta], scope).progress.text)
            .toBe('1 feita · 0/1 do plano · faltam 1 · +1 fora do plano');
        expect(evaluateQuery(spec('tipo: consulta\nescopo: vault\nmostrar: progresso'), [], scope).progress.text).toBe('nenhuma tarefa no recorte');
    });
    it('kanban agrupa por status na ordem do fluxo', () => {
        expect(vault('mostrar: kanban').groups.map(g => g.label)).toEqual(['Inbox', 'Próxima ação', 'Concluída']);
        expect(vault('mostrar: kanban\nstatus: todas').groups.map(g => g.label)).toContain('Cancelada');
    });
    it('grupos por projeto resolvem a ação para o projeto da SMART', () => {
        const g = vault('mostrar: grupos\nagrupar: projeto');
        expect(g.groups.find(x => x.key === 'Afiliados')!.items.map(t => t.basename).sort()).toEqual(['Gravar', 'Publicar vídeo (W38)']);
        expect(g.groups.find(x => x.key === '')!.label).toBe('Sem projeto');
    });
    it('limite corta a lista mas o total diz quantas há', () => {
        const res = vault('limite: 1');
        expect(res.items).toHaveLength(1);
        expect(res.total).toBe(4);
    });
});

describe('modelos prontos de consulta', () => {
    it('todo modelo do menu vira bloco válido e relê igual', async () => {
        const { QUERY_PRESETS } = await import('../../src/board/queryPresets');
        for (const preset of QUERY_PRESETS) {
            const body = widgetBlock(preset.spec).replace(/^```dfm-widget\n|\n```$/g, '');
            const parsed = parseWidgetSpec(body);
            expect(parsed.ok, preset.label).toBe(true);
            expect(parsed.ok && parsed.spec.kind).toBe('consulta');
        }
    });
});
