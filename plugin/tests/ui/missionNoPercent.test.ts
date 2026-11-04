/**
 * O painel e os widgets do canvas mostram contagens, nunca porcentagem (regra de 16/10),
 * e toda linha de contagem de tarefas sai da função única (`engine/showGrammar.ts`, 22/10).
 *
 * Os cartões antigos hospedados no painel ("Projetos por tarefa" e os projetos em foco do
 * cartão da semana) mostravam "concluídas/total" e um medidor de porcentagem; os widgets
 * `projeto`, `projetos` e a consulta em `progresso` mostravam "%" e barra. O DOM desses
 * cartões não roda aqui sem o Obsidian; o contrato é lido no código: a função que desenha
 * cada um chama a forma de mostrar e não monta mais medidor, porcentagem nem "x/y".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8');

/** O corpo de uma função (do nome até a próxima função de topo). */
function body(text: string, name: string): string {
    const start = text.indexOf(`function ${name}(`);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const rest = text.slice(start + 1);
    const next = rest.search(/\n(?:export )?(?:async )?function /);
    return next < 0 ? rest : rest.slice(0, next);
}

describe('sem porcentagem no painel e no canvas', () => {
    it('o cartão hospedado no painel usa a forma de mostrar, sem medidor nem "concluídas/total"', () => {
        // O outro (ui/mission/panelCycles.ts, projectRow) saiu em 03/11/2026 com o código aposentado.
        for (const [file, fn] of [['ui/mission/panelStructure.ts', 'projectBlock']] as const) {
            const code = body(read(file), fn);
            expect(code, `${file} ${fn}`).toContain('missionProjectGrammar(project, ctx.snapshot.quarter');
            expect(code, `${file} ${fn}`).not.toMatch(/meter\(|progressPercent|project\.completed|%`/);
        }
    });

    it('os widgets projeto, projetos e a consulta em progresso não desenham porcentagem nem barra', () => {
        const render = read('board/boardRender.ts');
        for (const fn of ['renderProjeto', 'renderProjetos']) {
            expect(body(render, fn), fn).not.toMatch(/percent|bar\(|%`|concluídas/);
        }
        const progresso = render.slice(render.indexOf("case 'progresso'"), render.indexOf("case 'kanban'"));
        expect(progresso).toContain('result.progress.text');
        expect(progresso).not.toMatch(/\* 100|%`|concluídas|bar\(/);
        expect(render).not.toMatch(/function bar\(/);
    });

    it('os hábitos contam vezes e dias, sem adesão em % nem barra de meta (25/10/2026)', () => {
        // O hábito conta na semana, sem sequência (núcleo, 4.4): o painel e o widget
        // mostram "N vezes na semana" e "N de M dias", nunca uma taxa.
        const tracker = body(read('ui/mission/panelHabits.ts'), 'renderTracker');
        expect(tracker).not.toMatch(/unit: '%'|taxaAdesao|percent/);
        expect(tracker).toContain('execucoesSemana');
        expect(read('ui/mission/panelHabits.ts')).not.toMatch(/ratioTone/);
        const widget = body(read('board/boardRender.ts'), 'renderHabitos');
        expect(widget).not.toMatch(/\* 100|%`|goal-bar|goal-fill|\$\{row\.week\}\/\$\{row\.target\}/);
        expect(widget).toContain('habitWeekText(row.week, row.target)');
        const engine = read('engine/habits.ts');
        expect(engine).not.toMatch(/adherenceRate|taxaAdesao|\* 100\)/);
    });

    it('a linha da SMART no canvas sai da função única, sem a barra ▰▱', () => {
        const color = read('canvas/taskColor.ts');
        const line = body(color, 'progressLine');
        expect(line).toContain('showGrammar(children, SMART_HORIZON');
        expect(line).not.toMatch(/[▰▱]|ações`/);
    });
});

describe('habitWeekText: a semana do hábito em contagem', () => {
    it('diz as vezes na semana e a meta, sem razão nem porcentagem', async () => {
        const { habitWeekText } = await import('../../src/board/boardRender');
        expect(habitWeekText(0, 5)).toBe('nenhuma vez na semana · meta 5');
        expect(habitWeekText(1, 5)).toBe('1 vez na semana · meta 5');
        expect(habitWeekText(3, 5)).toBe('3 vezes na semana · meta 5');
        expect(habitWeekText(6, 5)).toBe('6 vezes na semana · meta 5');
        expect(habitWeekText(2, null)).toBe('2 vezes na semana');
        for (const text of [habitWeekText(3, 5), habitWeekText(5, 5)]) expect(text).not.toMatch(/%|\//);
    });
});
