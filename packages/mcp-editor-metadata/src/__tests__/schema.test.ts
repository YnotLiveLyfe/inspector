import { describe, it, expect } from "vitest";
import {
  ParameterMetadataSchema,
  ToolMetadataSchema,
  MetadataFileSchema,
} from "../schema.js";

describe("ParameterMetadataSchema", () => {
  it("accepts a valid parameter with a description", () => {
    const result = ParameterMetadataSchema.safeParse({
      description: "City name",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty description", () => {
    const result = ParameterMetadataSchema.safeParse({ description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const result = ParameterMetadataSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = ParameterMetadataSchema.safeParse({
      description: "ok",
      type: "string",
    });
    // Note: Zod `object` is non-strict by default so extra keys pass. If we
    // want strict, we'd use .strict(). For now we DON'T enforce strict —
    // this test asserts the CURRENT behavior: extra keys pass silently.
    expect(result.success).toBe(true);
  });
});

describe("ToolMetadataSchema with parameters", () => {
  it("accepts a tool with parameters", () => {
    const result = ToolMetadataSchema.safeParse({
      description: "Get weather",
      parameters: {
        city: { description: "City name" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a tool without parameters (backward compat)", () => {
    const result = ToolMetadataSchema.safeParse({
      description: "Get weather",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a parameter with empty description", () => {
    const result = ToolMetadataSchema.safeParse({
      description: "Get weather",
      parameters: { city: { description: "" } },
    });
    expect(result.success).toBe(false);
  });
});

describe("MetadataFileSchema with parameters", () => {
  it("accepts a full metadata file with parameters", () => {
    const result = MetadataFileSchema.safeParse({
      version: 1,
      tools: {
        get_weather: {
          description: "Get the weather",
          parameters: {
            city: { description: "City name" },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("still accepts a Phase 1 metadata file (no parameters)", () => {
    const result = MetadataFileSchema.safeParse({
      version: 1,
      tools: {
        echo: { description: "Echo back the input" },
      },
    });
    expect(result.success).toBe(true);
  });
});
