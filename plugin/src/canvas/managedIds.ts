/**
 * Quem é dono de cada pedaço de um canvas: a zona gerida (ids `dfm-pc-*` do
 * canvas de projeto e `dfm-q*` do canvas do trimestre) ou o operador.
 *
 * Três decisões dependem disso e moravam espalhadas:
 * - o formatador e o motor antigo não mexem em nó gerido como mexem no resto;
 * - o formatador não grava `relacoes` em nenhuma nota de um canvas gerido
 *   (`canvasRelationsAllowed`): o canvas gerido já liga a tarefa pelos campos;
 * - o motor antigo não traduz seta que toca tarefa, semana ou dia em canvas
 *   nenhum (Fase 6 do plano do canvas, 15/10/2026). Quem traduz é o observador
 *   de setas (`edgeLinks.ts`), com uma tabela só; a tradução antiga gravava
 *   `blocking`/`blockedBy` entre SMART e ação, e `projects += [[2026-W42]]`
 *   entre tarefa e semana;
 * - antes de regravar a zona de um canvas aberto, a parte do operador da vista
 *   tem de bater com o disco (guarda contra vista desatualizada);
 * - a seta do operador que toca a zona só fica se for anotação
 *   (`operatorEdges`).
 *
 * Módulo puro: sem Obsidian.
 */

export const MANAGED_PREFIXES = ['dfm-pc-', 'dfm-q'] as const;

export function isManagedId(id: unknown): boolean {
    return typeof id === 'string' && MANAGED_PREFIXES.some(prefix => id.startsWith(prefix));
}

/** O canvas tem zona gerida se algum nó dele tem id gerido. */
export function hasManagedZone(ids: Iterable<unknown>): boolean {
    for (const id of ids) if (isManagedId(id)) return true;
    return false;
}

/**
 * Tipos de ponta (de `CanvasEngine.getFileType`) cujas setas o motor antigo não
 * traduz. `task` é a tarefa arquivada: fora de `TaskNotes/Tasks/`, o tipo vem
 * do frontmatter (`type: task`).
 */
export const LEGACY_REFUSED_TYPES: ReadonlySet<string> = new Set(['tasknote', 'task', 'weekly_note', 'daily_note']);

/** Os tipos de nota de projeto: a iniciativa, o projeto e o departamento. */
export const PROJECT_NOTE_TYPES: ReadonlySet<string> = new Set(['iniciativa', 'projeto', 'departamento']);

/**
 * O que faz: se o canvas solto tem o nome de um projeto: o `[[<nome do canvas>]]` abre uma
 * nota de projeto ou de departamento, ou o canvas é o do projeto homônimo (o README de
 * repositório, que o link não abre, como um portfólio de repositórios).
 * Por quê: o `projects` liga a tarefa ao projeto, e o `relacoes` fica para o resto (Passo 0
 * da Missão, 0d, 27/10/2026). O canvas do projeto tem o nome do projeto: gravar
 * `relacoes: [[<nome do canvas>]]` repetia o `projects`.
 * Entra → sai: o `type` da nota que o link abre (ou `null`), o nome do projeto dono do canvas
 * (ou `null`) e o nome do canvas → booleano.
 * Erro e ataque: caixa e acento diferentes casam (NFC, minúsculas); nomes vazios → `false`.
 * Prova: tests/engine/canvasSyncCanvasLink.test.ts ("canvas com o nome do projeto").
 */
export function canvasNameIsProject(input: { linkType: string | null | undefined; ownerName: string | null | undefined; canvasName: string }): boolean {
    if (PROJECT_NOTE_TYPES.has(String(input.linkType ?? ''))) return true;
    const fold = (v: unknown) => String(v ?? '').normalize('NFC').toLowerCase().trim();
    return Boolean(fold(input.ownerName)) && fold(input.ownerName) === fold(input.canvasName);
}

/** O tipo é de tarefa (aberta ou arquivada)? A sincronização reversa não as trata. */
export function isTaskType(type: string | null | undefined): boolean {
    return type === 'tasknote' || type === 'task';
}

export interface LegacyEdge {
    /**
     * O canvas tem zona gerida. Desde a Fase 6 não muda a resposta: a seta de
     * tarefa, semana ou dia é do observador de setas em todo canvas.
     */
    managed?: boolean;
    fromType: string | null;
    toType: string | null;
}

