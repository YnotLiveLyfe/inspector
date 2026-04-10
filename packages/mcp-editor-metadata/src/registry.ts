import type { MetadataFile, ToolMetadata } from "./schema.js";

/**
 * A handle that looks like the TS SDK's RegisteredTool — enough surface
 * to call update(). Kept structural so tests can pass plain mocks.
 */
export interface ToolHandle {
  description: string;
  update(updates: { description?: string; title?: string }): void;
}

export interface ApplyResult {
  updated: string[]; // tools whose description changed and were updated
  skipped: string[]; // tools that already matched the metadata (no-op)
  missing: string[]; // metadata entries for tools we don't have handles for
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
