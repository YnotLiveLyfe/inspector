/**
 * Spike server: Tests whether MCP TypeScript SDK tool metadata can be updated at runtime.
 *
 * Exposes these tools:
 *   - echo                  The tool under test. Its description is loaded from metadata.json.
 *   - get-live-description  Returns what the server currently holds in its in-memory variable.
 *   - mutate-variable       Mutates the in-memory `metadata` object (no SDK call).
 *   - reregister-tool       Attempts to re-call server.tool("echo", ...) with a new description.
 *   - update-tool           Calls registeredTool.update({ description }) with a new description.
 *   - reload-from-disk      Re-reads metadata.json from disk, then calls update().
 *
 * The test harness drives these via an MCP client over stdio.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const METADATA_PATH = resolve(__dirname, "metadata.json");

type ToolMeta = { title: string; description: string };
type Metadata = { echo: ToolMeta };

// Mutable in-memory snapshot of metadata, initially loaded from disk.
let metadata: Metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));

const server = new McpServer({
  name: "reload-spike-server",
  version: "0.0.0",
});

// --- The tool under test ----------------------------------------------------

const echoTool = server.registerTool(
  "echo",
  {
    title: metadata.echo.title,
    description: metadata.echo.description,
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({
    content: [{ type: "text", text: `echo: ${text}` }],
  }),
);

// --- Control tools the test harness uses to drive experiments ---------------

server.registerTool(
  "get-live-description",
  {
    title: "Get live description",
    description:
      "Returns the in-memory metadata.echo.description the server currently holds.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          inMemoryDescription: metadata.echo.description,
        }),
      },
    ],
  }),
);

server.registerTool(
  "mutate-variable",
  {
    title: "Mutate in-memory variable",
    description:
      "Mutates the in-memory metadata object WITHOUT calling any SDK update method. Proves whether the SDK holds descriptions by reference to our variable.",
    inputSchema: { newDescription: z.string() },
  },
  async ({ newDescription }) => {
    metadata.echo.description = newDescription;
    return {
      content: [
        {
          type: "text",
          text: `Mutated in-memory metadata.echo.description to: ${newDescription}`,
        },
      ],
    };
  },
);

server.registerTool(
  "reregister-tool",
  {
    title: "Attempt to re-register echo tool",
    description:
      "Calls server.registerTool('echo', ...) a second time. Expected: SDK throws because the name is taken.",
    inputSchema: { newDescription: z.string() },
  },
  async ({ newDescription }) => {
    try {
      server.registerTool(
        "echo",
        {
          title: "Echo Tool (re-registered)",
          description: newDescription,
          inputSchema: { text: z.string() },
        },
        async ({ text }) => ({
          content: [{ type: "text", text: `echo (v2): ${text}` }],
        }),
      );
      return {
        content: [
          { type: "text", text: "UNEXPECTED: re-registration succeeded" },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `re-registration threw: ${(err as Error).message}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  "update-tool",
  {
    title: "Call registeredTool.update()",
    description:
      "Calls the update() method on the RegisteredTool handle with a new description.",
    inputSchema: { newDescription: z.string() },
  },
  async ({ newDescription }) => {
    echoTool.update({ description: newDescription });
    metadata.echo.description = newDescription;
    return {
      content: [
        {
          type: "text",
          text: `Called echoTool.update({ description: ${JSON.stringify(newDescription)} })`,
        },
      ],
    };
  },
);

server.registerTool(
  "reload-from-disk",
  {
    title: "Reload metadata.json from disk",
    description:
      "Re-reads metadata.json and applies the new description via registeredTool.update().",
    inputSchema: {},
  },
  async () => {
    const fresh = JSON.parse(readFileSync(METADATA_PATH, "utf8")) as Metadata;
    metadata = fresh;
    echoTool.update({
      title: fresh.echo.title,
      description: fresh.echo.description,
    });
    return {
      content: [
        {
          type: "text",
          text: `Reloaded from disk. Applied description: ${fresh.echo.description}`,
        },
      ],
    };
  },
);

// --- Start ------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
// IMPORTANT: never write to stdout; it's the JSON-RPC transport. Use stderr for logs.
process.stderr.write("[spike-server] connected\n");
