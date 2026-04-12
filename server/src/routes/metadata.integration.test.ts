import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerMetadataRoutes } from "./metadata.js";
import {
  createOriginValidationMiddleware,
  createAuthMiddleware,
} from "../middleware/auth.js";

const TEST_TOKEN = "test-session-token-0123456789abcdef";

describe("PUT /api/metadata — middleware-wired (Phase 3 integration)", () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-editor-phase3-"));

    const originMiddleware = createOriginValidationMiddleware({
      clientPort: "6274",
    });
    const authMiddleware = createAuthMiddleware({
      sessionToken: TEST_TOKEN,
      authDisabled: false,
    });

    app = express();
    app.use(express.json());
    registerMetadataRoutes(app, [originMiddleware, authMiddleware]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects PUT without X-MCP-Proxy-Auth header with 401", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .set("Origin", "http://localhost:6274")
      .send({
        version: 1,
        tools: { echo: { description: "new" } },
      });

    expect(res.status).toBe(401);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("old");
  });

  it("rejects PUT with a wrong token with 401", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .set("Origin", "http://localhost:6274")
      .set("X-MCP-Proxy-Auth", "Bearer wrong-token-with-different-length")
      .send({
        version: 1,
        tools: { echo: { description: "new" } },
      });

    expect(res.status).toBe(401);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("old");
  });

  it("accepts PUT with correct token and allowed origin", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .set("Origin", "http://localhost:6274")
      .set("X-MCP-Proxy-Auth", `Bearer ${TEST_TOKEN}`)
      .send({
        version: 1,
        tools: { echo: { description: "new" } },
      });

    expect(res.status).toBe(200);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("new");
  });

  it("rejects PUT with correct token but disallowed origin with 403", async () => {
    const path = join(tmpDir, "metadata.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 1, tools: { echo: { description: "old" } } }),
    );

    const res = await request(app)
      .put("/api/metadata")
      .query({ path })
      .set("Origin", "http://evil.example.com")
      .set("X-MCP-Proxy-Auth", `Bearer ${TEST_TOKEN}`)
      .send({
        version: 1,
        tools: { echo: { description: "new" } },
      });

    expect(res.status).toBe(403);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.tools.echo.description).toBe("old");
  });
});
