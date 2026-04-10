# Inspector Architecture Findings

Written during Phase 0 exploration. This is ground truth for the Phase 1 plan.
Inspector version: 0.21.1

## Top-Level Layout

- Monorepo?: Yes
- Workspaces: client, server, cli
- Build tool: Vite (client), TypeScript tsc (server/cli)
- Root package.json scripts that matter:
  - dev: Launches client development server via node client/bin/start.js --dev
  - build: Runs build-server && build-client && build-cli
  - start: Runs node client/bin/start.js (full stack in production)
  - start-server: Express backend on port 6277
  - start-client: Vite preview on port 6274
  - test: Prettier check + Jest in client workspace

## Frontend (client/)

- Entry HTML: client/index.html
- Entry TS/TSX: client/src/main.tsx
- Root component: App (in client/src/App.tsx)
- Routing: None (no React Router). Tab-based navigation using Radix UI Tabs component
- State management: Plain React useState hooks in App component. No context, Zustand, or Redux
- Styling: Tailwind CSS with Radix UI components, class-variance-authority, clsx, PostCSS

### Tools Tab

- Component file: client/src/components/ToolsTab.tsx
- Component name: ToolsTab
- How it fetches tool list: Callback listTools() from App calls sendMCPRequest with method "tools/list"
- Tool list data: React state tools: Tool[] in App (line 158)
- Individual tools rendered by: ListPane component (left sidebar), shows name, description, icon via IconDisplay
- How "Run tool" works:
  1. User fills form in right pane
  2. Clicks "Run" button
  3. Calls callTool(name, params, toolMetadata, runAsTask)
  4. Sends: {method: "tools/call", params: {name, arguments, \_meta}}
  5. Result shown in ToolResults component

### Resources Tab

- Component file: client/src/components/ResourcesTab.tsx
- Component name: ResourcesTab
- How it fetches resource list: Via listResources() callback, sends {method: "resources/list"}
- List data: React state resources: Resource[] in App
- Features: Templates, subscriptions, reading via readResource(uri)

### Prompts Tab

- Component file: client/src/components/PromptsTab.tsx
- Component name: PromptsTab
- How it fetches prompt list: Via listPrompts() callback, sends {method: "prompts/list"}
- Getting content: Via getPrompt(name, args), sends {method: "prompts/get"}
- Supports: Argument completions

## MCP Connection Layer

- Where MCP Client instantiated: client/src/lib/hooks/useConnection.ts
- Transport types:
  - stdio: Via StdioClientTransport
  - sse: Via SSEClientTransport (deprecated)
  - streamable-http: Via StreamableHTTPClientTransport
- Client instance held in: State variable mcpClient in useConnection hook
- How tools/list called: Via Client.request() wrapped in sendMCPRequest() helper
- Connection selection: "direct" or "proxy" (backend Express at 6277)
- Authentication: Custom headers, Bearer tokens, OAuth 2.0 PKCE flow
- Metadata: Global key-value pairs merged with tool calls via \_meta field

## Backend Proxy (server/)

- Entry file: server/src/index.ts
- Framework: Express.js
- Port: DEFAULT_MCP_PROXY_LISTEN_PORT = "6277"
- Route pattern: app.get("/route", originValidationMiddleware, authMiddleware, async (req, res) => {...})
- Key routes: GET /mcp, POST /mcp, DELETE /mcp, GET /stdio, GET /sse, POST /message, GET /health, GET /config
- Authentication: Bearer token from header x-mcp-proxy-auth, constant-time comparison
- Proxy mechanism: mcpProxy.ts creates bidirectional forwarding between client and server transports

## CLI (cli/)

- Entry file: cli/src/cli.ts
- What it does: Command-line tool using Commander.js, invokes Inspector from CLI

## Where The Metadata Editor Will Hook In

- Add React components at: client/src/components/ directory
- Add backend routes at: server/src/index.ts following existing pattern
- Reuse MCP client: Yes - extend useConnection hook's mcpClient
- Reuse state management: Yes - extend App.tsx with new useState calls
- Extend existing tools tab: Add dedicated tab for structured tool/resource/prompt metadata

