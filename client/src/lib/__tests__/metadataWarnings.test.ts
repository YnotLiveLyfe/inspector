import { describe, it, expect } from "@jest/globals";
import {
  normalize,
  humanize,
  tokenize,
  checkToolDescription,
  checkParamDescription,
  ALL_STOPWORDS,
  SHORT_TOOL_DESC_CHARS,
  SHORT_PARAM_DESC_CHARS,
  type Warning,
  type WarningSeverity,
  type WarningKind,
} from "../metadataWarnings";
import { computeWarnings } from "../metadataWarnings";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

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

describe("checkParamDescription — missing", () => {
  it("emits missing-param-description for empty string", () => {
    const warnings = checkParamDescription("get_weather", "city", "");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      toolName: "get_weather",
      paramName: "city",
      kind: "missing-param-description",
      severity: "error",
    });
  });

  it("emits missing-param-description for whitespace-only", () => {
    const warnings = checkParamDescription("get_weather", "city", "   ");
    expect(warnings[0].kind).toBe("missing-param-description");
  });

  it("suppresses other kinds when missing fires", () => {
    const warnings = checkParamDescription("get_weather", "city", "");
    expect(warnings.map((w) => w.kind)).toEqual(["missing-param-description"]);
  });
});

describe("checkParamDescription — short", () => {
  it("emits short-param-description for a 14-char description", () => {
    const desc = "A".repeat(14);
    const warnings = checkParamDescription("get_weather", "city", desc);
    expect(warnings.map((w) => w.kind)).toEqual(["short-param-description"]);
    expect(warnings[0].severity).toBe("advisory");
    expect(warnings[0].message).toContain("14 chars");
  });

  it("does NOT emit short for a 15-char description (boundary)", () => {
    const desc = "A".repeat(15);
    const warnings = checkParamDescription("get_weather", "city", desc);
    expect(warnings.map((w) => w.kind)).not.toContain(
      "short-param-description",
    );
  });

  it("suppresses echoes and stopwords if short fires", () => {
    // "city" echoes the param name and is also short
    const warnings = checkParamDescription("get_weather", "city", "city");
    expect(warnings.map((w) => w.kind)).toEqual(["short-param-description"]);
  });
});

describe("checkParamDescription — echoes-param-name", () => {
  it("emits echoes when desc equals param name (padded long enough)", () => {
    // We need a param name whose humanized form is >= 15 chars to clear short
    const warnings = checkParamDescription(
      "get_weather",
      "the_city_to_look_up",
      "the city to look up",
    );
    expect(warnings.map((w) => w.kind)).toContain("echoes-param-name");
  });

  it("emits echoes when desc is 'the ' + param name", () => {
    const warnings = checkParamDescription(
      "get_weather",
      "city_identifier",
      "the city identifier",
    );
    expect(warnings.map((w) => w.kind)).toContain("echoes-param-name");
  });

  it("does not emit echoes for distinct description", () => {
    const warnings = checkParamDescription(
      "get_weather",
      "city",
      "City name — e.g. 'Minneapolis' or 'Tokyo'",
    );
    expect(warnings.map((w) => w.kind)).not.toContain("echoes-param-name");
  });
});

describe("checkParamDescription — stopwords", () => {
  it("emits stopwords-param-description when all tokens are stopwords and length is sufficient", () => {
    const warnings = checkParamDescription(
      "get_weather",
      "input",
      "the input value to process",
    );
    expect(warnings.map((w) => w.kind)).toContain(
      "stopwords-param-description",
    );
  });

  it("does not emit stopwords when at least one token is domain-specific", () => {
    const warnings = checkParamDescription(
      "get_weather",
      "city",
      "the city name like Minneapolis",
    );
    expect(warnings.map((w) => w.kind)).not.toContain(
      "stopwords-param-description",
    );
  });
});

describe("checkParamDescription — co-firing", () => {
  it("emits both echoes and stopwords if both apply", () => {
    // Param: "the_input_value" → humanize "the input value" (15 chars — at the boundary, doesn't fire short)
    // Description: "the input value" → matches humanize AND all tokens are stopwords
    const warnings = checkParamDescription(
      "example",
      "the_input_value",
      "the input value",
    );
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("echoes-param-name");
    expect(kinds).toContain("stopwords-param-description");
    expect(kinds).not.toContain("missing-param-description");
    expect(kinds).not.toContain("short-param-description");
  });
});

function makeTool(
  name: string,
  description: string,
  properties: Record<string, { description?: string } | true> = {},
): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: properties as Record<string, unknown>,
    },
  } as Tool;
}

describe("computeWarnings — empty inputs", () => {
  it("returns [] for empty tools", () => {
    expect(computeWarnings([], null)).toEqual([]);
  });

  it("returns [] for tools with fully-valid descriptions", () => {
    const tools = [
      makeTool(
        "get_weather",
        "Get current weather and 5-day forecast for a given city. Use when the user mentions weather.",
        {
          city: { description: "City name such as 'Minneapolis' or 'Tokyo'." },
        },
      ),
    ];
    expect(computeWarnings(tools, null)).toEqual([]);
  });
});

