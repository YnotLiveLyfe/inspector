"""Register the administrative reload tool on a FastMCP server."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable

from .loader import load_metadata
from .registry import ApplyResult, ToolHandle, apply_metadata


def register_reload_tool(
    mcp: Any,  # FastMCP instance (or test mock). Typed Any for structural flexibility.
    metadata_path: str | Path,
    handles: dict[str, ToolHandle],
    *,
    tool_name: str = "_reload_metadata",
    on_reload: Callable[[ApplyResult], None] | None = None,
) -> None:
    """
    Register an administrative MCP tool that re-reads metadata.json from disk
    and applies any description/title changes via direct Pydantic attribute
    assignment, then fires tools/list_changed so clients refresh.

    The MCP Editor frontend invokes this tool after writing a new metadata.json.
    """
    path = Path(metadata_path)

    @mcp.tool(
        name=tool_name,
        title="Reload metadata from disk",
        description=(
            "Administrative tool used by the MCP Editor. Re-reads the server's "
            "metadata.json file and applies any description/title changes to "
            "registered tools. Not intended for direct use by end users."
        ),
    )
    async def _reload(ctx: Any) -> str:  # ctx: fastmcp.Context at runtime
        try:
            metadata = load_metadata(path)
            result = apply_metadata(handles, metadata)
            if on_reload is not None:
                on_reload(result)
            await ctx.session.send_tool_list_changed()
            return json.dumps(asdict(result))
        except Exception as e:
            raise RuntimeError(f"Failed to reload metadata: {e}") from e
