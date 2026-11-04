// A forma dos resumos tem duas implementações (o gerador do cofre em Python e `lib/digest.js`, que refaz
// ao vivo a nota que mudou). Este teste as confere: pelas notas de exemplo, cujo resumo esperado é o
// mesmo das duas (`Scripts/tests/fixtures/resumos_do_agente/esperado.json`, que o teste do gerador também
// lê), e pelas notas do cofre que não mudaram desde a geração. Divergiu, vermelho. O juiz do gerador roda
// este arquivo quando o `node` está no PATH.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cut, DIGEST_LIMITS, digestNote, digestStateNote, sha1, SUMMARIES_PATH } from "../lib/digest.js";

const VAULT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const FIXTURES = join(VAULT, "200 - FUNCTIONS/Scripts/tests/fixtures/resumos_do_agente");
const digestOf = (name, content) => (name.startsWith("estado") ? digestStateNote(content) : digestNote(content));

test("as duas implementações dão o mesmo resumo nas notas de exemplo", t => {
  // O pacote fora do cofre (o repositório aberto) não leva o gerador nem as notas dele: a forma fica com os testes abaixo.
  if (!existsSync(FIXTURES)) {
    t.diagnostic("sem as notas de exemplo do gerador (o pacote fora do cofre): nada a comparar");
    return;
  }
  const expected = JSON.parse(readFileSync(join(FIXTURES, "esperado.json"), "utf8"));
  assert.ok(Object.keys(expected).length >= 3);
  for (const [name, summary] of Object.entries(expected)) {
    assert.deepEqual(digestOf(name, readFileSync(join(FIXTURES, name), "utf8")), summary, name);
  }
});

test("e nas notas do cofre que não mudaram desde a geração", t => {
  const file = join(VAULT, SUMMARIES_PATH);
  if (!existsSync(file)) {
    t.diagnostic("sem o arquivo gerado: nada a comparar (as notas de exemplo bastam)");
    return;
  }
  const stored = JSON.parse(readFileSync(file, "utf8"));
  const sources = [{ ...stored.estado, kind: "estado" }, ...Object.values(stored.semanas).flat().map(s => ({ ...s, kind: "nota" }))];
  let compared = 0;
  for (const source of sources) {
    if (!source.existe) continue;
    const path = join(VAULT, source.caminho);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    if (sha1(content) !== source.sha1) continue;
    assert.deepEqual(digestOf(source.kind, content), source.resumo, source.caminho);
    assert.equal(Array.from(content).length, source.chars, `${source.caminho}: chars`);
    compared += 1;
  }
  t.diagnostic(`comparou ${compared} notas do cofre`);
});

test("a forma: o frontmatter cortado, os títulos fora do código, as caixas, o começo dos itens", () => {
  const note = `---\ntype: weekly_note\nfoco: "${"á".repeat(250)}"\ntags:\n  - weekly\n  - ""\nvazio:\n---\n# Semana\n\`\`\`js\n# não é título\n- [ ] nem caixa\n\`\`\`\n## 🎯 Entregas\n- [x] feita\n  - [ ] aberta\n`;
  const d = digestNote(note);
  assert.equal(d.frontmatter.type, "weekly_note");
  assert.equal(Array.from(d.frontmatter.foco).length, DIGEST_LIMITS.valueMax);
  assert.ok(d.frontmatter.foco.endsWith("…"));
  assert.deepEqual(d.frontmatter.tags, ["weekly"]);
  assert.equal("vazio" in d.frontmatter, false);
  assert.deepEqual(d.titulos, ["# Semana", "## 🎯 Entregas"]);
  assert.deepEqual(d.caixas, { feitas: 1, abertas: 1 });
  const state = digestStateNote("# T\n\nintro\n## Estado atual\n- **Comece aqui (30/10):** texto longo\n- item sem negrito\n## Outra\n");
  assert.deepEqual(state.secoes.map(s => [s.titulo, s.itens]), [["Estado atual", ["Comece aqui (30/10):", "item sem negrito"]], ["Outra", []]]);
  assert.equal(cut("😀😀😀", 2), "😀…");
});
