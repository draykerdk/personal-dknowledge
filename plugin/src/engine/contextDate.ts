/**
 * O período de uma semana ISO (`AAAA-Www`) ou de um trimestre (`AAAA-Qn`) e o dia de contexto dele:
 * hoje, se hoje cai no período; senão, o primeiro dia. É a regra da nota de ciclo aberta
 * (`JSONProtocol.getContextDate`) e do reparo das notas de período (`temporal/periodNoteRepair.ts`).
 *
 * A parte do canvas temporal (o protocolo rodado de dentro de um `AAAA-Www.canvas` ou `AAAA-Qn.canvas`,
 * e a tarefa criada nele com a `week` do canvas) saiu em 03/11/2026 com o código aposentado: os canvas
 * da semana e do trimestre se aposentaram em 02/11/2026, e o "+ Nova tarefa" do ramo da semana da
 * Missão já nasce com a `week` (inventário 4.8).
 *
 * Módulo puro: sem Obsidian.
 */
import { diaMais, partesDoTrimestre, segundaDaSemana } from './periodo';

export type TemporalCanvas = { kind: 'week'; id: string } | { kind: 'quarter'; id: string };

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Primeiro e último dia (inclusive) de uma semana ISO ou de um trimestre. */
export function periodOf(target: TemporalCanvas): { start: string; end: string } | null {
    if (target.kind === 'week') {
        // A segunda-feira tem um dono só (`periodo.segundaDaSemana`; item 10 do roteiro).
        const monday = segundaDaSemana(target.id);
        const sunday = monday ? diaMais(monday, 6) : null;
        return monday && sunday ? { start: monday, end: sunday } : null;
    }
    const p = partesDoTrimestre(target.id);
    if (!p) return null;
    const year = p.ano;
    const q = p.trimestre;
    const start = new Date(Date.UTC(year, (q - 1) * 3, 1));
    const end = new Date(Date.UTC(year, q * 3, 0));
    return { start: iso(start), end: iso(end) };
}

/**
 * O dia de contexto de uma semana ou trimestre: hoje, se hoje cai no período; senão,
 * o primeiro dia dele. É a regra da nota de ciclo aberta
 * (`JSONProtocol.getContextDate`) e do reparo das notas de período
 * (`temporal/periodNoteRepair.ts`). Período ilegível → `null`.
 */
export function contextDayOf(target: TemporalCanvas, today: string): string | null {
    const period = periodOf(target);
    if (!period) return null;
    return today >= period.start && today <= period.end ? today : period.start;
}
