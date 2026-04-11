import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadMetadata } from "./loader.js";
import { applyMetadata, type ToolHandle } from "./registry.js";

export interface RegisterReloadToolOptions {
  /** Name of the admin tool to register. Defaults to "_reload_metadata". */
  toolName?: string;
  /** Called after each reload with the diff. Useful for server logging. */
  onReload?: (result: { updated: string[]; skipped: string[]; missing: string[] }) => void;
}

/**
 * Registers an administrative MCP tool on the given server that re-reads the
 * metadata file from disk and applies changes to the provided tool handles.
 *
 * This is the hot-reload mechanism for @mcp-editor/metadata. The MCP Editor
 * frontend calls this tool (via the normal MCP client connection) after
 * writing a new metadata.json to disk.
 *
 * @param server The McpServer instance to register the tool on.
 * @param metadataPath Absolute path to the metadata.json file.
 * @param handles Map of tool name → RegisteredTool handle. Must be the SAME
 *   map the server's tools were registered with, since applyMetadata mutates
 *   those handles directly.
 * @param options Optional tool name override and reload callback.
 */
export function registerReloadTool(
  server: McpServer,
  metadataPath: string,
  handles: Map<string, ToolHandle>,
  options: RegisterReloadToolOptions = {},
): void {
  const toolName = options.toolName ?? "_reload_metadata";

  server.registerTool(
    toolName,
    {
      title: "Reload metadata from disk",
      description:
        "Administrative tool used by the MCP Editor. Re-reads the server's metadata.json file and applies any description/title changes to registered tools. Not intended for direct use by end users.",
      inputSchema: {},
    },
    async () => {
      try {
        const metadata = await loadMetadata(metadataPath);
        const result = applyMetadata(handles, new Map(), metadata);
        options.onReload?.(result);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reload metadata: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
