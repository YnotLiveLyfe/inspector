/**
 * Spike test harness: drives the server through each experiment and reports results.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_SCRIPT = resolve(__dirname, "server.ts");
const METADATA_PATH = resolve(__dirname, "metadata.json");

// Restore metadata.json to its initial value regardless of how the last run exited.
const INITIAL_METADATA = {
  echo: {
    title: "Echo Tool (initial)",
    description:
      "INITIAL description loaded from metadata.json at server startup.",
  },
};

function log(section: string, msg: unknown): void {
  const text = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
  process.stdout.write(`\n[${section}] ${text}\n`);
}

function banner(title: string): void {
  process.stdout.write(
    `\n\n==================== ${title} ====================\n`,
  );
}

async function getEchoFromList(client: Client): Promise<{
  name: string;
  description?: string;
  title?: string;
}> {
  const result = await client.listTools();
  const echo = result.tools.find((t) => t.name === "echo");
  if (!echo) throw new Error("echo tool missing from tools/list");
  return { name: echo.name, description: echo.description, title: echo.title };
}

async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as Array<{
    type: string;
    text?: string;
  }>;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

async function main(): Promise<void> {
  // Reset metadata.json in case a previous run mutated it
  writeFileSync(METADATA_PATH, JSON.stringify(INITIAL_METADATA, null, 2));

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["--yes", "tsx", SERVER_SCRIPT],
    cwd: __dirname,
    stderr: "inherit",
  });

  const client = new Client({ name: "reload-spike-test", version: "0.0.0" });
  await client.connect(transport);

  try {
    banner("BASELINE");
    const baseline = await getEchoFromList(client);
    log("baseline tools/list echo", baseline);
    const baselineLive = await callText(client, "get-live-description");
    log("baseline get-live-description", baselineLive);

    banner("EXPERIMENT 1: mutate in-memory variable directly (no SDK call)");
    const mutated = await callText(client, "mutate-variable", {
      newDescription: "MUTATED description (variable only, no SDK call).",
    });
    log("mutate-variable result", mutated);
    const afterMutateLive = await callText(client, "get-live-description");
    log("get-live-description after mutate", afterMutateLive);
    const afterMutateList = await getEchoFromList(client);
    log("tools/list echo after mutate", afterMutateList);
    log(
      "conclusion",
      afterMutateList.description === baseline.description
        ? "tools/list STILL shows the original description -> SDK captured description BY VALUE. Mutating the source variable has no effect."
        : "tools/list changed -> SDK holds a reference. (Unexpected for strings.)",
    );

    banner("EXPERIMENT 2: re-call server.registerTool('echo', ...)");
    const reregister = await callText(client, "reregister-tool", {
      newDescription: "description from re-registration attempt",
    });
    log("reregister-tool result", reregister);
    const afterRereg = await getEchoFromList(client);
    log("tools/list echo after re-register attempt", afterRereg);

    banner("EXPERIMENT 3: call registeredTool.update({ description })");
    const updated = await callText(client, "update-tool", {
      newDescription: "UPDATED via registeredTool.update() API.",
    });
    log("update-tool result", updated);
    const afterUpdateList = await getEchoFromList(client);
    log("tools/list echo after update", afterUpdateList);
    log(
      "conclusion",
      afterUpdateList.description === "UPDATED via registeredTool.update() API."
        ? "SUCCESS: tools/list reflects the new description."
        : "FAILURE: tools/list did not update.",
    );

    banner("EXPERIMENT 4: modify metadata.json on disk, then reload");
    const onDisk = {
      echo: {
        title: "Echo Tool (from disk v2)",
        description:
          "RELOADED from disk via file rewrite + registeredTool.update().",
      },
    };
    writeFileSync(METADATA_PATH, JSON.stringify(onDisk, null, 2));
    log("disk", `wrote ${METADATA_PATH}`);

    // Before telling the server to reload, verify that merely changing the file
    // on disk does NOT affect tools/list (the server has no file watcher).
    const beforeReloadList = await getEchoFromList(client);
    log(
      "tools/list echo after file rewrite (before reload call)",
      beforeReloadList,
    );

    const reloaded = await callText(client, "reload-from-disk");
    log("reload-from-disk result", reloaded);
    const afterReloadList = await getEchoFromList(client);
    log("tools/list echo after reload", afterReloadList);
    log(
      "conclusion",
      afterReloadList.description === onDisk.echo.description
        ? "SUCCESS: hot reload from disk works via registeredTool.update()."
        : "FAILURE: tools/list did not update after reload.",
    );

    banner("EXPERIMENT 5: sanity check final state");
    const finalList = await getEchoFromList(client);
    log("final tools/list echo", finalList);

    banner("ALL EXPERIMENTS COMPLETE");
  } finally {
    await client.close();
    // Restore metadata.json so repeated runs are idempotent
    writeFileSync(METADATA_PATH, JSON.stringify(INITIAL_METADATA, null, 2));
  }
}

main().catch((err) => {
  process.stderr.write(`test harness error: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
