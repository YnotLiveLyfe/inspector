import type { MetadataFile, ToolMetadata } from "./schema.js";
import type { ZodRawShape, ZodTypeAny } from "zod";

/**
 * A handle that looks like the TS SDK's RegisteredTool — enough surface
 * to call update(). Kept structural so tests can pass plain mocks.
 *
 * Phase 2a adds optional `paramsSchema` to the update payload so parameter
 * description edits can be hot-reloaded alongside tool description edits.
 * The TS SDK's RegisteredTool.update() already supports paramsSchema —
 * see reload-spike-findings.md lines 232-235.
 */
export interface ToolHandle {
  description?: string;
  update(updates: {
    description?: string;
    title?: string;
    paramsSchema?: ZodRawShape;
  }): void;
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
 * whose description, title, or parameter descriptions changed. Returns a
 * diff describing what happened.
 *
 * Phase 2a: accepts an additional `baseShapes` map so that when the metadata
 * has a `parameters` sub-object, applyMetadata can rebuild the Zod input
 * schema with the new descriptions and pass the fresh shape through
 * `update({ paramsSchema })`.
 *
 * Skipping rules:
 *   - Tool name not in `handles` → recorded in `missing`.
 *   - Description and title already match AND no parameters block → recorded
 *     in `skipped`. (If a parameters block is present we always apply, since
 *     comparing rebuilt Zod shapes is nontrivial. The re-apply is idempotent
 *     because Zod `.describe()` is a pure operation.)
 *   - Tool name in handles but no `baseShapes` entry → description/title
 *     still update; `paramsSchema` is silently skipped. This lets servers
 *     opt-in to param description hot-reload per tool.
 */
export function applyMetadata(
  handles: Map<string, ToolHandle>,
  baseShapes: Map<string, ZodRawShape>,
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

    const hasParameters =
      toolMeta.parameters !== undefined &&
      Object.keys(toolMeta.parameters).length > 0;

    if (
      handle.description === toolMeta.description &&
      toolMeta.title === undefined &&
      !hasParameters
    ) {
      skipped.push(toolName);
      continue;
    }

    const updates: {
      description?: string;
      title?: string;
      paramsSchema?: ZodRawShape;
    } = {
      description: toolMeta.description,
    };
    if (toolMeta.title !== undefined) updates.title = toolMeta.title;

    if (hasParameters) {
      const baseShape = baseShapes.get(toolName);
      if (baseShape) {
        const descriptions: Record<string, string> = {};
        for (const [paramName, paramMeta] of Object.entries(
          toolMeta.parameters!,
        )) {
          descriptions[paramName] = paramMeta.description;
        }
        updates.paramsSchema = rebuildParamsSchema(baseShape, descriptions);
      }
      // If no base shape exists for this tool, we silently skip the
      // paramsSchema rebuild — description/title still update.
    }

    handle.update(updates);
    updated.push(toolName);
  }

  return { updated, skipped, missing };
}
