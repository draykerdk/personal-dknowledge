/**
 * Semantica canonica das tarefas DFM.
 *
 * - status: executabilidade / estado do fluxo
 * - priority: urgencia operacional atual
 * - impacto: importancia estrategica (escala 1-10)
 *
 * Valores textuais antigos continuam aceitos para que tarefas historicas nao percam
 * telemetria durante a migracao para a escala numerica do TaskNotes.
 */
import { diaEHoraNoInicio } from './dia';

export function parseImpactScore(raw: unknown): number | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(1, Math.min(10, numeric));

    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'critico' || normalized === 'crítico') return 10;
    if (normalized === 'alto' || normalized === 'alta') return 8;
    if (normalized === 'medio' || normalized === 'médio' || normalized === 'media' || normalized === 'média') return 5;
    if (normalized === 'baixo' || normalized === 'baixa') return 3;
    return null;
}

export function isHighImpact(raw: unknown): boolean {
    const score = parseImpactScore(raw);
    return score !== null && score >= 7;
}

export function impactMultiplier(raw: unknown): number {
    const score = parseImpactScore(raw);
    if (score === null || score <= 3) return 1;
    if (score <= 6) return 2;
    if (score <= 8) return 3;
    return 5;
}

/**
 * Estados terminais: a tarefa saiu do fluxo aberto e virou fato.
 *
 * Mora aqui, e não no agregador, porque **três** módulos precisam da mesma
 * resposta — o snapshot, o plano e o grafo. Enquanto ela vivia em
 * `missionControl.ts`, `missionPlan` e `missionGraph` tinham que importar de lá,
 * e o agregador importava os dois de volta: ciclo de importação que deixava
 * `buildWeekPlan` indefinido em tempo de execução conforme a ordem de carga.
 * Semântica de tarefa pertence ao módulo de semântica de tarefa.
 */
export const TERMINAL_STATUSES: ReadonlyArray<string> = ['done', 'completed', 'cancelled', 'canceled'];

export function isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.includes(String(status || '').toLowerCase());
}

/**
 * Estimativa de duração em minutos (`timeEstimate` do TaskNotes).
 *
 * Aceita o número de minutos que o TaskNotes grava e o texto de nota antiga
 * (`"90 min"`, `"1h30"`, `"2 h"`). Texto solto vira `null`, não chute.
 *
 * Devolve `null` quando nada foi declarado: ausência de estimativa é ausência de
 * dado, nunca zero — um zero silencioso encolheria a carga da semana e faria o
 * plano parecer mais leve do que ele é.
 */
export function parseMinutes(raw: unknown): number | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null || value === '') return null;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 0 ? Math.round(numeric) : null;

    const text = String(value).trim().toLowerCase();
    const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h/);
    const minutes = text.match(/(\d+)\s*m/);
    if (!hours && !minutes) return null;
    const total = (hours ? Number(hours[1].replace(',', '.')) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
    return total > 0 ? Math.round(total) : null;
}

/**
 * Divide `scheduled` em data e hora declaradas.
 *
 * O campo aceita `YYYY-MM-DD` (dia inteiro) e `YYYY-MM-DDTHH:mm` (bloco com
 * hora). O plano precisa das duas leituras: a data coloca a tarefa no dia, a
 * hora coloca no bloco. Sem hora, a tarefa é do dia e não de um horário — o
 * console não inventa 09:00 só para preencher a grade.
 */
export function parseSchedule(raw: unknown): { date: string; time: string } {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = String(value ?? '').trim();
    const { dia, hora } = diaEHoraNoInicio(text);
    return { date: dia, time: hora };
}

/** O valor de `natureza` da SMART de manutenção de rotina (proposta da viagem nos ciclos, 29/10, §3). */
export const NATUREZA_MANUTENCAO = 'manutencao';

/**
 * O que faz: a SMART é de manutenção de rotina (`natureza: manutencao`); sem o campo, ou com outro valor,
 * é a estratégica de sempre.
 * Por quê: decidido em 29/10/2026 (a proposta da viagem nos ciclos, §3 e §10.2): é um tipo de SMART de
 * manutenção de rotina, marcado num campo separado. A de manutenção não
 * conta nas "até 3 SMART da semana": o 🌳, o 🎯 e a Missão a mostram à parte. Um teste só para todos.
 * Entra → sai: o registro (a TaskNote lida, o `TaskUnit` ou o frontmatter) → sim ou não.
 * Erro e ataque: caixa e espaços não contam; lista com o valor (o YAML de lista) conta; nada, `null` ou
 * outro valor é estratégica.
 * Prova: tests/engine/manutencao.test.ts.
 */
export function ehManutencao(registro: { natureza?: unknown } | null | undefined): boolean {
    const valores = Array.isArray(registro?.natureza) ? registro!.natureza as unknown[] : [registro?.natureza];
    return valores.some(v => String(v ?? '').trim().toLowerCase() === NATUREZA_MANUTENCAO);
}
