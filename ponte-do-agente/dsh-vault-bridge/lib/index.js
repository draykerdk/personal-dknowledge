import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { createContextPack } from "./context-pack.js";
import { readSummaries, summarizeSource } from "./digest.js";
import {
  MISSION_LIMIT_KEYS,
  MISSION_PERIODS,
  MISSION_SECTIONS,
  MISSION_STATE_MAX_ITEMS,
  PROPOSAL_ACTIONS,
  PROPOSAL_REASON_MAX,
  PROTOCOL_IDS_DE_PARTIDA,
  TASK_CONTEXTS,
  TASK_PRIORITIES,
} from "./contract.js";
import { createOperatorClient } from "./operator-client.js";
import { fieldLabel, loadTypeContract } from "./schema.js";

function createHarness() {
  const entry = process.argv[1];
  if (!entry) throw new Error("DSH entrypoint indisponivel para resolver dsh-tools");
  const { defineTool: nativeDefineTool } = createRequire(realpathSync(entry))("@deepseek-ai/dsh-tools");
  return {
    defineTool(options) {
      const parameters = options.parameters?.type === "object"
        ? options.parameters.properties ?? {}
        : options.parameters;
      return nativeDefineTool({ ...options, parameters });
    },
    registerTool(ctx, tool) {
      return ctx.tools.register(tool);
    },
  };
}

const openObject = { type: "object", properties: {}, additionalProperties: false };
const textOutput = {
  schema: { type: "object", properties: {}, additionalProperties: true },
  render(_args, value) {
    return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }];
  },
};

function objectSchema(properties, required = []) {
  const requiredNames = new Set(required);
  const marked = Object.fromEntries(Object.entries(properties).map(([name, schema]) => [
    name,
    requiredNames.has(name) ? { ...schema, required: true } : schema,
  ]));
  return { type: "object", properties: marked, additionalProperties: false };
}

const stringArray = (description, maxItems = 20, choices = null) => ({
  type: "array",
  items: choices ? { type: "string", enum: choices } : { type: "string" },
  description: `${description} Limite validado pelo gateway: ${maxItems}.`,
});

/**
 * Uma escolha de texto pela lista do modelo; sem a lista (o modelo não se leu), vai sem `enum` e a
 * descrição diz que o gateway confere. Nunca uma cópia escondida.
 */
const choiceOf = (choices, description) => (choices.length
  ? { type: "string", enum: choices, description }
  : { type: "string", description: `${description} (lista indisponível: o gateway confere)` });

/**
 * As peças de schema das tools que vêm dos modelos de tipo (`Config/dominios/`, a fonte do hub 015):
 * os status pela tabela de estados da tarefa e os rótulos dos campos como o painel do nó os mostra.
 */
export function typeSchemaParts(contract) {
  const label = (name, fallback) => fieldLabel(contract, "tarefa", name, fallback);
  return {
    contract,
    label,
    statusChoice: description => choiceOf(contract.openStatuses, `${label("status", "Status")}: ${description}`),
    statusList: description => (contract.statuses.length
      ? stringArray(description, contract.statuses.length, contract.statuses)
      : stringArray(`${description} (lista indisponível: o gateway confere)`, 7)),
    priorityChoice: { type: "string", enum: TASK_PRIORITIES, description: `${label("priority", "Prioridade")} (urgência).` },
    contextsChoice: description => stringArray(`${label("contexts", "Onde")}: ${description}`, 6, TASK_CONTEXTS),
  };
}
/** As seções do painel quando o agente não pede nenhuma: a curta (a ação de agora com o porquê). */
export const MISSION_DEFAULT_SECTIONS = ["intent"];

const missionLimits = {
  type: "object",
  additionalProperties: false,
  description: "Tetos opcionais por seção, inteiros de 1 a 500. Omita para usar os padrões curtos.",
  properties: Object.fromEntries(MISSION_LIMIT_KEYS.map(key => [key, { type: "integer" }])),
};

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

