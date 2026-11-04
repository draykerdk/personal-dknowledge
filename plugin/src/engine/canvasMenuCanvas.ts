/**
 * O menu do acervo **dentro do desenho**: o plano puro do bloco.
 *
 * O catálogo do DFM existe hoje em dois lugares fora do canvas — o painel
 * lateral (`canvasRailView`) e o clique direito (`canvasMenu.ts`). Esta peça
 * escreve o **acervo dentro do arquivo**, no mesmo padrão do cabeçalho de escala
 * (`canvasFractalContext.ts`): nós de texto marcados, um bloco por canvas,
 * atualizado no lugar em vez de duplicado.
 *
 * Quatro disciplinas, e o porquê de cada uma:
 *
 * 1. **o acervo não é recriado aqui.** O agrupamento e a contagem de vazios vêm
 *    de `buildCanvasMenuTree` (`canvasMenu.ts`), a mesma função que a rail e o
 *    menu de contexto usam. Se o agrupamento mudar lá, o desenho muda junto —
 *    não existe tabela de grupos paralela nesta peça.
 * 2. **o item é um nó de TEXTO, com o id que o menu executa.** O acervo real não
 *    tem caminho de arquivo: `CanvasMenuEntry` carrega `{id, label, kind, group}`,
 *    `collectCanvasMenuInventory` não preenche caminho nenhum e `JSONProtocol`
 *    expõe só id/name/icon (medido no catálogo em 15/09). Um nó `type:"file"`
 *    prometeria um clique que não abre nada. O nó do item declara o rótulo e o
 *    **id** — é o id que o menu de contexto executa.
 * 3. **nada é escondido.** Item sem arquivo clicável é o caso **normal**, e o nó
 *    do grupo diz isso em palavras; o corte por teto também é declarado, com o
 *    teto efetivo. Corte silencioso é mentira.
 * 4. **determinismo byte a byte.** Todo id sai de `railNodeIdFor` (FNV-1a) e o
 *    título é montado por concatenação fixa: o mesmo estado produz exatamente a
 *    mesma string, que é o que permite a segunda execução não escrever nada.
 *
 * Diferente do cabeçalho de escala, o menu **não depende da escala para
 * existir**: ele é o acervo, não contexto inventado. Escreve em qualquer escala
 * lida e **declara** a escala no título; quando a leitura não reivindica o
 * canvas, o rótulo diz "Escala indefinida" em palavras, sem inventar nível.
 *
 * Módulo **puro**: sem `obsidian`, sem DOM, sem I/O.
 */
import type { CanvasMenuEntry, CanvasMenuGroup, CanvasMenuKind, CanvasMenuTree } from './canvasengine/canvasMenuModel';
import { railNodeIdFor } from './canvasengine/canvasSplice';
import type { FractalReading, FractalScale } from './missionFractal';

/* ==========================================================================
   O bloco: marcador, rótulo, cor e o teto de itens por grupo
   ========================================================================== */

export const CANVAS_MENU_MARKER = 'dfm-canvas-menu';
export const CANVAS_MENU_LABEL = '📋 Menu do canvas';
/** Ciano — distinto do cabeçalho de escala (`"6"`), para os dois blocos não se confundirem. */
export const CANVAS_MENU_COLOR = '5';
export const CANVAS_MENU_GROUP_LIMIT = 5;

/** Largura e altura de cada nó, e o passo da coluna — as mesmas do resto da rail. */
export const CANVAS_MENU_WIDTH = 400;
export const CANVAS_MENU_NODE_HEIGHT = 150;
export const CANVAS_MENU_GAP = 24;

/** Um item do acervo que entrou no desenho. */
export interface CanvasMenuItem {
    /** O id cru do acervo: id do protocolo, ou id completo do comando. */
    entryId: string;
    kind: CanvasMenuKind;
    label: string;
    group: string;
    /** Id determinístico — `railNodeIdFor`, semeado pelo id do item. */
    nodeId: string;
    /**
     * O caminho da nota de origem, **quando o acervo declara um**.
     *
     * Hoje nenhum declara (ver o cabeçalho deste módulo), e por isso o campo é
     * opcional: ausente ou vazio significa "sem arquivo clicável", e o nó do
     * grupo declara quantos itens estão nesse caso.
     */
    filePath?: string;
}

export interface CanvasMenuGroupPlan {
    name: string;
    /** Itens que o grupo tem no acervo (não os que entraram). */
    total: number;
    /** Os que entraram no desenho, no teto. */
    items: CanvasMenuItem[];
    /** Quantos ficaram fora do teto. */
    truncated: number;
    /** Quantos **não têm** arquivo clicável — hoje, todos. Declarado, nunca escondido. */
    semDestino: number;
}

