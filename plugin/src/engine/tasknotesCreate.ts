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

/* ---------------------------------------------------------------- o criador único (D5, 05/11) */

/** A pasta onde a tarefa nasce (o `tasksFolder` do TaskNotes). */
export const PASTA_DAS_TAREFAS = 'TaskNotes/Tasks';
/** A tag pela qual o TaskNotes reconhece a tarefa (`taskIdentificationMethod: tag`). */
export const TAG_DA_TAREFA = 'task';
/** O status da tarefa que nasce sem status: a próxima (o ▶️, o 🌙 e o Deep Work não mostram o `inbox`). */
export const STATUS_DA_TAREFA_NOVA = 'next-action';
/** A prioridade de quem nasce sem urgência dita (`high` é para pressão real; a importância mora no `impacto`). */
export const PRIORIDADE_DA_TAREFA_NOVA = 'normal';

/** As chaves numéricas da tarefa (o TaskNotes e os campos do usuário as leem como número). */
const NUMEROS_DA_TAREFA = ['timeEstimate', 'impacto', 'energia'] as const;

/** As chaves que são listas no frontmatter da tarefa, mesmo quando o modelo as escreve como texto. */
const LISTAS_DA_TAREFA = ['tags', 'projects', 'contexts', 'blockedBy', 'blocking'] as const;

/**
 * O que faz: a lista de um valor de lista do frontmatter: a lista como veio, ou o texto de um modelo
 * (`"[task, valor]"`, `"a, b"`) partido em itens, sem as aspas das pontas e sem os vazios.
 * Entra → sai: o valor cru → a lista de textos.
 * Erro e ataque: `"[]"`, `""`, `null` e o "Nenhum" de um passo pulado dão a lista vazia.
 */
export function listaDoFrontmatter(valor: unknown): string[] {
    if (Array.isArray(valor)) return valor.map(v => String(v ?? '').trim()).filter(Boolean);
    const texto = String(valor ?? '').trim();
    if (!texto || texto === 'Nenhum') return [];
    const miolo = texto.startsWith('[') && texto.endsWith(']') ? texto.slice(1, -1) : texto;
    return miolo.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '').trim()).filter(Boolean);
}

/**
 * O que faz: o frontmatter de uma tarefa que nasce, numa forma só: o `type` (o que veio, ou o padrão),
 * a tag `task` (na frente quando faltava, como o TaskNotes põe), o `status` e a prioridade quando
 * faltam, as listas como listas, o impacto e a estimativa como número, e o `dateCreated` e o `dateModified`
 * no carimbo dado.
 * Por quê: o diagnóstico do fluxo SMART (02/11, §3.2, "Criar uma tarefa"; D5, o criador único, 05/11):
 * oito caminhos criavam a tarefa, cada um com o seu `status`, as suas tags (`[task, protocolo]` no
 * `createTask`), o seu `dateCreated` (com hora e fuso, só o dia, `Z`) e o seu `title`. Todos passam por
 * aqui: o `createTask` do motor, o "➕ Criar a que falta" de um passo, o Novo e o "＋ O que fiz" da
 * Missão (pela borda única, `tasknotesBridge.createTaskViaApi`), as notas do ⚡ e da 🎯 (o frontmatter
 * do protocolo) e o "Virar tarefa" da triagem (`criacao: 'manter'`).
 * Entra → sai: o frontmatter (as chaves como o TaskNotes as nomeia), o carimbo do momento
 * (`dia.carimboDoMomento`) e as opções → um frontmatter novo (a entrada não muda).
 * Erro e ataque: chave vazia (texto em branco, lista vazia, `null`) sai; `type` vazio vira o padrão;
 * `status` vivo que veio fica; tag repetida com outra caixa não dobra; com `criacao: 'manter'` (a nota
 * que já existia e vira tarefa), o `dateCreated` que ela tem fica e o `dateModified` não muda; carimbo
 * vazio não grava data.
 * Prova: tests/engine/tasknotesCreate.test.ts ("a forma única") e tests/engine/criadorUnico.test.ts.
 */
export function frontmatterDaTarefaNova(
    fm: Record<string, unknown>,
    carimbo: string,
    opcoes: { tipoPadrao?: string; criacao?: 'nova' | 'manter' } = {},
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fm ?? {})) {
        let valor = (LISTAS_DA_TAREFA as readonly string[]).includes(k) ? listaDoFrontmatter(v) : copia(v);
        // O impacto e a estimativa são números (os campos do usuário do TaskNotes, os modelos da tarefa).
        if ((NUMEROS_DA_TAREFA as readonly string[]).includes(k) && typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor.trim())) valor = Number(valor);
        if (!vazio(valor)) out[k] = valor;
    }
    if (vazio(out.type)) out.type = opcoes.tipoPadrao ?? TIPO_DA_TAREFA;
    const tags = listaDoFrontmatter(out.tags);
    const semCerquilha = (t: string) => t.replace(/^#/, '').toLowerCase();
    const unicas = tags.filter((t, i) => tags.findIndex(o => semCerquilha(o) === semCerquilha(t)) === i);
    out.tags = unicas.some(t => semCerquilha(t) === TAG_DA_TAREFA) ? unicas : [TAG_DA_TAREFA, ...unicas];
    if (vazio(out.status)) out.status = STATUS_DA_TAREFA_NOVA;
    if (vazio(out.priority)) out.priority = PRIORIDADE_DA_TAREFA_NOVA;
    if (carimbo) {
        if (opcoes.criacao === 'manter') {
            if (vazio(out.dateCreated)) out.dateCreated = carimbo;
        } else {
            out.dateCreated = carimbo;
            out.dateModified = carimbo;
        }
    }
    return out;
}

