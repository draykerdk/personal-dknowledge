/**
 * O nome de link de uma nota, fora do Obsidian (módulo puro): o mesmo que os protocolos
 * gravam e que a lista de foco do trimestre usa (`[[Nome]]`), e o nome que um link escrito
 * aponta (`normalizeLink`).
 */

/**
 * O que faz: o nome pelo qual um protocolo grava a nota escolhida. Nota-índice `README.md`
 * vira o nome da pasta: `[[README]]` resolve para o README do KERNEL (o vault tem dezenas),
 * e o canvas, a nota do trimestre e as tarefas já chamam o projeto pela pasta
 * (`[[Um projeto]]`).
 * Entra → sai: `{ basename, path }` → o nome.
 * Prova: tests/engine/q4Round2.test.ts ("projeto só com README").
 */
export function noteLinkName(file: { basename: string; path: string }): string {
    if (String(file.basename).toLowerCase() !== 'readme') return file.basename;
    const parts = String(file.path).split('/');
    return parts.length > 1 ? parts[parts.length - 2] : file.basename;
}

/**
 * O que faz: o nome que um link escrito aponta: `[[Projeto X]]` → `Projeto X`, sem o apelido
 * (`[[Projeto X|X]]` → `Projeto X`); de uma lista, o primeiro item.
 * Por quê: casar o projeto de uma tarefa com o foco da semana e com o projeto de um canvas; o
 * agregador e o canvas do projeto leem o mesmo nome. Vinha do missionControl (o passo
 * `normalizeLink` da divisão do motor, tests/engine/modeloMotor.test.ts).
 * Entra → sai: o valor cru do frontmatter (texto, lista, nada) → o nome, ou ''.
 * Erro e ataque: `undefined`, `null` e a lista vazia dão ''; o texto sem colchetes sai aparado,
 * como veio; um colchete só numa ponta sai só dessa ponta.
 * Prova: tests/contracts/vaultIntent.test.ts e tests/engine/missionCanvas.test.ts.
 */
export function normalizeLink(raw: unknown): string {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return '';
    return String(value).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
}
