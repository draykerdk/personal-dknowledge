/**
 * As contas do dia da projeção do Mission Control: o dia escrito virado data em UTC, a volta, o
 * passo de N dias e os dias entre duas datas. Aritmética de Date em UTC, sem moment.
 *
 * Por quê: o passo `contasDoDia` da divisão do motor (tests/engine/modeloMotor.test.ts). O plano
 * (missionPlan) e a intenção (missionIntent) escreviam cada um as quatro contas, com o mesmo
 * corpo (a cópia vigiada `copia:contas-do-dia`); aqui elas moram num lugar só, e os dois as
 * importam.
 *
 * Módulo puro: sem relógio, sem cofre.
 */

import { partesDoDia } from './dia';

/** Um dia em milissegundos. */
export const DAY_MS = 86_400_000;

/**
 * O que faz: `YYYY-MM-DD` → `Date` na meia-noite UTC, ou `null`.
 * Por quê: o round-trip existe porque `Date.UTC(2026, 1, 30)` não falha: rola para março. Data
 * que não existe no calendário é ausência de dado, não uma data plausível inventada pelo runtime.
 * Entra → sai: texto → `Date` (UTC) ou `null`.
 * Erro e ataque: espaço nas pontas sai; hora junto, vazio ou dia que não existe dão `null`.
 */
export function parseDay(value: string): Date | null {
    const partes = partesDoDia(String(value ?? '').trim());
    if (!partes) return null;
    const { ano: year, mes: month, dia: day } = partes;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
}

/** O que faz: `Date` → `YYYY-MM-DD`, pelo dia em UTC. */
export function isoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** O que faz: a data `days` dias depois (ou antes, com negativo), em passos de 24 h UTC. */
export function shiftDay(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

/**
 * O que faz: os dias inteiros entre duas datas ISO; `null` quando alguma não é legível.
 * Entra → sai: (de, até) `YYYY-MM-DD` → dias (negativo quando `até` vem antes) ou `null`.
 * Prova: tests/engine/missionIntent.test.ts e tests/contracts/vaultIntent.test.ts.
 */
export function daysBetween(from: string, to: string): number | null {
    const start = parseDay(from);
    const end = parseDay(to);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}