/**
 * O que faz: o patch que leva à forma única o frontmatter de uma tarefa que já nasceu fora da borda única
 * (o "Abrir no TaskNotes" do Novo, depois que o formulário do TaskNotes salva): o que a forma única
 * (`frontmatterDaTarefaNova`, com a data de criação mantida) dá diferente do que está lá, e `null` nas
 * chaves vazias, que a forma única não grava.
 * Por quê: o criador único (05/11) deixou de fora o caminho 2 do diagnóstico do fluxo SMART (§3.2), que
 * acertava só o `type` depois do formulário; desde 06/11 ele monta o frontmatter pela mesma função, e o
 * formulário continua sendo o lugar onde a pessoa completa a tarefa (o `status` e a prioridade que ela deu
 * ficam: a forma única só os põe quando faltam).
 * Entra → sai: o frontmatter de agora (com a herança da mãe já por cima, se houver), o carimbo do momento e
 * as opções → o patch, ou `null` quando nada muda (a entrada não muda).
 * Erro e ataque: o `dateCreated` e o `dateModified` que o TaskNotes gravou ficam; aplicado duas vezes, o
 * segundo dá `null`; carimbo vazio não grava data.
 * Prova: tests/engine/tasknotesCreate.test.ts ("o patch da forma única") e tests/engine/criadorUnico.test.ts.
 */
export function patchDaFormaUnica(fm: Record<string, unknown>, carimbo: string, opcoes: { tipoPadrao?: string } = {}): Record<string, unknown> | null {
    const atual = fm ?? {};
    const alvo = frontmatterDaTarefaNova(atual, carimbo, { ...opcoes, criacao: 'manter' });
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(alvo)) if (JSON.stringify(atual[k] ?? null) !== JSON.stringify(v)) patch[k] = v;
    for (const k of Object.keys(atual)) if (!(k in alvo)) patch[k] = null;
    return Object.keys(patch).length ? patch : null;
}

/**
 * O que faz: o frontmatter que o TaskNotes grava de um pedido de criação (`api.tasks.create`): os campos
 * dele no topo, o `customFrontmatter` por cima, o "sem dia" (`scheduled: ''`) fora, e sem o `title`
 * quando o nome do arquivo já é o título (`storeTitleInFilename`, o que o cofre usa).
 * Por quê: a volta pelo cofre (sem o TaskNotes carregado) grava o mesmo frontmatter que a API gravaria;
 * a prova de equivalência compara os dois.
 * Entra → sai: o pedido e o nome do arquivo (sem `.md`) → o frontmatter (a entrada não muda).
 * Erro e ataque: `customProperties` (o TaskNotes só grava as que são campos do usuário) não vão;
 * título diferente do nome fica.
 */
export function frontmatterDoPedido(pedido: PedidoDeCriacao, nome: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pedido ?? {})) {
        if (k === 'customFrontmatter' || k === 'customProperties' || vazio(v)) continue;
        out[k] = copia(v);
    }
    for (const [k, v] of Object.entries(pedido?.customFrontmatter ?? {})) if (!vazio(v)) out[k] = copia(v);
    if (String(out.title ?? '').trim() === nome) delete out.title;
    return out;
}

