# weather-server-py

Reference FastMCP server using `mcp-editor-metadata` for hot reload. Parallel
to `examples/weather-server` (the TypeScript version).

## Run

From the fork root:

    uv run weather-server-py

The server speaks MCP over stdio. Point Inspector at:

- Transport: STDIO
- Command: `uv`
- Arguments: `run weather-server-py`
- Working directory: the fork root (`build/`)

## Edit a description

1. Connect Inspector to this server.
2. Paste the absolute path of `examples/weather-server-py/metadata.json` into
   the Metadata Path field on the Tools tab.
3. Click Edit next to a tool, modify the description, Save.
4. The list and detail panes auto-refresh with the new description.
