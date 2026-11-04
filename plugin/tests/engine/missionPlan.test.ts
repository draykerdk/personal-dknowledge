/**
 * Testes do motor de planejamento.
 *
 * O alvo é a **leitura do plano**: carga por dia, overflow, matriz de ação,
 * timeline e radar do trimestre. São funções puras, então o teste fixa o
 * contrato sem Obsidian.
 *
 * O que se prova aqui, em uma frase por bloco:
 * - a semana ISO fecha em UTC, inclusive atravessando a virada do ano;
 * - ausência de estimativa e de agenda é contada, nunca convertida em zero;
 * - terminal e arquivada não entram no plano;
 * - nenhum gap aparece sem um número que o sustente.
 *
 * A fixture imita o vault real de 2026-09-14 (74 tarefas: 34 com `scheduled`,
 * 56 com `timeEstimate`), ou seja, **muitos `estimate: null`** — um vault
 * idealizado esconderia justamente o defeito que este motor evita.
 */
import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
    class TFile {
        path: string;
        constructor(path: string) {
            this.path = path;
        }
    }
    class TFolder {
        path: string;
        constructor(path: string) {
            this.path = path;
        }
    }
    return { TFile, TFolder };
});

// `missionPlan` importa `isTerminalStatus` de `./missionControl`, e esse módulo
// importa `obsidian`. O motor puro não toca Obsidian nenhum: o mock existe só
// para o import resolver fora do app.
vi.mock('obsidian', () => ({
    TFile: hoisted.TFile,
    TFolder: hoisted.TFolder,
    Notice: class {},
    moment: (value?: any) => ({
        format: () => '',
        subtract: () => ({ format: () => '' }),
        diff: () => 0,
        valueOf: () => (value ? Date.parse(String(value)) : 0),
    }),
}));

import {
    DEFAULT_DAY_CAPACITY_MINUTES,
    buildPriorityMatrix,
    buildQuarterRadar,
    buildTimeline,
    buildWeekPlan,
    dueSignal,
    weekBounds,
    weekOf,
} from '../../src/engine/missionPlan';
import { parseSchedule } from '../../src/engine/taskSemantics';
import type { MissionTask } from '../../src/engine/missionControl';

const TODAY = '2026-09-14';
const WEEK = '2026-W38';

/**
 * Tarefa completa, com os derivados montados como o coletor monta: quem declara
 * `scheduled` ganha `scheduledDate`/`scheduledTime` do mesmo parser do
 * `toMissionTask`. Assim o teste fala a língua do dado real, não de um objeto
 * sem os campos do plano.
 */
function task(overrides: Partial<MissionTask> & { path: string }): MissionTask {
    const scheduled = overrides.scheduled ?? '';
    const parsed = parseSchedule(scheduled);
    return {
        title: overrides.path.split('/').pop()!.replace(/\.md$/, ''),
        status: 'next-action',
        priority: 'normal',
        projects: [],
        week: '',
        // O modelo exige `blockedBy` (lista, mesmo vazia): o fixture vivia sem o campo
        // porque o teste nunca passou pelo tsc. É exatamente o que este config expõe.
        blockedBy: [],
        due: '',
        impact: null,
        overdue: false,
        dueToday: false,
        highImpact: false,
        scheduled,
        scheduledDate: parsed.date,
        scheduledTime: parsed.time,
        scheduledPast: false,
        estimate: null,
        contexts: [],
        type: 'task',
        archived: false,
        ...overrides,
    };
}

function paths(tasks: MissionTask[]): string[] {
    return tasks.map(item => item.path);
}

function cellsById(cells: ReturnType<typeof buildPriorityMatrix>): Record<string, string[]> {
    return Object.fromEntries(cells.map(cell => [cell.id, paths(cell.tasks)]));
}

