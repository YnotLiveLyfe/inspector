# Reload Spike Findings

_Phase 0 — Can MCP tools be updated at runtime without restarting the server?_

## TypeScript SDK

**SDK version tested:** `@modelcontextprotocol/sdk@1.26.0`
(matches `build/node_modules/@modelcontextprotocol/sdk/package.json`; the
Inspector client declares `^1.25.2` in `client/package.json` and the root
workspace currently resolves it to `1.26.0`.)

Spike location: `build/spikes/reload-typescript/`

- `server.ts` — minimal stdio MCP server exposing `echo` + control tools
- `test.ts` — MCP client harness that spawns the server and runs 5 experiments
- `metadata.json` — external metadata file the server reads at startup

### SDK source investigation

All quoted line numbers are from
`build/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`.

**How the description is stored.** Both `server.tool(...)` and
`server.registerTool(...)` ultimately call a private helper
`_createRegisteredTool(...)` (lines 605–653) that builds a plain object,
copies `description` onto it as a plain property, and writes it into the
server's `this._registeredTools` map:

```js
// mcp.js, lines 605-653 (trimmed)
_createRegisteredTool(name, title, description, inputSchema, outputSchema,
                     annotations, execution, _meta, handler) {
    validateAndWarnToolName(name);
    const registeredTool = {
        title,
        description,                  // <-- stored by value here
        inputSchema: getZodSchemaObject(inputSchema),
        outputSchema: getZodSchemaObject(outputSchema),
        annotations,
        execution,
        _meta,
        handler,
        enabled: true,
        disable: () => registeredTool.update({ enabled: false }),
        enable:  () => registeredTool.update({ enabled: true }),
        remove:  () => registeredTool.update({ name: null }),
        update: updates => {
            // ...
            if (typeof updates.description !== 'undefined')
                registeredTool.description = updates.description;
            // ...
            this.sendToolListChanged();
        }
    };
    this._registeredTools[name] = registeredTool;
    this.setToolRequestHandlers();
    this.sendToolListChanged();
    return registeredTool;
}
```

Because JavaScript strings are values, `description` on the stored object is
a copy. Mutating the original variable that was passed in cannot affect it.

**How `tools/list` is served.** The `ListToolsRequestSchema` handler
(installed by `setToolRequestHandlers`, mcp.js lines 67–99) reads
`tool.description` directly from the `_registeredTools` map on every request:

```js
// mcp.js, lines 67-99 (trimmed)
this.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(this._registeredTools)
        .filter(([, tool]) => tool.enabled)
        .map(([name, tool]) => {
            const toolDefinition = {
                name,
                title: tool.title,
                description: tool.description,   // <-- live lookup
                inputSchema: /* ... */,
                annotations: tool.annotations,
                execution: tool.execution,
                _meta: tool._meta
            };
            /* ... */
            return toolDefinition;
        })
}));
```

So the list is not cached. Whatever is on the `registeredTool` object when a
`tools/list` request arrives is what the client sees.

**Re-registration is rejected.** `tool()` (line 657) and `registerTool()`
(line 698) both guard against duplicate names:

```js
tool(name, ...rest) {
    if (this._registeredTools[name]) {
        throw new Error(`Tool ${name} is already registered`);
    }
    // ...
}

registerTool(name, config, cb) {
    if (this._registeredTools[name]) {
        throw new Error(`Tool ${name} is already registered`);
    }
    // ...
}
```

**The supported mutation path is `update()`.** The `RegisteredTool` handle
returned from `registerTool()` / `tool()` has an `update()` method
(mcp.js lines 621–647, typed in `mcp.d.ts` lines 278–288) that mutates the
stored object in place AND calls `sendToolListChanged()`, which emits the
`notifications/tools/list_changed` message to connected clients. `update()`
accepts `name`, `title`, `description`, `paramsSchema`, `outputSchema`,
`annotations`, `_meta`, `callback`, and `enabled`.

