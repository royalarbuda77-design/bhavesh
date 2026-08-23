import { test } from "node:test";
import assert from "node:assert";
import { classifyPrompt, routeModel } from "../../src/lib/agent.ts";
import type { ModelDTO } from "../../src/lib/providers/manager.ts";

function fakeModel(partial: Partial<ModelDTO> & { modelId: string }): ModelDTO {
  return {
    id: `row-${partial.modelId}`,
    credentialId: "cred1",
    providerId: "openai",
    providerLabel: "OpenAI",
    displayName: partial.modelId,
    capabilities: {
      text: true, streaming: true, vision: false, toolCalling: true,
      reasoning: false, structuredOutput: null, imageGeneration: false,
    },
    labels: {},
    contextWindow: null,
    pricing: null,
    enabled: true,
    source: "discovered",
    lastSeen: Date.now(),
    ...partial,
  } as ModelDTO;
}

const vision = fakeModel({ modelId: "gpt-4o", capabilities: { text: true, streaming: true, vision: true, toolCalling: true, reasoning: false, structuredOutput: true, imageGeneration: false } });
const reasoner = fakeModel({ modelId: "o3-mini", capabilities: { text: true, streaming: true, vision: false, toolCalling: true, reasoning: true, structuredOutput: true, imageGeneration: false } });
const fast = fakeModel({ modelId: "gpt-4o-mini", labels: { fast: true } });

test("router: vision messages go to vision-capable models only", () => {
  const routed = routeModel([fast, reasoner, vision], "what is in this picture?", true, false);
  assert.ok(routed);
  assert.strictEqual(routed.model.modelId, "gpt-4o");
  const none = routeModel([fast, reasoner], "what is in this picture?", true, false);
  assert.strictEqual(none, null);
});

test("router: reasoning prompts prefer reasoning models", () => {
  const routed = routeModel([fast, reasoner], "Explain in depth why the bridge collapsed, step by step", false, false);
  assert.ok(routed);
  assert.strictEqual(routed.model.modelId, "o3-mini");
});

test("router: simple prompts prefer fast models", () => {
  const routed = routeModel([reasoner, fast], "hi", false, false);
  assert.ok(routed);
  assert.strictEqual(routed.model.modelId, "gpt-4o-mini");
});

test("router: coding prompts prefer coding models", () => {
  const coder = fakeModel({ modelId: "codestral-latest", labels: { coding: true } });
  const routed = routeModel([fast, coder], "fix the bug in my typescript function", false, false);
  assert.ok(routed);
  assert.strictEqual(routed.model.modelId, "codestral-latest");
});

test("router: disabled models are never selected", () => {
  const disabled = { ...vision, enabled: false };
  assert.strictEqual(routeModel([disabled], "image question", true, false), null);
});

test("classify: web search intent", () => {
  const d = classifyPrompt("latest news about Mars", false, true);
  assert.strictEqual(d.kind, "search");
});
