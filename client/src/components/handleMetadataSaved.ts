import type { MetadataFile } from "@/lib/metadataApi";

/**
 * Dependencies injected into the post-save orchestration step.
 */
export interface HandleMetadataSavedDeps {
  setEditingTool: (tool: string | null) => void;
  callTool: (name: string, params: Record<string, unknown>) => Promise<unknown>;
  listTools: () => Promise<void> | void;
  fetchMetadataFn: (path: string, token?: string) => Promise<MetadataFile>;
  setCurrentMetadata: (md: MetadataFile) => void;
  toast: (args: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void;
  metadataPath: string;
  authToken?: string;
}

/**
 * Orchestrate the post-save reload + refetch sequence.
 *
 * Steps: close form → _reload_metadata → listTools → re-fetch metadata → toast.
 */
export async function handleMetadataSaved(
  deps: HandleMetadataSavedDeps,
): Promise<void> {
  const {
    setEditingTool,
    callTool,
    listTools,
    fetchMetadataFn,
    setCurrentMetadata,
    toast,
    metadataPath,
    authToken,
  } = deps;

  setEditingTool(null);

  try {
    await callTool("_reload_metadata", {});
  } catch (err) {
    console.warn(
      "_reload_metadata failed — server may not support hot reload:",
      err,
    );
    toast({
      title: "Metadata saved, but reload failed",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
  }

  await listTools();

  try {
    const refreshed = await fetchMetadataFn(metadataPath, authToken);
    setCurrentMetadata(refreshed);
  } catch (err) {
    console.error("Failed to refresh metadata after save:", err);
    toast({
      title: "Failed to refresh metadata after save",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
    return;
  }

  toast({
    title: "Metadata saved",
    description: "Changes applied to the running server.",
  });
}
