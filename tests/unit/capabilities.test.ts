import { test } from "node:test";
import assert from "node:assert";
import { detectCapabilities } from "../../src/lib/providers/registry.ts";

test("capabilities: gpt-4o family", () => {
  const { caps } = detectCapabilities("openai", "gpt-4o-2024-08-06");
  assert.strictEqual(caps.vision, true);
  assert.strictEqual(caps.toolCalling, true);
  assert.strictEqual(caps.reasoning, false);
  assert.strictEqual(caps.streaming, true);
});

test("capabilities: reasoning models", () => {
  assert.strictEqual(detectCapabilities("openai", "o3-mini").caps.reasoning, true);
  assert.strictEqual(detectCapabilities("openai", "deepseek-r1").caps.reasoning, true);
  assert.strictEqual(detectCapabilities("anthropic", "claude-3-5-sonnet-20241022").caps.reasoning, false);
});

test("capabilities: claude vision + tools, no vision on claude-2", () => {
  assert.strictEqual(detectCapabilities("anthropic", "claude-3-5-haiku-20241022").caps.vision, true);
  assert.strictEqual(detectCapabilities("anthropic", "claude-2.1").caps.vision, false);
});

test("capabilities: unknown models stay unknown, never guessed true", () => {
  const { caps } = detectCapabilities("custom", "totally-unknown-model");
  assert.strictEqual(caps.vision, null);
  assert.strictEqual(caps.toolCalling, null);
  assert.strictEqual(caps.reasoning, null);
});

test("capabilities: provider metadata wins over KB", () => {
  const { caps } = detectCapabilities("openrouter", "some-model", {
    inputModalities: ["text", "image"],
    supportedParameters: ["tools", "structured_outputs"],
  });
  assert.strictEqual(caps.vision, true);
  assert.strictEqual(caps.toolCalling, true);
  assert.strictEqual(caps.structuredOutput, true);
});

test("capabilities: gemini non-generateContent models excluded", () => {
  const { caps } = detectCapabilities("google", "text-embedding-004", { methods: ["embedContent"] });
  assert.strictEqual(caps.text, false);
});

test("capabilities: labels and context window", () => {
  const fast = detectCapabilities("google", "gemini-2.0-flash-001");
  assert.strictEqual(fast.labels.fast, true);
  assert.strictEqual(fast.contextWindow, 1_048_576);
  const coding = detectCapabilities("mistral", "codestral-latest");
  assert.strictEqual(coding.labels.coding, true);
});
