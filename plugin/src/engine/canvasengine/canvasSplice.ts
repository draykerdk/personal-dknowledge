/**
 * Primitivas puras de splice textual e geometria de arquivos .canvas.
 *
 * Responsável pela localização e mutação não-destrutiva de arrays e blocos
 * em strings JSON brutas de canvas, preservando integridade byte a byte,
 * formatação e recuo original sem reformatar o arquivo inteiro.
 */

export const CANVAS_FILE_NODE_WIDTH = 400;
export const CANVAS_FILE_NODE_HEIGHT = 150;
export const RAIL_NODE_GAP = 24;

interface RailRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function asNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function rectOf(candidate: unknown): RailRect | null {
    if (!candidate || typeof candidate !== 'object') return null;
    const obj = candidate as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
        x,
        y,
        width: Math.max(asNumber(obj.width, CANVAS_FILE_NODE_WIDTH), 1),
        height: Math.max(asNumber(obj.height, CANVAS_FILE_NODE_HEIGHT), 1),
    };
}

function overlaps(a: RailRect, b: RailRect, gap = RAIL_NODE_GAP): boolean {
    return !(
        a.x + a.width + gap <= b.x
        || b.x + b.width + gap <= a.x
        || a.y + a.height + gap <= b.y
        || b.y + b.height + gap <= a.y
    );
}

/** O fim da string JSON que começa em `start` (a aspa de abertura). */
export function endOfJsonString(raw: string, start: number): number {
    let index = start + 1;
    while (index < raw.length) {
        const char = raw[index];
        if (char === '\\') { index += 2; continue; }
        if (char === '"') return index;
        index++;
    }
    return -1;
}

/** O `]` que fecha o `[` em `open`, respeitando strings e escapes. */
function matchingBracket(raw: string, open: number): number {
    let depth = 0;
    let index = open;
    while (index < raw.length) {
        const char = raw[index];
        if (char === '"') {
            const end = endOfJsonString(raw, index);
            if (end < 0) return -1;
            index = end + 1;
            continue;
        }
        if (char === '[') depth++;
        else if (char === ']') {
            depth--;
            if (depth === 0) return index;
        }
        index++;
    }
    return -1;
}

/** O span da lista `"<key>"` no texto cru: offsets do `[` e do `]` que a fecham. */
export function findCanvasArraySpan(raw: string, key: string): { open: number; close: number; keyStart: number } | null {
    if (typeof raw !== 'string') return null;
    const alvo = `"${key}"`;
    let index = 0;

    while (index < raw.length) {
        const char = raw[index];
        if (char === '"') {
            const end = endOfJsonString(raw, index);
            if (end < 0) return null;
            if (raw.slice(index, end + 1) === alvo) {
                let cursor = end + 1;
                while (cursor < raw.length && /\s/.test(raw[cursor])) cursor++;
                if (raw[cursor] !== ':') { index = end + 1; continue; }
                cursor++;
                while (cursor < raw.length && /\s/.test(raw[cursor])) cursor++;
                if (raw[cursor] !== '[') return null;
                const close = matchingBracket(raw, cursor);
                return close < 0 ? null : { open: cursor, close, keyStart: index };
            }
            index = end + 1;
            continue;
        }
        index++;
    }
    return null;
}

/** A indentação que cada elemento de `nodes` recebe no arquivo. */
export function indentacaoDeElemento(raw: string): string {
    const span = findCanvasArraySpan(raw, 'nodes');
    if (!span) return '\t\t';

    const linhaInicio = raw.lastIndexOf('\n', span.keyStart) + 1;
    const recuoChave = (raw.slice(linhaInicio).match(/^[ \t]*/) ?? [''])[0];
    const corpo = raw.slice(span.open + 1, span.close);

    let recuo = `${recuoChave}\t`;
    const primeiro = corpo.search(/\n[ \t]*\S/);
    if (primeiro >= 0) {
        const linha = corpo.slice(primeiro + 1);
        recuo = (linha.match(/^[ \t]*/) ?? [''])[0] || recuo;
    }
    return recuo;
}

