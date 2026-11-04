// O schema das tools a partir dos modelos de tipo do cofre (`200 - FUNCTIONS/Config/dominios/`), a
// mesma fonte do hub gerado `015 - Tipos de Função (gerado)` (`generate_function_types.py`).
//
// Por quê: a proposta do Dk pessoal (02/11/2026, integração 3): um dono só. Os status e os rótulos dos
// campos de uma TaskNote moram no modelo do tipo; uma cópia à mão na ponte envelhecia a cada mudança.
// Aqui a ponte lê o modelo ao montar as tools: o status novo aparece sozinho no `enum`, e o rótulo do
// campo é o que o painel do nó mostra. O gateway do DFMsystem continua conferindo tudo de novo, e o
// teste de contrato (`native-dsh/test/contract.test.mjs`) fica vermelho se o modelo e o gateway
// divergirem.
//
// Só lê, no começo da sessão (as tools se montam uma vez). Sem o modelo legível, as listas ficam
// vazias e a tool vai sem `enum` (a descrição diz que o gateway confere): nunca uma cópia escondida.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A pasta dos modelos de tipo, relativa à raiz do cofre. */
export const DOMAIN_MODELS_DIR = "200 - FUNCTIONS/Config/dominios";
/** Os modelos que as tools usam (o da ação e o da SMART). */
export const TYPE_MODELS = ["tarefa", "smart"];
/** Onde a tabela de estados põe o que acabou (o fim de uma TaskNote). */
const FINAL_PLACES = new Set(["conclusao", "fora"]);

/**
 * O que faz: o contrato das tools a partir dos modelos lidos: os status (todos e os abertos, pela tabela
 * de estados da tarefa, na ordem dela) e o rótulo e a obrigação de cada campo, por tipo.
 * Entra → sai: `{ tarefa, smart }` (os JSON dos modelos; o que faltar fica vazio) → o contrato.
 * Erro e ataque: estado sem `valor` fica de fora; campo sem `nome` também; modelo ausente dá listas vazias.
 */
export function contractFromModels(models = {}) {
  const estados = Array.isArray(models.tarefa?.estados) ? models.tarefa.estados : [];
  const statuses = estados.map(e => (typeof e?.valor === "string" ? e.valor : "")).filter(Boolean);
  const openStatuses = estados.filter(e => typeof e?.valor === "string" && e.valor && !FINAL_PLACES.has(e.lugar)).map(e => e.valor);
  const fields = {};
  for (const name of TYPE_MODELS) {
    fields[name] = {};
    for (const campo of Array.isArray(models[name]?.campos) ? models[name].campos : []) {
      if (typeof campo?.nome !== "string" || !campo.nome) continue;
      fields[name][campo.nome] = { label: String(campo.rotulo || campo.nome), required: campo.obrigatorio === true };
    }
  }
  return { source: DOMAIN_MODELS_DIR, statuses, openStatuses, fields, loaded: statuses.length > 0 };
}

/** O que faz: as raízes de cofre a tentar: a da config, a do processo (o DSH abre no cofre) e a do pacote. */
export function candidateVaultRoots(configured, cwd = process.cwd(), moduleUrl = import.meta.url) {
  const roots = [];
  if (typeof configured === "string" && configured.trim()) roots.push(resolve(configured.trim()));
  roots.push(resolve(cwd));
  try {
    // lib → dfm-vault-bridge → native-dsh → Plugins → 200 - FUNCTIONS → a raiz do cofre (o pacote ligado ao repo).
    roots.push(resolve(dirname(realpathSync(fileURLToPath(moduleUrl))), "../../../../.."));
  } catch (_) {
    // O pacote fora de um arquivo (raro): fica a config e o processo.
  }
  return [...new Set(roots)];
}

/**
 * O que faz: lê os modelos da primeira raiz que os tem e monta o contrato; diz de onde leu.
 * Erro e ataque: JSON ilegível ou nenhuma raiz com a pasta: o contrato vazio (`loaded: false`), com o motivo.
 */
export function loadTypeContract({ vaultRoot, cwd, moduleUrl, read = readFileSync, exists = existsSync } = {}) {
  for (const root of candidateVaultRoots(vaultRoot, cwd, moduleUrl)) {
    const dir = join(root, DOMAIN_MODELS_DIR);
    if (!exists(join(dir, "tarefa.json"))) continue;
    try {
      const models = {};
      for (const name of TYPE_MODELS) {
        const path = join(dir, `${name}.json`);
        if (exists(path)) models[name] = JSON.parse(read(path, "utf8"));
      }
      return { ...contractFromModels(models), root };
    } catch (error) {
      return { ...contractFromModels({}), root, error: String(error?.message || error).slice(0, 300) };
    }
  }
  return { ...contractFromModels({}), root: null, error: "modelos de tipo não encontrados" };
}

/** O que faz: o rótulo de um campo pelo modelo (o que o painel do nó mostra), ou o reserva dado. */
export function fieldLabel(contract, type, name, fallback = name) {
  return contract?.fields?.[type]?.[name]?.label ?? fallback;
}
