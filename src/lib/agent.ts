import type { ModelDTO } from "./providers/manager";

/**
 * CapabilityDetector-backed auto model routing. Decisions use ONLY models the
 * current user has connected and enabled. Classification is a deterministic
 * heuristic (no extra API calls, no cost).
 */

export type RouteKind = "vision" | "search" | "coding" | "reasoning" | "general";

export type RoutingDecision = {
  kind: RouteKind;
  reason: string;
  needsVision: boolean;
  prefersTools: boolean;
  preference: "fast" | "reasoning" | "coding" | "any";
};

const CODE_RE = /\b(code|coding|function|bug|debug|stack ?trace|compile|refactor|api endpoint|regex|typescript|javascript|python|java|c\+\+|rust|go lang|golang|sql|html|css|react|node|script|algorithm|leetcode)\b/i;
const REASON_RE = /\b(why|explain in depth|derive|prove|step by step|reason|analy[sz]e|compare and contrast|strategy|trade-?offs|philosoph|math proof|evaluate|implications)\b/i;
const LONG_INPUT_THRESHOLD = 900;

export function classifyPrompt(userText: string, hasImages: boolean, webSearch: boolean): RoutingDecision {
  if (hasImages) {
    return { kind: "vision", reason: "Message contains images — routed to a vision-capable model.", needsVision: true, prefersTools: false, preference: "any" };
  }
  if (webSearch) {
    return { kind: "search", reason: "Web research requested — routed to a tool-capable model.", needsVision: false, prefersTools: true, preference: "any" };
  }
  if (CODE_RE.test(userText)) {
    return { kind: "coding", reason: "Looks like a coding task — routed to a coding-oriented model.", needsVision: false, prefersTools: false, preference: "coding" };
  }
  if (REASON_RE.test(userText) || userText.length > LONG_INPUT_THRESHOLD) {
    return { kind: "reasoning", reason: "Complex or reasoning-heavy question — routed to a reasoning model.", needsVision: false, prefersTools: false, preference: "reasoning" };
  }
  return { kind: "general", reason: "Simple question — routed to a fast model.", needsVision: false, prefersTools: false, preference: "fast" };
}

export function routeModel(models: ModelDTO[], userText: string, hasImages: boolean, webSearch: boolean): { model: ModelDTO; decision: RoutingDecision } | null {
  if (models.length === 0) return null;
  const decision = classifyPrompt(userText, hasImages, webSearch);

  let candidates = models.filter((m) => m.enabled);
  if (decision.needsVision) {
    const vision = candidates.filter((m) => m.capabilities.vision === true);
    if (vision.length === 0) return null;
    candidates = vision;
  }
  if (decision.prefersTools) {
    const withTools = candidates.filter((m) => m.capabilities.toolCalling === true);
    if (withTools.length > 0) candidates = withTools;
    // no tool-capable model → pre-search fallback still works, don't hard-fail
  }

  const score = (m: ModelDTO): number => {
    let s = 0;
    if (decision.preference === "fast") {
      if (m.labels.fast) s += 3;
      if (m.capabilities.reasoning === true) s -= 1;
    } else if (decision.preference === "reasoning") {
      if (m.capabilities.reasoning === true) s += 3;
      if (m.labels.fast) s += 1;
    } else if (decision.preference === "coding") {
      if (m.labels.coding) s += 3;
      if (m.capabilities.reasoning === true) s += 1;
    } else {
      if (m.labels.fast) s += 1;
    }
    if (m.capabilities.streaming !== false) s += 0.5;
    return s;
  };

  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  return { model: ranked[0], decision };
}
