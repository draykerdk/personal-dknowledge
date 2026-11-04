/**
 * Splice de blocos marcados no Canvas (cabeçalho fractal, menu do acervo).
 * Suporta blocos com nós intercalados e protege arestas autorais antes da escrita.
 */
import { CanvasElemento, elementosDoCanvas, findCanvasArraySpan, endOfJsonString } from './canvasSplice';

export type SpliceBlockOutcome = 'replaced' | 'unchanged' | 'refused';

export interface CanvasEdgeAttachment {
    id: string;
    fromNode: string;
    toNode: string;
}

export interface SpliceBlockOptions {
    /**
     * 'refuse' (padrão): recusa sem gravar para evitar perda de dados/arestas autorais.
     * 'clean': remove as arestas órfãs via cleanOrphanEdges.
     */
    edgePolicy?: 'refuse' | 'clean';
}

export interface SpliceBlockResult {
    next: string;
    outcome: SpliceBlockOutcome;
    oldIds: string[];
    removedIds: string[];
    primarySpan: { start: number; end: number; x: number; y: number };
    refusalReason?: string;
    conflictingEdges?: CanvasEdgeAttachment[];
}

/**
 * Remove cirurgicamente um elemento de uma lista JSON crua, preservando delimitadores.
 */
export function removeCanvasElement(raw: string, elemento: { start: number; end: number }): string {
    if (typeof raw !== 'string' || !elemento) return raw;
    const { start, end } = elemento;
    if (start < 0 || end > raw.length || start >= end) return raw;

    let cursor = end;
    while (cursor < raw.length && (raw[cursor] === ' ' || raw[cursor] === '\t')) cursor++;
    if (cursor < raw.length && raw[cursor] === ',') {
        cursor++;
        while (cursor < raw.length && (raw[cursor] === ' ' || raw[cursor] === '\t')) cursor++;
        if (cursor < raw.length && raw[cursor] === '\n') cursor++;
        return `${raw.slice(0, start)}${raw.slice(cursor)}`;
    }

    cursor = start - 1;
    while (cursor >= 0 && (raw[cursor] === ' ' || raw[cursor] === '\t' || raw[cursor] === '\n')) cursor--;
    if (cursor >= 0 && raw[cursor] === ',') {
        return `${raw.slice(0, cursor)}${raw.slice(end)}`;
    }
    return `${raw.slice(0, start)}${raw.slice(end)}`;
}

/**
 * Retorna os elementos de qualquer array de topo do canvas ("nodes", "edges", etc).
 */
export function elementosDeArray(raw: string, key: string): CanvasElemento[] | null {
    const span = findCanvasArraySpan(raw, key);
    if (!span) return null;

    const elementos: CanvasElemento[] = [];
    let index = span.open + 1;
    let start = -1;
    let depth = 0;

    while (index < span.close) {
        const char = raw[index];
        if (char === '"') {
            const fim = endOfJsonString(raw, index);
            if (fim < 0) return elementos;
            index = fim + 1;
            continue;
        }
        if (char === '{' || char === '[') {
            if (depth === 0 && start < 0) start = index;
            depth++;
            index++;
            continue;
        }
        if (char === '}' || char === ']') {
            depth--;
            index++;
            if (depth <= 0 && start >= 0) {
                let node: any = null;
                try { node = JSON.parse(raw.slice(start, index)); } catch (_) { node = null; }
                elementos.push({ start, end: index, node });
                start = -1;
                depth = 0;
            }
            continue;
        }
        index++;
    }
    return elementos;
}

/**
 * Identifica arestas conectadas a nós específicos (em fromNode ou toNode).
 */
export function findAttachedEdges(
    raw: string,
    targetNodeIds: ReadonlyArray<string>,
): CanvasEdgeAttachment[] {
    if (typeof raw !== 'string' || !Array.isArray(targetNodeIds) || targetNodeIds.length === 0) {
        return [];
    }
    const idSet = new Set(targetNodeIds.map(String));
    const edges = elementosDeArray(raw, 'edges');
    if (!edges || edges.length === 0) return [];

    const found: CanvasEdgeAttachment[] = [];
    for (const elem of edges) {
        const from = String(elem.node?.fromNode ?? '');
        const to = String(elem.node?.toNode ?? '');
        if ((from && idSet.has(from)) || (to && idSet.has(to))) {
            found.push({ id: String(elem.node?.id ?? ''), fromNode: from, toNode: to });
        }
    }
    return found;
}

/**
 * Remove arestas cujo `fromNode` ou `toNode` pertence à lista de nós descartados.
 */
export function cleanOrphanEdges(raw: string, removedNodeIds: ReadonlyArray<string>): string {
    if (typeof raw !== 'string' || !Array.isArray(removedNodeIds) || removedNodeIds.length === 0) {
        return raw;
    }
    const idSet = new Set(removedNodeIds.map(String));
    const edges = elementosDeArray(raw, 'edges');
    if (!edges || edges.length === 0) return raw;

    const toRemove = edges.filter(edge => {
        const from = String(edge.node?.fromNode ?? '');
        const to = String(edge.node?.toNode ?? '');
        return (from && idSet.has(from)) || (to && idSet.has(to));
    });
    if (toRemove.length === 0) return raw;

    let cleaned = raw;
    toRemove.sort((a, b) => b.start - a.start);
    for (const elem of toRemove) {
        cleaned = removeCanvasElement(cleaned, elem);
    }
    return cleaned;
}

