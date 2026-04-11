"""Reference FastMCP server using mcp-editor-metadata for hot reload.

Parallel to examples/weather-server (TypeScript). Exposes two user tools
(get_weather, convert_temperature) plus the _reload_metadata admin tool.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.tools.function_tool import FunctionTool

from mcp_editor_metadata import (
    ApplyResult,
    ToolHandle,
    load_metadata,
    register_reload_tool,
)

HERE = Path(__file__).resolve().parent
# Package layout: examples/weather-server-py/src/weather_server_py/server.py
# HERE           = examples/weather-server-py/src/weather_server_py/
# HERE.parent    = examples/weather-server-py/src/
# HERE.parent.parent = examples/weather-server-py/   ← metadata.json lives here
PACKAGE_ROOT = HERE.parent.parent
METADATA_PATH = PACKAGE_ROOT / "metadata.json"


def _get_weather_impl(city: str) -> str:
    """Stub weather lookup. Returns a canned string; does not hit any real API."""
    return f"Weather in {city}: sunny, 72°F (stub response from reference server)."


def _convert_temperature_impl(
    value: float, from_unit: str, to_unit: str
) -> str:
    """Convert between Celsius and Fahrenheit."""
    from_u = from_unit.strip().lower()
    to_u = to_unit.strip().lower()

    if from_u in ("c", "celsius"):
        celsius = value
    elif from_u in ("f", "fahrenheit"):
        celsius = (value - 32) * 5 / 9
    else:
        return f"Unsupported from_unit: {from_unit}"

    if to_u in ("c", "celsius"):
        result = celsius
        unit = "°C"
    elif to_u in ("f", "fahrenheit"):
        result = celsius * 9 / 5 + 32
        unit = "°F"
    else:
        return f"Unsupported to_unit: {to_unit}"

    return f"{value}{from_unit.upper()} = {result:.2f}{unit}"


def build_server() -> FastMCP:
    """Build the FastMCP server with tools registered and metadata loaded."""
    mcp = FastMCP(name="weather-server-py")

    # Load initial metadata so the first tools/list already reflects file contents.
    initial = load_metadata(METADATA_PATH)

    # Register user tools via add_tool(FunctionTool.from_function(...))
    # so we get back mutable handles for later reload.
    get_weather_handle: FunctionTool = mcp.add_tool(
        FunctionTool.from_function(
            _get_weather_impl,
            name="get_weather",
            description=initial.tools["get_weather"].description,
        )
    )

    convert_handle: FunctionTool = mcp.add_tool(
        FunctionTool.from_function(
            _convert_temperature_impl,
            name="convert_temperature",
            description=initial.tools["convert_temperature"].description,
        )
    )

    handles: dict[str, ToolHandle] = {
        "get_weather": get_weather_handle,
        "convert_temperature": convert_handle,
    }

    def _log_reload(result: ApplyResult) -> None:
        # stderr-only: stdout is the JSON-RPC transport under stdio mode.
        updated = ", ".join(result.updated) or "(none)"
        sys.stderr.write(
            f"[weather-server-py] updated tools: {updated}\n"
        )
        sys.stderr.flush()

    register_reload_tool(
        mcp,
        METADATA_PATH,
        handles,
        on_reload=_log_reload,
    )

    return mcp


def main() -> None:
    """Entry point for the `weather-server-py` console script."""
    sys.stderr.write("[weather-server-py] starting\n")
    sys.stderr.flush()
    mcp = build_server()
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
