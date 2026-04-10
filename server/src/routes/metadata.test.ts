import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerMetadataRoutes } from "./metadata.js";

describe("GET /api/metadata", () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-editor-route-"));
    app = express();
    app.use(express.json());
    registerMetadataRoutes(app);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns metadata JSON for a valid path", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        tools: { echo: { description: "Echoes the input" } },
      }),
    );

    const res = await request(app).get("/api/metadata").query({ path });
    expect(res.status).toBe(200);
    expect(res.body.tools.echo.description).toBe("Echoes the input");
  });

  it("returns 400 when path query is missing", async () => {
    const res = await request(app).get("/api/metadata");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/path/i);
  });

  it("returns 404 when the file does not exist", async () => {
    const res = await request(app)
      .get("/api/metadata")
      .query({ path: join(tmpDir, "missing.json") });
    expect(res.status).toBe(404);
  });

  it("returns 422 when the file is malformed", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(path, JSON.stringify({ version: 1, tools: { echo: {} } }));
    const res = await request(app).get("/api/metadata").query({ path });
    expect(res.status).toBe(422);
  });
});

describe("PUT /api/metadata", () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-editor-put-"));
    app = express();
    app.use(express.json());
    registerMetadataRoutes(app);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes valid metadata to the given path", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const newMetadata = {
      version: 1,
      tools: { echo: { description: "new description" } },
    };

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .send(newMetadata);

    expect(res.status).toBe(200);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("new description");
  });

  it("rejects invalid metadata with 422", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .send({ version: 1, tools: { echo: { description: "" } } }); // empty description

    expect(res.status).toBe(422);
    // File should not have been modified
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("old");
  });

  it("returns 400 when path is missing", async () => {
    const res = await request(app)
      .put("/api/metadata")
      .send({ version: 1, tools: {} });
    expect(res.status).toBe(400);
  });

  it("returns 400 when path does not end with metadata.json", async () => {
    const badPath = join(tmpDir, "evil.txt");
    writeFileSync(badPath, "original content");

    const res = await request(app)
      .put("/api/metadata")
      .query({ path: badPath })
      .send({ version: 1, tools: { echo: { description: "x" } } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/metadata\.json/i);
    // The bad file must not have been modified
    expect(readFileSync(badPath, "utf-8")).toBe("original content");
  });
});