export interface CanvasMenuBlock {
    menuId: string;
    scale: FractalScale;
    scaleLabel: string;
    title: string;
    groups: CanvasMenuGroupPlan[];
    /** Itens do acervo — o mesmo número que a árvore declara. */
    total: number;
    empty: boolean;
}

export interface CanvasMenuRequest {
    canvasPath: string;
    reading: FractalReading;
    tree: CanvasMenuTree;
    limit?: number;
    exists?: ((path: string) => boolean) | null;
    takenIds?: ReadonlyArray<string>;
}

/* ==========================================================================
   Normalizações: nada aqui confia no formato de quem chama
   ========================================================================== */

function asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * O teto efetivo: número finito, inteiro, nunca negativo. Ausente ou ilegível cai
 * no teto declarado — o mesmo `Math.max(0, Math.floor(...))` do cabeçalho, para
 * que "teto 0" seja uma escolha possível e não um erro silencioso.
 */
function normalizeLimit(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return CANVAS_MENU_GROUP_LIMIT;
    return Math.max(0, Math.floor(parsed));
}

/**
 * O caminho clicável de uma entrada do acervo, quando ela declara um.
 *
 * `CanvasMenuEntry` não carrega caminho, e a coleta viva não preenche nenhum:
 * quem tiver um caminho de verdade (um acervo futuro que resolva a nota de
 * origem) declara `filePath` e ele aparece no nó do item. Sem caminho declarado,
 * o item continua entrando no desenho — como texto — e é contado em `semDestino`.
 */
function filePathOf(entry: CanvasMenuEntry): string {
    return asText((entry as any)?.filePath);
}

/* ==========================================================================
   Os ids: a chave da não-duplicação
   ========================================================================== */

/**
 * O id do bloco do menu: `<canvasPath>#dfm-canvas-menu`, pela mesma FNV-1a da
 * rail. É a chave da idempotência — o mesmo canvas dá sempre o mesmo id, e é por
 * ele que a atualização encontra o bloco que já existe.
 */
export function canvasMenuIdFor(canvasPath: string, taken: ReadonlyArray<string> = []): string {
    return railNodeIdFor(`${asText(canvasPath)}#${CANVAS_MENU_MARKER}`, taken);
}

/** O id do nó de grupo, derivado do id do bloco e do nome do grupo. */
export function canvasMenuGroupIdFor(menuId: string, groupName: string): string {
    return railNodeIdFor(`${CANVAS_MENU_MARKER}:grupo:${asText(menuId)}:${asText(groupName)}`);
}

/**
 * O id do nó de item, derivado do id do bloco e do **id do acervo**.
 *
 * A semente é o id do item (protocolo ou comando), e não um caminho: sem
 * caminho — o caso de hoje — todos os itens nasceriam com o mesmo hash e o
 * desenho teria ids numerados em sequência, que mudariam de lugar quando a lista
 * mudasse. Com a semente no id, cada item tem sempre o mesmo id.
 */
export function canvasMenuItemIdFor(menuId: string, entryId: string, taken: ReadonlyArray<string> = []): string {
    return railNodeIdFor(`${CANVAS_MENU_MARKER}:item:${asText(menuId)}:${asText(entryId)}`, taken);
}

/**
 * Os ids do bloco, na ordem em que os nós entram no arquivo — **a** fonte.
 *
 * Existe para que "o id que o plano promete" e "o id que a gravação escreve"
 * sejam literalmente a mesma lista: quem grava usa `renderCanvasMenuNodes`, que
 * monta as linhas a partir desta função. O primeiro id é o do bloco (o nó de
 * título): é por ele que `findCanvasMenuSpan` reconhece o menu do canvas aberto.
 */
export function canvasMenuNodeIds(block: CanvasMenuBlock): string[] {
    return [
        block?.menuId ?? '',
        ...(block?.groups ?? []).flatMap(group => [
            canvasMenuGroupIdFor(block.menuId, group.name),
            ...group.items.map(item => item.nodeId),
        ]),
    ];
}

/* ==========================================================================
   O plano
   ========================================================================== */

/**
 * Monta o bloco do menu a partir da árvore do acervo já agrupada.
 *
 * A ordem recebida é preservada (grupos e itens): quem ordena é a coleta, que vê
 * o acervo vivo — reordenar aqui criaria uma segunda regra de ordem no sistema.
 */