/**
 * A seta pode virar campo pela tradução antiga do motor? Não quando uma ponta é
 * tarefa, tarefa arquivada, semana ou dia, em canvas nenhum. O resto (nota↔nota,
 * meta→projeto, projeto→área) segue como era.
 */
export function legacyEdgeAllowed({ fromType, toType }: LegacyEdge): boolean {
    return !LEGACY_REFUSED_TYPES.has(String(fromType)) && !LEGACY_REFUSED_TYPES.has(String(toType));
}

/**
 * A seta apagada abre a pergunta "remover também dos metadados"? Só entre duas
 * notas comuns (`relatesTo`/`relatedBy`). Os outros pares não têm o que desfazer
 * por ali: a seta de tarefa é desfeita pelo observador, com [Desfazer].
 */
export function legacyRemovalAsks({ fromType, toType }: LegacyEdge): boolean {
    return fromType === null && toType === null;
}

/**
 * O formatador pode gravar `relacoes: [[<canvas>]]` nas notas deste canvas?
 * Não num canvas com zona gerida (o de projeto), nem para o nó posto fora da
 * zona: o canvas gerido já liga a tarefa pelos campos dela. O caminho fica na
 * assinatura para quem chama; o caso do canvas temporal (`AAAA-Qn.canvas`,
 * `AAAA-Www.canvas`) saiu em 03/11/2026 com os canvas da semana e do trimestre.
 */
export function canvasRelationsAllowed(_canvasPath: string | null | undefined, nodeIds: Iterable<unknown>): boolean {
    return !hasManagedZone(nodeIds);
}

/**
 * A seta do operador que toca a zona fica? Recebe a seta e as duas pontas no
 * plano novo. Quem sabe se a seta tem sentido de dado é o observador de setas
 * (`edgeLinks.annotationEdge`); o plano só pergunta.
 */
export type KeepEdge<E = any, N = any> = (edge: E, from: N, to: N) => boolean;

/**
 * As setas do operador que um plano de zona mantém (Fase 3 do plano do canvas):
 * - seta que não toca a zona fica, até a órfã (limpar o canvas dele não é
 *   trabalho da sincronização);
 * - seta que toca a zona fica só se as duas pontas existem no plano novo e
 *   `keepEdge` diz que ela é anotação, sem sentido de dado. A seta com dado sai:
 *   a zona desenha a seta gerida da mesma relação. Sem `keepEdge`, sai toda
 *   seta que toca a zona (o desenho de antes).
 *
 * A ordem das setas que ficam é a de entrada: plano do plano = mesmo plano.
 */
export function operatorEdges<E extends { id: string; fromNode: string; toNode: string }, N extends { id: string }>(
    edges: readonly E[],
    next: readonly N[],
    owned: (id: string) => boolean,
    keepEdge?: KeepEdge<E, N>,
): E[] {
    const byId = new Map(next.map(n => [n.id, n]));
    return edges.filter(e => {
        if (owned(String(e.id))) return false;
        if (!owned(String(e.fromNode)) && !owned(String(e.toNode))) return true;
        const from = byId.get(e.fromNode);
        const to = byId.get(e.toNode);
        return !!(keepEdge && from && to && keepEdge(e, from, to));
    });
}

interface LooseCanvas { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> }

/**
 * A parte do operador de um canvas, numa forma comparável: nós e setas fora da
 * zona, só com o que identifica o conteúdo e a geometria (arredondada, como o
 * canvas arredonda ao carregar). Cor e campos de exibição ficam de fora: o
 * canvas os normaliza e eles não dizem se a vista é velha. Seta órfã (ponta sem
 * nó) também fica de fora: o arquivo pode tê-la, mas a vista não a carrega.
 */
export function unmanagedSignature(data: LooseCanvas | null | undefined): string {
    const round = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v ?? null);
    const ids = new Set((data?.nodes ?? []).map(n => n?.id));
    const nodes = (data?.nodes ?? [])
        .filter(n => !isManagedId(n?.id))
        .map(n => [n.id, n.type ?? null, n.text ?? null, n.file ?? null, n.url ?? null, n.label ?? null,
            round(n.x), round(n.y), round(n.width), round(n.height)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const edges = (data?.edges ?? [])
        .filter(e => !isManagedId(e?.id) && ids.has(e?.fromNode) && ids.has(e?.toNode))
        .map(e => [e.id, e.fromNode ?? null, e.toNode ?? null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return JSON.stringify({ nodes, edges });
}
