import { describe, it, expect } from "vitest";
import { MetadataFileSchema } from "../src/schema.js";

describe("MetadataFileSchema", () => {
  it("accepts a minimal valid metadata file", () => {
    const input = {
      version: 1,
      tools: {
        echo: {
          description: "Echoes the input",
        },
      },
    };
    const result = MetadataFileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts an optional title field on tools", () => {
    const input = {
      version: 1,
      tools: {
        echo: { description: "Echoes", title: "Echo Tool" },
      },
    };
    expect(MetadataFileSchema.safeParse(input).success).toBe(true);
  });

  it("rejects missing version", () => {
    const input = { tools: { echo: { description: "x" } } };
    expect(MetadataFileSchema.safeParse(input).success).toBe(false);
  });

  it("rejects unknown version", () => {
    const input = { version: 999, tools: {} };
    expect(MetadataFileSchema.safeParse(input).success).toBe(false);
  });

  it("rejects tools without description", () => {
    const input = { version: 1, tools: { echo: {} } };
    expect(MetadataFileSchema.safeParse(input).success).toBe(false);
  });

  it("rejects empty tool descriptions", () => {
    const input = { version: 1, tools: { echo: { description: "" } } };
    expect(MetadataFileSchema.safeParse(input).success).toBe(false);
  });
});
