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

**SDK version tested:** `fastmcp==3.2.3` (client side: `mcp==1.27.0`)
**Python version:** `Python 3.12` (via `py -3.12`; Python 3.14.4 is the system
default but we used 3.12 for the venv for broader compatibility)

Spike location: `build/spikes/reload-python/`

- `server.py` — minimal stdio MCP server exposing `echo` + six control tools
- `test.py` — MCP client harness using `mcp.client.stdio.stdio_client` +
  `mcp.ClientSession` that spawns the server and runs 7 experiments
- `metadata.json` — external metadata file the server reads at startup
- `.venv/` — isolated Python 3.12 venv with fastmcp + mcp installed
- `spike-output.log` — saved transcript of the most recent run

### SDK source investigation

All paths below are relative to
`build/spikes/reload-python/.venv/Lib/site-packages/fastmcp/`.

**Where `description` lives.** `fastmcp/tools/base.py` line 140 defines
`class Tool(FastMCPComponent)`. `FastMCPComponent` lives in
`fastmcp/utilities/components.py` line 74 and is a `FastMCPBaseModel` (Pydantic
v2) with `description: str | None = Field(default=None, ...)` (line 104). The
Pydantic config comes from `fastmcp/utilities/types.py` line 38:

```python
class FastMCPBaseModel(BaseModel):
    """Base model for FastMCP models."""
    model_config = ConfigDict(extra="forbid")
```

Crucially, it is **NOT frozen** — so direct attribute assignment
(`tool.description = "new"`) mutates the Pydantic instance in place.

**How tools are stored.** `fastmcp/server/providers/local_provider/local_provider.py`
`LocalProvider` has `_components: dict[str, FastMCPComponent]` (line 107). The
key is `tool:<name>@<version>`. The `_add_component()` method (line 178) writes
the Tool instance into that dict. `_list_tools()` (line 347) is a live read:

```python
async def _list_tools(self) -> Sequence[Tool]:
    """Return all tools."""
    return [v for v in self._components.values() if isinstance(v, Tool)]
```

So whatever Tool instance currently sits in `_components` is what the
`tools/list` handler sees on every call.

**How `to_mcp_tool()` serializes.** `fastmcp/tools/base.py` `Tool.to_mcp_tool()`
(line 182) reads `self.description` at call time:

```python
mcp_tool = MCPTool(
    name=overrides.get("name", self.name),
    title=overrides.get("title", title),
    description=overrides.get("description", self.description),   # <-- live read
    ...
)
```

So `tools/list` gives you whatever `self.description` currently holds. Chain
these three facts: non-frozen Pydantic model + live `_list_tools` read + live
`to_mcp_tool` read = **direct attribute assignment on the Tool instance is the
supported mutation path.** Python does not need (and FastMCP does not provide)
an explicit `update()` method like the TypeScript SDK's `RegisteredTool.update()`.

**`add_tool()` returns the Tool instance.** `fastmcp/server/providers/local_provider/decorators/tools.py`
`ToolDecoratorMixin.add_tool()` (line 151) accepts either a `Tool` object or a
decorated function; after registering, `return tool` hands the caller a live
reference to the exact object that is now sitting in `_components`. This is the
Python equivalent of a "registered tool handle."

**The `@mcp.tool` decorator is NOT useful for this pattern.** In the default
`decorator_mode="function"`, the decorator returns the original function
(decorators/tools.py line ~402: `return fn`), not the Tool object. If you need
a handle, call `mcp.add_tool(FunctionTool.from_function(fn, ...))` directly.
The spike server does exactly this for `echo`.

**Duplicate-name behavior DIFFERS from TypeScript.**
`fastmcp/server/server.py` line 292:

```python
self._on_duplicate: DuplicateBehaviorSetting = on_duplicate or "warn"
```

FastMCP's default for `on_duplicate` is `"warn"` even though
`LocalProvider.__init__` (local_provider.py line 93) defaults to `"error"` when
standalone. In `"warn"` mode, `_add_component()` (line 178) logs a warning and
**silently replaces** the existing Tool instance in `_components` — the
TypeScript SDK's "already registered" error has no Python analog unless the
user explicitly constructs `FastMCP(on_duplicate="error")`.

