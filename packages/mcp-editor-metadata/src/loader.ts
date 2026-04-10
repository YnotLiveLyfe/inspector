import { readFile } from "fs/promises";
import { MetadataFileSchema, type MetadataFile } from "./schema.js";

/**
 * Loads and validates a metadata.json file from disk.
 *
 * @param path Absolute or relative path to the metadata file.
 * @returns The parsed and validated metadata.
 * @throws Error with descriptive message if file is missing, malformed, or invalid.
 */
export async function loadMetadata(path: string): Promise<MetadataFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Metadata file not found: ${path}`);
    }
    throw new Error(`Failed to read metadata file ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse metadata file ${path}: ${(err as Error).message}`);
  }

  const result = MetadataFileSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(
      `Metadata file ${path} failed validation: ${firstIssue.path.join(".")} — ${firstIssue.message}`,
    );
  }

  return result.data;
}
