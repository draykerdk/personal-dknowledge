/**
 * As tarefas num período (engine/tarefasNoPeriodo.ts): a carga do dia contra o Bloco Sagrado e a forma de
 * mostrar. As provas vieram dos testes do canvas da semana, que se aposentou em 02/11/2026 (aposentadoria,
 * fase 2): as contas ficaram e mudaram de casa; as provas vão com elas.
 */
import { describe, expect, it } from 'vitest';
import { dayLoad, dayOverText, hoursText, loadText, overCapacity, parseBlockMinutes, releasedInWeek, weekLoadSummary } from '../../src/engine/tarefasNoPeriodo';
import type { BlockTask } from '../../src/engine/tarefasNoPeriodo';

function t(basename: string, over: Partial<BlockTask> = {}): BlockTask {
    return { path: `T/${basename}.md`, basename, type: 'task', status: 'next-action', projects: [], due: '', week: '', completedDate: '', scheduled: '', ...over };
}

describe('capacidade: o Bloco Sagrado em minutos, lido do texto livre', () => {
    it.each([
        ['8h–10h30', 150],
        ['08:00-10:30', 150],
        ['8h às 10h', 120],
        ['23h-1h', 120],
        ['2h', 120],
        ['2h30', 150],
        ['2,5 h', 150],
        ['150 min', 150],
        ['90min', 90],
        ['1h30min', 90],
        ['7h30 · 90 min · celular em outro cômodo', 90],
        // Início e duração em horas: a hora de início não vira capacidade (15/10/2026).
        ['7h30 · 2h', 120],
        ['7h30 · 1h30 · celular fora', 90],
        ['7h, 2 horas', 120],
        ['das 7h até as 9h', 120],
        ['das 7h até às 9h', 120],
        ['das 7 às 9', 120],
        ['7h30–9h', 90],
        ['7h30 · 90 min', 90],
        ['manhã inteira, antes do celular', null],
        ['', null],
        [undefined, null],
        ['8-10', null],
        ['30h', null],
        // Duração antes do início, em qualquer ordem (16/10/2026): a hora de início
        // não vira capacidade; dois blocos no dia somam; por extenso também vale.
        ['1h30 a partir das 7h', 90],
        ['2h começando às 7h30', 120],
        ['8h a 10h e 14h a 15h', 180],
        ['7h30 · uma hora e meia', 90],
        ['às 7h, celular fora', null],
        ['meia hora', 30],
        // Horas e minutos separados, "e meia" depois de número e início – duração
        // (16/10/2026): antes davam 30, 60, 120 ou 1140.
        ['1h 30min', 90],
        ['1h e 30min', 90],
        ['2 horas e 30 minutos', 150],
        ['7h30 · 1h 30min · celular fora', 90],
        ['das 7h30 por 1h 30min', 90],
        ['1 hora e meia', 90],
        ['7h30, 1 hora e meia', 90],
        ['2 horas e meia', 150],
        ['2h e meia', 150],
        ['7h – 2h', 120],
    ])('%s → %s', (raw, minutes) => {
        expect(parseBlockMinutes(raw)).toBe(minutes);
    });
});

describe('carga do dia', () => {
    const tasks = [
        t('Gravar', { scheduled: '2026-10-14', timeEstimate: 90, peca: 'ignicao' }),
        t('Publicar', { scheduled: '2026-10-14', timeEstimate: 50, peca: 'soltar', status: 'done' }),
        t('Responder', { scheduled: '2026-10-14' }),
        t('Cancelada', { scheduled: '2026-10-14', timeEstimate: 300, status: 'cancelled' }),
        t('SMART', { type: 'tarefa_smart', scheduled: '2026-10-14', timeEstimate: 600 }),
        t('Outro dia', { scheduled: '2026-10-15', timeEstimate: 25 }),
    ];

    it('soma as ações do dia (abertas e concluídas); sem estimativa conta à parte, nunca como zero', () => {
        expect(dayLoad('2026-10-14', tasks)).toEqual({ date: '2026-10-14', minutes: 140, actions: 3, noEstimate: 1 });
    });

    it('"⏱ X h de Y h", o alerta quando passa e a ausência do bloco sem número inventado', () => {
        const load = dayLoad('2026-10-14', tasks);
        expect(hoursText(25)).toBe('25 min');
        expect(hoursText(150)).toBe('2,5 h');
        expect(hoursText(120)).toBe('2 h');
        expect(loadText(load, 150)).toBe('⏱ 2,3 h de 2,5 h\n+1 sem estimativa');
        expect(loadText(load, 120)).toBe('⏱ 2,3 h de 2 h · passa do bloco\n+1 sem estimativa');
        expect(loadText(load, null)).toBe('⏱ 2,3 h\n+1 sem estimativa');
        expect(overCapacity(load, 120)).toBe(true);
        expect(overCapacity(load, null)).toBe(false);
    });

    it('resumo da semana: planejado, bloco e dias acima; sem duração, a ausência em palavras', () => {
        expect(weekLoadSummary('2026-W42', tasks, '2h')).toBe('**⏱ Carga** · planejado 2,8 h (+1 sem estimativa) · bloco 2 h/dia · acima do bloco: qua 14');
        expect(weekLoadSummary('2026-W42', tasks, '')).toBe('**⏱ Carga** · planejado 2,8 h (+1 sem estimativa) · bloco sem duração na nota da semana');
        expect(weekLoadSummary('2026-W42', tasks, 'manhã')).toContain('bloco sem duração legível ("manhã")');
        expect(weekLoadSummary('2026-W42', tasks, undefined, false)).toContain('bloco: nota da semana não criada');
    });

    it('o aviso da seta dia → ação diz quando o dia passa do bloco, contando a ação que chega', () => {
        const chega = t('Editar', { timeEstimate: 50 });
        expect(dayOverText('2026-10-15', tasks, '1h', chega)).toBe(' · o dia passa de 1 h (1,3 h agendadas)');
        expect(dayOverText('2026-10-15', tasks, '2h', chega)).toBe('');
        expect(dayOverText('2026-10-15', tasks, '', chega)).toBe('');
    });
});

// A prova de `releasedInWeek` morava em tests/temporal/creationLoad.test.ts, com a célula do canvas do
// trimestre; o canvas saiu em 03/11/2026 com o código aposentado, e a conta (que a Missão lê) fica aqui.
describe('"📤 N no ar"', () => {
    it('📤 concluídas na semana (pela data de conclusão; sem ela, pela week)', () => {
        const tasks = [
            t('Publicou', { peca: 'soltar', status: 'done', completedDate: '2026-10-13', week: '2026-W41' }),
            t('Subiu', { peca: 'soltar', status: 'done', week: '2026-W42' }),
            t('Aberta', { peca: 'soltar', week: '2026-W42' }),
            t('Ignição feita', { peca: 'ignicao', status: 'done', completedDate: '2026-10-13' }),
            t('Semana seguinte', { peca: 'soltar', status: 'done', completedDate: '2026-10-19' }),
        ];
        expect(releasedInWeek('2026-W42', tasks).map(x => x.basename)).toEqual(['Publicou', 'Subiu']);
        expect(releasedInWeek('2026-W40', tasks)).toEqual([]);
    });
});