describe("computeWarnings — metadata null", () => {
  it("uses tool.description from listTools when metadata is null", () => {
    const tools = [makeTool("get_weather", "")];
    const warnings = computeWarnings(tools, null);
    expect(warnings.map((w) => w.kind)).toContain("missing-tool-description");
  });
});

describe("computeWarnings — draft shadowing", () => {
  it("uses draft.description for the tool being edited", () => {
    const tools = [
      makeTool(
        "get_weather",
        "A fully adequate description that is long enough",
      ),
    ];
    const draft = {
      toolName: "get_weather",
      description: "",
      parameters: {},
    };
    const warnings = computeWarnings(tools, null, draft);
    expect(warnings.map((w) => w.kind)).toContain("missing-tool-description");
  });

  it("does NOT use draft for a different tool", () => {
    const tools = [
      makeTool(
        "get_weather",
        "A fully adequate description that is long enough",
      ),
      makeTool("convert_temperature", ""),
    ];
    const draft = {
      toolName: "get_weather",
      description: "",
      parameters: {},
    };
    const warnings = computeWarnings(tools, null, draft);
    // get_weather uses draft and hits missing
    // convert_temperature uses its own (empty) description and also hits missing
    const missingForGet = warnings.filter(
      (w) =>
        w.toolName === "get_weather" && w.kind === "missing-tool-description",
    );
    const missingForConvert = warnings.filter(
      (w) =>
        w.toolName === "convert_temperature" &&
        w.kind === "missing-tool-description",
    );
    expect(missingForGet).toHaveLength(1);
    expect(missingForConvert).toHaveLength(1);
  });

  it("uses draft.parameters for the tool being edited", () => {
    const tools = [
      makeTool(
        "get_weather",
        "A perfectly fine long description for the tool here.",
        {
          city: { description: "A perfectly fine city parameter description." },
        },
      ),
    ];
    const draft = {
      toolName: "get_weather",
      description: "A perfectly fine long description for the tool here.",
      parameters: { city: "" },
    };
    const warnings = computeWarnings(tools, null, draft);
    const missing = warnings.filter(
      (w) => w.kind === "missing-param-description",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].paramName).toBe("city");
  });
});

describe("computeWarnings — fixture integration", () => {
  it("produces correct warning set for a mixed-quality server", () => {
    const tools = [
      // Clean
      makeTool(
        "get_weather",
        "Get current weather and a 5-day forecast for a given city. Use when asked.",
        {
          city: { description: "City name such as 'Minneapolis'." },
        },
      ),
      // Short tool desc
      makeTool("add", "adds two numbers", {
        a: { description: "First operand value as a number." },
        b: { description: "Second operand value as a number." },
      }),
      // Missing param desc
      makeTool(
        "convert_temperature",
        "Convert a temperature between Celsius and Fahrenheit units.",
        {
          value: { description: "The numeric temperature value to convert." },
          from: { description: "" },
          to: { description: "The target unit symbol, C or F." },
        },
      ),
    ];

    const warnings = computeWarnings(tools, null);
    const kinds = warnings.map(
      (w) => `${w.toolName}:${w.paramName ?? "-"}:${w.kind}`,
    );

    // Clean tool: no warnings
    expect(kinds.filter((k) => k.startsWith("get_weather:"))).toEqual([]);

    // add: short-tool-description (only)
    expect(kinds).toContain("add:-:short-tool-description");

    // convert_temperature 'from' param: missing
    expect(kinds).toContain(
      "convert_temperature:from:missing-param-description",
    );
    // convert_temperature 'value' and 'to': no warnings
    expect(
      kinds.filter((k) => k.startsWith("convert_temperature:value:")),
    ).toEqual([]);
    expect(
      kinds.filter((k) => k.startsWith("convert_temperature:to:")),
    ).toEqual([]);
  });
});

describe("computeWarnings — exotic schema handling", () => {
  it("skips param with boolean-true shorthand schema", () => {
    const tool: Tool = {
      name: "test",
      description: "A perfectly fine long description for the tool here.",
      inputSchema: {
        type: "object",
        properties: {
          weird: true, // boolean shorthand
        },
      },
    } as unknown as Tool;

    const warnings = computeWarnings([tool], null);
    // Should not emit any param warnings for 'weird'
    expect(warnings.filter((w) => w.paramName === "weird")).toEqual([]);
  });

  it("handles tools with no inputSchema.properties", () => {
    const tool: Tool = {
      name: "no_params",
      description: "A tool that takes no parameters at all, just runs once.",
      inputSchema: {
        type: "object",
      },
    } as Tool;
    expect(() => computeWarnings([tool], null)).not.toThrow();
    expect(computeWarnings([tool], null)).toEqual([]);
  });
});