export function planCanvasMenu(request: CanvasMenuRequest): CanvasMenuBlock {
    const canvasPath = asText(request?.canvasPath);
    const reading = request?.reading ?? ({} as FractalReading);
    const tree = request?.tree ?? ({} as CanvasMenuTree);
    const limit = normalizeLimit(request?.limit);
    const exists = request?.exists ?? (() => true);

    const menuId = canvasMenuIdFor(canvasPath, request?.takenIds ?? []);

    // Os ids de grupo não dependem dos itens: são calculados antes para que a
    // lista de "tomados" que semeia os ids de item já os contenha. Sem isso, um
    // item poderia nascer com o id de um grupo do próprio bloco.
    const grupos = Array.isArray(tree?.groups) ? tree.groups : [];
    const idsDeGrupo = grupos.map(group => canvasMenuGroupIdFor(menuId, asText((group as CanvasMenuGroup)?.group)));
    const tomados: string[] = [...(request?.takenIds ?? []), menuId, ...idsDeGrupo];

    const groups: CanvasMenuGroupPlan[] = [];

    for (const group of grupos) {
        const nome = asText((group as CanvasMenuGroup)?.group ?? (group as any)?.name) || 'Outros';
        const entries: CanvasMenuEntry[] = Array.isArray(group?.entries) ? group.entries : [];
        const items: CanvasMenuItem[] = [];
        let truncated = 0;
        let semDestino = 0;

        for (const entry of entries) {
            // O caminho só existe quando o acervo declara um E a nota existe no
            // vault. A contagem de "sem destino" é do GRUPO inteiro (o que o
            // acervo é), e não só do que coube no teto.
            const declarado = filePathOf(entry);
            const filePath = declarado && exists(declarado) ? declarado : '';
            if (!filePath) semDestino++;

            if (items.length >= limit) {
                truncated++;
                continue;
            }

            const entryId = asText(entry?.id);
            const nodeId = canvasMenuItemIdFor(menuId, entryId, tomados);
            tomados.push(nodeId);
            items.push({
                entryId,
                kind: entry?.kind === 'command' ? 'command' : 'protocol',
                label: asText(entry?.label) || entryId,
                group: nome,
                nodeId,
                ...(filePath ? { filePath } : {}),
            });
        }

        groups.push({ name: nome, total: entries.length, items, truncated, semDestino });
    }

    const total = Number.isFinite(tree?.total) ? Number(tree.total) : groups.reduce((soma, g) => soma + g.total, 0);
    const empty = Boolean(tree?.empty) || groups.length === 0;

    const block: CanvasMenuBlock = {
        menuId,
        scale: reading?.scale ?? 'indefinida',
        scaleLabel: asText(reading?.label) || 'Escala indefinida',
        title: '',
        groups,
        total,
        empty,
    };
    // O título sai do próprio bloco (`canvasMenuTitle` só recebe o bloco): a
    // contagem que ele declara é a mesma lista que vai virar nó, e não uma
    // segunda conta que poderia divergir dela.
    block.title = canvasMenuTitle(block);

    return block;
}

/* ==========================================================================
   Os textos: markdown simples, byte a byte
   ========================================================================== */

/**
 * O texto do nó de título — determinístico, byte a byte.
 *
 * Markdown simples, **sem callout**: o canvas do Obsidian não registra tipo de
 * callout (medido em 15/09, na peça do cabeçalho). Ele declara **o que é** (o
 * menu do acervo deste canvas), a **escala lida** e a conta do acervo: quantos
 * itens ele tem, quantos entraram no desenho, quantos ficaram fora do teto e
 * quantos não têm arquivo clicável.
 *
 * Recebe **só o bloco**: toda a conta sai das mesmas listas que viram nó, então
 * duas chamadas sobre o mesmo estado dão a mesma string, e o número declarado
 * não pode divergir do número desenhado. O teto **efetivo** da execução não
 * aparece aqui — ele é declarado na mensagem ao operador, que é onde o número do
 * corte precisa vir acompanhado do teto que o produziu.
 */
export function canvasMenuTitle(block: CanvasMenuBlock): string {
    const groups = block?.groups ?? [];
    const entraram = groups.reduce((soma, group) => soma + group.items.length, 0);
    const truncated = groups.reduce((soma, group) => soma + group.truncated, 0);
    const semDestino = groups.reduce((soma, group) => soma + group.semDestino, 0);

    const linhas: string[] = [
        `## ${CANVAS_MENU_LABEL}`,
        `**Escala:** ${block?.scaleLabel ?? ''} · **Acervo:** ${block?.total ?? 0} item(ns) em ${groups.length} grupo(s)`,
    ];

    if (block?.empty) {
        // O acervo vazio é DITO: um bloco em branco faria o desenho parecer cheio.
        linhas.push('Acervo vazio: nenhum protocolo ou comando do DFM foi encontrado — o menu declara isso em vez de desenhar itens.');
    } else {
        linhas.push(`**No desenho:** ${entraram} item(ns) · fora do teto: ${truncated} · sem arquivo clicável: ${semDestino} — o menu executa por id`);
    }

    return linhas.join('\n');
}

