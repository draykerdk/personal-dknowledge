import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";
import { diskReader, readSummaries, summarizeSource } from "./digest.js";

const execFileAsync = promisify(execFile);


const DAILY_MAX_CHARS = 4_000;
const PERIOD_MAX_CHARS = 8_000;
const PROJECT_EXCERPT_CHARS = 1_200;
const GITHUB_TIMEOUT_MS = 15_000;
const GITHUB_BUFFER_BYTES = 2 * 1024 * 1024;
const GITHUB_ITEMS_PER_OWNER_KIND = 50;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localCalendarDate(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function isoWeek(date = new Date()) {
  const cursor = localCalendarDate(date);
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const year = cursor.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((cursor - first) / 86_400_000) + 1) / 7);
  return `${year}-W${pad2(week)}`;
}

export function isoWeekMonday(value) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(value));
  if (!match) throw new Error("week deve usar YYYY-Wnn");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) throw new Error("week deve usar YYYY-Wnn");
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthDay = januaryFourth.getUTCDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setUTCDate(januaryFourth.getUTCDate() - januaryFourthDay + 1 + ((week - 1) * 7));
  if (isoWeek(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate())) !== value) {
    throw new Error("week ISO inexistente");
  }
  return monday;
}

export function previousIsoWeek(value) {
  const monday = isoWeekMonday(value);
  monday.setUTCDate(monday.getUTCDate() - 7);
  return isoWeek(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
}

function isoDate(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function datesForIsoWeek(value) {
  const monday = isoWeekMonday(value);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return isoDate(date);
  });
}

function truncate(content, maxChars) {
  if (content.length <= maxChars) return { content, truncated: false, originalChars: content.length };
  return {
    content: `${content.slice(0, maxChars)}\n\n[conteúdo truncado pelo pacote de contexto]`,
    truncated: true,
    originalChars: content.length,
  };
}

async function readSource(vaultRoot, relativePath, maxChars) {
  try {
    const raw = await readFile(join(vaultRoot, relativePath), "utf8");
    return { path: relativePath, exists: true, ...truncate(raw, maxChars) };
  } catch (error) {
    if (error?.code === "ENOENT") return { path: relativePath, exists: false };
    return { path: relativePath, exists: false, error: String(error?.message || error) };
  }
}

function stripQuotes(value) {
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "") return null;
  const number = Number(trimmed);
  if (Number.isFinite(number) && String(number) === trimmed) return number;
  return trimmed;
}

/**
 * O frontmatter em leitura simples: `chave: valor` e a lista em bloco (`chave:` seguida
 * de linhas `  - item`). Só lê; quem grava frontmatter é o DFMsystem (TaskNotes, os
 * protocolos e o normalizador), nunca esta ponte.
 */
function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end < 0) return {};
  const result = {};
  let listKey = null;
  for (const line of content.slice(4, end).split("\n")) {
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && listKey) {
      result[listKey].push(stripQuotes(item[1]));
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    if (match[2].trim() === "") {
      listKey = match[1];
      result[listKey] = [];
    } else {
      listKey = null;
      result[match[1]] = stripQuotes(match[2]);
    }
  }
  return result;
}

