import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { ZodRawShape } from "zod";
import { rebuildParamsSchema, applyMetadata, type ToolHandle } from "../registry.js";
import type { MetadataFile } from "../schema.js";

describe("rebuildParamsSchema", () => {
  it("returns the base shape unchanged if descriptions arg is undefined", () => {
    const base = {
      city: z.string(),
      units: z.enum(["C", "F"]),
    };
    const result = rebuildParamsSchema(base, undefined);
    expect(result).toBe(base);
  });

  it("returns the base shape unchanged if descriptions is an empty object", () => {
    const base = {
      city: z.string(),
    };
    // Empty-object short circuit: nothing to override, return the original.
    const result = rebuildParamsSchema(base, {});
    expect(result).toBe(base);
  });

  it("attaches a new .describe() when a description is provided", () => {
    const base = {
      city: z.string(),
    };
    const result = rebuildParamsSchema(base, { city: "The city to look up" });
    // The returned shape is a new object but preserves the same keys.
    expect(Object.keys(result)).toEqual(["city"]);
    // Zod's internal description lives on the `.description` property after
    // calling .describe(). Use the internal accessor to check:
    const described = result.city as z.ZodTypeAny;
    expect(described.description).toBe("The city to look up");
  });

  it("leaves parameters not in the descriptions object alone", () => {
    const base = {
      city: z.string(),
      units: z.enum(["C", "F"]).describe("Original"),
    };
    const result = rebuildParamsSchema(base, { city: "New city desc" });
    expect((result.city as z.ZodTypeAny).description).toBe("New city desc");
    // `units` was not in descriptions — its original .describe() survives.
    expect((result.units as z.ZodTypeAny).description).toBe("Original");
  });

  it("ignores description entries for params that don't exist in the base shape", () => {
    const base = {
      city: z.string(),
    };
    const result = rebuildParamsSchema(base, {
      city: "ok",
      nonexistent: "ignored",
    });
    expect(Object.keys(result)).toEqual(["city"]);
    expect((result.city as z.ZodTypeAny).description).toBe("ok");
    expect((result as Record<string, unknown>).nonexistent).toBeUndefined();
  });
});

type CapturedUpdate = {
  description?: string;
  title?: string;
  paramsSchema?: ZodRawShape;
};

function makeHandle(initialDescription: string): {
  handle: ToolHandle;
  updates: CapturedUpdate[];
} {
  const updates: CapturedUpdate[] = [];
  const handle: ToolHandle = {
    description: initialDescription,
    update: vi.fn((u: CapturedUpdate) => {
      updates.push(u);
      if (u.description !== undefined) handle.description = u.description;
    }),
  };
  return { handle, updates };
}

describe("applyMetadata with baseShapes", () => {
  it("rebuilds paramsSchema when metadata has a parameters block", () => {
    const { handle, updates } = makeHandle("old description");
    const handles = new Map<string, ToolHandle>([["get_weather", handle]]);
    const baseShapes = new Map<string, ZodRawShape>([
      ["get_weather", { city: z.string() }],
    ]);
    const metadata: MetadataFile = {
      version: 1,
      tools: {
        get_weather: {
          description: "new description",
          parameters: { city: { description: "The city to look up" } },
        },
      },
    };

    const result = applyMetadata(handles, baseShapes, metadata);

    expect(result.updated).toEqual(["get_weather"]);
    expect(updates).toHaveLength(1);
    expect(updates[0].description).toBe("new description");
    expect(updates[0].paramsSchema).toBeDefined();
    const rebuiltCity = (updates[0].paramsSchema as ZodRawShape).city as z.ZodTypeAny;
    expect(rebuiltCity.description).toBe("The city to look up");
  });

  it("skips paramsSchema update when metadata has no parameters block", () => {
    const { handle, updates } = makeHandle("old description");
    const handles = new Map<string, ToolHandle>([["echo", handle]]);
    const baseShapes = new Map<string, ZodRawShape>([
      ["echo", { text: z.string() }],
    ]);
    const metadata: MetadataFile = {
      version: 1,
      tools: {
        echo: { description: "new description" },
      },
    };

    applyMetadata(handles, baseShapes, metadata);

    expect(updates).toHaveLength(1);
    expect(updates[0].description).toBe("new description");
    expect(updates[0].paramsSchema).toBeUndefined();
  });

  it("still reports missing for unknown tool names", () => {
    const handles = new Map<string, ToolHandle>();
    const baseShapes = new Map<string, ZodRawShape>();
    const metadata: MetadataFile = {
      version: 1,
      tools: {
        ghost: { description: "never registered" },
      },
    };

    const result = applyMetadata(handles, baseShapes, metadata);

    expect(result.missing).toEqual(["ghost"]);
    expect(result.updated).toEqual([]);
  });

  it("works without a base shape entry for a tool (paramsSchema stays untouched)", () => {
    const { handle, updates } = makeHandle("old");
    const handles = new Map<string, ToolHandle>([["t", handle]]);
    // Intentionally no baseShapes entry for "t"
    const baseShapes = new Map<string, ZodRawShape>();
    const metadata: MetadataFile = {
      version: 1,
      tools: {
        t: {
          description: "new",
          parameters: { x: { description: "new x" } },
        },
      },
    };

    applyMetadata(handles, baseShapes, metadata);

    // We still call update() for description, but NOT paramsSchema because
    // we have no base shape to rebuild from.
    expect(updates).toHaveLength(1);
    expect(updates[0].description).toBe("new");
    expect(updates[0].paramsSchema).toBeUndefined();
  });
});