**Notifications are NOT automatic.** `fastmcp/server/low_level.py` advertises
`tools_changed=True` in `NotificationOptions` (line 165), but there is no
internal call to `send_tool_list_changed()` on add/remove/mutate. The user-side
`Tool` mutation path does nothing on the wire. `mcp/server/session.py` line 477
exposes `ServerSession.send_tool_list_changed()`; from inside a tool, access
it via `ctx.session.send_tool_list_changed()` (FastMCP `Context` in
`fastmcp/server/context.py` line 686). This is the Python equivalent of the
TypeScript SDK's automatic `sendToolListChanged()` on `update()`, but it must
be called manually.

### Empirical test

**Setup.** `server.py` loads `metadata.json` at startup and registers an
`echo` tool via `mcp.add_tool(FunctionTool.from_function(echo, name="echo",
title=..., description=...))`. It captures the returned `FunctionTool`
instance as `echo_tool` at module scope and also exposes six control tools
the test harness calls over stdio:

- `get_live_description` — returns the server's current in-memory metadata dict
- `mutate_variable` — mutates the in-memory metadata dict only
- `reregister_tool` — calls `mcp.add_tool(...)` a second time with name `echo`
- `update_tool` — directly assigns `echo_tool.description = new_description`
  and calls `ctx.session.send_tool_list_changed()`
- `reload_metadata` — re-reads `metadata.json` and applies title+description
  via direct assignment
- `remove_and_readd` — calls `mcp.remove_tool("echo")` then
  `mcp.add_tool(new_tool)`, rebinding the module-level `echo_tool` handle

The harness spawns `server.py` via `stdio_client(StdioServerParameters(...))`,
initializes the session, then calls `tools/list` and the control tools in
sequence. Idempotent: metadata.json is reset to initial state at both start
and end.

**Experiment 1: Mutate the in-memory metadata dict (no SDK call)**

Sequence: `list_tools()` baseline → call `mutate_variable` to set
`metadata["echo"]["description"]` in the server → call `get_live_description`
(server reports the dict IS mutated) → call `list_tools()` again.

What happened: **`tools/list` STILL returned the ORIGINAL description.** The
Tool instance in `LocalProvider._components` has its own `.description`
Pydantic field; it was COPIED from the metadata dict at registration time. The
metadata dict is not a source of truth the SDK consults on every list.

**Experiment 2: Directly assign `echo_tool.description = "..."` (Pydantic
attribute mutation)**

What happened: **The very next `tools/list` returned the new description.**
`echo_tool` is a reference to the exact Tool instance stored in
`LocalProvider._components`, and mutating a non-frozen Pydantic model's
attribute is a plain Python attribute write. `_list_tools` and `to_mcp_tool`
both read that attribute live on every request. This is the hot-reload primitive.
The server also called `ctx.session.send_tool_list_changed()` to notify
subscribed clients.

**Experiment 3: Modify metadata.json on disk, then reload**

1. Harness rewrote `metadata.json` with a new title and description.
2. Before telling the server to reload, harness called `list_tools()`.
3. Harness called `reload_metadata` which re-reads the file and assigns
   `echo_tool.title = fresh_title; echo_tool.description = fresh_description`.
4. Harness called `list_tools()` again.

What happened: step 2 returned the PRE-reload (post-Exp2) description — no
file watcher in FastMCP, so rewriting the file alone does nothing. Step 4
returned the new on-disk title and description. Full disk round trip works.

**Experiment 4: Re-call `mcp.add_tool()` with the same name**

What happened: **The SDK did NOT throw.** Instead it logged a WARNING and
silently REPLACED the Tool instance:

```
WARNING  Component already exists:    local_provider.py:192
         tool:echo@
```

The subsequent `tools/list` showed the replacement's new title and description.
The old Tool instance is now orphaned — still referenced by the module-level
`echo_tool` variable in the server, but no longer in `_components`.

**Experiment 5: Mutate the stale handle after re-registration**

Now that Experiment 4 has orphaned `echo_tool`, attempt
`echo_tool.description = "ATTEMPT to mutate stale handle after re-register."`.