describe('weekBounds / weekOf — semana ISO em UTC', () => {
    it('devolve segunda a domingo da semana pedida', () => {
        expect(weekBounds('2026-W38')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
        expect(weekOf('2026-09-14')).toBe('2026-W38');
        expect(weekOf('2026-09-20')).toBe('2026-W38');
        expect(weekOf('2026-09-21')).toBe('2026-W39');
    });

    it('atravessa a virada do ano: a semana é definida pela quinta', () => {
        expect(weekBounds('2026-W01')).toEqual({ start: '2025-12-29', end: '2026-01-04' });
        // Três dias de 2025 e quatro de 2026 pertencem à mesma semana ISO.
        expect(weekOf('2025-12-29')).toBe('2026-W01');
        expect(weekOf('2026-01-01')).toBe('2026-W01');
        expect(weekOf('2026-01-04')).toBe('2026-W01');
        expect(weekOf('2026-01-05')).toBe('2026-W02');
    });

    it('a W53 só existe em ano de 53 semanas', () => {
        // 2026 tem 53 semanas; a última começa em dezembro e termina no ano seguinte.
        expect(weekBounds('2026-W53')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
        expect(weekOf('2027-01-01')).toBe('2026-W53');
        // 2025 tem 52 semanas: W53 é uma semana que não existe, não uma semana a mais.
        expect(weekBounds('2025-W53')).toBeNull();
        expect(weekBounds('2026-W54')).toBeNull();
    });

    it('formato impossível é ausência, não erro', () => {
        expect(weekBounds('')).toBeNull();
        expect(weekBounds('semana')).toBeNull();
        expect(weekBounds('2026-W00')).toBeNull();
        expect(weekBounds('2026-W3')).toEqual(weekBounds('2026-W03'));
        expect(weekOf('')).toBe('');
        // 30 de fevereiro rolaria para março em Date.UTC: data que não existe não vira semana.
        expect(weekOf('2026-02-30')).toBe('');
    });
});

describe('buildWeekPlan — carga da semana', () => {
    it('soma os minutos de cada dia e separa agendadas de compromissos', () => {
        const plan = buildWeekPlan([
            task({ path: 'A.md', week: WEEK, scheduled: '2026-09-15', estimate: 90, due: '2026-09-18' }),
            task({ path: 'B.md', week: WEEK, scheduled: '2026-09-15T14:00', estimate: 30 }),
            task({ path: 'C.md', week: WEEK, scheduled: '2026-09-17', estimate: 120 }),
            task({ path: 'D.md', week: WEEK, due: '2026-09-15' }),
        ], WEEK, TODAY);

        expect(plan.start).toBe('2026-09-14');
        expect(plan.end).toBe('2026-09-20');
        expect(plan.days).toHaveLength(7);

        const tuesday = plan.days[1];
        expect(tuesday.date).toBe('2026-09-15');
        expect(tuesday.label).toBe('Ter 15/09');
        expect(tuesday.weekday).toBe(2);
        expect(tuesday.isToday).toBe(false);
        expect(tuesday.isPast).toBe(false);
        // Sem hora declarada a tarefa é do dia e vem primeiro; o bloco das 14:00 depois.
        expect(paths(tuesday.scheduled)).toEqual(['A.md', 'B.md']);
        expect(tuesday.minutes).toBe(120);
        expect(paths(tuesday.due)).toEqual(['D.md']);

        expect(plan.days[0].isToday).toBe(true);
        expect(plan.days[3].minutes).toBe(120);
        expect(plan.plannedMinutes).toBe(240);
        expect(plan.totals.scheduled).toBe(3);
        // Dois prazos caem na janela (D em 15/09 e A em 18/09), um deles no mesmo
        // dia em que a tarefa foi agendada.
        expect(plan.totals.dueInWindow).toBe(2);
        expect(paths(plan.days[4].due)).toEqual(['A.md']);
        expect(plan.peakDay).toEqual({ date: '2026-09-15', minutes: 120 });
    });

    it('tarefa sem estimativa não zera a carga: ela entra em unestimated', () => {
        const plan = buildWeekPlan([
            task({ path: 'Estimada.md', week: WEEK, scheduled: '2026-09-15', estimate: 60, contexts: ['💻 Computador'] }),
            task({ path: 'SemEstimativa.md', week: WEEK, scheduled: '2026-09-15', contexts: ['💻 Computador', '🚶 Campo'] }),
            task({ path: 'OutraSemEstimativa.md', week: WEEK, scheduled: '2026-09-16' }),
        ], WEEK, TODAY);

        const tuesday = plan.days[1];
        expect(tuesday.scheduled).toHaveLength(2);
        // 60 min é o que foi declarado. Os outros 2 blocos continuam sem número —
        // e é `unestimated` que impede a semana de parecer leve.
        expect(tuesday.minutes).toBe(60);
        expect(tuesday.unestimated).toBe(1);
        expect(plan.plannedMinutes).toBe(60);
        expect(plan.totals.unestimated).toBe(2);

        // Contexto com tarefa não estimada conta a tarefa e não soma minuto falso.
        expect(plan.totals.byContext).toEqual([
            { context: '💻 Computador', count: 2, minutes: 60 },
            { context: '🚶 Campo', count: 1, minutes: 0 },
        ]);
    });

    it('terminal fica fora do plano, e tarefa sem data não vira "hoje"', () => {
        const plan = buildWeekPlan([
            task({ path: 'Feita.md', status: 'done', week: WEEK, scheduled: '2026-09-15', estimate: 300 }),
            task({ path: 'Cancelada.md', status: 'cancelled', week: WEEK, scheduled: '2026-09-15', due: '2026-09-15' }),
            task({ path: 'Solto.md', week: WEEK }),
        ], WEEK, TODAY);

        expect(plan.totals.open).toBe(1);
        expect(plan.totals.scheduled).toBe(0);
        expect(plan.days.every(day => day.scheduled.length === 0 && day.due.length === 0)).toBe(true);
        // Ausência de agenda é ausência: a tarefa é `unscheduled`, não tarefa de hoje.
        expect(plan.totals.unscheduled).toBe(1);
        expect(plan.plannedMinutes).toBe(0);
        expect(plan.peakDay).toBeNull();
    });

    it('retrata o vault como ele é: maioria sem estimativa e sem agenda continua contada', () => {
        const plan = buildWeekPlan([
            task({ path: 'Agendada e estimada.md', week: WEEK, scheduled: '2026-09-15', estimate: 120, projects: ['P'] }),
            task({ path: 'Agendada sem estimativa.md', week: WEEK, scheduled: '2026-09-15', projects: ['P'] }),
            task({ path: 'Sem agenda com estimativa.md', week: WEEK, estimate: 45 }),
            task({ path: 'Sem nada declarado.md', week: WEEK }),
            task({ path: 'Sem nada declarado 2.md', week: WEEK, contexts: ['💻 Computador'] }),
        ], WEEK, TODAY);

        expect(plan.totals).toMatchObject({
            open: 5,
            scheduled: 2,
            unscheduled: 3,
            unestimated: 3,
            withoutProject: 3,
        });
        expect(plan.totals.byStatus).toEqual({ 'next-action': 5 });
        // Estimativa sem dia declarado não entra em dia nenhum: ela mede intenção
        // de duração, não carga agendada.
        expect(plan.days[1].minutes).toBe(120);
        expect(plan.days[1].unestimated).toBe(1);
        expect(plan.plannedMinutes).toBe(120);
    });

    it('semana ilegível devolve plano vazio em vez de sete dias inventados', () => {
        const plan = buildWeekPlan([task({ path: 'A.md', week: '2026-W53x', scheduled: '2026-09-15' })], '2026-W53x', TODAY);
        expect(plan.start).toBe('');
        expect(plan.end).toBe('');
        expect(plan.days).toEqual([]);
        expect(plan.gaps).toEqual([]);
        expect(plan.totals.open).toBe(0);
    });
});

describe('overflow, capacidade e pico', () => {
    const load = [
        task({ path: 'Bloco A.md', week: WEEK, scheduled: '2026-09-16', estimate: 180, projects: ['P'] }),
        task({ path: 'Bloco B.md', week: WEEK, scheduled: '2026-09-16', estimate: 180, projects: ['P'] }),
        task({ path: 'Bloco C.md', week: WEEK, scheduled: '2026-09-17', estimate: 60, projects: ['P'] }),
    ];

    it('dia acima da capacidade vira overflow, não conselho', () => {
        const plan = buildWeekPlan(load, WEEK, TODAY);

        expect(plan.capacityMinutes).toBe(DEFAULT_DAY_CAPACITY_MINUTES);
        expect(plan.days[2].minutes).toBe(360);
        // Só o excedente conta: o dia de 60 min não "compensa" o dia de 360.
        expect(plan.overflowMinutes).toBe(60);
        expect(plan.peakDay).toEqual({ date: '2026-09-16', minutes: 360 });
        expect(plan.gaps.map(gap => gap.id)).toContain('dia-sobrecarregado');
    });

    it('capacidade declarada muda o diagnóstico e valor inválido não inventa sobrecarga', () => {
        expect(buildWeekPlan(load, WEEK, TODAY, 60).overflowMinutes).toBe(300);
        // Capacidade 0 tornaria todo dia "sobrecarregado"; o padrão da casa volta
        // no lugar de um diagnóstico falso.
        const invalid = buildWeekPlan(load, WEEK, TODAY, 0);
        expect(invalid.capacityMinutes).toBe(DEFAULT_DAY_CAPACITY_MINUTES);
        expect(invalid.overflowMinutes).toBe(60);
    });

    it('sem estimativa não há pico: zero minuto não é medida', () => {
        const plan = buildWeekPlan([
            task({ path: 'Sem número.md', week: WEEK, scheduled: '2026-09-16' }),
        ], WEEK, TODAY);
        expect(plan.days[2].scheduled).toHaveLength(1);
        expect(plan.peakDay).toBeNull();
    });
});

describe('gaps — só o que os números sustentam', () => {
    it('semana limpa não gera nenhum gap', () => {
        const plan = buildWeekPlan([
            task({ path: 'Seg.md', week: WEEK, scheduled: '2026-09-14', estimate: 60, projects: ['P'] }),
            task({ path: 'Ter.md', week: WEEK, scheduled: '2026-09-15', estimate: 60, projects: ['P'] }),
            task({ path: 'Qua.md', week: WEEK, scheduled: '2026-09-16', estimate: 60, projects: ['P'] }),
            task({ path: 'Qui.md', week: WEEK, scheduled: '2026-09-17', estimate: 60, projects: ['P'] }),
            task({ path: 'Sex.md', week: WEEK, scheduled: '2026-09-18', estimate: 60, projects: ['P'] }),
        ], WEEK, TODAY);

        expect(plan.overflowMinutes).toBe(0);
        expect(plan.totals.unestimated).toBe(0);
        expect(plan.gaps).toEqual([]);
    });

    it('cada gap nasce de um número, com id estável e contagem no detalhe', () => {
        const plan = buildWeekPlan([
            task({ path: 'Vencida e fora.md', week: WEEK, scheduled: '2026-09-10', scheduledPast: true, estimate: 30, projects: ['P'] }),
            task({ path: 'Carregada.md', week: WEEK, scheduled: '2026-09-15', estimate: 400, projects: ['P'] }),
            task({ path: 'Sem nada.md', week: WEEK, due: '2026-09-01', overdue: true }),
        ], WEEK, TODAY);

        expect(plan.gaps.map(gap => gap.id)).toEqual([
            'intencao-vencida',
            'agendada-fora-da-semana',
            'dia-sobrecarregado',
            'dia-vazio',
            'sem-estimativa',
            'prazo-vencido',
            'sem-projeto',
        ]);

        const byId = Object.fromEntries(plan.gaps.map(gap => [gap.id, gap]));
        expect(byId['intencao-vencida'].severity).toBe('warning');
        expect(byId['intencao-vencida'].detail).toContain('1 tarefa agendada');
        expect(byId['dia-sobrecarregado'].detail).toContain('300 min');
        expect(byId['dia-vazio'].detail).toContain('4 dias úteis');
        expect(byId['sem-estimativa'].detail).toContain('1 tarefa da semana');
        expect(byId['sem-projeto'].detail).toContain('1 tarefa da semana');
        expect(byId['dia-vazio'].severity).toBe('info');
        // Nada foi agendado fora da janela, mas algo foi agendado nela: o gap de
        // semana vazia não pode aparecer.
        expect(plan.gaps.map(gap => gap.id)).not.toContain('semana-sem-intencao');
    });

    it('semana sem nenhuma intenção é dita, e nunca com contagem zero', () => {
        const plan = buildWeekPlan([
            task({ path: 'Sem agenda.md', week: WEEK, estimate: 30, projects: ['P'] }),
        ], WEEK, TODAY);

        const gap = plan.gaps.find(candidate => candidate.id === 'semana-sem-intencao');
        expect(gap).toBeDefined();
        expect(gap!.detail).toContain('Nenhuma tarefa agendada entre 14/09 e 20/09');
        expect(plan.gaps.map(candidate => candidate.id)).not.toContain('agendada-fora-da-semana');
    });

    it('agendada fora da semana conta a tarefa desta semana, não o vault inteiro', () => {
        const plan = buildWeekPlan([
            task({ path: 'Desta semana, outro dia.md', week: WEEK, scheduled: '2026-10-05', estimate: 30, projects: ['P'] }),
            task({ path: 'De outra semana.md', week: '2026-W41', scheduled: '2026-10-07', estimate: 30, projects: ['P'] }),
        ], WEEK, TODAY);

        expect(plan.totals.open).toBe(1);
        expect(plan.totals.scheduled).toBe(0);
        expect(plan.totals.scheduledOutsideWeek).toBe(1);
        expect(plan.gaps.map(gap => gap.id)).toContain('agendada-fora-da-semana');
    });

    it('intenção vencida é da tarefa e vale além da janela impressa', () => {
        const plan = buildWeekPlan([
            task({ path: 'Vencida de outro mês.md', week: '2026-W30', scheduled: '2026-07-20', scheduledPast: true, estimate: 15, projects: ['P'] }),
            task({ path: 'Desta semana.md', week: WEEK, scheduled: '2026-09-15', estimate: 60, projects: ['P'] }),
        ], WEEK, TODAY);

        const gap = plan.gaps.find(candidate => candidate.id === 'intencao-vencida');
        expect(gap).toBeDefined();
        expect(gap!.detail).toContain('1 tarefa agendada');
    });
});

describe('buildPriorityMatrix — Matriz DFM de Ação', () => {
    it('urgência é priority declarada: prazo não move ninguém de quadrante', () => {
        const cells = cellsById(buildPriorityMatrix([
            task({ path: 'Urgente e alto.md', priority: 'high', impact: 9 }),
            task({ path: 'Normal e alto.md', priority: 'normal', impact: 9 }),
            task({ path: 'Alias urgent.md', priority: 'urgent', impact: 9 }),
            task({ path: 'Vencida, mas não urgente.md', priority: 'normal', impact: 9, due: '2026-09-01', overdue: true }),
            task({ path: 'Vence hoje, mas não urgente.md', priority: 'normal', impact: 9, due: TODAY, dueToday: true }),
        ]));

        expect(cells['agora']).toEqual(['Alias urgent.md', 'Urgente e alto.md']);
        // Vencida e vence-hoje continuam no quadrante não urgente: quem declara
        // urgência é a triagem, não a data.
        expect(cells['agendar']).toEqual([
            'Vencida, mas não urgente.md',
            'Vence hoje, mas não urgente.md',
            'Normal e alto.md',
        ]);
        expect(cells['sem-impacto']).toEqual([]);
    });

    it('impacto ausente tem quadrante próprio, nunca "baixo impacto"', () => {
        const cells = cellsById(buildPriorityMatrix([
            task({ path: 'Urgente sem impacto.md', priority: 'high' }),
            task({ path: 'Normal sem impacto.md' }),
            task({ path: 'Alto impacto.md', priority: 'high', impact: 8 }),
            task({ path: 'Fronteira 7.md', priority: 'high', impact: 7 }),
            task({ path: 'Fronteira 6.md', priority: 'high', impact: 6 }),
            task({ path: 'Baixo impacto.md', priority: 'high', impact: 3 }),
        ]));

        // Sem número de impacto a triagem não aconteceu: o quadrante é o de classificar.
        expect(cells['sem-impacto']).toEqual(['Normal sem impacto.md', 'Urgente sem impacto.md']);
        // O corte é o da view canônica: `impacto >= 7`.
        expect(cells['agora']).toEqual(['Alto impacto.md', 'Fronteira 7.md']);
        expect(cells['rapido']).toEqual(['Fronteira 6.md', 'Baixo impacto.md']);
    });

    it('só tarefa executável entra: capturada, bloqueada, algum dia, arquivada e SMART-mãe ficam fora', () => {
        const matrix = buildPriorityMatrix([
            task({ path: 'Próxima ação.md', status: 'next-action', priority: 'high', impact: 9 }),
            task({ path: 'Em execução.md', status: 'in-progress', priority: 'high', impact: 9 }),
            task({ path: 'Capturada.md', status: 'inbox', priority: 'high', impact: 9 }),
            task({ path: 'Algum dia.md', status: 'someday', priority: 'high', impact: 9 }),
            task({ path: 'Bloqueada.md', status: 'waiting-on', priority: 'high', impact: 9 }),
            task({ path: 'Feita.md', status: 'done', priority: 'high', impact: 9 }),
            task({ path: 'Arquivada.md', status: 'next-action', priority: 'high', impact: 9, archived: true }),
            task({ path: 'SMART.md', status: 'next-action', priority: 'high', impact: 9, type: 'tarefa_smart' }),
        ]);

        const cells = cellsById(matrix);
        expect(matrix.reduce((total, cell) => total + cell.tasks.length, 0)).toBe(2);
        expect(cells['agora']).toEqual(['Em execução.md', 'Próxima ação.md']);
    });

    it('nota antiga sem type continua na matriz: ausência de campo não é exclusão', () => {
        const cells = cellsById(buildPriorityMatrix([
            task({ path: 'Nota antiga.md', type: '', priority: 'high', impact: 9 }),
        ]));
        expect(cells['agora']).toEqual(['Nota antiga.md']);
    });

    it('as cinco células existem mesmo vazias, na ordem da view canônica', () => {
        const cells = buildPriorityMatrix([]);
        expect(cells.map(cell => cell.id)).toEqual(['agora', 'agendar', 'rapido', 'soltar', 'sem-impacto']);
        expect(cells.map(cell => cell.label)).toEqual([
            'Fazer agora',
            'Agendar bloco',
            'Resolver rápido',
            'Soltar ou agrupar',
            'Classificar impacto',
        ]);
        expect(cells.every(cell => cell.tasks.length === 0)).toBe(true);
        expect(cells.every(cell => cell.hint.length > 0)).toBe(true);
    });
});

describe('dueSignal', () => {
    it('traduz o prazo em sinal — o ícone é do painel, não do motor', () => {
        expect(dueSignal('', TODAY)).toEqual({ days: null, label: '', late: false });
        expect(dueSignal('2026-09-11', TODAY)).toEqual({ days: -3, label: '3d atrasada', late: true });
        expect(dueSignal(TODAY, TODAY)).toEqual({ days: 0, label: 'hoje', late: false });
        expect(dueSignal('2026-09-16', TODAY)).toEqual({ days: 2, label: '2d', late: false });
        expect(dueSignal('2026-09-17', TODAY)).toEqual({ days: 3, label: '3d', late: false });
        // Acima de três dias o prazo é data, não sinal.
        expect(dueSignal('2026-09-25', TODAY)).toEqual({ days: 11, label: '', late: false });
        expect(dueSignal('2026-09-14T18:00', TODAY)).toEqual({ days: 0, label: 'hoje', late: false });
        expect(dueSignal('sem data', TODAY)).toEqual({ days: null, label: '', late: false });
    });

    it('hoje ilegível não vira sinal nenhum', () => {
        expect(dueSignal('2026-09-20', '')).toEqual({ days: null, label: '', late: false });
    });
});

describe('buildTimeline', () => {
    it('agendar depois do prazo é plano invertido, com folga negativa', () => {
        const entries = buildTimeline([
            task({ path: 'Invertida.md', scheduled: '2026-09-18', due: '2026-09-15', estimate: 60 }),
        ], TODAY);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            start: '2026-09-18',
            end: '2026-09-15',
            slackDays: -3,
            state: 'invertida',
        });
    });

    it('classifica folga, no dia, atraso, sem prazo e sem agenda', () => {
        const entries = buildTimeline([
            task({ path: 'Feita.md', status: 'done', scheduled: '2026-09-10', due: '2026-09-12' }),
            task({ path: 'Folga.md', scheduled: '2026-09-21', due: '2026-09-25' }),
            task({ path: 'No dia.md', scheduled: '2026-09-22', due: '2026-09-22' }),
            task({ path: 'Atrasada.md', scheduled: '2026-09-09', due: '2026-09-11' }),
            task({ path: 'Sem prazo.md', scheduled: '2026-09-23' }),
            task({ path: 'Sem agenda.md', due: '2026-09-24' }),
        ], TODAY);

        const byPath = Object.fromEntries(entries.map(entry => [entry.task.path, entry.state]));
        expect(byPath).toEqual({
            'Folga.md': 'folga',
            'No dia.md': 'no-dia',
            'Atrasada.md': 'atrasada',
            'Sem prazo.md': 'sem-prazo',
            'Sem agenda.md': 'sem-agenda',
        });
        // Terminal não entra, e quem declarou dia vem antes de quem não declarou.
        expect(paths(entries.map(entry => entry.task))).toEqual([
            'Atrasada.md',
            'Folga.md',
            'No dia.md',
            'Sem prazo.md',
            'Sem agenda.md',
        ]);
        expect(entries.map(entry => entry.slackDays)).toEqual([2, 4, 0, null, null]);
    });

    it('lê a data do campo cru quando o derivado não veio', () => {
        const full = task({ path: 'Cru.md', week: WEEK, scheduled: '2026-09-16T09:30', estimate: 45 });
        const { scheduledDate, scheduledTime, ...raw } = full;
        void scheduledDate;
        void scheduledTime;

        const plan = buildWeekPlan([raw as MissionTask], WEEK, TODAY);
        expect(plan.days[2].scheduled).toHaveLength(1);
        expect(plan.days[2].minutes).toBe(45);
        expect(plan.totals.scheduled).toBe(1);
    });
});

