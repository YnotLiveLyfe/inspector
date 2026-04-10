"""
Spike server: Tests whether MCP Python / FastMCP SDK tool metadata can be updated
at runtime without restarting the server.

Exposes these tools:
  - echo                  The tool under test. Its description is loaded from metadata.json.
  - get_live_description  Returns what the server currently holds in its in-memory variable.
  - mutate_variable       Mutates the in-memory `metadata` dict (no SDK call).
  - reregister_tool       Attempts to re-call mcp.add_tool(echo) with a new description.
  - update_tool           Directly assigns echo_tool.description = new_description (Pydantic attribute mutation).
  - reload_metadata       Re-reads metadata.json and applies the new description via direct attribute mutation.
  - remove_and_readd      Calls mcp.remove_tool("echo") then mcp.add_tool(new_echo) with a new description.

The test harness drives these via an MCP client over stdio.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from fastmcp import Context, FastMCP
from fastmcp.tools.function_tool import FunctionTool

HERE = Path(__file__).resolve().parent
METADATA_PATH = HERE / "metadata.json"


def load_metadata() -> dict[str, Any]:
    return json.loads(METADATA_PATH.read_text(encoding="utf-8"))


# In-memory snapshot of metadata, initially loaded from disk.
metadata: dict[str, Any] = load_metadata()

mcp = FastMCP(name="reload-spike-python-server")


# --- The tool under test ----------------------------------------------------
#
# Use mcp.add_tool(fn) (NOT @mcp.tool) so that we get back the FunctionTool
# instance. The @mcp.tool decorator returns the original function, not the
# Tool object, so you cannot get a handle to mutate.


def echo(text: str) -> str:
    return f"echo: {text}"


echo_tool: FunctionTool = mcp.add_tool(
    FunctionTool.from_function(
        echo,
        name="echo",
        title=metadata["echo"]["title"],
        description=metadata["echo"]["description"],
    )
)


# --- Control tools that drive the experiments ------------------------------


@mcp.tool(name="get_live_description")
def get_live_description() -> str:
    """Returns the in-memory metadata.echo.description the server currently holds."""
    return json.dumps({"inMemoryDescription": metadata["echo"]["description"]})


@mcp.tool(name="mutate_variable")
def mutate_variable(new_description: str) -> str:
    """
    Mutate the in-memory metadata dict WITHOUT calling any SDK method.
    Proves whether the SDK holds a reference to the dict or copied by value.
    """
    metadata["echo"]["description"] = new_description
    return f"Mutated in-memory metadata['echo']['description'] to: {new_description}"


@mcp.tool(name="reregister_tool")
def reregister_tool(new_description: str) -> str:
    """
    Attempt to call mcp.add_tool() a second time with a tool named "echo".
    Expected: the default on_duplicate="error" behavior raises.
    """
    try:
        new_tool = FunctionTool.from_function(
            echo,
            name="echo",
            title="Echo Tool (re-registered)",
            description=new_description,
        )
        mcp.add_tool(new_tool)
        return "UNEXPECTED: re-registration succeeded"
    except Exception as e:
        return f"re-registration threw: {type(e).__name__}: {e}"


@mcp.tool(name="update_tool")
async def update_tool(ctx: Context, new_description: str) -> str:
    """
    Directly assign echo_tool.description = new_description.
    This is the Python equivalent of TypeScript's registeredTool.update(). Since
    Tool is a Pydantic model with non-frozen config, attribute assignment mutates
    the instance stored in LocalProvider._components in place.
    Also manually fires tools/list_changed notification so clients are informed.
    """
    echo_tool.description = new_description
    metadata["echo"]["description"] = new_description
    # Unlike TypeScript's update(), the notification is NOT automatic.
    try:
        await ctx.session.send_tool_list_changed()
        notif_status = "tools/list_changed notification sent"
    except Exception as e:
        notif_status = f"notification failed: {type(e).__name__}: {e}"
    return (
        f"Assigned echo_tool.description = {new_description!r}; {notif_status}"
    )


@mcp.tool(name="reload_metadata")
async def reload_metadata(ctx: Context) -> str:
    """
    Re-read metadata.json from disk and apply the new title/description via
    direct Pydantic attribute assignment on the FunctionTool instance.
    This is the "save-and-reload" administrative path the editor would use.
    """
    global metadata
    fresh = load_metadata()
    metadata = fresh

    echo_tool.title = fresh["echo"]["title"]
    echo_tool.description = fresh["echo"]["description"]

    # Push a notification so any client that listens for list_changed re-fetches.
    try:
        await ctx.session.send_tool_list_changed()
        notif_status = "tools/list_changed notification sent"
    except Exception as e:
        notif_status = f"notification failed: {type(e).__name__}: {e}"

    return (
        f"Reloaded from disk. Applied description: "
        f"{fresh['echo']['description']}; {notif_status}"
    )


@mcp.tool(name="remove_and_readd")
async def remove_and_readd(ctx: Context, new_description: str) -> str:
    """
    Alternative strategy: mcp.remove_tool("echo") then mcp.add_tool(new_echo).
    This leaves `echo_tool` (the module-level handle) pointing at the OLD,
    now-orphaned Tool instance — which is the main reason to prefer direct
    attribute mutation instead.
    """
    global echo_tool
    try:
        mcp.remove_tool("echo")
        new_tool = FunctionTool.from_function(
            echo,
            name="echo",
            title="Echo Tool (re-added)",
            description=new_description,
        )
        returned = mcp.add_tool(new_tool)
        # Rebind the module-level handle so future update_tool / reload_metadata
        # calls target the NEW instance.
        echo_tool = returned  # type: ignore[assignment]
        try:
            await ctx.session.send_tool_list_changed()
            notif_status = "tools/list_changed notification sent"
        except Exception as e:
            notif_status = f"notification failed: {type(e).__name__}: {e}"
        return f"remove+add succeeded; {notif_status}"
    except Exception as e:
        return f"remove+add threw: {type(e).__name__}: {e}"


# --- Start ------------------------------------------------------------------

if __name__ == "__main__":
    # NEVER write to stdout; it's the JSON-RPC transport for stdio mode.
    sys.stderr.write("[spike-server-py] starting\n")
    sys.stderr.flush()
    mcp.run(transport="stdio")
