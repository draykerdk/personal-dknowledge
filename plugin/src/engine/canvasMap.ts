/**
 * Mapa de canvas — a camada que transforma `.canvas` em superfície operável.
 *
 * O vault é baseado em canvas: 63 arquivos, 56 com arestas. Quatro deles são
 * cockpits de área (sem arestas, curados à mão); o resto são mapas de verdade,
 * alguns já tentativas de painel geral (`MAPA_GERAL_DFM`, `Dk-Fleet-Commander`,
 * `Protocols-Hub`).
 *
 * O problema que este módulo resolve: canvas é ótimo para **desenhar relação** e
 * péssimo para **operar**. Não dá para ver saúde de projeto, tarefas abertas ou
 * estado vivo dentro dele. Aqui o nó deixa de ser um retângulo inerte e passa a
 * carregar o que o vault sabe sobre ele.
 *
 * Três regras duras:
 * 1. **O layout é o do autor.** As coordenadas vêm do arquivo, nunca de um
 *    auto-layout que ignora o trabalho já feito.
 * 2. **Nada é inventado.** Nó sem destino resolvido vira estado `órfão`; aresta
 *    apontando para nó inexistente é descartada e **contada**, não desenhada.
 * 3. **Nenhuma cor literal.** A cor do canvas (1–6) vira token semântico e o CSS
 *    resolve no tema ativo.
 * 4. **O corte é declarado.** `MAX_DRAWN_NODES` limita o desenho, mas o limite
 *    viaja no resultado (`truncation`): a tela pode dizer "120 de 200" em vez de
 *    apresentar 120 como se fossem todos.
 */

export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';

export interface CanvasNodeBox {
    id: string;
    type: CanvasNodeType;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Cor do arquivo (1–6) ou `null` quando o autor não pintou. */
    colorIndex: number | null;
    /** Rótulo curto para desenhar no nó. */
    label: string;
    /** Caminho do arquivo/nota de destino, quando o nó aponta para algo. */
    target: string | null;
    /** Caminho existe no vault? Ausente deixa de ser um nó operável. */
    resolved: boolean;
    /** Cabeçalho lido do corpo do nó de texto (`#`/`###`), para agrupar visualmente. */
    heading: string | null;
    /** Nó de texto que contém bloco executável (`dfm`/`dataviewjs`) — o autor quis operação aqui. */
    interactive: boolean;
    /** Grupo que contém este nó, quando houver. */
    groupId: string | null;
}

export interface CanvasEdge {
    id: string;
    from: string;
    to: string;
    fromSide: string;
    toSide: string;
    label: string;
}

export interface CanvasGraph {
    path: string;
    name: string;
    nodes: CanvasNodeBox[];
    edges: CanvasEdge[];
    /** Arestas descartadas por apontar para nó que não existe no arquivo. */
    droppedEdges: number;
    /** Nós de arquivo cujo destino não existe no vault. */
    orphans: number;
    /** Limites do desenho, já incluindo os grupos. */
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    /**
     * O corte por teto, declarado — nunca silencioso.
     *
     * `MAX_DRAWN_NODES` existe para um canvas gigante não travar a view, mas um
     * corte que não se anuncia é uma mentira por omissão: a tela mostra 120 nós e
     * o operador lê "o canvas tem 120 nós". Este campo é o que permite dizer
     * "120 de 200".
     */
    truncation: CanvasTruncation;
}

export interface CanvasTruncation {
    /** Nós que o teto deixou desenhar. */
    drawn: number;
    /** Nós declarados no arquivo. */
    total: number;
    /** Teto vigente (`MAX_DRAWN_NODES`). */
    limit: number;
    /** `total - drawn`: quantos ficaram fora. */
    dropped: number;
    /** Arestas perdidas porque uma das pontas ficou fora do corte. */
    edgesDropped: number;
}

const OVERVIEW_HINTS = ['mapa_geral', 'fleet', 'protocols-hub', 'arquitetura', 'painel', 'dashboard', 'cockpit'];

/** Teto de nós desenhados: um canvas gigante não pode travar a view. */
export const MAX_DRAWN_NODES = 120;