/** Os caracteres que o TaskNotes tira do nome do arquivo (`sanitizeTitleForFilename`, 4.14). */
const FORA_DO_NOME_DA_TAREFA = /[<>:"/\\|?*#[\]]/g;

/**
 * O que faz: o nome do arquivo de uma tarefa a partir do título, pela regra do TaskNotes (o título, sem os
 * caracteres que ele tira, sem os de controle, com os espaços juntos e sem pontos nas pontas); repetido,
 * ganha " (2)", " (3)"… até um nome livre.
 * Por quê: a decisão do nome no criador único (05/11): as 46 tarefas de `TaskNotes/Tasks` se chamam pelo
 * título (nenhuma com sufixo, nenhuma em zettel), e o TaskNotes mostra o nome do arquivo como título
 * (`storeTitleInFilename`: 41 das 46 nem têm `title`). O " (2)" é o que o `createTask` e as notas do ⚡ e
 * da 🎯 já davam, e o `naoRepetir` o reconhece (`tarefaAbertaDeMesmoTitulo`); o "-2" da API ficaria só
 * para a tarefa criada fora do DFM.
 * Entra → sai: o título e quem diz se um nome já existe na pasta → o nome (sem `.md`).
 * Erro e ataque: título que limpo fica vazio dá ''; 999 nomes ocupados devolvem o último tentado (quem
 * cria recusa o repetido).
 */
export function nomeDaTarefaNova(titulo: string, existe: (nome: string) => boolean): string {
    const limpo = String(titulo ?? '').trim().replace(/\s+/g, ' ').replace(FORA_DO_NOME_DA_TAREFA, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/^\.+|\.+$/g, '').trim();
    if (!limpo) return '';
    if (!existe(limpo)) return limpo;
    let n = 2;
    while (n < 999 && existe(`${limpo} (${n})`)) n++;
    return `${limpo} (${n})`;
}

/** Texto que o YAML leria como outra coisa (número, booleano, nulo, data com hora e espaço, lista, link). */
const PEDE_ASPAS = /^(?:[-?:,[\]{}#&*!|>'"%@`]|true$|false$|null$|yes$|no$|~$|-?\d+(?:\.\d+)?$)|: | #|^\s|\s$|\[\[/i;

/** O que faz: um valor escalar do frontmatter em YAML (com aspas só quando o YAML leria outra coisa). */
function escalarDaTarefa(v: unknown): string {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const s = String(v ?? '');
    return PEDE_ASPAS.test(s) || s.includes('\n') ? JSON.stringify(s) : s;
}

/** O que faz: um item de lista em linha: sem aspas só a palavra simples (`task`, `tarefa-smart`). */
function itemDaLista(v: unknown): string {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const s = String(v ?? '');
    return /^[\p{L}\p{N}_-]+$/u.test(s) && !PEDE_ASPAS.test(s) ? s : JSON.stringify(s);
}

/**
 * O que faz: o texto da nota de uma tarefa: o frontmatter em YAML (as listas em linha, como as do
 * TaskNotes e as que o `createTask` gravava: `tags: [task, valor]`, `projects: ["[[SMART]]"]`) e o corpo.
 * Por quê: a volta pelo cofre do criador único (sem o TaskNotes carregado) e as notas que só trocam o
 * frontmatter gravam o frontmatter numa forma só.
 * Entra → sai: o frontmatter e o corpo → o texto.
 * Erro e ataque: aspas e quebras de linha no valor saem escapadas; lista vazia e valor vazio não vão.
 */
export function textoDaTarefa(fm: Record<string, unknown>, corpo: string): string {
    const linhas: string[] = [];
    // O que diz o que a nota é vem primeiro (o `type`, o `status`, a prioridade); o resto, na ordem que veio.
    const frente = ['type', 'status', 'priority'].filter(k => k in (fm ?? {}));
    const ordem = [...frente, ...Object.keys(fm ?? {}).filter(k => !frente.includes(k))];
    for (const [k, v] of ordem.map(k => [k, fm[k]] as const)) {
        if (vazio(v)) continue;
        if (Array.isArray(v)) linhas.push(`${k}: [${v.map(itemDaLista).join(', ')}]`);
        else if (v && typeof v === 'object') linhas.push(`${k}: ${JSON.stringify(v)}`);
        else linhas.push(`${k}: ${escalarDaTarefa(v)}`);
    }
    return `---\n${linhas.join('\n')}\n---\n\n${String(corpo ?? '').replace(/^\n+/, '')}`;
}


/**
 * O que faz: o frontmatter de um modelo de propriedades já resolvido (`processProperties`: tudo texto)
 * nos tipos da tarefa: as listas como listas, `true`/`false` como booleano, a estimativa e o impacto
 * como número; o vazio sai.
 * Por quê: o "➕ Criar a que falta" de um passo escreve as propriedades como texto de YAML
 * (`tags: "[task]"`, `archived: "false"`); a borda única grava valores, e o texto viraria texto.
 * Entra → sai: as propriedades resolvidas → um frontmatter novo (a entrada não muda).
 * Erro e ataque: número que não é número fica texto; lista vazia sai.
 */
export function valoresDoModelo(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props ?? {})) {
        let valor: unknown = copia(v);
        if ((LISTAS_DA_TAREFA as readonly string[]).includes(k)) valor = listaDoFrontmatter(v);
        else if (typeof v === 'string') {
            const t = v.trim();
            if (t === 'true' || t === 'false') valor = t === 'true';
            else if ((NUMEROS_DA_TAREFA as readonly string[]).includes(k) && /^-?\d+(\.\d+)?$/.test(t)) valor = Number(t);
            else valor = t;
        }
        if (!vazio(valor)) out[k] = valor;
    }
    return out;
}