## Unknowns / Risks

1. Metadata persistence: Inspector fetches metadata but doesn't persist edits. Unclear if MCP server supports updates. (NOT FOUND - requires MCP spec verification)

2. Real-time refresh: ToolListChangedNotification handler exists but auto-refresh trigger unclear. (PARTIALLY FOUND)

3. Task-augmented execution: Complex lifecycle with sampling/createMessage and elicitation/create callbacks. (FOUND but complex)

4. Schema caching: Tools' output schemas cached. New ops may need to respect caching. (FOUND)

5. Transport compatibility: Must work across stdio, SSE, StreamableHttp. Not all features available everywhere. (FOUND but needs testing)

## Files You Should Read Before Writing Phase 1

1. client/src/App.tsx - Central state holder (1600+ lines)
2. client/src/lib/hooks/useConnection.ts - MCP client and request handling
3. client/src/components/ToolsTab.tsx - Reference for tool list UI
4. server/src/index.ts - Express routes and proxy (800+ lines)
5. client/src/components/MetadataTab.tsx - Existing metadata editor
6. server/src/mcpProxy.ts - Bidirectional forwarding
7. client/src/utils/schemaUtils.ts - JSON schema handling
8. client/src/lib/hooks/useConnection.ts lines 106-200 - Hook interface

---

# Deep Dive: Tool List Component (Phase 0 Task 5)

_Written after the initial architecture map. Detailed walkthrough of exactly how the tool tab is wired, including the existing MetadataTab component._

## ToolsTab.tsx

**File:** `client/src/components/ToolsTab.tsx`

**Props:**

- `tools: Tool[]` — array of available tools from server
- `listTools(): void` — callback to re-fetch tools via `tools/list`
- `clearTools(): void` — callback to clear the tool array
- `callTool(name, params, toolMetadata?, runAsTask?): Promise<CompatibilityCallToolResult>` — executes a tool
- `selectedTool: Tool | null` — currently selected tool (for right-panel display)
- `setSelectedTool(tool | null): void` — update selection
- `toolResult: CompatibilityCallToolResult | null` — output from the last tool call
- `isPollingTask?: boolean` — shows if a long-running task is polling
- `nextCursor: ListToolsResult["nextCursor"]` — pagination cursor
- `error: string | null` — error message if tool call failed
- `resourceContent: Record<string, string>` — cached resource content for display
- `onReadResource?: (uri: string) => void` — callback to read a resource
- `serverSupportsTaskRequests: boolean` — whether server supports task-augmented requests

**Render structure:** Two-column layout

- **Left pane (ListPane component):** Vertical scrollable list of tools with search. Each row shows tool icon (via IconDisplay), name/title, truncated description. Rows are clickable to select.
- **Right pane (details panel):** When a tool is selected, shows full description, annotation badges, input form (auto-generated from `inputSchema`), output schema (collapsible), tool metadata (collapsible), "Run as task" checkbox (if supported), and a "Run Tool" button. Also shows tool execution results in ToolResults component below. When no tool selected, shows "Select a tool" alert.

**Selection tracking:** React state `selectedTool: Tool | null`. Updated via `setSelectedTool()` callback when user clicks a list item.

**When a tool is selected:** The right panel renders:

1. Tool title/name in header with icon
2. Full description (scrollable, max-h-48)
3. AnnotationBadges showing readOnlyHint, destructiveHint, idempotentHint, openWorldHint
4. For each property in inputSchema.properties: renders appropriate input UI
5. Tool-specific metadata section (key-value pairs)
6. Output schema (if present, collapsed by default)
7. Tool's `_meta` field if present (collapsed by default)
8. "Run as task" checkbox (conditional)
9. "Run Tool" button
10. "Copy Input" button
11. ToolResults component showing call output

**Input form generation:** Reads `selectedTool.inputSchema.properties` and renders form controls based on type:

- boolean → Checkbox
- string with enum → Select dropdown
- string → Textarea
- number/integer → numeric Input
- object/array → DynamicJsonForm
- Default → DynamicJsonForm

