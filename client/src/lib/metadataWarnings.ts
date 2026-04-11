/**
 * Client-side quality warnings for tool and parameter descriptions.
 *
 * Pure functions over `tools + metadata + draft` — no I/O, no side effects.
 * Designed to run via `useMemo` in React components without latency.
 *
 * See `projects/mcp-editor/files/spec-phase2b-warnings.md` for the full design.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MetadataFile } from "./metadataApi";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type WarningSeverity = "error" | "advisory";

export type WarningKind =
  | "missing-tool-description"
  | "missing-param-description"
  | "short-tool-description"
  | "short-param-description"
  | "echoes-tool-name"
  | "echoes-param-name"
  | "stopwords-tool-description"
  | "stopwords-param-description";

export interface Warning {
  toolName: string;
  /** Present only for parameter-level warnings. */
  paramName?: string;
  kind: WarningKind;
  severity: WarningSeverity;
  /** Human-readable text shown in the UI. */
  message: string;
}

export interface Draft {
  toolName: string;
  description: string;
  parameters: Record<string, string>;
}

// -----------------------------------------------------------------------------
// Thresholds
// -----------------------------------------------------------------------------

export const SHORT_TOOL_DESC_CHARS = 30;
export const SHORT_PARAM_DESC_CHARS = 15;

// -----------------------------------------------------------------------------
// Stopword sets
// -----------------------------------------------------------------------------

const STOPWORD_VERBS = new Set([
  "get",
  "set",
  "do",
  "make",
  "handle",
  "process",
  "perform",
  "execute",
  "run",
  "call",
  "manage",
  "fetch",
  "load",
  "save",
  "return",
  "find",
  "use",
  "compute",
]);

const STOPWORD_NOUNS = new Set([
  "data",
  "value",
  "values",
  "string",
  "number",
  "input",
  "output",
  "result",
  "results",
  "item",
  "items",
  "thing",
  "things",
  "object",
  "parameter",
  "param",
  "arg",
  "argument",
]);

const STOPWORD_FILLER = new Set([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "and",
  "or",
  "of",
  "to",
  "for",
  "with",
  "from",
  "in",
  "on",
  "at",
  "is",
  "it",
  "its",
  "be",
]);

export const ALL_STOPWORDS = new Set<string>([
  ...STOPWORD_VERBS,
  ...STOPWORD_NOUNS,
  ...STOPWORD_FILLER,
]);

// -----------------------------------------------------------------------------
// Low-level pure helpers
// -----------------------------------------------------------------------------

/**
 * Lowercase, strip non-alphanumeric (keep spaces), collapse whitespace, trim.
 * Used as the canonical form for equality comparisons and tokenization.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Convert a tool or parameter identifier to a human-readable lowercase phrase.
 *   "get_weather"  -> "get weather"
 *   "getWeather"   -> "get weather"
 *   "GetWeather"   -> "get weather"
 *   "get__weather" -> "get weather"
 */
export function humanize(identifier: string): string {
  return identifier
    .replace(/([A-Z])/g, " $1") // split camelCase / PascalCase
    .replace(/_/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalize then split on single spaces, dropping empty tokens.
 */
export function tokenize(s: string): string[] {
  const normalized = normalize(s);
  if (normalized.length === 0) return [];
  return normalized.split(" ").filter((t) => t.length > 0);
}

// -----------------------------------------------------------------------------
// Tool-level heuristic
// -----------------------------------------------------------------------------

/**
 * Apply tool-level heuristics to a single tool's effective description and
 * return zero or more Warning objects.
 *
 * Precedence:
 * 1. Missing suppresses all others
 * 2. Short suppresses echoes and stopwords
 * 3. Otherwise echoes and stopwords test independently and may co-fire
 */
export function checkToolDescription(
  toolName: string,
  effectiveDesc: string,
): Warning[] {
  const trimmed = effectiveDesc.trim();

  // Missing: highest priority, suppresses everything else
  if (trimmed.length === 0) {
    return [
      {
        toolName,
        kind: "missing-tool-description",
        severity: "error",
        message: "Tool has no description. The AI can't decide when to use it.",
      },
    ];
  }

  // Short: suppresses echoes and stopwords
  if (trimmed.length < SHORT_TOOL_DESC_CHARS) {
    return [
      {
        toolName,
        kind: "short-tool-description",
        severity: "advisory",
        message: `Tool description is very short (${trimmed.length} chars). Add context about when to use it.`,
      },
    ];
  }

  // Echoes and stopwords may co-fire
  const warnings: Warning[] = [];

  if (normalize(effectiveDesc) === humanize(toolName)) {
    warnings.push({
      toolName,
      kind: "echoes-tool-name",
      severity: "advisory",
      message:
        "Tool description just repeats the tool name. Add what it does beyond the name.",
    });
  }

  const tokens = tokenize(effectiveDesc);
  if (tokens.length >= 2 && tokens.every((t) => ALL_STOPWORDS.has(t))) {
    warnings.push({
      toolName,
      kind: "stopwords-tool-description",
      severity: "advisory",
      message:
        "Tool description uses only generic words. Add specific domain terms.",
    });
  }

  return warnings;
}