/** O nome dentro de um wikilink (`"[[Nome|apelido]]"` → `Nome`). */
function linkName(value) {
  const match = /\[\[([^\]|#]+)/.exec(String(value ?? ""));
  return (match ? match[1] : String(value ?? "")).trim();
}

function linkNames(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(list.map(linkName).filter(Boolean))];
}

function fold(name) {
  return String(name ?? "").normalize("NFC").toLocaleLowerCase();
}

export function quarterId(date = new Date()) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/**
 * O foco do trimestre, do dono dele: a nota do trimestre (`temporada`, sem ela
 * `departamentos_foco`; e `projetos_foco`). O projeto não guarda foco (`quarter` se
 * aposentou). Mesma regra de `focoDoTrimestre` em `src/engine/temporada.ts`.
 */
export async function collectQuarterFocus(vaultRoot, quarter) {
  const path = `300 - RUNTIME/302 - Daymiss/Quarterly/${quarter}.md`;
  let content;
  try {
    content = await readFile(join(vaultRoot, path), "utf8");
  } catch (_) {
    return { quarter, path, exists: false, temporada: [], projetosFoco: [] };
  }
  const frontmatter = parseFrontmatter(content);
  const central = linkNames(frontmatter.temporada);
  return {
    quarter,
    path,
    exists: true,
    temporada: central.length ? central : linkNames(frontmatter.departamentos_foco),
    projetosFoco: linkNames(frontmatter.projetos_foco),
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (_) {
    return false;
  }
}

function bodyExcerpt(content) {
  const body = content.startsWith("---\n")
    ? content.slice(Math.max(0, content.indexOf("\n---", 4) + 4))
    : content;
  return truncate(body.trim(), PROJECT_EXCERPT_CHARS).content;
}

/**
 * Os projetos pela coluna física (a dona do estágio), em forma curta.
 *
 * A nota-índice é `<Projeto>/<Projeto>.md`, a que a Missão lê; o `README.md` sozinho não
 * vale desde 02/11/2026 (`validate_projects.py`, P1) e aparece como `missingIndex`.
 * O trecho do corpo só vem com `includeExcerpts`: a lista curta basta para escolher, e o
 * corpo de 30 notas custava dezenas de milhares de caracteres. Pasta em `closedFolders`
 * (config do pacote, a da pessoa) não se abre: entra só o nome e a coluna.
 */
export async function collectProjects(vaultRoot, { focus = null, closedFolders = [], includeExcerpts = false } = {}) {
  const areasRoot = join(vaultRoot, "100 - AREAS");
  const closed = new Set((closedFolders ?? []).map(fold));
  const projects = [];
  let areas = [];
  try {
    areas = await readdir(areasRoot, { withFileTypes: true });
  } catch (error) {
    return { available: false, error: String(error?.message || error), projects: [] };
  }

  for (const area of areas.filter(entry => entry.isDirectory())) {
    const projectsRoot = join(areasRoot, area.name, "100 - PROJECTS");
    let columns;
    try {
      columns = await readdir(projectsRoot, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const column of columns.filter(entry => entry.isDirectory())) {
      let entries;
      try {
        entries = await readdir(join(projectsRoot, column.name), { withFileTypes: true });
      } catch (_) {
        continue;
      }
      for (const project of entries.filter(entry => entry.isDirectory())) {
        const projectRoot = join(projectsRoot, column.name, project.name);
        const indexFile = join(projectRoot, `${project.name}.md`);
        const entry = {
          name: project.name,
          area: area.name,
          stage: column.name.replace(/^\d+\s*-\s*/, ""),
        };
        if (focus) {
          entry.temporada = focus.temporada.some(name => fold(name) === fold(project.name));
          entry.foco = entry.temporada || focus.projetosFoco.some(name => fold(name) === fold(project.name));
        }
        if (closed.has(fold(project.name))) {
          entry.closed = true;
          projects.push(entry);
          continue;
        }
        let content = null;
        try {
          content = await readFile(indexFile, "utf8");
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        if (content === null) {
          entry.indexPath = null;
          entry.missingIndex = true;
          if (await exists(join(projectRoot, "README.md"))) entry.readmeOnly = true;
          projects.push(entry);
          continue;
        }
        const frontmatter = parseFrontmatter(content);
        entry.indexPath = relative(vaultRoot, indexFile);
        entry.type = frontmatter.type ?? null;
        entry.statusMirror = frontmatter.status ?? null;
        if (includeExcerpts) entry.excerpt = bodyExcerpt(content);
        projects.push(entry);
      }
    }
  }
  projects.sort((a, b) => a.stage.localeCompare(b.stage) || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  return { available: true, projects };
}

function githubError(error) {
  const stderr = String(error?.stderr || "").trim();
  const message = stderr || String(error?.message || error);
  return message.replace(/gho_[A-Za-z0-9_]+/g, "[token redacted]").slice(0, 500);
}

async function runGhJson(args) {
  const { stdout } = await execFileAsync("gh", args, {
    timeout: GITHUB_TIMEOUT_MS,
    maxBuffer: GITHUB_BUFFER_BYTES,
    env: { ...process.env, GH_PAGER: "cat", NO_COLOR: "1" },
  });
  const parsed = JSON.parse(stdout || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

function projectLabels(labels) {
  return Array.isArray(labels) ? labels.map(label => String(label?.name || label)).filter(Boolean) : [];
}

/**
 * Issues e PRs abertos dos donos dados. Os donos são da pessoa: vêm da config do pacote
 * (`github_owners`, em `dfm-native-suite/cordis.patch.yml`), não do código; sem nenhum, a consulta não
 * roda e diz por quê.
 */
export async function collectGithub(owners = []) {
  if (!Array.isArray(owners) || owners.length === 0) {
    return {
      available: false, complete: false, owners: [], issues: [], pullRequests: [], errors: [], truncatedQueries: [],
      reason: "Sem github_owners na config da ponte (dfm-native-suite/cordis.patch.yml): nenhum dono a consultar.",
    };
  }
  const fetchLimit = GITHUB_ITEMS_PER_OWNER_KIND + 1;
  const calls = owners.flatMap(owner => [
    runGhJson(["search", "issues", "--owner", owner, "--state", "open", "--limit", String(fetchLimit), "--json", "number,title,repository,updatedAt,url,assignees,labels"])
      .then(items => ({ owner, kind: "issues", items }))
      .catch(error => ({ owner, kind: "issues", error: githubError(error), items: [] })),
    runGhJson(["search", "prs", "--owner", owner, "--state", "open", "--limit", String(fetchLimit), "--json", "number,title,repository,updatedAt,url,isDraft,author"])
      .then(items => ({ owner, kind: "pullRequests", items }))
      .catch(error => ({ owner, kind: "pullRequests", error: githubError(error), items: [] })),
  ]);
  const rawResults = await Promise.all(calls);
  const results = rawResults.map(result => ({
    ...result,
    items: result.items.slice(0, GITHUB_ITEMS_PER_OWNER_KIND),
    truncated: result.items.length > GITHUB_ITEMS_PER_OWNER_KIND,
  }));
  const errors = results.filter(result => result.error).map(({ owner, kind, error }) => ({ owner, kind, error }));
  const truncatedQueries = results
    .filter(result => result.truncated)
    .map(result => ({
      owner: result.owner,
      kind: result.kind,
      returned: result.items.length,
      observedAtLeast: GITHUB_ITEMS_PER_OWNER_KIND + 1,
    }));
  const issues = results.filter(result => result.kind === "issues").flatMap(result => result.items).map(item => ({
    repository: item.repository?.nameWithOwner ?? item.repository?.name ?? null,
    number: item.number,
    title: item.title,
    url: item.url,
    updatedAt: item.updatedAt,
    labels: projectLabels(item.labels),
    assignees: (item.assignees ?? []).map(assignee => assignee.login).filter(Boolean),
  }));
  const pullRequests = results.filter(result => result.kind === "pullRequests").flatMap(result => result.items).map(item => ({
    repository: item.repository?.nameWithOwner ?? item.repository?.name ?? null,
    number: item.number,
    title: item.title,
    url: item.url,
    updatedAt: item.updatedAt,
    isDraft: Boolean(item.isDraft),
    author: item.author?.login ?? null,
  }));
  return {
    available: errors.length < calls.length,
    complete: errors.length === 0,
    owners,
    limits: { itemsPerOwnerPerKind: GITHUB_ITEMS_PER_OWNER_KIND },
    truncatedQueries,
    issues,
    pullRequests,
    errors,
  };
}

async function readCurrentNoteSignal(vaultRoot) {
  const source = await readSource(vaultRoot, ".dfm-dsh-context.json", 4_000);
  if (!source.exists) return { note: null, reason: "sem sinal registrado" };
  try {
    const parsed = JSON.parse(source.content);
    return {
      note: {
        path: typeof parsed.path === "string" ? parsed.path : null,
        title: typeof parsed.title === "string" ? parsed.title : "",
        ts: typeof parsed.ts === "string" ? parsed.ts : null,
      },
    };
  } catch (_) {
    return { note: null, reason: "sinal ilegível" };
  }
}

function taskError(error) {
  return { available: false, error: String(error?.message || error).slice(0, 500), total: null, tasks: [] };
}

async function queryTasks(taskClient, filters) {
  try {
    const result = await taskClient.request("/v1/tasks/query", { limit: 50, ...filters });
    return { available: true, total: result.total, truncated: result.total > result.tasks.length, tasks: result.tasks };
  } catch (error) {
    return taskError(error);
  }
}

function missingPaths(sources) {
  return sources.filter(source => !source.exists).map(source => source.path);
}

/**
 * As fontes de uma semana: a Week, a Review e as sete Days. Por padrão, o resumo de cada uma (o gerado, ou
 * o refeito ao vivo quando a nota mudou depois da geração: `digest.js`), com o caminho para ler só se
 * precisar; o texto (cortado) só com `includeNotes`.
 */
async function collectPeriod(vaultRoot, week, { includeNotes = false, summaries = null } = {}) {
  const planningPath = `300 - RUNTIME/302 - Daymiss/Week/${week}.md`;
  const reviewPath = `400 - MEMORY/200 - WEEKLY/${week} - Review.md`;
  const dailyPaths = datesForIsoWeek(week).map(date => `300 - RUNTIME/302 - Daymiss/Day/${date}.md`);
  const stored = new Map((summaries?.semanas?.[week] ?? []).map(entry => [entry.caminho, entry]));
  const source = (path, maxChars) => (includeNotes
    ? readSource(vaultRoot, path, maxChars)
    : summarizeSource(diskReader(vaultRoot), path, stored.get(path) ?? null));
  const [planning, review, ...dailyNotes] = await Promise.all([
    source(planningPath, PERIOD_MAX_CHARS),
    source(reviewPath, PERIOD_MAX_CHARS),
    ...dailyPaths.map(path => source(path, DAILY_MAX_CHARS)),
  ]);

  const sources = [planning, review, ...dailyNotes];
  return {
    week,
    dates: datesForIsoWeek(week),
    form: includeNotes ? "texto" : "resumo",
    planning,
    review,
    dailyNotes,
    missingSources: missingPaths(sources),
    truncatedSources: sources.filter(source => source.truncated).map(source => source.path),
  };
}

const GITHUB_ON_DEMAND = {
  requested: false,
  reason: "GitHub é sob demanda: chame de novo com include_github=true só quando o operador pedir a fonte.",
};

export function createContextPack({
  vaultRoot,
  taskClient,
  githubCollector = collectGithub,
  now = () => new Date(),
  closedFolders = [],
  openStatuses = [],
  githubOwners = [],
  statePath = null,
}) {
  if (!vaultRoot) throw new TypeError("vaultRoot é obrigatório");
  if (!taskClient?.request) throw new TypeError("taskClient é obrigatório");

  async function operational({ includeGithub = false, includeExcerpts = false } = {}) {
    const currentWeek = isoWeek(now());
    const focus = await collectQuarterFocus(vaultRoot, quarterId(now()));
    const summaries = await readSummaries(diskReader(vaultRoot));
    const [workingState, currentNote, projects, taskNotes, github] = await Promise.all([
      // O resumo da nota de estado (as seções e o começo de cada item), nunca a nota inteira: dfm_working_state a lê.
      // Sem a nota de estado na config (`state_note`), o panorama segue sem ela, e ela não falta.
      statePath ? summarizeSource(diskReader(vaultRoot), statePath, summaries?.estado ?? null, "state") : Promise.resolve(null),
      readCurrentNoteSignal(vaultRoot),
      collectProjects(vaultRoot, { focus, closedFolders, includeExcerpts }),
      // Os status abertos vêm do modelo da tarefa (schema.js); sem a lista, a consulta vai sem filtro de status.
      queryTasks(taskClient, openStatuses.length ? { status: [...openStatuses] } : {}),
      includeGithub ? githubCollector(githubOwners) : Promise.resolve(GITHUB_ON_DEMAND),
    ]);
    const missingSources = [];
    if (workingState && !workingState.exists) missingSources.push(workingState.path);
    if (!currentNote.note) missingSources.push(".dfm-dsh-context.json");
    if (!focus.exists) missingSources.push(focus.path);
    return {
      kind: "dfm_operational_context",
      generatedAt: now().toISOString(),
      currentWeek,
      quarterFocus: focus,
      sourcePrecedence: [
        "decisão explícita atual do operador",
        "estado vivo e coluna física dos projetos DFM",
        "planejamento temporal e TaskNotes",
        "Issues e PRs GitHub",
        "memória compartilhada validada",
      ],
      currentNote,
      workingState,
      projects,
      taskNotes,
      github,
      missingSources,
      warnings: [
        "Issue GitHub é pendência remota/delegada; não criar TaskNote duplicada automaticamente.",
        "Projetos Waiting/Backlog não competem com Active sem decisão humana.",
        "O foco do trimestre vem da nota do trimestre (temporada, projetos_foco); o projeto não guarda foco.",
        "Projeto com closed=true é pasta fechada: não abra nem leia as notas dela sem pedido explícito do operador.",
      ],
    };
  }

  async function weekly(rawWeek, { includeGithub = false, includeNotes = false } = {}) {
    const targetWeek = rawWeek || isoWeek(now());
    isoWeekMonday(targetWeek);
    const priorWeek = previousIsoWeek(targetWeek);
    const summaries = includeNotes ? null : await readSummaries(diskReader(vaultRoot));
    const [base, currentPeriod, previousPeriod, currentTasks, previousTasks] = await Promise.all([
      operational({ includeGithub }),
      collectPeriod(vaultRoot, targetWeek, { includeNotes, summaries }),
      collectPeriod(vaultRoot, priorWeek, { includeNotes, summaries }),
      queryTasks(taskClient, { week: targetWeek, includeArchived: true }),
      queryTasks(taskClient, { week: priorWeek, includeArchived: true }),
    ]);
    return {
      kind: "dfm_weekly_context",
      generatedAt: now().toISOString(),
      targetWeek,
      previousWeek: priorWeek,
      currentPeriod,
      previousPeriod,
      weeklyTaskNotes: {
        [targetWeek]: currentTasks,
        [priorWeek]: previousTasks,
      },
      operational: base,
      missingSources: [...currentPeriod.missingSources, ...previousPeriod.missingSources, ...base.missingSources],
      instructions: [
        "Use as notas Day como evidência episódica, não como lista paralela de tarefas.",
        "Cada nota vem resumida (frontmatter, títulos e caixas) com o caminho: leia o texto de uma só se o resumo não basta (include_notes).",
        "Compare planejamento e review das duas semanas; declare arquivos ausentes sem inventar conteúdo.",
        "Se o GitHub veio (include_github), reconcilie TaskNotes pessoais com Issues/PRs remotos sem duplicá-los.",
      ],
    };
  }

  return { operational, weekly };
}
