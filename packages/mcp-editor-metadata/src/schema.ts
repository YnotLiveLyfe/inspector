import { z } from "zod";

/**
 * Per-tool metadata. Only editable fields from the spec go here.
 * Handler code and input schemas stay in source code.
 */
export const ToolMetadataSchema = z.object({
  description: z.string().min(1, "Tool description is required"),
  title: z.string().optional(),
});

export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;

/**
 * Top-level metadata file format. The `version` field lets us evolve
 * the format without breaking existing files.
 */
export const MetadataFileSchema = z.object({
  version: z.literal(1),
  tools: z.record(z.string(), ToolMetadataSchema),
});

export type MetadataFile = z.infer<typeof MetadataFileSchema>;
