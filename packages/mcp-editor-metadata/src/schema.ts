import { z } from "zod";

/**
 * Per-parameter metadata. Currently only holds a description override; future
 * phases may add name/type/required edits, but those require rebuild semantics
 * and are deferred.
 */
export const ParameterMetadataSchema = z.object({
  description: z.string().min(1, "Parameter description is required"),
});

export type ParameterMetadata = z.infer<typeof ParameterMetadataSchema>;

/**
 * Per-tool metadata. Only editable fields from the spec go here.
 * Handler code and input schemas stay in source code.
 *
 * `parameters` is optional and additive: a tool without it behaves exactly
 * as in Phase 1 (description/title only). When present, it maps parameter
 * names to per-parameter metadata. Parameter names that don't exist on the
 * real tool are recorded as warnings, not errors.
 */
export const ToolMetadataSchema = z.object({
  description: z.string().min(1, "Tool description is required"),
  title: z.string().optional(),
  parameters: z.record(z.string(), ParameterMetadataSchema).optional(),
});

export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;

/**
 * Top-level metadata file format. The `version` field lets us evolve
 * the format without breaking existing files. Phase 2a extends the per-tool
 * schema with an optional `parameters` sub-object; this is a backward-
 * compatible addition so `version` stays at 1.
 */
export const MetadataFileSchema = z.object({
  version: z.literal(1),
  tools: z.record(z.string(), ToolMetadataSchema),
});

export type MetadataFile = z.infer<typeof MetadataFileSchema>;
