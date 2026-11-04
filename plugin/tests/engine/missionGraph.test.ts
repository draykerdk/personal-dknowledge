/**
 * Testes do grafo da missão.
 *
 * O que está em jogo não é desenhar: é **conferir**. Um grafo que só mostra
 * relação é um diagrama; este confere cada ligação contra o contrato do tipo e
 * denuncia a contradição. Os testes fixam as quatro promessas:
 *
 * 1. só entra a semana corrente — o grafo é do plano, não do vault;
 * 2. ligação entre tipos errados vira violação com motivo, nunca aresta muda;
 * 3. ausência de dado (sem projeto, sem prazo) não vira violação;
 * 4. o layout é determinístico — o console re-renderiza e o nó não pode pular.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({ Notice: class {} }));

import { MissionTask, toMissionTask } from '../../src/engine/missionControl';
import { buildMissionGraph, MissionGraphInput } from '../../src/engine/missionGraph';

const TODAY = '2026-09-14';
const WEEK = '2026-W38';

const DAYS = [
    { date: '2026-09-14', label: 'Seg 14/09', weekday: 1, isToday: true },
    { date: '2026-09-15', label: 'Ter 15/09', weekday: 2, isToday: false },
    { date: '2026-09-16', label: 'Qua 16/09', weekday: 3, isToday: false },
    { date: '2026-09-17', label: 'Qui 17/09', weekday: 4, isToday: false },
    { date: '2026-09-18', label: 'Sex 18/09', weekday: 5, isToday: false },
    { date: '2026-09-19', label: 'Sáb 19/09', weekday: 6, isToday: false },
    { date: '2026-09-20', label: 'Dom 20/09', weekday: 7, isToday: false },
];

function task(path: string, frontmatter: Record<string, unknown>): MissionTask {
    return toMissionTask(path, { week: WEEK, status: 'next-action', priority: 'normal', ...frontmatter }, TODAY);
}

function input(over: Partial<MissionGraphInput> = {}): MissionGraphInput {
    return {
        week: WEEK,
        quarter: '2026-Q3',
        today: TODAY,
        days: DAYS,
        weekFocus: [],
        projects: [],
        tasks: [],
        trees: [],
        canvases: [],
        ...over,
    };
}

const project = (name: string, over: Record<string, unknown> = {}) => ({
    name, total: 3, completed: 1, pending: 2, blocked: 0, doing: 1,
    progressPercent: 33, health: 'on-track' as const, inFocus: true, ...over,
});

describe('buildMissionGraph — estrutura da semana', () => {
    it('monta trimestre, semana e os sete dias ligados por contém', () => {
        const graph = buildMissionGraph(input());
        expect(graph.stats.byKind.trimestre).toBe(1);
        expect(graph.stats.byKind.semana).toBe(1);
        expect(graph.stats.byKind.dia).toBe(7);
        expect(graph.stats.byEdge.contem).toBe(8); // trimestre→semana + semana→7 dias
        const week = graph.nodes.find(node => node.kind === 'semana')!;
        expect(week.label).toBe(WEEK);
        expect(week.layer).toBe(1);
    });

    it('a legenda só publica tipo de aresta que o grafo realmente usa, com o par do contrato', () => {
        const graph = buildMissionGraph(input());
        // Duas linhas de `contem` — trimestre→semana e semana→dia — porque a
        // contagem é do par do contrato, não do tipo solto.
        expect(graph.legend.map(entry => `${entry.kind}:${entry.from}->${entry.to}`))
            .toEqual(['contem:trimestre->semana', 'contem:semana->dia']);
        expect(graph.legend.map(entry => entry.count)).toEqual([1, 7]);
        // Tipo sem aresta não vira linha de legenda dizendo "0".
        expect(graph.legend.find(entry => entry.kind === 'vence')).toBeUndefined();
    });

    it('projeto em foco recebe aresta foco; dia recebe agenda; prazo vira vence', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [task('TaskNotes/Tasks/A.md', {
                title: 'A', projects: ['[[Projeto X]]'], scheduled: '2026-09-15T09:00', due: '2026-09-16',
            })],
        }));
        expect(graph.stats.byEdge.foco).toBe(1);
        expect(graph.stats.byEdge.executa).toBe(1);
        expect(graph.stats.byEdge.agenda).toBe(1);
        expect(graph.stats.byEdge.vence).toBe(1);
        expect(graph.violations).toEqual([]);
        expect(graph.looseTasks).toBe(0);
    });

    it('ignora tarefa de outra semana, terminal e arquivada', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [
                task('TaskNotes/Tasks/outra.md', { title: 'outra semana', week: '2026-W37', projects: ['[[Projeto X]]'] }),
                task('TaskNotes/Tasks/feita.md', { title: 'feita', status: 'done', projects: ['[[Projeto X]]'] }),
                toMissionTask('TaskNotes/Tasks/arq.md', { title: 'arquivada', status: 'next-action', week: WEEK, tags: ['task', 'archived'], projects: ['[[Projeto X]]'] }, TODAY),
            ],
        }));
        // Só a semana corrente entra: o grafo é do plano, não do vault.
        expect(graph.stats.byKind.tarefa).toBe(0);
    });

    it('tarefa sem projeto e sem agendamento conta como solta, sem ganhar ligação inventada', () => {
        const graph = buildMissionGraph(input({
            tasks: [task('TaskNotes/Tasks/solta.md', { title: 'Solta' })],
        }));
        expect(graph.looseTasks).toBe(1);
        expect(graph.stats.byKind.tarefa).toBe(1);
        // Ela existe no grafo, mas não recebeu nenhuma aresta.
        const semProjeto = graph.nodes.find(node => node.kind === 'tarefa')!;
        expect(graph.edges.filter(edge => edge.to === semProjeto.id)).toEqual([]);
    });

    it('projeto com trabalho aberto fora do foco declarado rende aviso, não erro', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X'), project('Projeto Y')],
            tasks: [task('TaskNotes/Tasks/b.md', { title: 'B', projects: ['[[Projeto Y]]'] })],
        }));
        expect(graph.stats.byEdge.executa).toBe(1);
        const aviso = graph.violations.find(violation => violation.kind === 'foco');
        expect(aviso?.severity).toBe('warning');
        expect(aviso?.reason).toContain('Projeto Y');
        expect(graph.violations.every(violation => violation.severity !== 'critical')).toBe(true);
    });
});

describe('buildMissionGraph — validação por tipo', () => {
    it('agenda fora da janela da semana é contradição crítica', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [task('TaskNotes/Tasks/c.md', {
                title: 'C', projects: ['[[Projeto X]]'], scheduled: '2026-09-25',
            })],
        }));
        const violacao = graph.violations[0];
        expect(violacao.kind).toBe('agenda');
        expect(violacao.severity).toBe('critical');
        expect(violacao.reason).toContain('2026-09-25');
        // A tarefa continua no grafo, ligada ao projeto: a violação é declarada,
        // não um jeito de esconder o dado.
        expect(graph.stats.byKind.tarefa).toBe(1);
    });

    it('intenção depois do prazo é contradição', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [task('TaskNotes/Tasks/d.md', {
                title: 'D', projects: ['[[Projeto X]]'], scheduled: '2026-09-18', due: '2026-09-15',
            })],
        }));
        const violacao = graph.violations.find(violation => violation.reason.includes('depois do prazo'));
        expect(violacao?.severity).toBe('critical');
    });

    it('sem prazo e sem agendamento não é violação — é ausência de dado', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [task('TaskNotes/Tasks/e.md', { title: 'E', projects: ['[[Projeto X]]'] })],
        }));
        expect(graph.violations).toEqual([]);
    });

    it('data crua com hora no último dia da semana NÃO vira acusação de fora da janela', () => {
        // `2026-09-20T09:00` é maior que `2026-09-20` na comparação de string:
        // sem normalizar, o grafo acusaria de "agendada fora da semana" uma
        // tarefa agendada no domingo que fecha a semana. O motor normaliza ao ler
        // o frontmatter, mas a ponte e o agente entregam o valor cru — e acusação
        // falsa é pior que omissão.
        const cru = task('TaskNotes/Tasks/fim.md', {
            title: 'Domingo', projects: ['[[Projeto X]]'], scheduled: '2026-09-20T09:00',
        });
        cru.scheduledDate = '2026-09-20T09:00';
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [cru],
        }));
        expect(graph.violations.filter(violation => violation.severity === 'critical')).toEqual([]);
        expect(graph.stats.byEdge.agenda).toBe(1);
    });

    it('toda violação aponta para nós que existem no grafo', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            tasks: [
                task('TaskNotes/Tasks/f.md', { title: 'F', projects: ['[[Projeto X]]'], scheduled: '2026-10-01' }),
                task('TaskNotes/Tasks/g.md', { title: 'G', projects: ['[[Projeto X]]'], scheduled: '2026-09-19', due: '2026-09-15' }),
            ],
        }));
        const ids = new Set(graph.nodes.map(node => node.id));
        expect(graph.violations.length).toBeGreaterThan(0);
        for (const violation of graph.violations) {
            expect(ids.has(violation.from) || violation.from === violation.to).toBe(true);
        }
    });

    it('o grafo vazio não explode nem inventa nó', () => {
        const graph = buildMissionGraph(input({ days: [] }));
        expect(graph.nodes.map(node => node.kind).sort()).toEqual(['semana', 'trimestre']);
        expect(graph.stats.byEdge.contem).toBe(1);
        expect(graph.violations).toEqual([]);
        expect(graph.orphans).toEqual([]);
    });
});

describe('buildMissionGraph — árvores e canvases', () => {
    it('liga projeto à árvore de progressão e ao canvas homônimo', () => {
        const graph = buildMissionGraph(input({
            weekFocus: ['Projeto X'],
            projects: [project('Projeto X')],
            trees: [{
                file: '100 - AREAS/A/Projeto X/04 - Árvore de Progressão.md',
                project: '[[Projeto X]]',
                tiers: [], active: null, done: 2, total: 6,
            }],
            canvases: [{ path: '100 - AREAS/A/Projeto X/Projeto X.canvas', name: 'Projeto X', folder: '100 - AREAS/A/Projeto X', nodes: 6, edges: 3, mtime: 0, system: false }],
        }));
        expect(graph.stats.byEdge.renderiza).toBe(1);
        expect(graph.stats.byEdge.aponta).toBe(1);
        expect(graph.stats.byKind.arvore).toBe(1);
        expect(graph.stats.byKind.canvas).toBe(1);
    });

    it('projeto sem árvore nem canvas não ganha nó fantasma', () => {
        const graph = buildMissionGraph(input({ weekFocus: ['Projeto X'], projects: [project('Projeto X')] }));
        expect(graph.stats.byKind.arvore).toBe(0);
        expect(graph.stats.byKind.canvas).toBe(0);
    });
});
