/**
 * O pedido de criação de uma TaskNote pela API do TaskNotes (`api.tasks.create`): o caminho
 * único de toda criação do plugin por essa API, que garante o `type`.
 *
 * Por quê: o TaskNotes grava no frontmatter só os campos que ele mapeia (o `fieldMapping`:
 * título, status, prioridade, datas, contextos, projetos, estimativa…) e os campos do
 * usuário (`userFields`, como `week` e `impacto`); o resto de `customProperties` some na
 * criação (TaskNotes 4.13.8, `mapToFrontmatter`). O `type` não é campo do usuário: a tarefa
 * criada pela API nascia sem `type: task`, e o sistema a lê pelo `type` (os candidatos de
 * `Config/dominios/tarefa.json`, o `TaskIndex`, os juízes). O que vai em `customFrontmatter`
 * o TaskNotes grava inteiro, por cima do que ele mapeou; por isso o `type` e as outras
 * chaves da casa vão lá também.
 *
 * Módulo puro: sem Obsidian. Quem cria é a borda (`tasknotesBridge.createTaskViaApi`, o
 * operador do DSH). Prova: tests/engine/tasknotesCreate.test.ts.
 */

/** O `type` da ação (a TaskNote comum): `Config/dominios/tarefa.json`, `candidatos.type`. */
export const TIPO_DA_TAREFA = 'task';

/**
 * Os campos que o TaskNotes grava pelo nome dele, no topo do pedido (o `fieldMapping` padrão,
 * que o cofre usa sem troca). O resto vai em `customFrontmatter`.
 */
export const CAMPOS_DO_TASKNOTES = ['title', 'status', 'priority', 'due', 'scheduled', 'contexts', 'projects', 'timeEstimate', 'details', 'tags'] as const;

export type PedidoDeCriacao = Record<string, unknown> & {
    title: string;
    customProperties?: Record<string, unknown>;
    customFrontmatter: Record<string, unknown>;
};

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const copia = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * O que faz: o pedido com o `type` garantido: as `customProperties` (que o TaskNotes só grava
 * quando são campos do usuário) também em `customFrontmatter`, que ele grava inteiro, e o
 * `type` lá (o que veio no pedido, ou o padrão).
 * Por quê: a tarefa criada pela API nascia sem `type: task` (o bug do P8 da Missão).
 * Entra → sai: o pedido do TaskNotes e o tipo padrão → um pedido novo (a entrada não muda).
 * Erro e ataque: `type` vazio no pedido vira o padrão; chave vazia em `customProperties` não
 * vai ao frontmatter; `customFrontmatter` que já veio vence `customProperties`.
 * Prova: tests/engine/tasknotesCreate.test.ts ("o type").
 */
export function comTipoNaCriacao<T extends Record<string, unknown>>(pedido: T, tipoPadrao: string = TIPO_DA_TAREFA): T & { customFrontmatter: Record<string, unknown> } {
    const props = (pedido.customProperties && typeof pedido.customProperties === 'object' ? pedido.customProperties : {}) as Record<string, unknown>;
    const proprio = (pedido.customFrontmatter && typeof pedido.customFrontmatter === 'object' ? pedido.customFrontmatter : {}) as Record<string, unknown>;
    const fm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) if (!vazio(v)) fm[k] = copia(v);
    for (const [k, v] of Object.entries(proprio)) if (!vazio(v)) fm[k] = copia(v);
    if (vazio(fm.type)) fm.type = tipoPadrao;
    return { ...pedido, customFrontmatter: fm };
}

/**
 * O que faz: o pedido de criação de um frontmatter inicial (as chaves do frontmatter, como a
 * Missão as calcula): os campos do TaskNotes no topo, o resto em `customFrontmatter`, e o
 * `type` garantido. Sem dia, o pedido diz "sem dia" (`scheduled: ''`), para o TaskNotes não
 * pôr o dia padrão dele (`defaultScheduledDate`) numa tarefa que o formulário criou sem data.
 * Entra → sai: o frontmatter inicial (com `title`) → o pedido.
 * Erro e ataque: chave vazia não vai; o título com espaços nas pontas sai limpo; sem título,
 * o pedido sai com o título vazio (o TaskNotes recusa: "Title is required").
 * Prova: tests/engine/tasknotesCreate.test.ts ("o pedido").
 */
export function pedidoDoFrontmatter(fm: Record<string, unknown>, tipoPadrao: string = TIPO_DA_TAREFA): PedidoDeCriacao {
    const topo: Record<string, unknown> = {};
    const resto: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm ?? {})) {
        if (vazio(v)) continue;
        if ((CAMPOS_DO_TASKNOTES as readonly string[]).includes(k)) topo[k] = copia(v);
        else resto[k] = copia(v);
    }
    const title = String(topo.title ?? '').trim();
    return comTipoNaCriacao({ ...topo, title, scheduled: topo.scheduled ?? '', customFrontmatter: resto }, tipoPadrao) as PedidoDeCriacao;
}
