import { describe, it, expect } from "@jest/globals";
import {
  normalize,
  humanize,
  tokenize,
  ALL_STOPWORDS,
  SHORT_TOOL_DESC_CHARS,
  SHORT_PARAM_DESC_CHARS,
  type Warning,
  type WarningSeverity,
  type WarningKind,
} from "../metadataWarnings";

describe("normalize", () => {
  it("lowercases, strips punctuation, collapses whitespace, and trims", () => {
    expect(normalize("  Hello, WORLD!  ")).toBe("hello world");
  });

  it("preserves alphanumerics and single spaces", () => {
    expect(normalize("get_weather v2")).toBe("getweather v2");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalize("   \t\n ")).toBe("");
  });
});

describe("humanize", () => {
  it("converts snake_case to space-separated lowercase", () => {
    expect(humanize("get_weather")).toBe("get weather");
  });

  it("converts camelCase to space-separated lowercase", () => {
    expect(humanize("getWeather")).toBe("get weather");
  });

  it("converts PascalCase to space-separated lowercase", () => {
    expect(humanize("GetWeather")).toBe("get weather");
  });

  it("handles a single word", () => {
    expect(humanize("weather")).toBe("weather");
  });

  it("collapses multiple underscores", () => {
    expect(humanize("get__weather")).toBe("get weather");
  });
});

describe("tokenize", () => {
  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("splits on whitespace after normalization", () => {
    expect(tokenize("The quick brown fox!")).toEqual([
      "the",
      "quick",
      "brown",
      "fox",
    ]);
  });

  it("filters out empty tokens from multiple spaces", () => {
    expect(tokenize("a   b    c")).toEqual(["a", "b", "c"]);
  });
});

describe("ALL_STOPWORDS", () => {
  it("contains common generic verbs", () => {
    expect(ALL_STOPWORDS.has("get")).toBe(true);
    expect(ALL_STOPWORDS.has("process")).toBe(true);
  });

  it("contains common generic nouns", () => {
    expect(ALL_STOPWORDS.has("data")).toBe(true);
    expect(ALL_STOPWORDS.has("value")).toBe(true);
  });

  it("contains filler words", () => {
    expect(ALL_STOPWORDS.has("the")).toBe(true);
    expect(ALL_STOPWORDS.has("a")).toBe(true);
  });

  it("does NOT contain domain-specific words", () => {
    expect(ALL_STOPWORDS.has("weather")).toBe(false);
    expect(ALL_STOPWORDS.has("celsius")).toBe(false);
  });
});

describe("threshold constants", () => {
  it("SHORT_TOOL_DESC_CHARS is 30", () => {
    expect(SHORT_TOOL_DESC_CHARS).toBe(30);
  });

  it("SHORT_PARAM_DESC_CHARS is 15", () => {
    expect(SHORT_PARAM_DESC_CHARS).toBe(15);
  });
});

describe("exported types", () => {
  it("Warning, WarningSeverity, WarningKind are importable (compile-time check)", () => {
    // This test exists purely to trigger a TypeScript compile check.
    // If the types are not exported, this file fails to typecheck.
    const w: Warning = {
      toolName: "example",
      kind: "missing-tool-description" as WarningKind,
      severity: "error" as WarningSeverity,
      message: "test",
    };
    expect(w.kind).toBe("missing-tool-description");
  });
});