/**
 * O texto do nó de grupo: o nome, quantos itens ele tem e o que ficou de fora.
 *
 * O item sem arquivo clicável é declarado **aqui**, no grupo dele: o desenho diz
 * que aquele grupo é executado por id (e não por clique em nota), em vez de
 * omitir o fato ou de inventar um caminho.
 */
export function canvasMenuGroupTitle(group: CanvasMenuGroupPlan): string {
    const extras: string[] = [
        `no desenho: ${group?.items?.length ?? 0}`,
        `fora do teto: ${group?.truncated ?? 0}`,
    ];
    if (group?.semDestino) extras.push(`sem arquivo clicável: ${group.semDestino} — o menu executa por id`);

    return [`### ${group?.name ?? ''}`, `**Itens:** ${group?.total ?? 0} · ${extras.join(' · ')}`].join('\n');
}

/**
 * O texto do nó de item: o rótulo e **o id que o menu executa**.
 *
 * É esta linha que dá ao operador o que ele precisa para agir: o rótulo diz o
 * que a função é, e o id diz qual função é — o mesmo id que o clique direito e a
 * rail executam por `runCanvasMenuEntry`. Quando o acervo declara um caminho de
 * arquivo de verdade, ele entra como terceira linha (o destino fica visível).
 */
export function canvasMenuItemTitle(item: CanvasMenuItem): string {
    const linhas = [
        `**${item?.label ?? ''}**`,
        `${item?.kind === 'command' ? 'comando' : 'protocolo'}: ${item?.entryId ?? ''}`,
    ];
    if (item?.filePath) linhas.push(`arquivo: ${item.filePath}`);
    return linhas.join('\n');
}

/* ==========================================================================
   A geometria: coluna única, um nó por linha
   ========================================================================== */

/** Quantos nós o bloco tem, contando o título e os grupos. */
function canvasMenuNodeCount(block: CanvasMenuBlock): number {
    return 1 + (block?.groups ?? []).reduce((soma, group) => soma + 1 + group.items.length, 0);
}

/**
 * A altura do grupo: `n × 150 + (n − 1) × 24` — a coluna inteira, sem sobra.
 *
 * É a mesma conta que posiciona os nós (`y = âncora.y + i × 174`), e é por isso
 * que ela é uma função só: grupo e nós não podem discordar sobre o tamanho.
 */
export function canvasMenuBlockHeight(block: CanvasMenuBlock): number {
    const nos = canvasMenuNodeCount(block);
    return nos * CANVAS_MENU_NODE_HEIGHT + (nos - 1) * CANVAS_MENU_GAP;
}

/**
 * As linhas de nó do bloco — **uma** por elemento, na ordem do desenho: o título
 * primeiro, depois cada grupo com os itens dele.
 *
 * A geometria é a do bloco (âncora): a coluna desce em `y + i × 174`, com a
 * largura do bloco em todos os nós. Os ids vêm de `canvasMenuNodeIds`, então a
 * linha escrita e o id prometido pelo plano são a mesma coisa.
 *
 * Título, grupos e itens são `type:"text"` com a cor do menu: o acervo vivo não
 * tem caminho de arquivo, e um nó `type:"file"` apontando um caminho inventado
 * seria um clique que não abre nada.
 */
export function renderCanvasMenuNodes(
    block: CanvasMenuBlock,
    geometry: { x: number; y: number; width: number; height: number },
): string[] {
    const x = Number.isFinite(geometry?.x) ? geometry.x : 0;
    const y = Number.isFinite(geometry?.y) ? geometry.y : 0;
    const passo = CANVAS_MENU_NODE_HEIGHT + CANVAS_MENU_GAP;
    const posicao = (indice: number) => ({ x, y: y + indice * passo, width: CANVAS_MENU_WIDTH, height: CANVAS_MENU_NODE_HEIGHT });

    const ids = canvasMenuNodeIds(block);
    const conteudos: Array<Record<string, unknown>> = [
        { type: 'text', text: block?.title ?? '', color: CANVAS_MENU_COLOR, ...posicao(0) },
    ];

    for (const group of block?.groups ?? []) {
        conteudos.push({ type: 'text', text: canvasMenuGroupTitle(group), color: CANVAS_MENU_COLOR, ...posicao(conteudos.length) });
        for (const item of group.items) {
            conteudos.push({ type: 'text', text: canvasMenuItemTitle(item), color: CANVAS_MENU_COLOR, ...posicao(conteudos.length) });
        }
    }

    return conteudos.map((conteudo, indice) => JSON.stringify({
        id: ids[indice],
        ...conteudo,
        // O marcador vai em CADA nó do bloco — é por ele que a gravação
        // reencontra o bloco no texto cru, e é ele que impede um segundo.
        mode: CANVAS_MENU_MARKER,
    }));
}
