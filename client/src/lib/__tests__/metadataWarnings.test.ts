import { describe, it, expect } from "@jest/globals";
import {
  normalize,
  humanize,
  tokenize,
  checkToolDescription,
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

describe("checkToolDescription — missing", () => {
  it("emits missing-tool-description for empty string", () => {
    const warnings = checkToolDescription("get_weather", "");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      toolName: "get_weather",
      kind: "missing-tool-description",
      severity: "error",
    });
  });

  it("emits missing-tool-description for whitespace-only", () => {
    const warnings = checkToolDescription("get_weather", "   \t\n ");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe("missing-tool-description");
  });

  it("does not emit other kinds when missing fires", () => {
    const warnings = checkToolDescription("get_weather", "");
    expect(warnings.map((w) => w.kind)).toEqual(["missing-tool-description"]);
  });
});

describe("checkToolDescription — short", () => {
  it("emits short-tool-description for a 29-char description", () => {
    const desc = "A".repeat(29);
    const warnings = checkToolDescription("get_weather", desc);
    expect(warnings.map((w) => w.kind)).toEqual(["short-tool-description"]);
    expect(warnings[0].severity).toBe("advisory");
    expect(warnings[0].message).toContain("29 chars");
  });

  it("does NOT emit short for a 30-char description (boundary)", () => {
    const desc = "A".repeat(30);
    const warnings = checkToolDescription("get_weather", desc);
    expect(warnings.map((w) => w.kind)).not.toContain("short-tool-description");
  });

  it("does not emit short when also missing", () => {
    const warnings = checkToolDescription("get_weather", "");
    expect(warnings.map((w) => w.kind)).not.toContain("short-tool-description");
  });

  it("suppresses echoes and stopwords even if triggered", () => {
    // "Get weather" (11 chars) echoes the tool name AND is short
    const warnings = checkToolDescription("get_weather", "Get weather");
    expect(warnings.map((w) => w.kind)).toEqual(["short-tool-description"]);
  });
});

describe("checkToolDescription — echoes-tool-name", () => {
  it("emits echoes-tool-name when desc equals humanized name (padded to long enough)", () => {
    // Use a tool name whose humanized form is already >= 30 chars.
    const warnings = checkToolDescription(
      "get_full_weather_forecast_for_a_city",
      "Get full weather forecast for a city",
    );
    expect(warnings.map((w) => w.kind)).toContain("echoes-tool-name");
  });

  it("does not emit echoes when the description differs", () => {
    const warnings = checkToolDescription(
      "get_weather",
      "Returns current weather conditions and a 5-day forecast for the given city.",
    );
    expect(warnings.map((w) => w.kind)).not.toContain("echoes-tool-name");
  });

  it("normalizes punctuation and case when comparing", () => {
    const warnings = checkToolDescription(
      "get_full_weather_forecast_for_a_city",
      "GET FULL WEATHER FORECAST FOR A CITY!!!",
    );
    expect(warnings.map((w) => w.kind)).toContain("echoes-tool-name");
  });
});

describe("checkToolDescription — stopwords", () => {
  it("emits stopwords-tool-description when all tokens are stopwords and length is long enough", () => {
    // "get the data and process the input values" — 41 chars, all stopwords
    const warnings = checkToolDescription(
      "example",
      "get the data and process the input values",
    );
    expect(warnings.map((w) => w.kind)).toContain("stopwords-tool-description");
  });

  it("does not emit stopwords when at least one token is domain-specific", () => {
    const warnings = checkToolDescription(
      "example",
      "get the weather data for the specified city location",
    );
    expect(warnings.map((w) => w.kind)).not.toContain(
      "stopwords-tool-description",
    );
  });

  it("requires at least 2 tokens (single-word handled by short)", () => {
    // Single word "data" is already caught by short; stopwords should not also fire
    const warnings = checkToolDescription("example", "data");
    expect(warnings.map((w) => w.kind)).not.toContain(
      "stopwords-tool-description",
    );
  });
});

describe("checkToolDescription — co-firing", () => {
  it("emits both echoes and stopwords if both apply and length is sufficient", () => {
    // Tool name "get_the_data_and_process_the_input" humanizes to "get the data and process the input" (34 chars)
    // That matches the description — and all tokens are stopwords.
    const warnings = checkToolDescription(
      "get_the_data_and_process_the_input",
      "Get the data and process the input",
    );
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("echoes-tool-name");
    expect(kinds).toContain("stopwords-tool-description");
    expect(kinds).not.toContain("missing-tool-description");
    expect(kinds).not.toContain("short-tool-description");
  });
});
