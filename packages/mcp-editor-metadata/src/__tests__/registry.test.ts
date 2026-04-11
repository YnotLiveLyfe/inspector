import { describe, it, expect } from "vitest";
import { z } from "zod";
import { rebuildParamsSchema } from "../registry.js";

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