/** O caminho cai numa pasta fechada? (um segmento do caminho é o nome dela, sem distinguir maiúsculas). */
export function inClosedFolder(path, closedFolders) {
  const closed = new Set(closedFolders.map(name => name.normalize("NFC").toLocaleLowerCase()));
  return String(path ?? "").split("/").some(part => closed.has(part.normalize("NFC").toLocaleLowerCase()));
}

/** Os donos do GitHub que a consulta sob demanda lê (a config do pacote, que é da pessoa; vazia sem config). */
export function githubOwnersFrom(config) {
  const list = config?.github_owners;
  return Array.isArray(list) ? [...new Set(list.filter(item => typeof item === "string" && /^[A-Za-z0-9-]{1,39}$/.test(item.trim())).map(item => item.trim()))] : [];
}

/**
 * Os protocolos que a ponte abre (a config `protocol_ids` do pacote, que é da pessoa: os ids do cofre
 * dela para os papéis da ponte); sem config, os do pacote aberto. Só ids no formato de protocolo.
 */
export function protocolIdsFrom(config) {
  const list = config?.protocol_ids;
  const ids = Array.isArray(list) ? [...new Set(list.filter(item => typeof item === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(item.trim())).map(item => item.trim()))] : [];
  return ids.length ? ids : [...PROTOCOL_IDS_DE_PARTIDA];
}

/**
 * A nota de estado do cofre (a config `state_note`: um caminho relativo .md); sem ela, `null`, e as
 * tools seguem sem a nota. Caminho absoluto ou com `..` não vale.
 */
export function statePathFrom(config) {
  const path = typeof config?.state_note === "string" ? config.state_note.trim() : "";
  if (!path || !path.endsWith(".md") || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) return null;
  return path;
}

/** Pastas que a ponte não abre (a config do pacote, que é da pessoa; vazia sem config). */
export function closedFoldersFrom(config) {
  const list = config?.closed_folders;
  return Array.isArray(list) ? list.filter(item => typeof item === "string" && item.trim()).map(item => item.trim()) : [];
}

export const BRIDGE_TOOL_NAMES = [
  "dfm_context_note",
  "dfm_working_state",
  "dfm_operational_context",
  "dfm_weekly_context",
  "dfm_tasks_query",
  "dfm_mission_query",
  "dfm_mission_state",
  "dfm_node",
  "dfm_propose",
  "dfm_task_create",
  "dfm_task_update",
  "dfm_task_complete",
  "dfm_note_open",
  "dfm_protocol_run",
  "dfm_notice",
];

