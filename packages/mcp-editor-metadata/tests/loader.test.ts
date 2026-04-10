import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadMetadata } from "../src/loader.js";

describe("loadMetadata", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-editor-loader-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads and validates a well-formed metadata file", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        tools: {
          echo: { description: "Echoes the input" },
        },
      }),
    );

    const result = await loadMetadata(path);
    expect(result.version).toBe(1);
    expect(result.tools.echo.description).toBe("Echoes the input");
  });

  it("throws on file not found", async () => {
    await expect(loadMetadata(join(tmpDir, "missing.json"))).rejects.toThrow(
      /not found/i,
    );
  });

  it("throws on invalid JSON", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(path, "{ not json");
    await expect(loadMetadata(path)).rejects.toThrow(/parse/i);
  });

  it("throws on schema validation failure", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(path, JSON.stringify({ version: 1, tools: { echo: {} } }));
    await expect(loadMetadata(path)).rejects.toThrow(/description/i);
  });
});
