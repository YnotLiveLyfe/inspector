import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadMetadata,
  registerReloadTool,
  type ToolHandle,
} from "@mcp-editor/metadata";
import { z } from "zod";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METADATA_PATH = join(__dirname, "..", "metadata.json");

async function main() {
  const metadata = await loadMetadata(METADATA_PATH);

  const server = new McpServer({
    name: "weather-server",
    version: "0.1.0",
  });

  // Keep handles keyed by tool name so the admin reload tool can update them.
  // The Map is explicitly typed so applyMetadata()'s signature checks cleanly.
  const handles = new Map<string, ToolHandle>();

  handles.set(
    "get_weather",
    server.registerTool(
      "get_weather",
      {
        description: metadata.tools.get_weather.description,
        inputSchema: { city: z.string().describe("City name") },
      },
      async ({ city }) => ({
        content: [
          { type: "text", text: `Weather in ${city}: 72°F, sunny (mock)` },
        ],
      }),
    ),
  );

  handles.set(
    "convert_temperature",
    server.registerTool(
      "convert_temperature",
      {
        description: metadata.tools.convert_temperature.description,
        inputSchema: {
          value: z.number().describe("Temperature value"),
          from: z.enum(["C", "F"]).describe("Source unit"),
          to: z.enum(["C", "F"]).describe("Target unit"),
        },
      },
      async ({ value, from, to }) => {
        if (from === to)
          return { content: [{ type: "text", text: `${value}°${to}` }] };
        const result =
          from === "C" ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9;
        return {
          content: [{ type: "text", text: `${result.toFixed(1)}°${to}` }],
        };
      },
    ),
  );

  // Register the admin reload tool. The MCP Editor calls this tool (via the
  // normal MCP client connection) after writing metadata.json. The tool
  // re-reads the file from disk and calls handle.update() on each tool whose
  // description or title changed.
  registerReloadTool(server, METADATA_PATH, handles, {
    onReload: (result) => {
      if (result.updated.length > 0) {
        console.error(
          `[weather-server] updated tools: ${result.updated.join(", ")}`,
        );
      }
      if (result.missing.length > 0) {
        console.error(
          `[weather-server] WARN metadata references unknown tools: ${result.missing.join(", ")}`,
        );
      }
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[weather-server] running on stdio");
}

main().catch((err) => {
  console.error("[weather-server] fatal:", err);
  process.exit(1);
});
