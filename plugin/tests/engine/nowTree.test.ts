import { describe, expect, it } from 'vitest';
import { buildTaskRelations, parseWeightTable, taskUnitFrom, type DecisionContext } from '../../src/engine/decisionWeights';
import {
    NOW_TIME_OPTIONS,
    blockOutcomeOf,
    fitsToday,
    nowReasonLine,
    nowSuggestionText,
    placeOptions,
    rankForNow,
    timeChoiceOf,
    timeOptions,
} from '../../src/engine/nowTree';
import { TASK_CONTEXTS } from '../../src/engine/taskContexts';

const TABLE = parseWeightTable({
    pesos: {
        urgencia: { high: 2, normal: 1, low: 0, none: 0 }, prazo: { vencida: 3, hoje: 3, semana: 2 },
        status: { 'in-progress': 2, 'next-action': 0 }, agendada_hoje: 3, semana_ou_smart: 2,
        trava_outras: { cada: 1, maximo: 3 }, par_ignicao_soltar: 1, impacto_divisor: 3, temporada: 1, aprendizado: 1,
    },
}).table;
const CTX: DecisionContext = { hoje: '2026-10-19', semana: '2026-W43', smartsDaVez: [], temporada: [] };
const u = (name: string, fm: Record<string, any> = {}) => taskUnitFrom({ status: 'next-action', ...fm }, `TaskNotes/Tasks/${name}.md`);

describe('as duas perguntas', () => {
    it('os 6 lugares, o último usado primeiro', () => {
        expect(placeOptions()).toEqual([...TASK_CONTEXTS]);
        const opts = placeOptions('📱 Celular');
        expect(opts[0]).toBe('📱 Celular');
        expect([...opts].sort()).toEqual([...TASK_CONTEXTS].sort());
        expect(placeOptions('inventado')).toEqual([...TASK_CONTEXTS]);
    });

    it('15 min, 30 min, 1 h, 2 h ou mais; o último primeiro; "2 h ou mais" sem teto', () => {
        expect(timeOptions()).toEqual(NOW_TIME_OPTIONS.map(o => o.label));
        expect(timeOptions(60)[0]).toBe('⏱️ 1 h');
        expect(timeChoiceOf('⏱️ 2 h ou mais')).toMatchObject({ minutes: 120, cap: null });
        expect(timeChoiceOf('outra')).toBeNull();
    });
});

describe('cabe hoje (o mesmo filtro do 🧭 Aqui e agora)', () => {
    const rel = (units: any[]) => buildTaskRelations(units);
    it('fica de fora: concluída, algum dia, esperando, SMART, recorrente sem instância aberta hoje, futuro, bloqueada', () => {
        const bloqueadora = u('B');
        // Desde 22/10/2026 a recorrente com a instância de hoje aberta entra (plano, seção 4):
        // fica de fora a já concluída hoje e a que não cai hoje (19/10 é segunda).
        const casos = [
            u('feita', { status: 'done' }), u('talvez', { status: 'someday' }), u('espera', { status: 'waiting-on' }),
            u('smart', { type: 'tarefa_smart' }), u('rec', { recurrence: 'FREQ=DAILY', complete_instances: ['2026-10-19'] }),
            u('rec sexta', { recurrence: 'FREQ=WEEKLY;BYDAY=FR', scheduled: '2026-10-23' }),
            u('amanha', { scheduled: '2026-10-20' }), u('w44', { week: '2026-W44' }),
            u('presa', { blockedBy: ['[[B]]'] }),
        ];
        const relations = rel([bloqueadora, ...casos]);
        expect(casos.filter(c => fitsToday(c, CTX, relations)).map(c => c.name)).toEqual([]);
        expect(fitsToday(bloqueadora, CTX, relations)).toBe(true);
        // Quem bloqueava saiu: a tarefa volta a caber.
        expect(fitsToday(u('presa', { blockedBy: ['[[B]]'] }), CTX, rel([u('B', { status: 'done' })]))).toBe(true);
    });
});

