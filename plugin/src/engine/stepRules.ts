/**
 * As regras de um passo de protocolo que o laço do motor (`JSONProtocol.run`) e o formulário
 * (`protocolForm.ts`) usam juntas: a condição, as chaves da resposta de um passo escondido, a
 * validação (`required`, `maxSelect`) e as duas variáveis de sistema do formulário.
 *
 * Por quê: o P11 da Missão (arquitetura de 27/10, §5.3): "a derivação e a validação são as
 * mesmas funções"; um motor só. Antes a validação morava no meio do laço.
 *
 * Módulo puro: sem Obsidian.
 */
import { selectionCount } from './stepDefault';

/**
 * A condição (de um passo ou de um modo do protocolo) casa com as respostas da
 * rodada? `{ variable, value }` compara por igualdade, e `value` em lista aceita
 * qualquer um; `{ variable, filled: true }` só pede que a resposta exista (ex.: o
 * impacto da ação do valor, só se houve ação). Sem condição, nada casa.
 */
export function conditionMatches(condition: any, variables: any): boolean {
    if (!condition || typeof condition !== 'object') return false;
    const target = variables?.[condition.variable];
    if (condition.filled === true) {
        return typeof target === 'string' ? target.trim() !== '' : Boolean(target);
    }
    return Array.isArray(condition.value) ? condition.value.includes(target) : target === condition.value;
}

/**
 * O que faz: a condição de um passo, lida com os passos do protocolo: `{ variable, filled: true }`
 * sobre a resposta de um `multiselect_note` pede pelo menos uma nota marcada; o resto é `conditionMatches`.
 * Por quê: a seleção de notas sem nada marcado responde com texto ("Nenhum", ou o `skipLabel` quando
 * não havia o que escolher), e o texto não é uma escolha: o passo que depende dela (as tarefas das
 * SMART escolhidas, na 🌳) não aparece, nem o aviso do vazio dele.
 * Entra → sai: a condição, as variáveis e os passos do protocolo → casa ou não.
 * Erro e ataque: passos ausentes ou sem o passo da variável valem como `conditionMatches`; o mesmo
 * para a condição por valor; nada lança.
 * Prova: tests/engine/protocolForm.test.ts ("a condição sobre uma seleção de notas").
 */
export function condicaoDoPasso(condition: any, variables: any, steps: unknown): boolean {
    const dono = condition?.filled === true && Array.isArray(steps) ? steps.find((s: any) => s?.id === condition.variable) : null;
    if (dono?.type === 'multiselect_note') return selectionCount(variables?.[condition.variable], 'multiselect_note') > 0;
    return conditionMatches(condition, variables);
}

/**
 * O que faz: as chaves que saem quando um passo respondido fica escondido (a condição dele
 * deixou de casar): a resposta, o valor da opção, o texto e o número.
 * Por quê: a regra do laço (o 📤 par de uma 🔥 que virou ⚙️), a mesma no formulário.
 * Prova: tests/engine/protocolForm.test.ts ("o passo que ficou escondido").
 */
export function chavesDaResposta(id: string): string[] {
    return [id, `${id}_value`, `${id}_display`, `${id}_num`];
}

/** O problema de uma resposta: o obrigatório vazio, ou marcadas a mais. */
export type ProblemaDaResposta =
    | { tipo: 'obrigatorio' }
    | { tipo: 'maxSelect'; max: number; marcadas: number };

/**
 * O que faz: o problema de uma resposta dada a um passo, ou `null`: `required: true` com
 * texto vazio (só espaços conta como vazio); `maxSelect: N` numa seleção com mais de N marcadas.
 * Por quê: §5.3, 4, a validação do formulário pelas mesmas funções do laço; e o laço, que
 * reabre o passo com o aviso. O `required` é opt-in: sem ele, a resposta vazia vale.
 * Entra → sai: o passo do JSON e a resposta → o problema ou `null`.
 * Erro e ataque: resposta que não é texto não é "vazia" para o `required` (como sempre foi);
 * `maxSelect` inválido (0, texto, negativo) não limita; "Nenhum" conta 0 marcadas.
 * Prova: tests/engine/protocolForm.test.ts ("a validação") e tests/engine/protocolGolden.test.ts
 * (o ▶️ com o obrigatório vazio e o 🧭 com marcadas a mais reabrem o passo).
 */
export function problemaDaResposta(step: any, value: unknown): ProblemaDaResposta | null {
    if (step?.required && typeof value === 'string' && value.trim() === '') return { tipo: 'obrigatorio' };
    const max = Number(step?.maxSelect) || 0;
    if (max > 0 && (step?.type === 'multiselect' || step?.type === 'multiselect_note')) {
        const marcadas = selectionCount(value, step.type);
        if (marcadas > max) return { tipo: 'maxSelect', max, marcadas };
    }
    return null;
}

/** O que faz: o aviso de um problema, o texto que o laço sempre mostrou. */
export function avisoDoProblema(problema: ProblemaDaResposta): string {
    if (problema.tipo === 'obrigatorio') return "⚠️ Este campo é obrigatório — sem ele o registro não representa nada.";
    return `⚠️ No máximo ${problema.max}: você marcou ${problema.marcadas}. Desmarque ${problema.marcadas - problema.max} para seguir.`;
}

