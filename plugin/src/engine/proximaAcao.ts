/**
 * A próxima ação fixada de um projeto: o campo `proxima_acao_real:` da nota do projeto, lido e achado entre
 * as candidatas.
 *
 * Por quê: o inventário da aposentadoria (02/11, seção O que se reaproveita, item 2): a nota do projeto pode
 * fixar a próxima ação, e a fixada vence a escolha da ordem, dita como fixada (a inferência nunca se
 * apresenta como declaração). As duas peças moravam no painel antigo (`missionCanvas.declaredNextAction`
 * e o começo de `missionIntent.nextRealAction`); mudaram de casa para cá, e o painel antigo e a Missão
 * leem daqui. A ordem das outras não mora aqui: a Missão usa a ordem padrão dela, e o painel antigo a sua.
 *
 * Funções puras. Prova: tests/engine/proximaAcao.test.ts.
 */
import { normalizeLink } from './noteLink';

/** O campo da nota do projeto que fixa a próxima ação. */
export const CAMPO_DA_PROXIMA_ACAO = 'proxima_acao_real';

/**
 * O que faz: lê a próxima ação fixada no frontmatter da nota do projeto (`proxima_acao_real:`), como o nome
 * ou o caminho que o link aponta.
 * Por quê: o campo é opcional; sem ele, a próxima ação é a da ordem, e a falta do campo não é falha.
 * Entra → sai: o frontmatter → o nome (`[[Tarefa|apelido]]` → `Tarefa`), ou vazio.
 * Erro e ataque: sem o campo, `null` ou lixo dão vazio; uma lista vale pelo primeiro item.
 * Prova: tests/engine/missionCanvas.test.ts ("declaredNextAction") e tests/engine/proximaAcao.test.ts.
 */
export function declaredNextAction(frontmatter: Record<string, unknown> | undefined): string {
    const raw = frontmatter?.[CAMPO_DA_PROXIMA_ACAO];
    if (raw === undefined || raw === null) return '';
    return normalizeLink(Array.isArray(raw) ? raw[0] : raw);
}

/** O que faz: a chave comparável de um nome ou caminho de nota: sem `.md`, sem caixa, sem espaço nas pontas. */
const chaveDaNota = (v: unknown) => String(v ?? '').trim().replace(/\.md$/i, '').normalize('NFC').toLowerCase();

/**
 * O que faz: acha a fixada entre as candidatas: a primeira que tem uma das chaves igual ao que o campo aponta
 * (o caminho inteiro ou o nome da nota).
 * Por quê: a fixada só vence quando ainda é uma candidata (aberta, do projeto): o campo que aponta para uma
 * tarefa feita ou de outro projeto não inventa uma próxima ação, e a ordem volta a valer.
 * Entra → sai: as candidatas, o que o campo aponta e as chaves de cada uma → a candidata, ou `null`.
 * Erro e ataque: o campo vazio dá `null`; `Tarefa`, `Tarefa.md` e `TaskNotes/Tasks/Tarefa.md` acham a mesma
 * (com o nome ou o caminho entre as chaves); a caixa e o espaço nas pontas não contam.
 * Prova: tests/engine/proximaAcao.test.ts.
 */
export function fixadaEntre<T>(candidatas: readonly T[], fixada: string, chaves: (candidata: T) => readonly string[]): T | null {
    const alvo = chaveDaNota(fixada);
    if (!alvo) return null;
    return candidatas.find(c => chaves(c).some(k => chaveDaNota(k) === alvo)) ?? null;
}