describe('a árvore do agora', () => {
    const units = [
        u('Computador curta', { contexts: ['💻 Computador'], timeEstimate: 15, priority: 'normal' }),
        u('Computador longa', { contexts: ['💻 Computador'], timeEstimate: 90, priority: 'high', due: '2026-10-19' }),
        u('Celular', { contexts: ['📱 Celular'], timeEstimate: 15, priority: 'high' }),
        u('Sem lugar', { timeEstimate: 10 }),
        u('Sem estimativa', { contexts: ['💻 Computador'], priority: 'high', status: 'in-progress' }),
        u('Para triar', { status: 'inbox', contexts: ['💻 Computador'], timeEstimate: 5 }),
    ];

    it('filtra pelo lugar e pelo tempo; sem lugar e sem estimativa entram, marcadas', () => {
        const r = rankForNow(units, CTX, TABLE, buildTaskRelations(units), { lugar: '💻 Computador', tempoCap: 30 });
        const names = r.sugestoes.map(i => i.name);
        expect(names).toEqual(['Sem estimativa', 'Computador curta', 'Sem lugar']);
        expect(r.sugestoes.find(i => i.name === 'Sem lugar')!.marcas).toContain('sem lugar');
        expect(r.sugestoes.find(i => i.name === 'Sem estimativa')!.marcas).toContain('sem estimativa');
        expect(r.aTriar.map(i => i.name)).toEqual(['Para triar']);
    });

    it('"2 h ou mais" não corta pelo tempo; sem lugar, todos os lugares', () => {
        const r = rankForNow(units, CTX, TABLE, buildTaskRelations(units), { tempoCap: null });
        expect(r.sugestoes.map(i => i.name)).toContain('Computador longa');
        expect(r.sugestoes.map(i => i.name)).toContain('Celular');
    });

    it('ordem pelos pontos; empate: a mais curta; as 3 primeiras em destaque', () => {
        const r = rankForNow(units, CTX, TABLE, buildTaskRelations(units), {});
        expect(r.sugestoes[0].name).toBe('Computador longa'); // vence hoje (3) + alta (2)
        expect(r.sugestoes.map(i => i.destaque)).toEqual([true, true, true, false, false]);
        const pontos = r.sugestoes.map(i => i.pontos);
        expect([...pontos].sort((a, b) => b - a)).toEqual(pontos);
        // Empate em 2 pontos: "Celular" (15 min) antes de "Sem estimativa" (sem estimativa por último)
        const empate = r.sugestoes.filter(i => i.pontos === 2).map(i => i.name);
        expect(empate).toEqual(['Celular', 'Sem estimativa'].filter(n => empate.includes(n)));
    });

    it('a deixada ontem pelo 🌙 abre a lista, marcada', () => {
        const r = rankForNow(units, CTX, TABLE, buildTaskRelations(units), { pinned: ['Sem lugar'] });
        expect(r.sugestoes[0].name).toBe('Sem lugar');
        expect(r.sugestoes[0].marcas[0]).toBe('🌙 deixada ontem');
    });

    it('a linha do porquê diz os pesos que contaram e as marcas', () => {
        const r = rankForNow(units, CTX, TABLE, buildTaskRelations(units), {});
        const line = nowReasonLine(r.sugestoes[0]);
        expect(line).toContain('⏰ vence hoje +3');
        expect(line).toContain('❗ urgência alta +2');
        const texto = nowSuggestionText(r.sugestoes[0]);
        expect(texto.title.startsWith('⭐ ')).toBe(true);
        expect(nowSuggestionText(r.aTriar[0]).title.startsWith('📥 a triar · ')).toBe(true);
    });

    it('lista vazia e entrada vazia não lançam', () => {
        expect(rankForNow([], CTX, TABLE, buildTaskRelations([]), {})).toEqual({ sugestoes: [], aTriar: [] });
    });
});

describe('se o bloco saiu', () => {
    const rec = { caminho: 'TaskNotes/Tasks/🔥 roteiro.md', tarefa: '🔥 roteiro', data: '2026-10-19' };
    it('concluída, 📤 do par concluído desde o dia do bloco, ou nada', () => {
        expect(blockOutcomeOf(rec, [u('🔥 roteiro', { status: 'done' })])).toBe('concluída');
        expect(blockOutcomeOf(rec, [u('🔥 roteiro'), u('📤 x', { peca: 'soltar', status: 'done', blockedBy: ['[[🔥 roteiro]]'], completedDate: '2026-10-19' })])).toBe('📤');
        expect(blockOutcomeOf(rec, [u('🔥 roteiro'), u('📤 x', { peca: 'soltar', status: 'done', blockedBy: ['[[🔥 roteiro]]'], completedDate: '2026-10-01' })])).toBe('nada');
        expect(blockOutcomeOf(rec, [])).toBe('nada');
    });
});

describe('as SMART da semana para a tarefa nova (decisão de 19/10)', () => {
    it('só as abertas da semana, a da vez (em andamento) primeiro', async () => {
        const { smartsDaSemanaDe } = await import('../../src/engine/nowTree');
        const u = (name: string, over: any) => ({ name, path: `TaskNotes/Tasks/${name}.md`, type: 'tarefa_smart', status: 'next-action', week: '2026-W43', archived: false, projects: [], ...over });
        const units: any[] = [
            u('B livro', {}), u('A vez', { status: 'in-progress' }), u('Feita', { status: 'done' }),
            u('Outra semana', { week: '2026-W42' }), u('Arquivada', { archived: true }),
            { ...u('Ação', {}), type: 'task' },
        ];
        expect(smartsDaSemanaDe(units, '2026-W43')).toEqual(['A vez', 'B livro']);
    });
});