/** A variável de sistema com os passos respondidos no formulário (lista de ids). */
export const RESPONDIDOS = '_respondidos';
/** A variável de sistema com o valor de abertura de cada passo, vindo do formulário (id → valor). */
export const VALORES_INICIAIS = '_valoresIniciais';

/**
 * O que faz: os ids dos passos respondidos no formulário (`_respondidos`, uma lista de textos).
 * Erro e ataque: outra forma (texto solto, objeto, número) vale nenhum; item que não é texto sai.
 */
export function respondidosDe(variables: any): Set<string> {
    const raw = variables?.[RESPONDIDOS];
    return new Set(Array.isArray(raw) ? raw.filter((id: unknown): id is string => typeof id === 'string' && id !== '') : []);
}

/**
 * O que faz: o valor de abertura de cada passo, vindo do formulário (`_valoresIniciais`, um
 * objeto id → valor).
 * Erro e ataque: lista, texto ou `null` valem nenhum (cópia: a variável da rodada não muda).
 */
export function valoresIniciaisDe(variables: any): Record<string, unknown> {
    const raw = variables?.[VALORES_INICIAIS];
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
}

/**
 * O que faz: o passo foi respondido no formulário e a resposta vale: está em `_respondidos`,
 * tem resposta (mesmo vazia) e a resposta passa na validação do passo.
 * Por quê: §5.3, 5: o passo respondido no formulário vale como respondido, mesmo vazio e mesmo
 * com `alwaysAsk`; a resposta que não passa (o obrigatório vazio, marcadas a mais) é perguntada
 * no modal, aberta com ela (§5.2, limite 4).
 * Entra → sai: o passo e as variáveis da rodada → sim ou não.
 * Prova: tests/engine/protocolForm.test.ts ("_respondidos").
 */
export function respondidoNoFormulario(step: any, variables: any): boolean {
    if (!step?.id || !respondidosDe(variables).has(step.id)) return false;
    const value = variables?.[step.id];
    if (value === undefined || value === null) return false;
    return problemaDaResposta(step, value) === null;
}

/**
 * O que faz: o passo do seletor de notas é de "contexto genérico" (o `contexto`, a `frente_maior`,
 * ou a pergunta que fala de contexto, projeto/área, projeto/experiência ou relacionado).
 * Por quê: nesses passos o seletor aceita qualquer nota e deixa pular, mesmo sem `optional`;
 * a regra morava no meio do `openNoteSuggester` e o formulário precisa da mesma (P12a da Missão).
 * Entra → sai: o passo → sim ou não.
 */
export function ehPassoDeContextoGenerico(step: any): boolean {
    const prompt = typeof step?.prompt === 'string' ? step.prompt : '';
    return step?.id === 'contexto' || step?.id === 'frente_maior'
        || /contexto|projeto\/área|projeto\/experiência|relacionado/i.test(prompt);
}

/**
 * O que faz: o seletor de notas do passo oferece o pular (a resposta vazia): `optional` quando o
 * passo o declara; sem a chave, o passo de contexto genérico.
 * Por quê: o modal e o formulário deixam vazio o mesmo passo (o follow-up 5 do P11: o formulário
 * só aceitava o vazio com `optional: true`, e o modal também pula o de contexto genérico).
 * Entra → sai: o passo → sim ou não (`optional: false` explícito não pula, mesmo genérico).
 * Prova: tests/engine/protocolForm.test.ts ("o seletor de notas vazio").
 */
export function pulaNoSeletorDeNota(step: any): boolean {
    return Boolean(step?.optional ?? ehPassoDeContextoGenerico(step));
}

/**
 * O que faz: os passos que a continuação do registro de hoje pula (`continueFromDay: { when,
 * doneField, skipSteps }`): quando o modo `when` casa com as variáveis e a Day da data de
 * contexto já tem `doneField` preenchido (o 🌙 já fechou o dia), os ids de `skipSteps`.
 * Por quê: o 🔎 Aprofundar depois do 🌙 não pergunta de novo o que já está na Day; o laço e o
 * formulário pulam os mesmos passos (P12a da Missão, follow-up 2 do P11).
 * Entra → sai: a configuração, as variáveis da rodada e o frontmatter da Day (`null` sem Day) →
 * os ids, ou `null` (sem configuração, sem a Day, com o campo vazio ou fora do modo).
 * Erro e ataque: configuração sem `doneField` texto ou sem `skipSteps` lista → `null`; item de
 * `skipSteps` que não é texto sai.
 * Prova: tests/engine/protocolForm.test.ts ("continueFromDay").
 */
export function passosContinuados(cfg: any, variables: any, frontmatterDaDay: Record<string, unknown> | null | undefined): Set<string> | null {
    if (!cfg || typeof cfg.doneField !== 'string' || !Array.isArray(cfg.skipSteps)) return null;
    if (cfg.when && !conditionMatches(cfg.when, variables)) return null;
    if (!frontmatterDaDay) return null;
    const done = frontmatterDaDay[cfg.doneField];
    if (done === undefined || done === null || String(done).trim() === '') return null;
    return new Set<string>(cfg.skipSteps.filter((id: any) => typeof id === 'string' && id));
}