/** O arquivo com o nó novo dentro da lista `"nodes"`, e nada mais mudado. */
export function insertCanvasNodeText(raw: string, nodeJson: string): string | null {
    const span = findCanvasArraySpan(raw, 'nodes');
    if (!span) return null;

    const corpo = raw.slice(span.open + 1, span.close);
    const linhaInicio = raw.lastIndexOf('\n', span.keyStart) + 1;
    const recuoChave = (raw.slice(linhaInicio).match(/^[ \t]*/) ?? [''])[0];
    const multilinha = corpo.includes('\n');
    const recuoElemento = indentacaoDeElemento(raw);

    const vazio = corpo.trim() === '';
    if (vazio) {
        if (!multilinha) return `${raw.slice(0, span.open + 1)}${nodeJson}${raw.slice(span.close)}`;
        return `${raw.slice(0, span.open + 1)}\n${recuoElemento}${nodeJson}\n${recuoChave}${raw.slice(span.close)}`;
    }

    let ultimo = span.close - 1;
    while (ultimo > span.open && /\s/.test(raw[ultimo])) ultimo--;
    const jaTemVirgula = raw[ultimo] === ',';
    const virgula = jaTemVirgula ? '' : ',';
    const separador = multilinha ? `\n${recuoElemento}` : '';
    const posicao = ultimo + 1;
    return `${raw.slice(0, posicao)}${virgula}${separador}${nodeJson}${raw.slice(posicao)}`;
}

export interface CanvasElemento {
    start: number;
    end: number;
    node: any;
}

/** Os elementos da lista `"nodes"`, cada um com o span de bytes no texto cru. */
export function elementosDoCanvas(raw: string): CanvasElemento[] | null {
    const span = findCanvasArraySpan(raw, 'nodes');
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

/** O span de um bloco marcado no texto cru. */
export function findMarkedBlockSpan(
    raw: string,
    marker: string,
    tipoInicial: string = 'group',
): { start: number; end: number; ids: string[]; x: number; y: number } | null {
    if (typeof raw !== 'string' || raw === '' || typeof marker !== 'string' || marker === '') return null;
    const elementos = elementosDoCanvas(raw);
    if (!elementos) return null;

    const inicio = elementos.findIndex(elemento => elemento.node?.type === tipoInicial && elemento.node?.mode === marker);
    if (inicio < 0) return null;

    let fim = inicio;
    while (fim + 1 < elementos.length && elementos[fim + 1].node?.mode === marker) fim++;

    let end = elementos[fim].end;
    if (raw[end] === ',') end += 1;

    const node = elementos[inicio].node;
    return {
        start: elementos[inicio].start,
        end,
        ids: elementos.slice(inicio, fim + 1).map(elemento => String(elemento.node?.id ?? '')),
        x: Number(node?.x),
        y: Number(node?.y),
    };
}

/** A primeira posição livre a partir da preferida. */
export function findFreeCanvasPosition(
    nodes: ReadonlyArray<unknown> | null | undefined,
    preferred: { x: number; y: number },
    size: { width: number; height: number },
    rings = 12,
): { x: number; y: number } {
    const ocupados = (nodes ?? []).map(rectOf).filter((rect): rect is RailRect => rect !== null);
    const largura = Math.max(asNumber(size?.width, CANVAS_FILE_NODE_WIDTH), 1);
    const altura = Math.max(asNumber(size?.height, CANVAS_FILE_NODE_HEIGHT), 1);
    const passoX = largura + RAIL_NODE_GAP;
    const passoY = altura + RAIL_NODE_GAP;

    const baseX = asNumber(preferred?.x, 0);
    const baseY = asNumber(preferred?.y, 0);

    for (let anel = 0; anel <= rings; anel++) {
        for (let dy = -anel; dy <= anel; dy++) {
            for (let dx = -anel; dx <= anel; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== anel) continue;
                const candidato = { x: Math.round(baseX + dx * passoX), y: Math.round(baseY + dy * passoY) };
                const caixa: RailRect = { x: candidato.x, y: candidato.y, width: largura, height: altura };
                if (!ocupados.some(rect => overlaps(rect, caixa))) return candidato;
            }
        }
    }

    return { x: Math.round(baseX), y: Math.round(baseY) };
}

/** O centro da caixa que contém os nós existentes; `null` quando não há nenhum. */
export function centerOfCanvasNodes(nodes: ReadonlyArray<unknown> | null | undefined): { x: number; y: number } | null {
    const caixas = (nodes ?? []).map(rectOf).filter((rect): rect is RailRect => rect !== null);
    if (caixas.length === 0) return null;

    const minX = Math.min(...caixas.map(rect => rect.x));
    const minY = Math.min(...caixas.map(rect => rect.y));
    const maxX = Math.max(...caixas.map(rect => rect.x + rect.width));
    const maxY = Math.max(...caixas.map(rect => rect.y + rect.height));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Hash FNV-1a de 32 bits em hex — id determinístico, sem `Math.random`. */
export function railNodeIdFor(filePath: string, taken: ReadonlyArray<string> = []): string {
    let hash = 0x811c9dc5;
    const seed = String(filePath ?? '');
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    let id = `dfm-file-${hash.toString(16).padStart(8, '0')}`;
    let sufixo = 1;
    while (taken.includes(id)) {
        id = `dfm-file-${hash.toString(16).padStart(8, '0')}-${sufixo++}`;
    }
    return id;
}