### Empirical test

**Setup.** The spike server loads `metadata.json` at startup and registers an
`echo` tool using the description from that file. It also exposes five
control tools the test harness can call over stdio:

- `get-live-description` — returns the server's current in-memory metadata
- `mutate-variable` — mutates the in-memory metadata object but calls no SDK APIs
- `reregister-tool` — tries `server.registerTool("echo", ...)` a second time
- `update-tool` — calls `echoTool.update({ description })` on the handle
- `reload-from-disk` — re-reads `metadata.json` then calls `.update()`

The harness spawns the server with `tsx` over `StdioClientTransport`, runs
the experiments in sequence, and logs each `tools/list` result before and
after each action. All experiments are deterministic — no timers or file
watchers.

**Experiment 1: Modify in-memory variable, re-call tools/list**

Sequence:

1. `listTools()` — returns `"INITIAL description loaded from metadata.json at server startup."`
2. Client calls `mutate-variable` which sets `metadata.echo.description = "MUTATED description (variable only, no SDK call)."` on the server.
3. Client calls `get-live-description` — server reports the in-memory variable IS now the mutated string.
4. Client calls `listTools()` again.

What happened: **`tools/list` still returned the ORIGINAL description.** The
SDK had copied the string at registration time and never looks at the
caller's variable again. The fact that the server's in-memory variable and
the SDK-stored description diverged in step 3 vs step 4 is direct proof.

**Experiment 2: Re-call `server.registerTool("echo", ...)` with the same name**

The control tool tries to register `echo` a second time in a `try/catch`.

What happened: **The SDK threw `Error: Tool echo is already registered`**,
exactly as the source shows. This path is closed.

**Experiment 3: Call `registeredTool.update({ description })`**

The server had captured the `RegisteredTool` handle returned by the initial
`registerTool` call. The control tool calls
`echoTool.update({ description: "UPDATED via registeredTool.update() API." })`.

What happened: **The very next `tools/list` returned the new description.**
`update()` mutated the stored object in place and (per the source) also
emitted a `tools/list_changed` notification. Subsequent `listTools()` calls
reflect the change immediately.

**Experiment 4: Modify metadata.json on disk, then reload**

1. Harness rewrites `metadata.json` on disk with a new title and description.
2. Before instructing the server to reload, harness calls `listTools()`.
3. Harness calls `reload-from-disk` which re-reads the file and calls
   `echoTool.update({ title, description })`.
4. Harness calls `listTools()` again.

What happened: step 2 returned the PRE-reload description (no file watcher,
no autoreload — expected). Step 4 returned the new on-disk description. Full
round-trip hot reload works as long as somebody triggers the `update()` call
after the file is rewritten.

**Experiment 5: Sanity check of final state**

`listTools()` one more time to make sure the update persisted and nothing
drifted. It did.

### Conclusion (TypeScript)

- **Descriptions are captured BY VALUE at registration time.** The SDK stores
  the string on a `RegisteredTool` object in `McpServer._registeredTools`.
  Mutating the caller's variable has no effect.
- **Hot reload of description text WITHOUT re-registering tools: WORKS** via
  the `RegisteredTool.update()` method returned by `registerTool()` / `tool()`.
  `update()` mutates the stored record in place and also emits
  `notifications/tools/list_changed` automatically.
- **Hot reload via re-registration: DOES NOT WORK.** Calling `registerTool()`
  a second time with the same name throws `Tool <name> is already registered`.
  (If you ever needed to, you could first call `registeredTool.remove()`
  — which is `update({ name: null })` — and then register fresh, but there is
  no reason to; `update()` covers every field you would want to change.)
- **File watching is NOT built in.** The SDK does not re-read any external
  file on its own. Something in the user's code must trigger `update()`.

**Recommended approach for the editor.** The MCP server project we ship
should:

1. Load tool metadata (names, titles, descriptions, param schemas) from an
   external `metadata.json` at startup.
