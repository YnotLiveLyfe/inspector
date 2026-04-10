import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerReloadTool } from "../src/reloadTool.js";
import type { ToolHandle } from "../src/registry.js";

function makeHandle(initial: string): ToolHandle {
  const handle = {
    description: initial,
    update: vi.fn((updates: { description?: string; title?: string }) => {
      if (updates.description !== undefined) handle.description = updates.description;
    }),
  };
  return handle;
}

function writeMeta(path: string, toolDescriptions: Record<string, string>) {
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      tools: Object.fromEntries(
        Object.entries(toolDescriptions).map(([k, v]) => [k, { description: v }]),
      ),
    }),
  );
}

// Minimal McpServer shim matching just the surface registerReloadTool needs.
function makeServerShim() {
  const registered: Array<{ name: string; handler: () => Promise<unknown> }> = [];
  return {
    registered,
    registerTool: vi.fn((name: string, _config: unknown, handler: () => Promise<unknown>) => {
      registered.push({ name, handler });
      return { description: "", update: vi.fn() };
    }),
  };
}

describe("registerReloadTool", () => {
  let tmpDir: string;
  let metaPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-editor-reload-"));
    metaPath = join(tmpDir, "metadata.json");
    writeMeta(metaPath, { echo: "original" });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers a tool named _reload_metadata on the server", () => {
    const server = makeServerShim();
    const handles = new Map<string, ToolHandle>([["echo", makeHandle("original")]]);

    registerReloadTool(server as any, metaPath, handles);

    expect(server.registerTool).toHaveBeenCalled();
    expect(server.registered[0].name).toBe("_reload_metadata");
  });

  it("re-reads the metadata file and updates handles when invoked", async () => {
    const server = makeServerShim();
    const echo = makeHandle("original");
    const handles = new Map<string, ToolHandle>([["echo", echo]]);

    registerReloadTool(server as any, metaPath, handles);

    // Change the file, then invoke the handler
    writeMeta(metaPath, { echo: "UPDATED" });
    const result = (await server.registered[0].handler()) as any;

    expect(echo.update).toHaveBeenCalledWith({ description: "UPDATED" });
    expect(echo.description).toBe("UPDATED");

    // The tool response should include an MCP content array summarizing the result
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toMatch(/echo/);
  });

  it("returns a clean error response when the metadata file is invalid", async () => {
    const server = makeServerShim();
    const handles = new Map<string, ToolHandle>([["echo", makeHandle("original")]]);

    registerReloadTool(server as any, metaPath, handles);

    writeFileSync(metaPath, "{ not json");
    const result = (await server.registered[0].handler()) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/parse|invalid|failed/i);
  });
});
