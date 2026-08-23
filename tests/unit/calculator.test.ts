import { test } from "node:test";
import assert from "node:assert";
import { evaluateExpression } from "../../src/lib/tools.ts";

test("calculator: basic arithmetic", () => {
  assert.strictEqual(evaluateExpression("2+2"), 4);
  assert.strictEqual(evaluateExpression("2+3*4"), 14);
  assert.strictEqual(evaluateExpression("(2+3)*4"), 20);
  assert.strictEqual(evaluateExpression("10/4"), 2.5);
  assert.strictEqual(evaluateExpression("2^10"), 1024);
  assert.strictEqual(evaluateExpression("7%3"), 1);
});

test("calculator: unary minus and precedence", () => {
  assert.strictEqual(evaluateExpression("-5+3"), -2);
  assert.strictEqual(evaluateExpression("2*-3"), -6);
  assert.strictEqual(evaluateExpression("-(2+3)"), -5);
  assert.strictEqual(evaluateExpression("--4"), 4);
});

test("calculator: functions and constants", () => {
  assert.strictEqual(evaluateExpression("sqrt(144)"), 12);
  assert.ok(Math.abs(evaluateExpression("sqrt(2)^2") - 2) < 1e-9);
  assert.strictEqual(evaluateExpression("ln(e)"), 1);
  assert.strictEqual(evaluateExpression("log(1000)"), 3);
  assert.strictEqual(evaluateExpression("abs(-42)"), 42);
  assert.strictEqual(evaluateExpression("round(2.5)"), 3);
  assert.ok(Math.abs(evaluateExpression("sin(0)") as number) < 1e-12);
  assert.strictEqual(evaluateExpression("2^-2"), 0.25);
});

test("calculator: rejects invalid and dangerous input", () => {
  assert.throws(() => evaluateExpression("2+"));
  assert.throws(() => evaluateExpression(")3("));
  assert.throws(() => evaluateExpression("process.exit(1)"));
  assert.throws(() => evaluateExpression("constructor"));
  assert.throws(() => evaluateExpression("1/0"));
  assert.throws(() => evaluateExpression(""));
  assert.throws(() => evaluateExpression("2..3"));
});
