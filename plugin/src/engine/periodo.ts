/**
 * A semana (`AAAA-Www`) e o trimestre (`AAAA-Qn`) escritos: a forma única do plugin inteiro.
 *
 * Por quê: o item 10 da fila (Arquitetura e Roteiro, §6), "um dono para as semanas e os trimestres
 * no texto", como o dia ganhou em 30/10 (`engine/dia.ts`). As regex da semana e do trimestre estavam
 * escritas à mão cerca de 80 vezes em 40 arquivos, em duas formas: a frouxa (`W\d{2}`, que aceitava
 * `W00` e `W99`) e a estrita (`W01` a `W53`). Aqui mora a estrita, a única: semana fora de 01–53 não
 * existe, e o leitor que a aceitava a jogava adiante como se existisse. O que fica escrito fora daqui
 * é outra forma (o id de um nó, o sufixo de um título, a pasta dos canvas), com a linha do porquê no
 * lugar e na lista do guarda tests/engine/periodoSemCopia.test.ts.
 *
 * Módulo puro: sem DOM, sem cofre, sem relógio. Prova: tests/engine/periodo.test.ts.
 */

/** A semana ISO escrita, `AAAA-Www`, de `W01` a `W53`, inteira. Sem a flag `g`: o `test` não guarda estado. */
export const SEMANA = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** O trimestre escrito, `AAAA-Qn`, de `Q1` a `Q4`, inteiro. */
export const TRIMESTRE = /^\d{4}-Q[1-4]$/;

/**
 * O que faz: diz se o texto é uma semana escrita (`AAAA-Www`, `W01` a `W53`).
 * Por quê: o teste da semana estava escrito à mão em cerca de 40 leitores, metade frouxo (`W\d{2}`).
 * Erro e ataque: vazio, link (`[[2026-W45]]`), espaço na ponta, `W00` ou `W54` dão `false`; não-texto vira texto.
 * Prova: tests/engine/periodo.test.ts.
 */
export function ehSemana(texto: unknown): boolean {
    return SEMANA.test(String(texto ?? ''));
}

/**
 * O que faz: diz se o texto é um trimestre escrito (`AAAA-Qn`, `Q1` a `Q4`).
 * Por quê: o teste do trimestre estava escrito à mão em cerca de 25 leitores.
 * Erro e ataque: vazio, `Q0`, `Q5`, link ou espaço na ponta dão `false`.
 * Prova: tests/engine/periodo.test.ts.
 */
export function ehTrimestre(texto: unknown): boolean {
    return TRIMESTRE.test(String(texto ?? ''));
}

/**
 * O que faz: a semana, se o texto é uma; senão ''.
 * Por quê: o "campo `week` ou nada" estava escrito como `.match(...)?.[0] ?? ''` em vários leitores.
 * Erro e ataque: a semana com link ou fora de 01–53 dá ''; não-texto vira texto.
 * Prova: tests/engine/periodo.test.ts.
 */
export function semanaOuVazio(texto: unknown): string {
    const t = String(texto ?? '');
    return SEMANA.test(t) ? t : '';
}

/**
 * O que faz: o trimestre, se o texto é um; senão ''.
 * Por quê: o "campo `quarter` ou nada", gêmeo de `semanaOuVazio`.
 * Erro e ataque: o trimestre com link ou fora de Q1–Q4 dá ''.
 * Prova: tests/engine/periodo.test.ts.
 */
export function trimestreOuVazio(texto: unknown): string {
    const t = String(texto ?? '');
    return TRIMESTRE.test(t) ? t : '';
}

/**
 * O que faz: os números da semana escrita (`2026-W45` → `{ ano: 2026, semana: 45 }`); fora da forma, `null`.
 * Por quê: a conta da segunda-feira da semana lia os grupos de uma regex própria em cada arquivo.
 * Erro e ataque: fora da forma estrita dá `null`; o número não passa de 53 (o ano com 52 semanas fica com quem conta).
 * Prova: tests/engine/periodo.test.ts.
 */
export function partesDaSemana(texto: unknown): { ano: number; semana: number } | null {
    const t = String(texto ?? '');
    if (!SEMANA.test(t)) return null;
    return { ano: Number(t.slice(0, 4)), semana: Number(t.slice(6)) };
}

/**
 * O que faz: os números do trimestre escrito (`2026-Q4` → `{ ano: 2026, trimestre: 4 }`); fora da forma, `null`.
 * Por quê: o deslocamento e os limites do trimestre liam os grupos de uma regex própria em cada arquivo.
 * Erro e ataque: fora da forma dá `null`.
 * Prova: tests/engine/periodo.test.ts.
 */
