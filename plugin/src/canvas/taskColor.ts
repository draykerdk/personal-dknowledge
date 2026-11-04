/**
 * A cor de uma tarefa no canvas — uma regra só, para zona gerida e formatador.
 *
 * A cor diz **onde a tarefa está no fluxo**, e o que pede atenção vence:
 * vencida (vermelho) > concluída (verde) > bloqueada/esperando (amarelo) >
 * em execução (laranja) > próxima ação (roxo) > inbox (ciano). A SMART é
 * pintada pelo avanço das ações dela: nenhuma começada (roxo), andando
 * (laranja), todas feitas (verde).
 *
 * Prioridade não pinta: ela mora no campo e nos widgets. Pintar por prioridade
 * escondia o progresso (em execução e vencida ficavam iguais).
 */
import { SMART_HORIZON, showGrammar } from '../engine/showGrammar';

export const CANVAS_COLOR = { red: '1', orange: '2', yellow: '3', green: '4', cyan: '5', purple: '6' } as const;

export interface ColorTask {
    status: string;
    due?: string;
    type?: string;
    /** O horizonte da ação (a forma de mostrar da SMART lê `week` e `scheduled`). */
    week?: string;
    scheduled?: string;
}

const DONE = new Set(['done', 'completed', 'complete']);

export function taskColor(task: ColorTask, today: string, opts: { children?: ColorTask[]; blocked?: boolean } = {}): string | undefined {
    const status = String(task.status ?? '').toLowerCase();
    if (DONE.has(status)) return CANVAS_COLOR.green;
    // "Algum dia" está fora da grade: um prazo antigo nela não é atraso de agora
    // (a grade da semana, as células do trimestre e o painel já a tiram da conta).
    if (status === 'cancelled' || status === 'someday') return undefined;
    if (task.due && task.due < today) return CANVAS_COLOR.red;

    if (task.type === 'tarefa_smart' && opts.children && opts.children.length) {
        const kids = opts.children.filter(c => String(c.status).toLowerCase() !== 'cancelled');
        if (kids.length && kids.every(c => DONE.has(String(c.status).toLowerCase()))) return CANVAS_COLOR.green;
        if (kids.some(c => DONE.has(String(c.status).toLowerCase()) || String(c.status).toLowerCase() === 'in-progress')) return CANVAS_COLOR.orange;
        return CANVAS_COLOR.purple;
    }

    if (status === 'waiting-on' || status === 'blocked' || opts.blocked) return CANVAS_COLOR.yellow;
    if (status === 'in-progress') return CANVAS_COLOR.orange;
    if (status === 'next-action') return CANVAS_COLOR.purple;
    return CANVAS_COLOR.cyan;
}

/**
 * O avanço de uma SMART: ações feitas sobre as ações dela, sem as canceladas.
 * Uma conta só para a linha da zona, a cor e o cartão (Fase 5 do plano do
 * canvas): antes o cartão contava só `done` e a zona contava também `completed`.
 */
export function childProgress(children: readonly ColorTask[]): { done: number; total: number; pct: number } {
    const kids = children.filter(c => String(c.status).toLowerCase() !== 'cancelled');
    const done = kids.filter(c => DONE.has(String(c.status).toLowerCase())).length;
    return { done, total: kids.length, pct: kids.length ? Math.round((done / kids.length) * 100) : 0 };
}

/**
 * O que faz: o avanço de uma SMART em uma linha, na forma de mostrar (a função única,
 * `engine/showGrammar.ts`, no horizonte da SMART, o mesmo do cartão) e o prazo:
 * `3 feitas · 3/5 do plano · faltam 2 · vence 17/09`.
 * Por quê: a barra `▰▱` e o `3/5 ações` eram porcentagem desenhada e `x/y` montado aqui;
 * desde 16/10 a regra é contagem sem porcentagem, e desde 22/10 a linha sai da função única.
 * Prova: tests/canvas/taskGraph.test.ts.
 */
export function progressLine(children: ColorTask[], today: string, due?: string): string {
    const { done, total } = childProgress(children);
    const parts = [showGrammar(children, SMART_HORIZON, 'sem ações ainda').text];
    if (due) {
        const [, m, d] = due.split('-');
        // Sem ação nenhuma também "venceu": "vence 30/09" em 15/10 falava do passado no futuro.
        parts.push(due < today && (total === 0 || done < total) ? `venceu ${d}/${m}` : `vence ${d}/${m}`);
    }
    return parts.join(' · ');
}
