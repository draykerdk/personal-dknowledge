import { randomUUID } from "node:crypto";

export const OPERATOR_DESCRIPTOR_PATH = ".dfm-dsh-operator.json";
export const OPERATOR_CONTRACT_VERSION = 1;
const MAX_RESPONSE_BYTES = 256 * 1024;

function bridgeError(code, message, correlationId) {
  const error = new Error(`[${code}] ${message}${correlationId ? ` (correlationId: ${correlationId})` : ""}`);
  error.code = code;
  error.correlationId = correlationId;
  return error;
}

export function parseOperatorDescriptor(raw) {
  let value;
  try {
    value = JSON.parse(String(raw));
  } catch (_) {
    throw bridgeError("bridge_descriptor_invalid", "Descritor da ponte DFM não é JSON válido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bridgeError("bridge_descriptor_invalid", "Descritor da ponte DFM inválido.");
  }
  if (value.contractVersion !== OPERATOR_CONTRACT_VERSION) {
    throw bridgeError("bridge_contract_mismatch", `Contrato esperado: ${OPERATOR_CONTRACT_VERSION}.`);
  }
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) {
    throw bridgeError("bridge_descriptor_invalid", "Porta da ponte DFM inválida.");
  }
  if (typeof value.token !== "string" || !/^[a-f0-9]{64}$/i.test(value.token)) {
    throw bridgeError("bridge_descriptor_invalid", "Token da ponte DFM inválido.");
  }
  if (typeof value.vault !== "string" || !value.vault || typeof value.vaultPath !== "string" || !value.vaultPath) {
    throw bridgeError("bridge_descriptor_invalid", "Identidade do vault ausente no descritor.");
  }
  return {
    contractVersion: value.contractVersion,
    port: value.port,
    token: value.token,
    vault: value.vault,
    vaultPath: value.vaultPath,
    dfmSystemVersion: String(value.dfmSystemVersion || ""),
    startedAt: String(value.startedAt || ""),
  };
}

export function createOperatorClient({ readText, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  if (typeof readText !== "function") throw new TypeError("readText é obrigatório");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch não está disponível no runtime DSH");

  async function descriptor() {
    let raw;
    try {
      raw = await readText(OPERATOR_DESCRIPTOR_PATH);
    } catch (_) {
      throw bridgeError(
        "bridge_offline",
        "Ponte operacional ausente. Abra/recarregue o Obsidian com DFMsystem 2.4+ antes de operar TaskNotes.",
      );
    }
    return parseOperatorDescriptor(raw);
  }

  async function request(route, payload = {}, options = {}) {
    if (typeof route !== "string" || !route.startsWith("/v1/")) {
      throw bridgeError("bridge_route_invalid", "Rota fora do contrato /v1.");
    }
    const config = await descriptor();
    const correlationId = options.correlationId || randomUUID();
    const method = options.method || "POST";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`http://127.0.0.1:${config.port}${route}`, {
        method,
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.token}`,
          "X-DFM-Correlation-ID": correlationId,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify(payload ?? {}) } : {}),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw bridgeError("bridge_timeout", `Ponte DFM não respondeu em ${timeoutMs} ms.`, correlationId);
      }
      throw bridgeError("bridge_offline", "Não foi possível alcançar o Obsidian em loopback.", correlationId);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw bridgeError("bridge_response_too_large", "Resposta da ponte excedeu 256 KiB.", correlationId);
    }
    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch (_) {
      throw bridgeError("bridge_response_invalid", `Resposta não JSON (HTTP ${response.status}).`, correlationId);
    }
    if (!response.ok || !envelope?.ok) {
      throw bridgeError(
        String(envelope?.error?.code || `http_${response.status}`),
        String(envelope?.error?.message || "A ponte DFM recusou a operação."),
        String(envelope?.correlationId || correlationId),
      );
    }
    const data = envelope.data;
    if (route === "/v1/health") {
      if (data?.contractVersion !== OPERATOR_CONTRACT_VERSION
        || data?.vault !== config.vault
        || data?.vaultPath !== config.vaultPath) {
        throw bridgeError("bridge_identity_mismatch", "Health respondeu por outro vault ou contrato.", correlationId);
      }
    }
    return data;
  }

  return {
    descriptor,
    health: () => request("/v1/health", {}, { method: "GET" }),
    request,
  };
}
