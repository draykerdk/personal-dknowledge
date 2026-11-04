/**
 * Trocar ou acrescentar uma chave de primeiro nível num JSON sem reformatar o arquivo.
 *
 * O painel "Protocolos" grava a `fase_uso` e o `objetivo` que o operador escolheu ou
 * escreveu. O arquivo é dele (e dos juízes): reformatar 160 protocolos para mudar uma
 * linha mudaria a indentação e a ordem das chaves. Aqui só o trecho do valor muda; a
 * chave nova entra numa linha própria, ao lado da âncora, com a indentação dela.
 *
 * Módulo puro: sem Obsidian, sem DOM. Prova: tests/board/jsonKeyEdit.test.ts.
 */

export interface JsonMember {
    key: string;
    /** Do início da aspa da chave. */
    keyStart: number;
    valueStart: number;
    /** Logo depois do fim do valor. */
    valueEnd: number;
}

export type JsonEdit =
    | { ok: true; text: string; changed: boolean; before: unknown; after: unknown; beforeLine: string | null; afterLine: string }
    | { ok: false; error: string };

/** O que faz: o fim de uma string JSON que começa em `start` (a aspa), ou -1. */
function stringEnd(text: string, start: number): number {
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '\\') { i++; continue; }
        if (text[i] === '"') return i + 1;
    }
    return -1;
}

/**
 * O que faz: os membros de primeiro nível do objeto JSON do texto, com as posições da
 * chave e do valor. `null` se o texto não é um objeto.
 * Por quê: editar no lugar exige saber onde cada valor começa e termina sem reescrever.
 * Erro e ataque: aspas e chaves dentro de strings, escapes (`\"`), objetos aninhados.
 */
export function topLevelMembers(text: string): JsonMember[] | null {
    const open = text.search(/\S/);
    if (open === -1 || text[open] !== '{') return null;
    const members: JsonMember[] = [];
    let depth = 0;
    let key: string | null = null;
    let keyStart = -1;
    let valueStart = -1;
    const flush = (limit: number) => {
        if (key !== null && valueStart !== -1) members.push({ key, keyStart, valueStart, valueEnd: trimmedEnd(text, limit) });
        key = null;
        valueStart = -1;
    };
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            const end = stringEnd(text, i);
            if (end === -1) return null;
            if (depth === 1) {
                if (key === null) { key = JSON.parse(text.slice(i, end)); keyStart = i; }
                else if (valueStart === -1) valueStart = i;
            }
            i = end - 1;
            continue;
        }
        if (ch === '{' || ch === '[') {
            if (depth === 1 && key !== null && valueStart === -1) valueStart = i;
            depth++;
            continue;
        }
        if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) { flush(i); return members; }
            continue;
        }
        if (depth !== 1) continue;
        if (ch === ',') { flush(i); continue; }
        if (ch === ':' || /\s/.test(ch)) continue;
        if (key !== null && valueStart === -1) valueStart = i;
    }
    return null;
}

/** O que faz: a posição logo depois do último caractere não branco antes de `limit`. */
function trimmedEnd(text: string, limit: number): number {
    let end = limit;
    while (end > 0 && /\s/.test(text[end - 1])) end--;
    return end;
}

/** O que faz: igualdade estrutural de dois valores JSON (a ordem das chaves não conta). */
export function sameJson(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => sameJson(x, (b as unknown[])[i]));
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && sameJson((a as any)[k], (b as any)[k]));
}

/** O que faz: a linha do texto que contém a posição `at`, sem a quebra. */
function lineAt(text: string, at: number): string {
    const start = text.lastIndexOf('\n', at - 1) + 1;
    const end = text.indexOf('\n', at);
    return text.slice(start, end === -1 ? text.length : end);
}

/**
 * O que faz: o texto com a chave de primeiro nível `key` valendo `value`: troca só o
 * trecho do valor quando a chave existe; senão, acrescenta a chave logo depois da
 * primeira âncora que existe (na indentação dela), ou no começo do objeto.
 * Por quê: a fase e o objetivo são gravados a pedido do operador sem mexer no resto do
 * arquivo (indentação, ordem das chaves, quebras).
 * Entra → sai: texto do JSON, chave, valor (JSON) e âncoras → `JsonEdit`, com o valor de
 * antes e de depois e a linha de antes e de depois (para mostrar o que muda).
 * Erro e ataque: texto que não é objeto JSON, valor que não serializa, resultado que não
 * relê igual ao esperado (tudo devolve `ok: false`, e nada é gravado).
 * Prova: tests/board/jsonKeyEdit.test.ts.
 */
export function setTopLevelKey(text: string, key: string, value: unknown, anchors: readonly string[] = []): JsonEdit {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: `o JSON do arquivo não abre: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'o arquivo não é um objeto JSON' };
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return { ok: false, error: 'valor que não vira JSON' };
    const members = topLevelMembers(text);
    if (!members) return { ok: false, error: 'não foi possível localizar as chaves do arquivo' };
    const had = Object.prototype.hasOwnProperty.call(parsed, key);
    const before = had ? parsed[key] : undefined;
    if (had && sameJson(before, value)) {
        const m = members.find(x => x.key === key)!;
        return { ok: true, text, changed: false, before, after: value, beforeLine: lineAt(text, m.keyStart), afterLine: lineAt(text, m.keyStart) };
    }
    let next: string;
    let at: number;
    const existing = [...members].reverse().find(m => m.key === key);
    if (existing) {
        next = text.slice(0, existing.valueStart) + serialized + text.slice(existing.valueEnd);
        at = existing.keyStart;
    } else {
        const anchor = anchors.map(name => members.find(m => m.key === name)).find(Boolean) ?? null;
        const pair = `${JSON.stringify(key)}: ${serialized}`;
        if (anchor) {
            const lineStart = text.lastIndexOf('\n', anchor.keyStart - 1) + 1;
            // A âncora numa linha só dela (o arquivo indentado): a chave nova ganha a linha dela.
            const multiline = lineStart > 0 && /^\s*$/.test(text.slice(lineStart, anchor.keyStart));
            const indent = text.slice(lineStart, anchor.keyStart);
            const insert = multiline ? `,\n${indent}${pair}` : `, ${pair}`;
            next = text.slice(0, anchor.valueEnd) + insert + text.slice(anchor.valueEnd);
            at = anchor.valueEnd + insert.length - pair.length;
        } else {
            const open = text.indexOf('{');
            const first = members[0];
            const lineStart = first ? text.lastIndexOf('\n', first.keyStart - 1) + 1 : 0;
            const multiline = !!first && lineStart > open && /^\s*$/.test(text.slice(lineStart, first.keyStart));
            const indent = multiline ? text.slice(lineStart, first!.keyStart) : '';
            const insert = first ? (multiline ? `\n${indent}${pair},` : ` ${pair},`) : ` ${pair} `;
            next = text.slice(0, open + 1) + insert + text.slice(open + 1);
            at = open + 1 + insert.indexOf(pair);
        }
    }
    let reread: any;
    try { reread = JSON.parse(next); } catch (e) { return { ok: false, error: `a troca deixaria o JSON inválido: ${e instanceof Error ? e.message : String(e)}` }; }
    if (!sameJson(reread, { ...parsed, [key]: value })) return { ok: false, error: 'a troca mudaria outra coisa além da chave' };
    return { ok: true, text: next, changed: true, before, after: value, beforeLine: had ? lineAt(text, existing!.keyStart) : null, afterLine: lineAt(next, at) };
}
