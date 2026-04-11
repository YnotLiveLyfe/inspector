import type { MetadataFile, ToolMetadata } from "./schema.js";
import type { ZodRawShape, ZodTypeAny } from "zod";

/**
 * A handle that looks like the TS SDK's RegisteredTool — enough surface
 * to call update(). Kept structural so tests can pass plain mocks.
 *
 * `description` is optional to match the SDK's `RegisteredTool` type,
 * so consumers can pass the return of `server.registerTool(...)` directly
 * into a `Map<string, ToolHandle>` without a cast.
 */
export interface ToolHandle {
  description?: string;
  update(updates: { description?: string; title?: string }): void;
}

export interface ApplyResult {
  updated: string[]; // tools whose description changed and were updated
  skipped: string[]; // tools that already matched the metadata (no-op)
  missing: string[]; // metadata entries for tools we don't have handles for
}

/**
 * Return a new ZodRawShape with parameter descriptions overridden.
 *
 * Policy:
 *   - If descriptions is undefined OR empty, returns the ORIGINAL baseShape
 *     object (reference equality) — no allocation, no rebuild.
 *   - For each key in descriptions that also exists in baseShape, replaces
 *     that key's Zod schema with `schema.describe(newDescription)`.
 *   - Keys in descriptions that don't exist in baseShape are silently
 *     ignored (the `missing` warning is emitted at the applyMetadata level).
 *   - Keys in baseShape that aren't in descriptions are passed through
 *     unchanged (preserving any existing source-code .describe() calls).
 *
 * The return value is safe to pass to `RegisteredTool.update({ paramsSchema })`.
 */
export function rebuildParamsSchema(
  baseShape: ZodRawShape,
  descriptions: Record<string, string> | undefined,
): ZodRawShape {
  if (!descriptions || Object.keys(descriptions).length === 0) {
    return baseShape;
  }
  const rebuilt: ZodRawShape = {};
  for (const [key, schema] of Object.entries(baseShape)) {
    const newDesc = descriptions[key];
    rebuilt[key] = newDesc
      ? (schema as ZodTypeAny).describe(newDesc)
      : schema;
  }
  return rebuilt;
}

/**
 * Apply a metadata file to a map of tool handles, calling update() on any
 * whose description changed. Returns a diff describing what happened.
 *
 * This is the only function that actually mutates tool state. Callers use
 * the returned diff for logging and for frontend feedback.
 */
export function applyMetadata(
  handles: Map<string, ToolHandle>,
  metadata: MetadataFile,
): ApplyResult {
  const updated: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const [toolName, toolMeta] of Object.entries(metadata.tools)) {
    const handle = handles.get(toolName);
    if (!handle) {
      missing.push(toolName);
      continue;
    }

    if (handle.description === toolMeta.description && toolMeta.title === undefined) {
      skipped.push(toolName);
      continue;
    }

    const updates: { description?: string; title?: string } = {
      description: toolMeta.description,
    };
    if (toolMeta.title !== undefined) updates.title = toolMeta.title;

    handle.update(updates);
    updated.push(toolName);
  }

  return { updated, skipped, missing };
}
