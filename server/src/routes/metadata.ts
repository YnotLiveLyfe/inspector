import type { Express, Request, Response } from "express";
import { loadMetadata } from "@mcp-editor/metadata";

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
      const message = (err as Error).message;
      if (/not found/i.test(message)) {
        res.status(404).json({ error: message });
      } else if (/parse|validation/i.test(message)) {
        res.status(422).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });
}
