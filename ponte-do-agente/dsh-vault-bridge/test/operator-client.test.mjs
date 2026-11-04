import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperatorClient,
  OPERATOR_DESCRIPTOR_PATH,
  parseOperatorDescriptor,
} from "../lib/operator-client.js";

const descriptor = {
  contractVersion: 1,
  port: 3082,
  token: "a".repeat(64),
  vault: "cofre-teste",
  vaultPath: "/vault/cofre-teste",
  dfmSystemVersion: "2.4.0",
  startedAt: "2026-08-30T00:00:00.000Z",
};

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

test("descritor aceita somente contrato local completo", () => {
  assert.deepEqual(parseOperatorDescriptor(JSON.stringify(descriptor)), descriptor);
  assert.throws(
    () => parseOperatorDescriptor(JSON.stringify({ ...descriptor, contractVersion: 2 })),
    /bridge_contract_mismatch/,
  );
  assert.throws(
    () => parseOperatorDescriptor(JSON.stringify({ ...descriptor, token: "curto" })),
    /bridge_descriptor_invalid/,
  );
});

test("cliente força loopback, autenticação e correlation id", async () => {
  const calls = [];
  const client = createOperatorClient({
    readText: async path => {
      assert.equal(path, OPERATOR_DESCRIPTOR_PATH);
      return JSON.stringify(descriptor);
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { ok: true, data: { total: 0, tasks: [] } });
    },
  });
  const result = await client.request("/v1/tasks/query", { status: ["next-action"] }, { correlationId: "test-operation-001" });
  assert.deepEqual(result, { total: 0, tasks: [] });
  assert.equal(calls[0].url, "http://127.0.0.1:3082/v1/tasks/query");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${descriptor.token}`);
  assert.equal(calls[0].options.headers["X-DFM-Correlation-ID"], "test-operation-001");
  assert.equal(JSON.parse(calls[0].options.body).status[0], "next-action");
});

test("health recusa servidor de outro vault", async () => {
  const client = createOperatorClient({
    readText: async () => JSON.stringify(descriptor),
    fetchImpl: async () => response(200, {
      ok: true,
      data: { contractVersion: 1, vault: "outro", vaultPath: "/vault/outro" },
    }),
  });
  await assert.rejects(() => client.health(), /bridge_identity_mismatch/);
});

test("erro remoto preserva código e correlation id sem vazar token", async () => {
  const client = createOperatorClient({
    readText: async () => JSON.stringify(descriptor),
    fetchImpl: async () => response(409, {
      ok: false,
      error: { code: "task_exists", message: "Duplicada" },
      correlationId: "corr-remote-001",
    }),
  });
  await assert.rejects(async () => {
    await client.request("/v1/tasks/create", {});
  }, error => {
    assert.equal(error.code, "task_exists");
    assert.equal(error.correlationId, "corr-remote-001");
    assert.equal(error.message.includes(descriptor.token), false);
    return true;
  });
});
