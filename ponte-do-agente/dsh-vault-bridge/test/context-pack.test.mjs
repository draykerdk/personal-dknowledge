import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectGithub,
  createContextPack,
  datesForIsoWeek,
  isoWeek,
  previousIsoWeek,
} from "../lib/context-pack.js";

/** A nota de estado do cofre de teste (a config `state_note` do pacote). */
const ESTADO = "000 - KERNEL/Estado.md";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dfm-context-pack-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    async write(path, content) {
      const target = join(root, path);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, content, "utf8");
    },
  };
}

const githubSnapshot = {
  available: true,
  complete: true,
  owners: ["exemplo-org"],
  issues: [{ repository: "exemplo-org/project-management", number: 2, title: "Distribuir", labels: ["agent-ready"] }],
  pullRequests: [{ repository: "exemplo-org/site", number: 7, title: "Publicar", isDraft: false }],
  errors: [],
};

function taskClient(calls) {
  return {
    async request(route, filters) {
      calls.push({ route, filters });
      return { total: 1, tasks: [{ title: `Task ${filters.week ?? "open"}`, status: "next-action" }] };
    },
  };
}

test("calendário ISO atravessa o ano sem inventar W00", () => {
  assert.equal(isoWeek(new Date(2027, 0, 1, 12)), "2026-W53");
  assert.equal(previousIsoWeek("2027-W01"), "2026-W53");
  assert.deepEqual(datesForIsoWeek("2026-W53"), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
    "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
  assert.throws(() => datesForIsoWeek("2026-W00"), /week/);
});

test("contexto operacional combina estado, coluna física, foco do trimestre e TaskNotes", async t => {
  const fx = await fixture(t);
  await fx.write(ESTADO, "# Estado vivo\n\nFoco principal.");
  await fx.write(".dfm-dsh-context.json", JSON.stringify({ path: "Hoje.md", title: "Hoje", ts: "2026-08-30T10:00:00Z" }));
  await fx.write(
    "300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q3.md",
    "---\ntype: quarterly_note\nprojetos_foco:\n  - \"[[Projeto A]]\"\n  - \"[[Livro]]\"\ntemporada:\n  - \"[[Projeto A]]\"\n---\n# Q3\n",
  );
  await fx.write(
    "100 - AREAS/03 - Exemplo/100 - PROJECTS/2 - Active/Projeto A/Projeto A.md",
    "---\ntype: iniciativa\nstatus: active\nquarter: 2026-Q3\n---\n# Projeto A\n\nEntrega atual.",
  );
  await fx.write(
    "100 - AREAS/03 - Exemplo/100 - PROJECTS/3 - Waiting/Projeto B/README.md",
    "---\ntype: projeto\nstatus: waiting\n---\n# Projeto B\n",
  );
  await fx.write(
    "100 - AREAS/01 - Autor/100 - PROJECTS/2 - Active/Livro/Livro.md",
    "---\ntype: iniciativa\nstatus: active\n---\n# Texto que não se lê\n",
  );
  const calls = [];
  let githubCalls = 0;
  let owners = null;
  const context = createContextPack({ statePath: ESTADO,
    vaultRoot: fx.root,
    taskClient: taskClient(calls),
    githubOwners: ["exemplo-org"],
    githubCollector: async list => { githubCalls += 1; owners = list; return githubSnapshot; },
    now: () => new Date(2026, 7, 30, 12),
    closedFolders: ["Livro"],
    openStatuses: ["inbox", "next-action", "in-progress", "waiting-on", "someday"],
  });
  const result = await context.operational();
  assert.equal(result.currentWeek, "2026-W35");
  assert.equal(result.currentNote.note.path, "Hoje.md");
  assert.deepEqual(result.quarterFocus.temporada, ["Projeto A"]);
  assert.deepEqual(result.projects.projects.map(project => [project.name, project.stage]), [
    ["Livro", "Active"],
    ["Projeto A", "Active"],
    ["Projeto B", "Waiting"],
  ]);
  const [livro, a, b] = result.projects.projects;
  // A pasta fechada entra só com nome, coluna e foco; nada dela é lido.
  assert.deepEqual(livro, { name: "Livro", area: "01 - Autor", stage: "Active", temporada: false, foco: true, closed: true });
  // A nota-índice é <Projeto>.md; o quarter aposentado não viaja; o trecho só a pedido.
  assert.equal(a.indexPath, "100 - AREAS/03 - Exemplo/100 - PROJECTS/2 - Active/Projeto A/Projeto A.md");
  assert.equal(a.temporada, true);
  assert.equal("quarter" in a, false);
  assert.equal("excerpt" in a, false);
  // O README.md sozinho não é nota-índice (P1, 02/11/2026).
  assert.equal(b.missingIndex, true);
  assert.equal(b.readmeOnly, true);
  assert.equal(result.taskNotes.tasks[0].title, "Task open");
  // GitHub é sob demanda: sem o pedido, nenhuma consulta.
  assert.equal(githubCalls, 0);
  assert.equal(result.github.requested, false);
  assert.equal(result.taskNotes.truncated, false);
  assert.deepEqual(calls[0].filters.status, ["inbox", "next-action", "in-progress", "waiting-on", "someday"]);
  assert.equal(result.missingSources.length, 0);

  const full = await context.operational({ includeGithub: true, includeExcerpts: true });
  assert.equal(githubCalls, 1);
  // Os donos vêm da config do pacote, não do código.
  assert.deepEqual(owners, ["exemplo-org"]);
  assert.equal(full.github.issues[0].number, 2);
  assert.match(full.projects.projects[1].excerpt, /Entrega atual/);
  assert.equal("excerpt" in full.projects.projects[0], false);
});

test("contexto semanal inclui alvo e anterior e declara fontes ausentes", async t => {
  const fx = await fixture(t);
  await fx.write(ESTADO, "# Estado vivo");
  await fx.write(".dfm-dsh-context.json", JSON.stringify({ path: "Semana.md", title: "Semana", ts: "2026-08-30T10:00:00Z" }));
  await fx.write("300 - RUNTIME/302 - Daymiss/Week/2026-W35.md", "# Planejamento W35");
  await fx.write("300 - RUNTIME/302 - Daymiss/Week/2026-W34.md", "# Planejamento W34");
  await fx.write("400 - MEMORY/200 - WEEKLY/2026-W34 - Review.md", "# Review W34");
  await fx.write("300 - RUNTIME/302 - Daymiss/Day/2026-08-30.md", `# Domingo\n${"x".repeat(4_500)}`);
  const calls = [];
  const context = createContextPack({ statePath: ESTADO,
    vaultRoot: fx.root,
    taskClient: taskClient(calls),
    githubCollector: async () => githubSnapshot,
    now: () => new Date(2026, 7, 30, 12),
  });
  const result = await context.weekly("2026-W35");
  assert.equal(result.targetWeek, "2026-W35");
  assert.equal(result.previousWeek, "2026-W34");
  assert.equal(result.currentPeriod.planning.exists, true);
  assert.equal(result.previousPeriod.review.exists, true);
  assert.ok(result.missingSources.includes("400 - MEMORY/200 - WEEKLY/2026-W35 - Review.md"));
  // Por padrão, cada nota vem resumida (refeita ao vivo: não há resumo gerado no cofre de teste), sem o corpo.
  const domingo = result.currentPeriod.dailyNotes.find(note => note.path.endsWith("2026-08-30.md"));
  assert.equal(result.currentPeriod.form, "resumo");
  assert.equal(domingo.live, true);
  assert.deepEqual(domingo.summary.titulos, ["# Domingo"]);
  assert.equal("content" in domingo, false);
  assert.equal(result.operational.workingState.summary.secoes.length, 0);
  assert.equal("content" in result.operational.workingState, false);
  assert.deepEqual(calls.map(call => call.filters.week).filter(Boolean).sort(), ["2026-W34", "2026-W35"]);
  assert.ok(calls.filter(call => call.filters.week).every(call => call.filters.includeArchived === true));
  // O texto (cortado) só a pedido.
  const notes = await context.weekly("2026-W35", { includeNotes: true });
  assert.equal(notes.currentPeriod.form, "texto");
  assert.ok(notes.currentPeriod.truncatedSources.includes("300 - RUNTIME/302 - Daymiss/Day/2026-08-30.md"));
});

test("o resumo gerado vale enquanto a nota é a mesma; a que mudou se refaz ao vivo", async t => {
  const fx = await fixture(t);
  const state = "# Estado\n\n## Estado atual\n- **Comece aqui:** a nota.\n- outro item\n";
  await fx.write(ESTADO, state);
  await fx.write("300 - RUNTIME/302 - Daymiss/Week/2026-W35.md", "---\nfoco: x\n---\n# W35\n- [x] a\n- [ ] b\n");
  const { sha1 } = await import("../lib/digest.js");
  await fx.write("200 - FUNCTIONS/Agents/DSH/resumos_do_agente.json", JSON.stringify({
    estado: { caminho: ESTADO, existe: true, sha1: sha1(state), chars: 1, resumo: { secoes: [{ titulo: "GRAVADO", chars: 0, itens: [] }] } },
    semanas: { "2026-W35": [{ caminho: "300 - RUNTIME/302 - Daymiss/Week/2026-W35.md", existe: true, sha1: "velho", chars: 1, resumo: { titulos: ["VELHO"] } }] },
  }));
  const context = createContextPack({ statePath: ESTADO, vaultRoot: fx.root, taskClient: taskClient([]), now: () => new Date(2026, 7, 30, 12) });
  const result = await context.weekly("2026-W35");
  assert.equal(result.operational.workingState.summary.secoes[0].titulo, "GRAVADO");
  assert.equal(result.operational.workingState.live, undefined);
  const week = result.currentPeriod.planning;
  assert.equal(week.live, true);
  assert.deepEqual(week.summary, { frontmatter: { foco: "x" }, titulos: ["# W35"], caixas: { feitas: 1, abertas: 1 } });
});

test("falha GitHub permanece explícita sem apagar contexto local", async t => {
  const fx = await fixture(t);
  await fx.write(ESTADO, "# Estado vivo");
  const context = createContextPack({ statePath: ESTADO,
    vaultRoot: fx.root,
    taskClient: taskClient([]),
    now: () => new Date(2026, 7, 30, 12),
    githubCollector: async () => ({
      available: false,
      complete: false,
      owners: ["exemplo-org"],
      issues: [],
      pullRequests: [],
      errors: [{ owner: "exemplo-org", kind: "issues", error: "offline" }],
    }),
  });
  const result = await context.operational({ includeGithub: true });
  assert.equal(result.workingState.exists, true);
  assert.ok(result.missingSources.includes("300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q3.md"));
  assert.equal(result.github.available, false);
  assert.equal(result.github.errors[0].error, "offline");
});

test("sem donos na config, o GitHub não se consulta e diz por quê", async () => {
  const result = await collectGithub([]);
  assert.equal(result.available, false);
  assert.match(result.reason, /github_owners/);
});

test("sem a nota de estado na config, o panorama segue sem ela e ela não falta", async t => {
  const fx = await fixture(t);
  const context = createContextPack({ vaultRoot: fx.root, taskClient: taskClient([]), now: () => new Date(2026, 7, 30, 12) });
  const result = await context.operational();
  assert.equal(result.workingState, null);
  assert.ok(!result.missingSources.includes(null));
  assert.ok(!result.missingSources.some(source => /Estado/.test(String(source))));
});
