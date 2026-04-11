import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
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

    registerReloadTool(server as any, metaPath, handles, new Map());

    expect(server.registerTool).toHaveBeenCalled();
    expect(server.registered[0].name).toBe("_reload_metadata");
  });

  it("re-reads the metadata file and updates handles when invoked", async () => {
    const server = makeServerShim();
    const echo = makeHandle("original");
    const handles = new Map<string, ToolHandle>([["echo", echo]]);

    registerReloadTool(server as any, metaPath, handles, new Map());

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

    registerReloadTool(server as any, metaPath, handles, new Map());

    writeFileSync(metaPath, "{ not json");
    const result = (await server.registered[0].handler()) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/parse|invalid|failed/i);
  });

  it("rebuilds paramsSchema via baseShapes when metadata has parameters (Phase 2a F3 coverage)", async () => {
    // Phase 2a added `rebuildParamsSchema` and threaded `baseShapes` through
    // `registerReloadTool`, but the existing tests all passed an empty
    // Map() as baseShapes, so the "with actual base shapes" path was never
    // exercised end-to-end. This test closes that gap.
    const server = makeServerShim();
    const echo = makeHandle("original");
    const handles = new Map<string, ToolHandle>([["echo", echo]]);
    const baseShapes = new Map<string, Record<string, z.ZodTypeAny>>([
      ["echo", { city: z.string() }],
    ]);

    registerReloadTool(server as any, metaPath, handles, baseShapes);

    // Write metadata that includes a parameter description override
    writeFileSync(
      metaPath,
      JSON.stringify({
        version: 1,
        tools: {
          echo: {
            description: "Echo a message",
            parameters: {
              city: {
                description: "City name such as Minneapolis.",
              },
            },
          },
        },
      }),
    );

    const result = (await server.registered[0].handler()) as any;

    // update() should have been called with BOTH description and paramsSchema
    // when baseShapes carries an entry for the tool and metadata supplies
    // parameters.
    const updateCalls = (echo.update as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[unknown]>;
    const paramsSchemaCall = updateCalls.find(
      (call) => typeof call[0] === "object" && call[0] !== null && "paramsSchema" in (call[0] as Record<string, unknown>),
    );
    expect(paramsSchemaCall).toBeDefined();

    const paramsSchema = (paramsSchemaCall![0] as { paramsSchema: Record<string, z.ZodTypeAny> })
      .paramsSchema;
    expect(paramsSchema).toHaveProperty("city");
    // The rebuilt Zod string should carry the description from metadata
    // via `.describe()`, which Zod stores on `_def.description`.
    const cityZod = paramsSchema.city as z.ZodString;
    expect(
      (cityZod._def as { description?: string }).description,
    ).toBe("City name such as Minneapolis.");

    // Result payload still indicates echo was updated
    expect(result.content[0].text).toMatch(/echo/);
  });
});
