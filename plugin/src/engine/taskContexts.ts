/**
 * Onde dá para fazer a tarefa: o vocabulário do campo `contexts` das TaskNotes.
 *
 * Existe porque a tarefa só aparece "aqui e agora" (a pauta do dia agrupa as
 * pendentes por contexto) se nasceu com o contexto registrado, e cada caminho que
 * cria tarefa perguntava outra coisa ou nada. É o vocabulário que já estava nas
 * tarefas dele (16/10/2026), não uma lista nova: "🚶 Campo" e "🌍 Externo" são
 * contextos diferentes e não se fundem aqui (fundir é decisão do operador).
 *
 * Cópias vigiadas por teste (tests/contracts/livroNoSistemaEtapaC.test.ts): as
 * opções dos passos `contexto_*` dos protocolos, o juiz `task_doctor.py` e o
 * `FORA_DO_COMPUTADOR` do `week_act_adler.js` (subconjunto).
 */
export const TASK_CONTEXTS = [
    '💻 Computador',
    '🌍 Externo',
    '📱 Celular',
    '🎬 Criação',
    '🤝 Relacional',
    '🚶 Campo',
] as const;

export const TASK_CONTEXT_QUESTION = '🧭 Onde dá para fazer?';
export const TASK_CONTEXT_SKIP = '⏭️ Sem contexto';
export const TASK_CONTEXT_INFO = 'Uma escolha; ⏭️ pula. A pauta do dia agrupa as pendentes por aqui (🧭 Aqui e agora).';

/**
 * Resposta de passo, valor fixo de protocolo ou frontmatter → lista do vocabulário.
 * Aceita texto (`"📱 Celular"`, `"💻 Computador, 📱 Celular"`), lista em fluxo
 * (`["📱 Celular"]`) ou array. Fica só o que é do vocabulário, sem repetição, na
 * ordem em que veio: o "⏭️ Sem contexto", o vazio e um contexto inventado não viram
 * contexto gravado.
 */
export function taskContextsFrom(raw: unknown): string[] {
    const items: unknown[] = Array.isArray(raw)
        ? raw
        : String(raw ?? '').replace(/^\s*\[|\]\s*$/g, '').split(',');
    const known = new Set<string>(TASK_CONTEXTS);
    const out: string[] = [];
    for (const item of items) {
        const value = String(item ?? '').trim().replace(/^["']|["']$/g, '').trim();
        if (known.has(value) && !out.includes(value)) out.push(value);
    }
    return out;
}

/** `["📱 Celular", "🌍 Externo"]` (a forma que o TaskNotes lê) ou `''` quando vazio. */
export function taskContextsYaml(contexts: string[]): string {
    return contexts.length ? `[${contexts.map(c => `"${c}"`).join(', ')}]` : '';
}