Validation via DynamicJsonFormRef refs collected in `formRefs.current`.

## MetadataTab.tsx — Existing Metadata Editor

**File:** `client/src/components/MetadataTab.tsx`

**Purpose:** Displays and edits **global request metadata** — key-value pairs applied to _all_ MCP requests. These are top-level `_meta` fields sent on every request. **NOT** for editing individual tool metadata (that's in ToolsTab).

**Editable?** Yes. Users add/remove/edit key-value pairs. Changes call `onMetadataChange()` callback, which propagates to parent state and session storage.

**Data source:** Loads from App.tsx state `metadata: Record<string, string>`, which initializes from session storage via `loadInspectorConfig()`.

**Save mechanism:**

1. MetadataTab calls `onMetadataChange(newMetadata)`
2. Parent App.tsx receives at line 1663: `onMetadataChange={handleMetadataChange}`
3. `handleMetadataChange()` calls `saveInspectorConfig()` which writes to session/localStorage
4. Updated metadata used in all subsequent tools/call requests (line 1018: `...metadata`)

**Relationship to our project:** This is **unrelated** to editing tool descriptions. MetadataTab edits global request metadata (request IDs, user context, auth tokens). Our editor edits **per-tool metadata** (descriptions, titles, input schemas). We can follow its UI pattern but use it for tool editing in ToolsTab, not a global metadata tab.

## Tool Row Rendering (ListPane)

**Component:** `client/src/components/ListPane.tsx`

**What each row contains:**

- Tool icon (via IconDisplay, size="sm")
- Tool title or name (truncated)
- Description (line-clamped to 2 lines)
- Chevron-right icon

**Space for an "edit" button:** Yes — **requires minor refactor**. The renderItem function (from ToolsTab, lines 287-300) returns React nodes. To add an edit button:

1. Add optional `onEditItem` callback prop to ListPane
2. Add a pencil icon button next to the chevron
3. Invoke callback in row click handler

Layout has room — row is `flex items-start gap-2` with chevron as `flex-shrink-0`. Could insert another button without breaking layout. This is a **minor refactor**.

**Selection signal:** Click handler calls `setSelectedItem()` callback, which in ToolsTab is `setSelectedTool()`.

## `tools/list_changed` Notification Handling

**Where registered:** `client/src/lib/hooks/useConnection.ts`, lines 748-767.

```typescript
if (onNotification) {
  [
    CancelledNotificationSchema,
    LoggingMessageNotificationSchema,
    ResourceUpdatedNotificationSchema,
    ResourceListChangedNotificationSchema,
    ToolListChangedNotificationSchema, // <-- registered here
    PromptListChangedNotificationSchema,
    TaskStatusNotificationSchema,
  ].forEach((notificationSchema) => {
    client.setNotificationHandler(notificationSchema, onNotification);
  });
}
```

**What happens on notification:** When the server sends `notifications/tools/list_changed`, the MCP Client routes it to `onNotification()` callback (App.tsx line 400), which stores it in `notifications` state array.

**Automatic refresh?** **NO.** The notification is captured and stored, but there is **no automatic re-call to `listTools()`**. Grep confirms: only `notifications/tasks/list_changed` has special handling (line 403-407); `tools/list_changed` has no handler.

**Verdict for our editor:** We **cannot rely on automatic refresh**. However, this is **not a blocker**: the editor can explicitly call `listTools()` after saving. The notification is nice-to-have for multi-client scenarios but not required.

## "Run Tool" Click Path

When user clicks "Run Tool" button:

1. **Button handler** (ToolsTab.tsx:806-844) validates JSON inputs via `checkValidationErrors(true)`
2. **Gather metadata** from `metadataEntries` state (lines 813-826)
3. **Call `callTool()`** (line 827) with tool name, params, metadata, runAsTask flag
4. **Inside `callTool()`** (App.tsx:1000-1170):
   - Find tool to get inputSchema
   - Clean params via `cleanParams()` helper
   - Merge metadata: general + tool-specific + progressToken
   - Build request: `{method: "tools/call", params: {name, arguments, _meta}}`
   - If runAsTask, add `task: {ttl}` to params
   - Call `sendMCPRequest()`
5. **Inside `sendMCPRequest()`** (useConnection.ts:200-279):
   - Add global metadata to request (skip for tool calls)
   - Set up abort controller and MCP request options
   - Call `mcpClient.request()` → sends to server
   - Return response or throw
6. **UI update:** `toolResult` passed to ToolResults component, renders output

**Function:** `callTool()` at App.tsx:1000

**Signature:**

```typescript
const callTool = async (
  name: string,
  params: Record<string, unknown>,
  toolMetadata?: Record<string, unknown>,
  runAsTask?: boolean,
): Promise<CompatibilityCallToolResult>
```

**Reusability for editor:** **YES, fully.** Function is decoupled from UI — takes only data, returns Promise, no side effects beyond state updates. Editor can call directly: `await callTool(toolName, testParams)` to test a saved change. No code duplication needed.

## State Shape: `tools: Tool[]`

**Type import:** `client/src/App.tsx` line 19:

```typescript
import { Tool, ... } from "@modelcontextprotocol/sdk/types.js";
```

**Type definition:**

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  title?: string;
  outputSchema?: JsonSchema;
  _meta?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  execution?: { taskSupport?: "forbidden" | "required" | "optional" };
}
```

**State:** Raw MCP SDK Tool[] objects (not wrapped). After `listTools()` response: `setTools(response.tools)` at App.tsx:995.

## Resources and Prompts Tabs (Brief)

**ResourcesTab:** Two-pane layout. Resources are read-only display of remote files/directories. Users select a resource and click "Read" to fetch content via `readResource()` callback. Supports templates (URI with parameters) and subscriptions. No editing.

**PromptsTab:** Two-pane layout. Prompts are templated text blocks with optional arguments. Users select, fill arguments, click "Get Prompt" to fetch rendered template via `getPrompt()` callback. Supports autocompletion. Read-only from client.

## Phase 1 Implications

The metadata editor (for tool descriptions) will:

1. **Add edit forms in ToolsTab, not a separate tab.** Reuse metadata entry UI pattern from MetadataTab (Input + validation styling).

2. **Reuse existing state shape.** Work with MCP SDK's Tool interface directly. No wrapper types.

3. **Save via backend route that triggers server reload.** POST to `/edit-tool-metadata`, backend writes `metadata.json` and calls the server's administrative reload tool (per the reload spike). Editor then calls `listTools()` explicitly. No reliance on `tools/list_changed` auto-refresh.

4. **Reuse `callTool()` for "Test" button.** After editing/saving, users test the updated tool via same plumbing. ToolResults component handles output display.

5. **Handle save+reload gracefully:**
   - User clicks "Save"
   - POST updated metadata to backend
   - Backend writes `metadata.json` and triggers server reload (calls admin tool on the target MCP server)
   - Backend responds with updated tool metadata
   - Editor calls `listTools()` to refresh
   - UI shows updated description/schema immediately

## Open Questions

1. **Where should edit UI live?** Recommend: Add "Edit" button per row in ListPane, opens modal or inline edit form. Cleaner separation than cramming it into the existing right panel.

2. **Extend ToolsTab or create EditToolsTab?** For MVP, extend ToolsTab (reuse existing selection, list pane, callbacks).

3. **How to handle schema edits?** Treat schema edits as "rebuild the tool": remove + re-add with new schema. Only title/description edits use the fast hot-reload path.

## Critical Gotchas for Phase 1

1. **ListPane doesn't have per-row edit button.** Minor refactor: add `onEditItem` callback prop, add pencil icon button next to chevron.
2. **No automatic `tools/list_changed` refresh.** Editor must explicitly `listTools()` after save.
3. **Tool-specific metadata (ToolsTab) ≠ global metadata (MetadataTab).** Don't conflate them.
4. **Schema edits should be "rebuild" not "hot-reload."** Only title/description/param descriptions use the fast update path.
5. **`callTool()` is fully reusable** for "Edit then Test" flow — no duplication needed.
