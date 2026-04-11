import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadMetadata,
  registerReloadTool,
  rebuildParamsSchema,
  type ToolHandle,
} from "@mcp-editor/metadata";
import { z, type ZodRawShape } from "zod";
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

  // Map of tool name → RegisteredTool handle for live updates.
  const handles = new Map<string, ToolHandle>();

  // Map of tool name → the ORIGINAL ZodRawShape, no .describe() calls.
  // This is the "base" from which paramsSchema is rebuilt on reload with
  // parameter descriptions pulled from metadata.json. Keeping it free of
  // baked-in .describe() text means metadata.json is the single source of
  // truth for parameter documentation.
  const baseShapes = new Map<string, ZodRawShape>();

  // --- get_weather ---
  const getWeatherBaseShape: ZodRawShape = {
    city: z.string(),
  };
  baseShapes.set("get_weather", getWeatherBaseShape);
  handles.set(
    "get_weather",
    server.registerTool(
      "get_weather",
      {
        description: metadata.tools.get_weather.description,
        // On startup we apply any parameter descriptions from metadata.json
        // to the base shape. If metadata has no parameters block, the shape
        // passes through unchanged.
        inputSchema: rebuildParamsSchema(
          getWeatherBaseShape,
          toDescriptionMap(metadata.tools.get_weather.parameters),
        ),
      },
      async ({ city }) => ({
        content: [
          { type: "text", text: `Weather in ${city}: 72°F, sunny (mock)` },
        ],
      }),
    ),
  );

  // --- convert_temperature ---
  const convertBaseShape: ZodRawShape = {
    value: z.number(),
    from: z.enum(["C", "F"]),
    to: z.enum(["C", "F"]),
  };
  baseShapes.set("convert_temperature", convertBaseShape);
  handles.set(
    "convert_temperature",
    server.registerTool(
      "convert_temperature",
      {
        description: metadata.tools.convert_temperature.description,
        inputSchema: rebuildParamsSchema(
          convertBaseShape,
          toDescriptionMap(metadata.tools.convert_temperature.parameters),
        ),
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

  // Register the admin reload tool. Passes BOTH handles and baseShapes so
  // param description reloads work end-to-end.
  registerReloadTool(server, METADATA_PATH, handles, baseShapes, {
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

/**
 * Convert the optional parameters block from metadata.json into the flat
 * `{ paramName: description }` map that rebuildParamsSchema wants.
 */
function toDescriptionMap(
  parameters: Record<string, { description: string }> | undefined,
): Record<string, string> | undefined {
  if (!parameters) return undefined;
  const out: Record<string, string> = {};
  for (const [name, meta] of Object.entries(parameters)) {
    out[name] = meta.description;
  }
  return out;
}

main().catch((err) => {
  console.error("[weather-server] fatal:", err);
  process.exit(1);
});
