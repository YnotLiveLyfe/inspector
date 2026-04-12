import { describe, it, expect, jest } from "@jest/globals";
import { handleMetadataSaved } from "../handleMetadataSaved";
import type { MetadataFile } from "@/lib/metadataApi";

function makeDeps(
  overrides: Partial<Parameters<typeof handleMetadataSaved>[0]> = {},
) {
  const goodMetadata: MetadataFile = { version: 1, tools: {} };
  return {
    setEditingTool: jest.fn(),
    callTool: jest.fn(async () => ({})),
    listTools: jest.fn(async () => undefined),
    fetchMetadataFn: jest.fn(async () => goodMetadata),
    setCurrentMetadata: jest.fn(),
    toast: jest.fn(),
    metadataPath: "/fake/metadata.json",
    authToken: "test-token",
    ...overrides,
  };
}

describe("handleMetadataSaved", () => {
  it("fires a success toast on the happy path", async () => {
    const deps = makeDeps();
    await handleMetadataSaved(deps);

    expect(deps.setEditingTool).toHaveBeenCalledWith(null);
    expect(deps.callTool).toHaveBeenCalledWith("_reload_metadata", {});
    expect(deps.listTools).toHaveBeenCalled();
    expect(deps.fetchMetadataFn).toHaveBeenCalledWith(
      "/fake/metadata.json",
      "test-token",
    );
    expect(deps.setCurrentMetadata).toHaveBeenCalled();
    expect(deps.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Metadata saved",
      }),
    );
  });

  it("fires a destructive toast when _reload_metadata fails", async () => {
    const deps = makeDeps({
      callTool: jest.fn(async () => {
        throw new Error("reload boom");
      }),
    });
    await handleMetadataSaved(deps);

    expect(deps.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Metadata saved, but reload failed",
        description: "reload boom",
        variant: "destructive",
      }),
    );
    // Happy-path toast still fires (reload failure is partial — save landed)
    expect(deps.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Metadata saved",
      }),
    );
  });

  it("fires a destructive toast and skips success when refetch fails", async () => {
    const deps = makeDeps({
      fetchMetadataFn: jest.fn(async () => {
        throw new Error("refetch boom");
      }),
    });
    await handleMetadataSaved(deps);

    expect(deps.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to refresh metadata after save",
        description: "refetch boom",
        variant: "destructive",
      }),
    );
    // Success toast NOT fired
    expect(deps.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Metadata saved",
      }),
    );
  });
});