/**
 * Extrai os ids declarados em um bloco de nós gerado.
 */
export function extractNodeIdsFromJson(candidateBlock: string): string[] {
    if (typeof candidateBlock !== 'string' || candidateBlock.trim() === '') return [];
    const ids: string[] = [];
    const regex = /"id"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(candidateBlock)) !== null) {
        if (match[1]) ids.push(match[1]);
    }
    return ids;
}

/**
 * Substitui com segurança um bloco marcado, mesmo com nós dispersos ou intercalados.
 */
export function spliceMarkedBlock(
    raw: string,
    marker: string,
    candidateBlock: string,
    tipoInicial: string = 'group',
    options?: SpliceBlockOptions,
): SpliceBlockResult | null {
    if (typeof raw !== 'string' || raw === '' || !marker) return null;
    const elementos = elementosDoCanvas(raw);
    if (!elementos || elementos.length === 0) return null;

    const marcados = elementos.filter(e => e.node?.mode === marker);
    if (marcados.length === 0) return null;

    let inicio = elementos.findIndex(e => e.node?.type === tipoInicial && e.node?.mode === marker);
    if (inicio < 0) inicio = elementos.findIndex(e => e.node?.mode === marker);
    if (inicio < 0) return null;

    let fim = inicio;
    while (fim + 1 < elementos.length && elementos[fim + 1].node?.mode === marker) {
        fim++;
    }

    const primaryCluster = elementos.slice(inicio, fim + 1);
    const primaryStart = primaryCluster[0].start;
    let primaryEnd = primaryCluster[primaryCluster.length - 1].end;
    if (raw[primaryEnd] === ',') primaryEnd += 1;

    const firstNode = primaryCluster[0].node;
    const primarySpan = {
        start: primaryStart,
        end: primaryEnd,
        x: Number(firstNode?.x),
        y: Number(firstNode?.y),
    };

    const primaryIds = new Set(primaryCluster.map(e => String(e.node?.id ?? '')));
    const scatteredElements = marcados.filter(e => !primaryIds.has(String(e.node?.id ?? '')));

    const consumiuVirgula = raw[primaryEnd - 1] === ',';
    const candidato = consumiuVirgula ? `${candidateBlock},` : candidateBlock;
    if (scatteredElements.length === 0 && raw.slice(primaryStart, primaryEnd) === candidato) {
        return {
            next: raw,
            outcome: 'unchanged',
            oldIds: marcados.map(e => String(e.node?.id ?? '')).filter(Boolean),
            removedIds: [],
            primarySpan,
        };
    }

    const oldIds = marcados.map(e => String(e.node?.id ?? '')).filter(Boolean);
    const newIds = extractNodeIdsFromJson(candidateBlock);
    const removedIds = oldIds.filter(id => !newIds.includes(id));

    // Proteção de Integridade Autoral (A3): recusa se houver aresta conectada a nó removido
    if (removedIds.length > 0) {
        const attachedEdges = findAttachedEdges(raw, removedIds);
        if (attachedEdges.length > 0 && options?.edgePolicy !== 'clean') {
            const edgeDesc = attachedEdges.map(e => `${e.id || 'sem-id'} (${e.fromNode} -> ${e.toNode})`).join(', ');
            return {
                next: raw,
                outcome: 'refused',
                oldIds,
                removedIds,
                primarySpan,
                refusalReason: `remoção de nós gerados ("${removedIds.join(', ')}") impactaria aresta(s) conectada(s): ${edgeDesc}; operação recusada sem gravar`,
                conflictingEdges: attachedEdges,
            };
        }
    }

    let currentRaw = raw;
    let adjustedStart = primaryStart;
    let adjustedEnd = primaryEnd;

    const sortedScattered = [...scatteredElements].sort((a, b) => b.start - a.start);
    for (const elem of sortedScattered) {
        const lenBefore = currentRaw.length;
        currentRaw = removeCanvasElement(currentRaw, elem);
        const delta = lenBefore - currentRaw.length;
        if (elem.end <= adjustedStart) {
            adjustedStart -= delta;
            adjustedEnd -= delta;
        }
    }

    const consumiuVirgulaCleaned = currentRaw[adjustedEnd - 1] === ',';
    const finalCandidate = consumiuVirgulaCleaned ? `${candidateBlock},` : candidateBlock;
    let next = `${currentRaw.slice(0, adjustedStart)}${finalCandidate}${currentRaw.slice(adjustedEnd)}`;

    if (removedIds.length > 0) {
        next = cleanOrphanEdges(next, removedIds);
    }

    return { next, outcome: 'replaced', oldIds, removedIds, primarySpan };
}