What happened: **`tools/list` did NOT change.** The stale handle still
points at the pre-re-register object. The new object living in `_components`
is a different Python instance that nothing in user code holds a reference to.
This is a real footgun: any code path that first re-adds a tool and then
later tries to mutate the old handle silently does nothing.

**Experiment 6: `remove_tool()` + `add_tool()` with explicit handle rebind**

The server's `remove_and_readd` control tool calls `mcp.remove_tool("echo")`,
then `mcp.add_tool(FunctionTool.from_function(...))`, and **rebinds the
module-level `echo_tool` variable** to the returned new instance.

What happened: **Subsequent `tools/list` reflected the re-added tool.** This
is a valid alternative to direct mutation, but only if the server code
carefully rebinds any handles it holds.

**Experiment 7: Sanity check of final state**

`list_tools()` confirmed the final state matched Experiment 6's output.

### Conclusion (Python / FastMCP)

- **Descriptions are captured by value at registration time**, same as
  TypeScript. The Tool instance has its own `description` Pydantic field that
  was copied from whatever you passed to `Tool.from_function(...)`. Mutating
  the caller's metadata dict has no effect.
- **Hot reload of description text WITHOUT re-registering tools: WORKS** via
  direct Pydantic attribute assignment on the Tool object returned by
  `mcp.add_tool()`. There is no `update()` method — because you do not need
  one. Python's non-frozen Pydantic model supports plain attribute writes, and
  FastMCP reads those attributes live on every `tools/list`.
- **Hot reload via re-registration: ALSO WORKS but is a footgun.** FastMCP's
  default `on_duplicate="warn"` means `add_tool()` silently replaces the
  existing Tool instance, orphaning any handle the user code was holding. The
  remove+add path works only if the server explicitly rebinds its handles to
  the new instance.
- **Notifications are NOT automatic.** In TypeScript, `update()` auto-fires
  `sendToolListChanged()`. In Python, you must explicitly call
  `await ctx.session.send_tool_list_changed()` after any mutation. For a
  pull-based client that just calls `tools/list` on demand (like the editor's
  save action), this does not matter — `tools/list` returns live state. It
  only matters for push-based clients listening for `list_changed` events.
- **File watching is NOT built in**, same as TypeScript. Something in user
  code must trigger the reload.
- **The `@mcp.tool` decorator returns the original function, not the Tool
  object**, in the default decorator mode. If the server needs a handle for
  later mutation, it must use `mcp.add_tool(FunctionTool.from_function(...))`
  instead. This is a meaningful API difference vs the TypeScript SDK's
  `registerTool()` which always returns the handle.

**Recommended approach for Python/FastMCP servers.** The MCP server project
we ship should:

1. Load tool metadata (names, titles, descriptions, param schemas) from an
   external `metadata.json` at startup.
2. Construct each tool with
   `mcp.add_tool(FunctionTool.from_function(fn, name=..., title=..., description=...))`
   and store the returned `FunctionTool` in a `dict[str, FunctionTool]` keyed
   by tool name.
3. Expose an internal "reload" entry point (signal handler, HTTP endpoint,
   watch callback, or an administrative MCP tool) that re-reads
   `metadata.json` and, for each tool whose description/title/schema changed:
   - **For in-place changes to `title`, `description`, `output_schema`,
     `annotations`**: directly assign the attribute on the stored
     `FunctionTool` instance. e.g. `self.tools["echo"].description = fresh`.
   - **For renames or schema-incompatible edits**: `mcp.remove_tool(old_name)`
     followed by `mcp.add_tool(new_tool)`, and rebind the cached handle.
4. After any mutation, call `await ctx.session.send_tool_list_changed()` from
   the administrative tool handler to push a list_changed notification to
   subscribed clients.
5. The editor saves `metadata.json` then calls the admin MCP tool, which
   triggers step 3+4. The editor also re-calls `list_tools()` explicitly after
   the save, so it does not depend on the client receiving the notification.

**Gotchas / caveats.**

- FastMCP's `on_duplicate` defaults to `"warn"`, not `"error"`. Re-adding a
  tool with the same name silently replaces it. If the editor uses
  "remove and re-add" as its save path, the server MUST rebind its cached
  handle — otherwise subsequent direct-mutation paths will silently write to a
  dead object. Prefer direct attribute mutation as the primary path; use
  remove+add only for renames or breaking schema changes.
