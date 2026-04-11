"""Tests for register_reload_tool.

Uses a MockMCP that mirrors FastMCP's @mcp.tool decorator interface just
enough to capture the registered tool function, so we can invoke it with a
mock Context and verify the reload behavior without running a real server.
This matches the Phase 1 TS approach of mocking McpServer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from unittest.mock import AsyncMock, MagicMock

import pytest

from mcp_editor_metadata.reload_tool import register_reload_tool


@dataclass
class FakeHandle:
    description: str | None = None
    title: str | None = None


class MockMCP:
    """Captures tools registered via @mcp.tool(...) for inspection in tests."""

    def __init__(self) -> None:
        self.registered: dict[str, dict[str, Any]] = {}

    def tool(
        self,
        *,
        name: str,
        title: str | None = None,
        description: str | None = None,
        **kwargs: Any,
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            self.registered[name] = {
                "title": title,
                "description": description,
                "fn": fn,
                "kwargs": kwargs,
            }
            return fn

        return decorator


def _make_ctx() -> MagicMock:
    ctx = MagicMock()
    ctx.session.send_tool_list_changed = AsyncMock()
    return ctx


def _write_metadata(path: Path, tools: dict[str, dict[str, Any]]) -> None:
    path.write_text(
        json.dumps({"version": 1, "tools": tools}), encoding="utf-8"
    )


async def test_register_reload_tool_adds_admin_tool(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    _write_metadata(metadata_path, {"echo": {"description": "hello"}})

    mcp = MockMCP()
    handles = {"echo": FakeHandle(description="old")}

    register_reload_tool(mcp, metadata_path, handles)

    assert "_reload_metadata" in mcp.registered
    assert (
        mcp.registered["_reload_metadata"]["title"]
        == "Reload metadata from disk"
    )


async def test_custom_tool_name_is_respected(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    _write_metadata(metadata_path, {})

    mcp = MockMCP()
    register_reload_tool(mcp, metadata_path, {}, tool_name="_admin_reload")

    assert "_admin_reload" in mcp.registered
    assert "_reload_metadata" not in mcp.registered


async def test_reload_tool_body_updates_handles_and_notifies(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    _write_metadata(metadata_path, {"echo": {"description": "new desc"}})

    mcp = MockMCP()
    handles = {"echo": FakeHandle(description="old desc")}

    register_reload_tool(mcp, metadata_path, handles)

    tool = mcp.registered["_reload_metadata"]
    ctx = _make_ctx()
    result_json = await tool["fn"](ctx)

    assert handles["echo"].description == "new desc"
    ctx.session.send_tool_list_changed.assert_awaited_once()

    result = json.loads(result_json)
    assert result["updated"] == ["echo"]
    assert result["skipped"] == []
    assert result["missing"] == []


async def test_reload_tool_body_fires_on_reload_callback(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    _write_metadata(metadata_path, {"echo": {"description": "new"}})

    mcp = MockMCP()
    handles = {"echo": FakeHandle(description="old")}
    seen = []

    register_reload_tool(
        mcp,
        metadata_path,
        handles,
        on_reload=lambda r: seen.append(r),
    )

    tool = mcp.registered["_reload_metadata"]
    ctx = _make_ctx()
    await tool["fn"](ctx)

    assert len(seen) == 1
    assert seen[0].updated == ["echo"]


async def test_reload_tool_body_surfaces_missing_file_error(tmp_path: Path):
    metadata_path = tmp_path / "missing.json"
    mcp = MockMCP()

    register_reload_tool(mcp, metadata_path, {})

    tool = mcp.registered["_reload_metadata"]
    ctx = _make_ctx()

    with pytest.raises(RuntimeError, match="Failed to reload metadata"):
        await tool["fn"](ctx)