function recoveredPluginFactory(harness, config = {}) {
  const closedFolders = closedFoldersFrom(config);
  const githubOwners = githubOwnersFrom(config);
  const protocolIds = protocolIdsFrom(config);
  const statePath = statePathFrom(config);
  const typeContract = loadTypeContract({ vaultRoot: config?.vault_root });
  const { label, statusChoice, statusList, priorityChoice, contextsChoice } = typeSchemaParts(typeContract);
  return {
    apply(ctx) {
      const fs = ctx.get("fs");
      if (fs === undefined) return;

      async function readVaultText(relativePath) {
        const target = await fs.resolve(String(relativePath));
        return await fs.readText(target);
      }

      function isStale(isoTs) {
        const ts = Date.parse(String(isoTs));
        if (!Number.isFinite(ts)) return true;
        const ageMs = Date.now() - ts;
        return ageMs < 0 || ageMs > 15 * 60 * 1000;
      }

      const operator = createOperatorClient({ readText: readVaultText });
      const tools = [];

      async function contextPack() {
        const descriptor = await operator.descriptor();
        return createContextPack({ vaultRoot: descriptor.vaultPath, taskClient: operator, closedFolders, openStatuses: typeContract.openStatuses, githubOwners, statePath });
      }

      tools.push(harness.defineTool({
        name: "dfm_context_note",
        description: "Diz qual nota está aberta no Obsidian: caminho, título e hora (stale=true se tem mais de 15 min). Não devolve o corpo.",
        parameters: openObject,
        async execute() {
          let raw;
          try {
            raw = await readVaultText(".dfm-dsh-context.json");
          } catch (_) {
            return { note: null, reason: "sem sinal registrado" };
          }
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            return { note: null, reason: "sinal ilegivel" };
          }
          if (!parsed || typeof parsed.path !== "string" || typeof parsed.ts !== "string") {
            return { note: null, reason: "contrato invalido" };
          }
          return {
            note: { path: parsed.path, title: String(parsed.title || ""), ts: parsed.ts },
            stale: isStale(parsed.ts),
          };
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_working_state",
        description: "A nota de estado do cofre em resumo: as seções e o começo de cada item (cerca de 3 mil caracteres, no lugar dos 30 mil da nota). inteira=true lê a nota toda: só quando o operador pedir uma regra que o resumo não mostra.",
        parameters: objectSchema({
          inteira: { type: "boolean", description: "Padrão false. true devolve a nota inteira (longa)." },
        }),
        async execute(args = {}) {
          if (!statePath) return { error: "sem nota de estado configurada (a config state_note do pacote)" };
          try {
            if (args.inteira === true) {
              const content = await readVaultText(statePath);
              return { source: statePath, chars: content.length, content };
            }
            const summaries = await readSummaries(readVaultText);
            return { source: statePath, ...(await summarizeSource(readVaultText, statePath, summaries?.estado ?? null, "state")) };
          } catch (_) {
            return { error: "a nota de estado está indisponível neste checkout" };
          }
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_operational_context",
        description: "Primeira chamada para 'o que fazer agora', prioridades, panorama ou pendências. Somente leitura. Traz: o estado vivo, a nota em foco, o foco do trimestre, os projetos pela coluna (curtos) e as TaskNotes abertas. GitHub só com include_github=true, quando o operador pedir a fonte. Projeto com closed=true não se abre.",
        parameters: objectSchema({
          include_github: { type: "boolean", description: "Inclui Issues/PRs abertos. Padrão false (GitHub é sob demanda)." },
          include_excerpts: { type: "boolean", description: "Inclui o começo da nota-índice de cada projeto. Padrão false; use só se o nome não basta." },
        }),
        async execute(args) {
          return (await contextPack()).operational({
            includeGithub: args.include_github === true,
            includeExcerpts: args.include_excerpts === true,
          });
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_weekly_context",
        description: "Primeira chamada para revisar ou planejar uma semana. Somente leitura: a Week, a Review e as Days da semana-alvo e da anterior em resumo (frontmatter, títulos e caixas, com o caminho de cada nota), as TaskNotes das duas e o panorama operacional. Fonte ausente aparece em missingSources: declare a ausência, não invente. A semana em números: dfm_mission_state com periodo=semana.",
        parameters: objectSchema({
          week: { type: "string", description: "Semana-alvo ISO YYYY-Wnn; omita para a semana atual." },
          include_notes: { type: "boolean", description: "Padrão false. true traz o texto das notas (cortado, longo): só se o resumo não basta." },
          include_github: { type: "boolean", description: "Inclui Issues/PRs abertos. Padrão false (GitHub é sob demanda)." },
        }),
        async execute(args) {
          return (await contextPack()).weekly(args.week, { includeGithub: args.include_github === true, includeNotes: args.include_notes === true });
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_tasks_query",
        description: "Consulta TaskNotes pela API viva. Chame antes de criar ou mudar tarefa. Filtros opcionais; sem filtro, 20 tarefas. Não escreve.",
        parameters: objectSchema({
          path: { type: "string", description: "Caminho exato da TaskNote .md." },
          text: { type: "string", description: "Trecho do título." },
          status: statusList("Um ou mais status."),
          week: { type: "string", description: "Semana ISO YYYY-Wnn." },
          project: { type: "string", description: "Nome ou wikilink do pai (SMART, projeto ou departamento)." },
          due_before: { type: "string", description: "Prazo até YYYY-MM-DD." },
          due_after: { type: "string", description: "Prazo desde YYYY-MM-DD." },
          include_archived: { type: "boolean", description: "Inclui o arquivo; padrão false." },
          include_details: { type: "boolean", description: "Inclui o corpo; padrão false, use só quando necessário." },
          limit: { type: "integer", description: "De 1 a 50; padrão 20." },
        }),
        async execute(args) {
          return operator.request("/v1/tasks/query", compact({
            path: args.path,
            text: args.text,
            status: args.status,
            week: args.week,
            project: args.project,
            dueBefore: args.due_before,
            dueAfter: args.due_after,
            includeArchived: args.include_archived,
            includeDetails: args.include_details,
            limit: args.limit,
          }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_mission_query",
        description: "Lê o painel antigo do DFMsystem por seção, somente leitura; truncated diz o que foi cortado. Para 'o que fazer agora' prefira dfm_mission_state. Sem sections vem só [\"intent\"] (intent.agora, a ação com o porquê). Plano da semana: [\"plan\"]. Hábitos (contagem de execuções, sem sequência): [\"habits\"].",
        parameters: objectSchema({
          sections: stringArray(`Seções a ler; omita para ${JSON.stringify(MISSION_DEFAULT_SECTIONS)}.`, MISSION_SECTIONS.length, MISSION_SECTIONS),
          limits: missionLimits,
          fresh: { type: "boolean", description: "Relê o cofre em vez do cache de 15 s; use logo depois de uma mudança." },
        }),
        async execute(args) {
          // Sem seções, a curta: o painel inteiro é longo e um modelo pequeno se perde nele (02/11/2026).
          const sections = Array.isArray(args.sections) && args.sections.length ? args.sections : MISSION_DEFAULT_SECTIONS;
          return operator.request("/v1/mission/query", compact({
            sections,
            limits: args.limits,
            fresh: args.fresh,
          }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_mission_state",
        description: "Primeira chamada para 'o que fazer agora', 'hoje' ou 'esta semana'. Somente leitura e curta: a lista do período na ordem que a Missão mostra (n=1 é o primeiro), cada item com porque (os pesos que o puseram ali) e sinais; mais a forma do período, as feitas e o que espera na triagem. Escolha da lista; não reordene. Para o detalhe de um item, dfm_node com o caminho dele.",
        parameters: objectSchema({
          periodo: { type: "string", enum: MISSION_PERIODS, description: "Padrão hoje." },
          limite: { type: "integer", description: `Itens, de 1 a ${MISSION_STATE_MAX_ITEMS}; padrão 12. O resto vem contado em mais.` },
        }),
        async execute(args) {
          return operator.request("/v1/mission/state", compact({ periodo: args.periodo, limite: args.limite }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_node",
        description: "Um nó da Missão pelo caminho da nota (uma tarefa de dfm_mission_state, uma SMART, um projeto, um dia ou uma semana). Somente leitura e curta: o tipo e a linha, o ramo (acima, abaixo, ao lado, com os caminhos), os sinais com o próximo passo e os protocolos do nó na ordem dos pesos, cada um com porque e pode_abrir (pode_abrir=true: dfm_protocol_run abre). Com o modelo do tipo, as situações. Sugira ao operador um protocolo desta lista; não invente outro.",
        parameters: objectSchema({
          caminho: { type: "string", description: "Caminho relativo da nota .md." },
          protocolos: { type: "boolean", description: "Padrão true; false pula a lista de protocolos." },
        }, ["caminho"]),
        async execute(args) {
          if (inClosedFolder(args.caminho, closedFolders)) {
            return { closed: true, reason: "Pasta fechada: não se abre sem pedido explícito do operador nesta sessão." };
          }
          return operator.request("/v1/node/query", compact({ caminho: args.caminho, protocolos: args.protocolos }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_propose",
        description: "Propõe UMA mudança para o operador aceitar na triagem da Missão; nunca grava a tarefa. acao: ligar_smart (valor = a SMART, caminho ou título), ligar_projeto (valor = o nome do projeto), semana (valor = AAAA-Www), dia (valor = AAAA-MM-DD), criar_tarefa (titulo = a ação nova; valor = a SMART ou o projeto-pai; semana opcional). tarefa = o caminho da TaskNote (de dfm_mission_state ou dfm_tasks_query); criar_tarefa não leva tarefa. porque = uma linha para o operador. Recusa volta com o motivo: corrija e tente de novo. repetida=true: a proposta já espera.",
        parameters: objectSchema({
          acao: { type: "string", enum: PROPOSAL_ACTIONS, description: "O que propor." },
          tarefa: { type: "string", description: "Caminho da TaskNote que muda (não em criar_tarefa)." },
          valor: { type: "string", description: "O alvo: a SMART, o projeto, a semana AAAA-Www ou o dia AAAA-MM-DD." },
          titulo: { type: "string", description: "Só criar_tarefa: o título da ação nova, até 140 caracteres." },
          semana: { type: "string", description: "Só criar_tarefa: AAAA-Www; omita para a semana atual." },
          porque: { type: "string", description: `Por que propor, numa linha (até ${PROPOSAL_REASON_MAX} caracteres).` },
        }, ["acao", "valor", "porque"]),
        async execute(args) {
          return operator.request("/v1/proposals/create", compact({
            acao: args.acao,
            tarefa: args.tarefa,
            valor: args.valor,
            titulo: args.titulo,
            semana: args.semana,
            porque: args.porque,
          }));
        },
        output: textOutput,
      }));

      // Um jeito por função (02/11): para acrescentar uma tarefa, o agente propõe; a ação nova espera na
      // triagem da Missão (Propostas do agente) e só nasce com o sim do operador, com `origem: agente`.
      tools.push(harness.defineTool({
        name: "dfm_task_create",
        description: "Para acrescentar uma tarefa, proponha: esta ferramenta NÃO cria a TaskNote; ela põe a proposta criar_tarefa na triagem da Missão (Propostas do agente), e só o operador aceita (Y) ou recusa (X). Antes: dfm_tasks_query pelo título, para não repetir. pai = a SMART ou o projeto (um só). porque = uma linha para o operador. A SMART (a meta) é decisão do operador: abra dfm_protocol_run com id=tarefa_smart. O mesmo que dfm_propose com acao=criar_tarefa. Recusa volta com o motivo: corrija e proponha de novo; nunca escreva o arquivo à mão.",
        parameters: objectSchema({
          title: { type: "string", description: `${label("title", "Título")}, até 140 caracteres.` },
          pai: { type: "string", description: `${label("projects", "SMART ou projeto")}: o pai, em texto ou wikilink.` },
          week: { type: "string", description: `${label("week", "Semana")}: YYYY-Wnn; omita para a semana atual.` },
          porque: { type: "string", description: `Por que propor, numa linha (até ${PROPOSAL_REASON_MAX} caracteres).` },
        }, ["title", "pai", "porque"]),
        async execute(args) {
          return operator.request("/v1/proposals/create", compact({
            acao: "criar_tarefa",
            titulo: args.title,
            valor: args.pai,
            semana: args.week,
            porque: args.porque,
          }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_task_update",
        description: "Muda campos operacionais de uma TaskNote viva (pegue o path em dfm_tasks_query). O pai: add_parent acrescenta um, remove_parent tira um; os outros pais ficam (a lista nunca se troca inteira). Não conclui, não cancela, não arquiva, não move, não renomeia e não muda o corpo; para concluir, dfm_task_complete.",
        parameters: objectSchema({
          path: { type: "string", description: "Caminho exato da TaskNote .md." },
          status: statusChoice("o novo status aberto."),
          priority: priorityChoice,
          impacto: { type: "integer", description: `${label("impacto", "Impacto")}: de 1 a 10.` },
          scheduled: { type: "string", description: `${label("scheduled", "Dia e hora")}: YYYY-MM-DD ou YYYY-MM-DDTHH:mm; nunca numa SMART.` },
          due: { type: "string", description: `${label("due", "Prazo")}: YYYY-MM-DD ou YYYY-MM-DDTHH:mm.` },
          clear_scheduled: { type: "boolean", description: "Tira a data marcada." },
          clear_due: { type: "boolean", description: "Tira o prazo." },
          week: { type: "string", description: `${label("week", "Semana")}: YYYY-Wnn.` },
          time_estimate: { type: "integer", description: `${label("timeEstimate", "Estimativa")}: minutos, de 1 a 1440.` },
          add_parent: { type: "string", description: `Acrescenta um pai (${label("projects", "SMART ou projeto")}); os outros ficam. Tem de ser uma nota do cofre.` },
          remove_parent: { type: "string", description: "Tira um pai que a tarefa tem; a tarefa nunca fica sem pai." },
          contexts: contextsChoice("a lista nova de onde dá para fazer."),
        }, ["path"]),
        async execute(args) {
          const one = value => (typeof value === "string" && value.trim() ? [value] : undefined);
          return operator.request("/v1/tasks/update", compact({
            path: args.path,
            status: args.status,
            priority: args.priority,
            impacto: args.impacto,
            scheduled: args.scheduled,
            due: args.due,
            clearScheduled: args.clear_scheduled,
            clearDue: args.clear_due,
            week: args.week,
            timeEstimate: args.time_estimate,
            addProjects: one(args.add_parent),
            removeProjects: one(args.remove_parent),
            contexts: args.contexts,
          }));
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_task_complete",
        description: "Conclui uma TaskNote, só quando o operador disse nesta conversa que terminou (operador_disse=true). evidence = de 1 a 5 fatos observáveis, nas palavras do operador, que entram no corpo antes da conclusão. O TaskNotes faz o resto (completedDate, eventos, arquivo). Não serve para tarefa recorrente. Na dúvida, pergunte antes.",
        parameters: objectSchema({
          path: { type: "string", description: "Caminho exato da tarefa .md." },
          operador_disse: { type: "boolean", description: "true só se o operador disse nesta conversa que a tarefa terminou." },
          evidence: stringArray("Fatos observáveis que comprovam a conclusão.", 5),
        }, ["path", "operador_disse", "evidence"]),
        async execute(args) {
          if (args.operador_disse !== true) {
            return { completed: false, reason: "Concluir é do operador: pergunte se terminou e chame de novo com operador_disse=true só se ele disse." };
          }
          return operator.request("/v1/tasks/complete", { path: args.path, evidence: args.evidence });
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_note_open",
        description: "Abre no Obsidian uma nota Markdown que existe no cofre, para o operador olhar. Só caminho relativo; não aceita URI.",
        parameters: objectSchema({ path: { type: "string", description: "Caminho relativo da nota .md." } }, ["path"]),
        async execute(args) {
          return operator.request("/v1/notes/open", { path: args.path });
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_protocol_run",
        description: `Abre no Obsidian um protocolo interativo da lista. Só abre para o operador responder; não preenche nem conclui. Na dúvida sobre qual, ${protocolIds[0]} (o primeiro da lista).`,
        parameters: objectSchema({ id: { type: "string", enum: protocolIds, description: "O protocolo." } }, ["id"]),
        async execute(args) {
          return operator.request("/v1/protocols/run", { id: args.id });
        },
        output: textOutput,
      }));

      tools.push(harness.defineTool({
        name: "dfm_notice",
        description: "Mostra um aviso curto no Obsidian quando o operador precisa agir agora. Não é lembrete: o que fica para depois é TaskNote.",
        parameters: objectSchema({
          message: { type: "string", description: "Até 280 caracteres." },
          duration_ms: { type: "integer", description: "De 3000 a 15000 ms." },
        }, ["message"]),
        async execute(args) {
          return operator.request("/v1/notices/show", compact({ message: args.message, durationMs: args.duration_ms }));
        },
        output: textOutput,
      }));

      const disposers = tools.map(tool => harness.registerTool(ctx, tool));
      ctx.effect(() => () => disposers.forEach(dispose => dispose()));
    },
  };
}

export const name = "dfm-vault-bridge";
export const inject = ["tools", "fs"];

export function apply(ctx, config) {
  const recoveredPlugin = recoveredPluginFactory(createHarness(), config);
  return recoveredPlugin.apply(ctx, config);
}
