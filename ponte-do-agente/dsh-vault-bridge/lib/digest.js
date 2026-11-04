// Os resumos das notas que o agente lê no lugar das notas inteiras (a integração 5 do Dk pessoal,
// 02/11/2026). A forma é uma só, com duas implementações: o gerador do cofre
// (`200 - FUNCTIONS/Scripts/generate_agent_summaries.py`, que grava `resumos_do_agente.json`) e esta,
// que refaz ao vivo o resumo de uma nota que mudou depois da geração (o `sha1` de cada fonte diz).
// O teste `test/digest.test.mjs` confere que as duas dão o mesmo resumo para as notas do cofre.
//
// Só lê. Os tamanhos contam caracteres (pontos de código), como o Python.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** O leitor de uma raiz de cofre pelo disco (o do pacote de contexto); a tool da nota de estado usa o `fs` da sessão. */
export const diskReader = vaultRoot => path => readFile(join(vaultRoot, path), "utf8");

/** O arquivo gerado, relativo à raiz do cofre. */
export const SUMMARIES_PATH = "200 - FUNCTIONS/Agents/DSH/resumos_do_agente.json";
/** Os tetos da forma (os mesmos do gerador). */
export const DIGEST_LIMITS = {
  valueMax: 200, itemMax: 80, itemsMax: 10, headingsMax: 40, headingMax: 80, leadMax: 120, leadsPerSection: 15,
};

const chars = text => Array.from(text);
const length = text => chars(text).length;

/** O que faz: o texto até o teto (em caracteres), com a reticência quando corta. */
export function cut(text, max) {
  const list = chars(text);
  return list.length <= max ? text : `${list.slice(0, max - 1).join("")}…`;
}

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) return v.slice(1, -1);
  return v;
}

/** O que faz: o frontmatter em leitura simples, os valores como texto cortado (a mesma regra do gerador). */
export function digestFrontmatter(content) {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end < 0) return {};
  const raw = {};
  let listKey = null;
  for (const line of content.slice(4, end).split("\n")) {
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && listKey !== null) {
      raw[listKey].push(unquote(item[1]));
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    if (match[2].trim() === "") {
      listKey = match[1];
      raw[listKey] = [];
    } else {
      listKey = null;
      raw[match[1]] = unquote(match[2]);
    }
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const items = value.filter(x => x.trim()).map(x => cut(x, DIGEST_LIMITS.itemMax)).slice(0, DIGEST_LIMITS.itemsMax);
      if (items.length) out[key] = items;
    } else if (value.trim()) {
      out[key] = cut(value, DIGEST_LIMITS.valueMax);
    }
  }
  return out;
}

/** O que faz: as linhas do corpo (depois do frontmatter), sem as dos blocos de código. */
function bodyLines(content) {
  let body = content;
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end >= 0) body = content.slice(end + 4);
  }
  const lines = [];
  let inside = false;
  for (const line of body.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inside = !inside;
      continue;
    }
    if (!inside) lines.push(line);
  }
  return lines;
}

/** O que faz: o resumo de uma nota: o frontmatter cortado, os títulos (até o nível 3) e as caixas. */
export function digestNote(content) {
  const titulos = [];
  let feitas = 0;
  let abertas = 0;
  for (const line of bodyLines(content)) {
    const h = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (h && titulos.length < DIGEST_LIMITS.headingsMax) titulos.push(cut(`${h[1]} ${h[2]}`, DIGEST_LIMITS.headingMax));
    if (/^\s*[-*]\s+\[[xX]\]/.test(line)) feitas += 1;
    else if (/^\s*[-*]\s+\[ \]/.test(line)) abertas += 1;
  }
  return { frontmatter: digestFrontmatter(content), titulos, caixas: { feitas, abertas } };
}

/** O que faz: o resumo da nota de estado: cada seção `## ` com o tamanho e o começo de cada item de topo. */
export function digestStateNote(content) {
  const secoes = [];
  let current = null;
  for (const line of bodyLines(content)) {
    if (line.startsWith("## ")) {
      current = { titulo: cut(line.slice(3).trim(), DIGEST_LIMITS.headingMax), chars: 0, itens: [] };
      secoes.push(current);
      continue;
    }
    if (current === null) continue;
    current.chars += length(line) + 1;
    if (line.startsWith("- ") && current.itens.length < DIGEST_LIMITS.leadsPerSection) {
      const text = line.slice(2).trim();
      const m = /^\*\*(.+?)\*\*/.exec(text);
      current.itens.push(cut((m ? m[1] : text).trim(), DIGEST_LIMITS.leadMax));
    }
  }
  return { secoes };
}

export function sha1(content) {
  return createHash("sha1").update(content, "utf8").digest("hex");
}

/** O que faz: lê o arquivo dos resumos pelo leitor dado; ausente ou ilegível dá `null` (o resumo se refaz ao vivo). */
export async function readSummaries(read) {
  try {
    const value = JSON.parse(await read(SUMMARIES_PATH));
    return value && typeof value === "object" ? value : null;
  } catch (_) {
    return null;
  }
}

/**
 * O que faz: o resumo de uma fonte: o gerado, quando o `sha1` da nota de agora é o gravado; senão o refeito
 * ao vivo pela mesma forma (`live: true`). Sempre com o caminho, para ler a nota só se precisar.
 * Entra → sai: o leitor, o caminho, a entrada gerada (ou `null`) e qual resumo fazer → a fonte resumida.
 * Erro e ataque: a nota que não existe vem com `exists: false`; nunca devolve o corpo.
 */
export async function summarizeSource(read, path, stored, kind = "note") {
  let content;
  try {
    content = await read(path);
  } catch (error) {
    return { path, exists: false };
  }
  const hash = sha1(content);
  if (stored && stored.existe && stored.sha1 === hash && stored.resumo) {
    return { path, exists: true, chars: stored.chars, summary: stored.resumo };
  }
  const summary = kind === "state" ? digestStateNote(content) : digestNote(content);
  return { path, exists: true, chars: length(content), summary, live: true };
}