describe('buildQuarterRadar', () => {
    it('cobre as semanas ISO que o trimestre toca (14 quando não começa numa segunda)', () => {
        const weeks = buildQuarterRadar([], '2026-Q3', TODAY);

        expect(weeks).toHaveLength(14);
        expect(weeks[0]).toMatchObject({ week: '2026-W27', start: '2026-06-29', end: '2026-07-05' });
        expect(weeks[13]).toMatchObject({ week: '2026-W40', start: '2026-09-28', end: '2026-10-04' });
    });

    it('13 semanas quando o trimestre começa numa segunda', () => {
        const weeks = buildQuarterRadar([], '2024-Q2', '2024-04-15');

        expect(weeks).toHaveLength(13);
        expect(weeks[0].week).toBe('2024-W14');
        expect(weeks[0].start).toBe('2024-04-01');
        expect(weeks[12].week).toBe('2024-W26');
        expect(weeks[12].end).toBe('2024-06-30');
    });

    it('marca passada, corrente e futura pela semana de hoje', () => {
        const weeks = buildQuarterRadar([], '2026-Q3', TODAY);
        const state = Object.fromEntries(weeks.map(week => [week.week, week.state]));

        expect(state['2026-W37']).toBe('passada');
        expect(state['2026-W38']).toBe('corrente');
        expect(state['2026-W39']).toBe('futura');
    });

    it('conta abertas e minutos por semana e ignora terminal', () => {
        const weeks = buildQuarterRadar([
            task({ path: 'W38 A.md', week: '2026-W38', estimate: 60 }),
            task({ path: 'W38 B.md', week: '2026-W38' }),
            task({ path: 'W38 feita.md', week: '2026-W38', status: 'done', estimate: 300 }),
            task({ path: 'W37.md', week: '2026-W37', estimate: 90 }),
        ], '2026-Q3', TODAY);

        expect(weeks.find(week => week.week === '2026-W38')).toMatchObject({ openTasks: 2, minutes: 60 });
        expect(weeks.find(week => week.week === '2026-W37')).toMatchObject({ openTasks: 1, minutes: 90 });
        expect(weeks.find(week => week.week === '2026-W39')).toMatchObject({ openTasks: 0, minutes: 0 });
    });

    it('hasNote segue as semanas declaradas; ausência é false, não "sem review"', () => {
        const weeks = buildQuarterRadar([], '2026-Q3', TODAY, ['2026-W38']);

        expect(weeks.find(week => week.week === '2026-W38')!.hasNote).toBe(true);
        expect(weeks.find(week => week.week === '2026-W37')!.hasNote).toBe(false);
        // Sem lista declarada, nenhuma semana afirma ter nota.
        expect(buildQuarterRadar([], '2026-Q3', TODAY).every(week => !week.hasNote)).toBe(true);
    });

    it('trimestre fora do formato devolve radar vazio, e hoje ilegível não afirma passado', () => {
        expect(buildQuarterRadar([], '2026-T3', TODAY)).toEqual([]);
        expect(buildQuarterRadar([], '', TODAY)).toEqual([]);
        expect(buildQuarterRadar([], '2026-Q3', '').every(week => week.state === 'futura')).toBe(true);
    });
});
