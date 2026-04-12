import type { Express, Request, Response } from "express";
import { rename, unlink, open } from "fs/promises";
import { dirname, basename, join } from "path";
import { loadMetadata, MetadataFileSchema } from "@mcp-editor/metadata";

/**
 * Registers the metadata editor API routes on an Express app.
 */
export function registerMetadataRoutes(app: Express): void {
  app.get("/api/metadata", async (req: Request, res: Response) => {
    const pathParam = req.query.path;
    if (typeof pathParam !== "string" || pathParam.length === 0) {
      res.status(400).json({ error: "Missing required query parameter: path" });
      return;
    }

    try {
      const metadata = await loadMetadata(pathParam);
      res.status(200).json(metadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found/i.test(message)) {
        res.status(404).json({ error: message });
      } else if (/parse|validation/i.test(message)) {
        res.status(422).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  app.put("/api/metadata", async (req: Request, res: Response) => {
    const pathParam = req.query.path;
    if (typeof pathParam !== "string" || pathParam.length === 0) {
      res.status(400).json({ error: "Missing required query parameter: path" });
      return;
    }

    // MVP footgun guard: refuse to write anywhere except a file named metadata.json.
    // This prevents accidents from mistyped paths. Real security comes in Phase 2.
    if (!pathParam.endsWith("metadata.json")) {
      res.status(400).json({
        error: "path must end with 'metadata.json'",
      });
      return;
    }

    const validation = MetadataFileSchema.safeParse(req.body);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      res.status(422).json({
        error: `Validation failed: ${firstIssue.path.join(".")} — ${firstIssue.message}`,
      });
      return;
    }

    const content = JSON.stringify(validation.data, null, 2) + "\n";
    const dir = dirname(pathParam);
    const base = basename(pathParam);
    const tmpPath = join(dir, `.${base}.tmp.${process.pid}.${Date.now()}`);

    try {
      // Write to temp file, fsync to disk, then atomic rename.
      const handle = await open(tmpPath, "w");
      try {
        await handle.writeFile(content, "utf-8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      await rename(tmpPath, pathParam);
      res.status(200).json({ ok: true });
    } catch (err) {
      // Best-effort cleanup of the temp file.
      try {
        await unlink(tmpPath);
      } catch {
        // intentionally ignored
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
}
