import { describe, it, expect, vi } from "vitest";
import { applyMetadata } from "../src/registry.js";
import type { MetadataFile } from "../src/schema.js";

function makeHandle(initialDescription: string) {
  const handle = {
    description: initialDescription,
    update: vi.fn((updates: { description?: string; title?: string }) => {
      if (updates.description !== undefined) handle.description = updates.description;
    }),
  };
  return handle;
}

describe("applyMetadata", () => {
  it("calls update() on tools whose description changed", () => {
    const echo = makeHandle("old echo");
    const add = makeHandle("old add");
    const handles = new Map([
      ["echo", echo],
      ["add", add],
    ]);

    const metadata: MetadataFile = {
      version: 1,
      tools: {
        echo: { description: "new echo" },
        add: { description: "old add" },
      },
    };

    const result = applyMetadata(handles, metadata);

    expect(echo.update).toHaveBeenCalledWith({ description: "new echo" });
    expect(add.update).not.toHaveBeenCalled();
    expect(result.updated).toEqual(["echo"]);
    expect(result.skipped).toEqual(["add"]);
  });

  it("passes title through when present", () => {
    const echo = makeHandle("desc");
    const handles = new Map([["echo", echo]]);
    const metadata: MetadataFile = {
      version: 1,
      tools: { echo: { description: "desc", title: "Echo Tool" } },
    };

    applyMetadata(handles, metadata);

    expect(echo.update).toHaveBeenCalledWith({
      description: "desc",
      title: "Echo Tool",
    });
  });

  it("warns (does not throw) when metadata references an unknown tool", () => {
    const echo = makeHandle("desc");
    const handles = new Map([["echo", echo]]);
    const metadata: MetadataFile = {
      version: 1,
      tools: {
        echo: { description: "desc" },
        unknown: { description: "phantom" },
      },
    };

    const result = applyMetadata(handles, metadata);

    expect(result.missing).toEqual(["unknown"]);
    expect(echo.update).not.toHaveBeenCalled();
  });
});