2. Keep the `RegisteredTool` handles returned by `registerTool()` in a map
   keyed by tool name.
3. Expose an internal "reload" entry point (signal handler, HTTP endpoint,
   watch callback, or an administrative MCP tool) that re-reads
   `metadata.json` and, for each tool whose description / title / schema
   changed, calls `registeredTool.update({ title, description, paramsSchema })`.
4. The editor saves `metadata.json`, then trips that reload entry point.
5. Connected clients (including the Inspector) will be notified via
   `notifications/tools/list_changed`; any client that re-fetches on that
   notification will show the new description without restart. The editor
   UI can also just re-call `listTools()` explicitly after a save and not
   depend on the client listening to notifications.

**Gotchas / caveats.**

- `registerTool()` / `tool()` throw on duplicate names. If the user renames a
  tool in the editor (changes the key), the editor must call
  `registeredTool.update({ name: newName })` rather than register a fresh
  tool under the new name (`update()` supports renaming and even removal via
  `name: null`).
- The `handler` callback is NOT stored on the JSON serialized by `tools/list`,
  but it IS stored on `RegisteredTool` and can be swapped via
  `update({ callback })`. The spike didn't test this but the source confirms it.
- Changing `inputSchema` at runtime via `update({ paramsSchema })` works
  structurally, but any tool call already in flight that was validated
  against the old schema may have unexpected behavior. For the editor, this
  is fine — it's an admin surface, not concurrent traffic.
- Notifications fire automatically on `update()`. That means any other
  connected MCP client will also receive a `tools/list_changed` notification
  the moment the editor saves. This is probably the desired behavior but
  worth knowing.
- `registerTool()` itself also calls `sendToolListChanged()` every time
  (mcp.js line 651), so every save that adds a new tool already triggers
  notifications automatically — nothing extra to wire.

### Code snippets that prove the claim

Minimal reproduction of the hot-reload mechanism (distilled from
`spikes/reload-typescript/server.ts`):

```ts
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

let metadata = JSON.parse(readFileSync("metadata.json", "utf8")) as {
  echo: { title: string; description: string };
};

const server = new McpServer({ name: "demo", version: "0.0.0" });

// Capture the RegisteredTool handle — this is the key.
const echo = server.registerTool(
  "echo",
  {
    title: metadata.echo.title,
    description: metadata.echo.description,
    inputSchema: { text: z.string() },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
);

// ... later, after metadata.json changes on disk ...
function reload() {
  const fresh = JSON.parse(readFileSync("metadata.json", "utf8"));
  echo.update({
    title: fresh.echo.title,
    description: fresh.echo.description,
  });
  // SDK has already sent notifications/tools/list_changed to every client.
}

await server.connect(new StdioServerTransport());
```

Observed spike output from `experiment 3`:

```
[update-tool result] Called echoTool.update({ description: "UPDATED via registeredTool.update() API." })
[tools/list echo after update] {
  "name": "echo",
  "description": "UPDATED via registeredTool.update() API.",
  "title": "Echo Tool (initial)"
}
[conclusion] SUCCESS: tools/list reflects the new description.
```

And from `experiment 4` (full disk round trip):

```
[disk] wrote .../metadata.json
[tools/list echo after file rewrite (before reload call)] {
  "description": "UPDATED via registeredTool.update() API.",
  ...
}
[reload-from-disk result] Reloaded from disk. Applied description: RELOADED from disk via file rewrite + registeredTool.update().
[tools/list echo after reload] {
  "description": "RELOADED from disk via file rewrite + registeredTool.update().",
  "title": "Echo Tool (from disk v2)"
}
[conclusion] SUCCESS: hot reload from disk works via registeredTool.update().
```

## Python SDK (FastMCP)

_[Placeholder — to be filled in by Task 4]_

## Overall Decision

_[To be filled in after both spikes complete]_