export function partesDoTrimestre(texto: unknown): { ano: number; trimestre: number } | null {
    const t = String(texto ?? '');
    if (!TRIMESTRE.test(t)) return null;
    return { ano: Number(t.slice(0, 4)), trimestre: Number(t.slice(6)) };
}

/**
 * O que faz: a primeira semana escrita em qualquer lugar do texto (`[[2026-W45]]`, `2026-W45.md`); sem uma, ''.
 * Por quê: o nome da nota de período (`2026-W45 - Review`) e o link pediam a semana de dentro do texto.
 * Erro e ataque: `W00` e `W54` não contam; dígito colado antes do ano (`12026-W45`) não conta.
 * Prova: tests/engine/periodo.test.ts.
 */
export function semanaNoTexto(texto: unknown): string {
    return /(?<!\d)(\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3]))(?!\d)/.exec(String(texto ?? ''))?.[1] ?? '';
}

/**
 * O que faz: o primeiro trimestre escrito em qualquer lugar do texto (`2026-Q4.canvas`); sem um, ''.
 * Por quê: o gêmeo de `semanaNoTexto`, para o nome da nota e o link do trimestre.
 * Erro e ataque: `Q0`, `Q5` e dígito colado antes do ano não contam.
 * Prova: tests/engine/periodo.test.ts.
 */
export function trimestreNoTexto(texto: unknown): string {
    return /(?<!\d)(\d{4}-Q[1-4])(?!\d)/.exec(String(texto ?? ''))?.[1] ?? '';
}

/**
 * O que faz: o trimestre do nome de um canvas de trimestre (`…/2026-Q4.canvas` → `2026-Q4`); sem ele, ''.
 * Por quê: a mesma leitura do caminho estava escrita à mão no quadro, na barra do canvas e no gestor do trimestre.
 * Erro e ataque: sem `.canvas` no fim, ou com dígito colado antes do ano, dá ''.
 * Prova: tests/engine/periodo.test.ts.
 */
export function trimestreDoCanvas(caminho: unknown): string {
    return /(?<!\d)(\d{4}-Q[1-4])\.canvas$/.exec(String(caminho ?? ''))?.[1] ?? '';
}

/**
 * O que faz: a segunda-feira da semana ISO escrita, `AAAA-MM-DD` (`2026-W45` → `2026-11-02`); fora da forma, `null`.
 * Por quê: o item 10 da fila (Arquitetura e Roteiro, §6): a conta da segunda-feira estava escrita à mão em
 * quatro arquivos (`board/queryModel.ts`, `engine/contextDate.ts`, `temporal/quarterCanvasModel.ts`,
 * `temporal/weekBlockModel.ts`). A conta: o 4 de janeiro está sempre na semana 1; a segunda dela, mais 7 dias
 * por semana. Em UTC, sem relógio nem fuso.
 * Entra → sai: a semana escrita → a data da segunda-feira, ou `null`.
 * Erro e ataque: fora da forma estrita (vazio, link, `W00`, `W54`) dá `null`. A `W53` de um ano com 52 semanas
 * não é recusada: dá a segunda da `W01` do ano seguinte, como as quatro cópias davam; quem precisa recusar
 * confere o número pelo ano (`engine/missionPlan.ts`, `weekBounds`).
 * Prova: tests/engine/periodo.test.ts ("a segunda-feira da semana").
 */
export function segundaDaSemana(texto: unknown): string | null {
    const p = partesDaSemana(texto);
    if (!p) return null;
    const jan4 = new Date(Date.UTC(p.ano, 0, 4));
    const segunda = new Date(jan4);
    segunda.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (p.semana - 1) * 7);
    return segunda.toISOString().slice(0, 10);
}

/**
 * O que faz: o dia `n` dias depois (ou antes, com `n` negativo) de um dia `AAAA-MM-DD`, em UTC.
 * Por quê: quem lê a semana a partir da segunda (os sete dias, o domingo, a quinta-feira do trimestre) somava
 * os dias à mão sobre um `Date`; a soma mora junto da segunda-feira.
 * Entra → sai: o dia e o deslocamento → o dia, `AAAA-MM-DD`.
 * Erro e ataque: dia ilegível dá `null`; o deslocamento que não é inteiro conta pela parte inteira.
 * Prova: tests/engine/periodo.test.ts ("a segunda-feira da semana").
 */
export function diaMais(dia: string, n: number): string | null {
    const d = new Date(`${String(dia ?? '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + Math.trunc(Number(n) || 0));
    return d.toISOString().slice(0, 10);
}