function firstHeading(text: string): string | null {
    const match = String(text ?? '').match(/^\s{0,3}#{1,4}\s+(.+)$/m);
    return match ? match[1].replace(/[*_`]/g, '').trim() : null;
}

function shortLabel(node: any): string {
    if (node.type === 'text' || node.type === 'link') {
        const heading = firstHeading(node.text ?? '') ?? String(node.url ?? '');
        if (heading) return heading;
        const firstLine = String(node.text ?? '').split('\n').map((line: string) => line.trim()).find(Boolean) ?? '';
        return firstLine.replace(/[*_`#]/g, '').slice(0, 64) || '(texto vazio)';
    }
    const path = String(node.file ?? '');
    const name = path.split('/').pop() ?? path;
    return name.replace(/\.(md|canvas)$/, '');
}

function basename(path: string): string {
    return String(path ?? '').split('/').pop() ?? String(path ?? '');
}

/**
 * Deriva do nome/pasta se o canvas é uma tentativa de panorama do sistema.
 * Heurística declarada — não decide nada sozinha, só ordena a lista.
 */
export function looksLikeOverview(path: string): boolean {
    const lower = String(path).toLowerCase();
    return OVERVIEW_HINTS.some(hint => lower.includes(hint));
}

/**
 * Interpreta um `.canvas` já lido. Função pura: recebe texto, devolve grafo.
 *
 * `exists` responde se um caminho do vault existe — injetado para o teste rodar
 * sem Obsidian, e para o chamador decidir se checa o vault ou confia no cache.
 */
export function parseCanvasGraph(
    path: string,
    raw: string,
    exists: (target: string) => boolean = () => true,
): CanvasGraph {
    const empty: CanvasGraph = {
        path, name: basename(path).replace(/\.canvas$/, ''),
        nodes: [], edges: [], droppedEdges: 0, orphans: 0,
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        truncation: { drawn: 0, total: 0, limit: MAX_DRAWN_NODES, dropped: 0, edgesDropped: 0 },
    };
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch (_) {
        return empty;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) return empty;

    const declared: any[] = parsed.nodes;
    const rawNodes: any[] = declared.slice(0, MAX_DRAWN_NODES);
    const known = new Set(rawNodes.map(node => String(node?.id ?? '')).filter(Boolean));
    // Todo nó do arquivo, cortado ou não: é o que separa "aponta para nó
    // inexistente" de "a ponta ficou fora do teto".
    const allKnown = new Set(declared.map(node => String(node?.id ?? '')).filter(Boolean));

    // Grupos primeiro: um nó pertence ao grupo mais interno que o contém.
    const groups = rawNodes
        .filter(node => node?.type === 'group')
        .map(node => ({
            id: String(node.id),
            x: Number(node.x) || 0,
            y: Number(node.y) || 0,
            width: Number(node.width) || 0,
            height: Number(node.height) || 0,
        }))
        .sort((a, b) => (a.width * a.height) - (b.width * b.height));

    const groupFor = (node: any): string | null => {
        const x = Number(node.x) || 0;
        const y = Number(node.y) || 0;
        for (const group of groups) {
            if (x >= group.x && y >= group.y && x <= group.x + group.width && y <= group.y + group.height) {
                return group.id;
            }
        }
        return null;
    };

    const nodes: CanvasNodeBox[] = [];
    let orphans = 0;
    for (const node of rawNodes) {
        const type = String(node?.type ?? 'text') as CanvasNodeType;
        if (!['text', 'file', 'link', 'group'].includes(type)) continue;
        const target = type === 'file' ? String(node.file ?? '') : null;
        const resolved = target ? exists(target) : true;
        if (target && !resolved) orphans++;
        const text = String(node.text ?? '');
        nodes.push({
            id: String(node.id ?? ''),
            type,
            x: Number(node.x) || 0,
            y: Number(node.y) || 0,
            width: Number(node.width) || 0,
            height: Number(node.height) || 0,
            colorIndex: node.color === undefined || node.color === null ? null : Number(node.color),
            label: shortLabel(node),
            target,
            resolved,
            heading: type === 'text' ? firstHeading(text) : null,
            interactive: type === 'text' && /```(dfm|dataview|dataviewjs|tasks)/i.test(text),
            groupId: type === 'group' ? null : groupFor(node),
        });
    }

    // Aresta que aponta para nó inexistente é descartada e contada — desenhar uma
    // linha para lugar nenhum seria inventar relação. Aresta cuja ponta existe no
    // arquivo mas caiu no corte é **outra coisa** e por isso tem contador próprio:
    // somar as duas faria a tela acusar nó inexistente onde houve teto de desenho.
    const edges: CanvasEdge[] = [];
    let droppedEdges = 0;
    let edgesDropped = 0;
    for (const edge of Array.isArray(parsed.edges) ? parsed.edges : []) {
        const from = String(edge?.fromNode ?? '');
        const to = String(edge?.toNode ?? '');
        if (!known.has(from) || !known.has(to)) {
            if (allKnown.has(from) && allKnown.has(to)) edgesDropped++;
            else droppedEdges++;
            continue;
        }
        edges.push({
            id: String(edge?.id ?? `${from}->${to}`),
            from, to,
            fromSide: String(edge?.fromSide ?? 'right'),
            toSide: String(edge?.toSide ?? 'left'),
            label: String(edge?.label ?? ''),
        });
    }

    const xs = nodes.map(node => node.x);
    const ys = nodes.map(node => node.y);
    const rights = nodes.map(node => node.x + node.width);
    const bottoms = nodes.map(node => node.y + node.height);
    const bounds = nodes.length
        ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...rights), maxY: Math.max(...bottoms) }
        : empty.bounds;

    return {
        path,
        name: empty.name,
        nodes,
        edges,
        droppedEdges,
        orphans,
        bounds,
        truncation: {
            drawn: rawNodes.length,
            total: declared.length,
            limit: MAX_DRAWN_NODES,
            dropped: Math.max(0, declared.length - rawNodes.length),
            edgesDropped,
        },
    };
}