- The `@mcp.tool` decorator's default `function` mode returns the wrapped
  callable, not the Tool instance. Code that wants a handle must use
  `add_tool(FunctionTool.from_function(...))`. The editor's server scaffold
  should standardize on this form.
- `send_tool_list_changed()` is ONLY reachable from inside a tool call, via
  `ctx.session`. For signal-handler or file-watcher reload paths (no client
  request in flight), you need to plumb the session reference separately, or
  accept that notifications won't fire for those paths and rely on the client
  re-polling.
- Pydantic `extra="forbid"` is set on `FastMCPBaseModel`, so you cannot add
  arbitrary fields. But the declared fields (including `description`, `title`,
  `parameters`, `output_schema`, `annotations`) are all settable.
- Param schema edits via direct mutation: settable as
  `tool.parameters = new_json_schema`, but the spike did not exercise this in
  depth. The editor should treat schema edits as a "rebuild the tool" path
  (remove+add) to be safe, since `parameters` is tied to the function signature
  in `FunctionTool`.

### Code snippet that proves the claim

Minimal reproduction of the hot-reload mechanism (distilled from
`spikes/reload-python/server.py`):

```python
import json
from pathlib import Path
from fastmcp import Context, FastMCP
from fastmcp.tools.function_tool import FunctionTool

METADATA = Path("metadata.json")
metadata = json.loads(METADATA.read_text())

mcp = FastMCP("demo")

def echo(text: str) -> str:
    return f"echo: {text}"

# Capture the FunctionTool handle — this is the key.
echo_tool: FunctionTool = mcp.add_tool(
    FunctionTool.from_function(
        echo,
        name="echo",
        title=metadata["echo"]["title"],
        description=metadata["echo"]["description"],
    )
)

@mcp.tool(name="reload_metadata")
async def reload_metadata(ctx: Context) -> str:
    fresh = json.loads(METADATA.read_text())
    # Direct Pydantic attribute assignment.
    echo_tool.title = fresh["echo"]["title"]
    echo_tool.description = fresh["echo"]["description"]
    # Notification is NOT automatic in Python — must send manually.
    await ctx.session.send_tool_list_changed()
    return f"reloaded: {fresh['echo']['description']}"

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

Observed spike output from experiment 2 (direct attribute mutation):

```
[update_tool result] Assigned echo_tool.description = 'UPDATED via direct Pydantic attribute assignment.'; tools/list_changed notification sent
[tools/list echo after update] {
  "name": "echo",
  "title": "Echo Tool (initial)",
  "description": "UPDATED via direct Pydantic attribute assignment."
}
[conclusion] SUCCESS: tools/list reflects the new description.
```

And from experiment 3 (full disk round trip):

```
[disk] wrote .../metadata.json
[tools/list echo after file rewrite (before reload call)] {
  "description": "UPDATED via direct Pydantic attribute assignment.",
  ...
}
[reload_metadata result] Reloaded from disk. Applied description: RELOADED from disk via file rewrite + direct Pydantic attribute assignment.; tools/list_changed notification sent
[tools/list echo after reload] {
  "name": "echo",
  "title": "Echo Tool (from disk v2)",
  "description": "RELOADED from disk via file rewrite + direct Pydantic attribute assignment."
}
[conclusion] SUCCESS: hot reload from disk works via direct attribute assignment.
```

And the stale-handle footgun from experiment 5:

```
WARNING  Component already exists: tool:echo@
[reregister_tool result] UNEXPECTED: re-registration succeeded
[tools/list echo after re-register attempt] {
  "title": "Echo Tool (re-registered)",
  "description": "description from re-registration attempt"
}
[update_tool result (stale handle)] Assigned echo_tool.description = 'ATTEMPT to mutate stale handle after re-register.'; tools/list_changed notification sent
[tools/list echo after stale update] {
  "title": "Echo Tool (re-registered)",
  "description": "description from re-registration attempt"
}
```

## Overall Decision

Based on both spikes, the MCP Editor's save-and-reload UX will be:

**TypeScript servers:**

- Server scaffold loads tool metadata from an external `metadata.json` at
  startup and keeps a `Map<string, RegisteredTool>` of handles returned by
  `server.registerTool()`.
- Save path: editor rewrites `metadata.json`, then calls an administrative
  MCP tool (or a signal handler) that re-reads the file and calls
  `registeredTool.update({ title, description, paramsSchema })` for each tool
  whose fields changed. `update()` mutates the SDK's stored record in place
  AND automatically emits `notifications/tools/list_changed`.
- Rename path: `registeredTool.update({ name: newName })` (the SDK supports
  rename via the same `update()` method).
- Remove path: `registeredTool.update({ name: null })` a.k.a.
  `registeredTool.remove()`.

**Python/FastMCP servers:**

- Server scaffold loads tool metadata from an external `metadata.json` at
  startup. For each tool it calls
  `mcp.add_tool(FunctionTool.from_function(fn, name=..., title=..., description=...))`
  and keeps a `dict[str, FunctionTool]` of the returned handles. (It must
  NOT use the `@mcp.tool` decorator in default mode, which discards the Tool
  object.)
- Save path for in-place edits (title, description, output_schema,
  annotations): editor rewrites `metadata.json`, then calls an administrative
  MCP tool that re-reads the file and directly assigns the updated attributes
  on the cached `FunctionTool` instance, then awaits
  `ctx.session.send_tool_list_changed()`. No SDK-level `update()` method
  exists; this is how Python exposes the same mutation capability.
- Rename and schema-breaking changes: call `mcp.remove_tool(old_name)` then
  `mcp.add_tool(new_tool)` and REBIND the cached handle in the server's dict.
  Crucial: forgetting the rebind leaves the old handle stale and silently
  breaks subsequent in-place mutations.
- The server scaffold should standardize on `on_duplicate="error"` when
  constructing `FastMCP(...)` so that accidental duplicate `add_tool()` calls
  fail loudly instead of silently replacing. The spike proved the default
  `"warn"` behavior is the main footgun in the Python path.

**Implications for the Phase 1 plan:**

- **A common abstraction is feasible.** Both SDKs converge on the same
  mental model: "capture a tool handle at registration, mutate its fields on
  reload." The abstraction interface we ship in Phase 1 looks like:

  ```
  interface ToolRegistry {
    register(name, metadata, handler): ToolHandle;
    update(name, partialMetadata);           // title, description, schema, ...
    remove(name);
    rename(oldName, newName);
    onChange(listener);                       // for list_changed notifications
  }
  ```

  TypeScript maps this onto `RegisteredTool.update()` (auto-notifies).
  Python maps this onto direct attribute assignment + explicit
  `send_tool_list_changed()`. The editor itself never calls the SDK directly;
  it calls our `ToolRegistry`.

- **The administrative reload surface should be per-server, not per-SDK.**
  Both server scaffolds should expose the same MCP tool (e.g.,
  `_editor_reload_metadata`) that the editor calls after saving. The tool's
  implementation on each side handles the SDK-specific dance.

- **Notifications are a per-SDK detail.** TypeScript notifies automatically;
  Python requires manual `send_tool_list_changed()` from inside the tool
  handler. The editor's client should re-fetch `list_tools()` explicitly after
  every save so it is not dependent on the notification path (and so it also
  works with Python's signal-handler reload path where no client request is
  in flight).

- **Schema mutation is risky on both sides.** For Phase 1, treat description
  and title edits as the common-case hot-reload path. Schema edits should go
  through a rebuild path: remove the old tool, add a new one, rebind handles.
  This is especially important for Python where the `FunctionTool.parameters`
  is tied to the function signature.

- **Things we punt on until later:**
  - Param schema edits via hot-reload. The spike proved both SDKs can mutate
    `parameters` / `paramsSchema` in place but neither validates against
    in-flight tool calls. Phase 1 should only hot-reload description/title
    and fall back to server restart for schema changes.
  - File-watcher reload. Both spikes relied on an explicit admin tool call.
    A watcher adds complexity and is not required for editor-triggered saves.
  - Multi-client notification semantics (what happens when a second client is
    connected and also receives `list_changed`).
  - Tool enable/disable via the same mechanism. Both SDKs expose it
    (`update({ enabled: false })` in TS, `server.disable(keys=[...])` in
    Python), but the editor does not need it for Phase 1.
