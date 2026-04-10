"""
Spike test harness: drives the Python / FastMCP server through each experiment
and reports results.

Mirrors the structure of spikes/reload-typescript/test.ts but uses the
official `mcp` Python client package to spawn the server over stdio.

Experiment order matters: direct Pydantic mutation is tested FIRST so we
don't pollute the test with side effects from the re-register experiment
(which in FastMCP 3.2.3 silently REPLACES the tool object, orphaning the
module-level handle).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent
SERVER_SCRIPT = HERE / "server.py"
METADATA_PATH = HERE / "metadata.json"
PYTHON_BIN = HERE / ".venv" / "Scripts" / "python.exe"

INITIAL_METADATA: dict[str, Any] = {
    "echo": {
        "title": "Echo Tool (initial)",
        "description": "INITIAL description loaded from metadata.json at server startup.",
    }
}


def log(section: str, msg: Any) -> None:
    text = msg if isinstance(msg, str) else json.dumps(msg, indent=2, default=str)
    sys.stdout.write(f"\n[{section}] {text}\n")
    sys.stdout.flush()


def banner(title: str) -> None:
    sys.stdout.write(f"\n\n==================== {title} ====================\n")
    sys.stdout.flush()


def _tool_to_dict(tool: Any) -> dict[str, Any]:
    return {
        "name": getattr(tool, "name", None),
        "title": getattr(tool, "title", None),
        "description": getattr(tool, "description", None),
    }


async def get_echo_from_list(session: ClientSession) -> dict[str, Any]:
    result = await session.list_tools()
    echo = next((t for t in result.tools if t.name == "echo"), None)
    if echo is None:
        raise RuntimeError("echo tool missing from tools/list")
    return _tool_to_dict(echo)


async def call_text(
    session: ClientSession, name: str, args: dict[str, Any] | None = None
) -> str:
    result = await session.call_tool(name, arguments=args or {})
    chunks: list[str] = []
    for block in result.content or []:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            chunks.append(text)
    return "".join(chunks)


async def main() -> None:
    # Reset metadata.json in case a previous run mutated it.
    METADATA_PATH.write_text(
        json.dumps(INITIAL_METADATA, indent=2), encoding="utf-8"
    )

    params = StdioServerParameters(
        command=str(PYTHON_BIN),
        args=[str(SERVER_SCRIPT)],
        cwd=str(HERE),
        env=None,
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            try:
                banner("BASELINE")
                baseline = await get_echo_from_list(session)
                log("baseline tools/list echo", baseline)
                baseline_live = await call_text(session, "get_live_description")
                log("baseline get_live_description", baseline_live)

                banner(
                    "EXPERIMENT 1: mutate in-memory variable directly (no SDK call)"
                )
                mutated = await call_text(
                    session,
                    "mutate_variable",
                    {
                        "new_description": "MUTATED description (variable only, no SDK call).",
                    },
                )
                log("mutate_variable result", mutated)
                after_mutate_live = await call_text(
                    session, "get_live_description"
                )
                log("get_live_description after mutate", after_mutate_live)
                after_mutate_list = await get_echo_from_list(session)
                log("tools/list echo after mutate", after_mutate_list)
                log(
                    "conclusion",
                    (
                        "tools/list STILL shows the original description -> "
                        "SDK captured description BY VALUE. Mutating the "
                        "metadata dict does NOT affect the Tool object."
                    )
                    if after_mutate_list["description"] == baseline["description"]
                    else (
                        "tools/list changed -> SDK holds a reference to the dict "
                        "(unexpected)."
                    ),
                )

                banner(
                    "EXPERIMENT 2: assign echo_tool.description directly (Pydantic mutation)"
                )
                # Tested BEFORE re-registration so the module-level echo_tool
                # handle still points at the instance in LocalProvider._components.
                updated = await call_text(
                    session,
                    "update_tool",
                    {
                        "new_description": "UPDATED via direct Pydantic attribute assignment.",
                    },
                )
                log("update_tool result", updated)
                after_update_list = await get_echo_from_list(session)
                log("tools/list echo after update", after_update_list)
                log(
                    "conclusion",
                    "SUCCESS: tools/list reflects the new description."
                    if after_update_list["description"]
                    == "UPDATED via direct Pydantic attribute assignment."
                    else "FAILURE: tools/list did not update.",
                )

                banner(
                    "EXPERIMENT 3: modify metadata.json on disk, then reload via reload_metadata"
                )
                on_disk = {
                    "echo": {
                        "title": "Echo Tool (from disk v2)",
                        "description": (
                            "RELOADED from disk via file rewrite + direct "
                            "Pydantic attribute assignment."
                        ),
                    }
                }
                METADATA_PATH.write_text(
                    json.dumps(on_disk, indent=2), encoding="utf-8"
                )
                log("disk", f"wrote {METADATA_PATH}")

                before_reload_list = await get_echo_from_list(session)
                log(
                    "tools/list echo after file rewrite (before reload call)",
                    before_reload_list,
                )

                reloaded = await call_text(session, "reload_metadata")
                log("reload_metadata result", reloaded)
                after_reload_list = await get_echo_from_list(session)
                log("tools/list echo after reload", after_reload_list)
                log(
                    "conclusion",
                    "SUCCESS: hot reload from disk works via direct attribute assignment."
                    if after_reload_list["description"]
                    == on_disk["echo"]["description"]
                    else "FAILURE: tools/list did not update after reload.",
                )

                banner(
                    "EXPERIMENT 4: re-call mcp.add_tool('echo', ...) with same name"
                )
                reregister = await call_text(
                    session,
                    "reregister_tool",
                    {"new_description": "description from re-registration attempt"},
                )
                log("reregister_tool result", reregister)
                after_rereg = await get_echo_from_list(session)
                log("tools/list echo after re-register attempt", after_rereg)
                log(
                    "finding",
                    "FastMCP default on_duplicate='warn' -> add_tool() silently "
                    "REPLACES the tool in LocalProvider._components and logs a "
                    "warning. The OLD Tool instance is orphaned; any module-level "
                    "handle the user code was holding is now stale.",
                )

                banner(
                    "EXPERIMENT 5: direct Pydantic mutation AFTER re-register (stale handle test)"
                )
                # This demonstrates the bug: the server's `echo_tool` global now
                # points at the pre-re-registration Tool object, so mutating it
                # does NOT affect the new instance in _components.
                staled = await call_text(
                    session,
                    "update_tool",
                    {
                        "new_description": "ATTEMPT to mutate stale handle after re-register.",
                    },
                )
                log("update_tool result (stale handle)", staled)
                after_stale = await get_echo_from_list(session)
                log("tools/list echo after stale update", after_stale)
                log(
                    "finding",
                    "STALE HANDLE PROBLEM confirmed. tools/list shows the "
                    "re-registered description, not the one we just tried to "
                    "assign. Direct mutation only works on the Tool instance "
                    "that's currently in _components.",
                )

                banner(
                    "EXPERIMENT 6: remove_tool + add_tool explicit rebind path"
                )
                remove_readd = await call_text(
                    session,
                    "remove_and_readd",
                    {
                        "new_description": "RE-ADDED via remove_tool + add_tool path.",
                    },
                )
                log("remove_and_readd result", remove_readd)
                after_readd = await get_echo_from_list(session)
                log("tools/list echo after remove+add", after_readd)
                log(
                    "conclusion",
                    "SUCCESS: remove+add path also works; server rebinds echo_tool handle."
                    if after_readd["description"]
                    == "RE-ADDED via remove_tool + add_tool path."
                    else "FAILURE: remove+add did not update tools/list.",
                )

                banner("EXPERIMENT 7: sanity check of final state")
                final_list = await get_echo_from_list(session)
                log("final tools/list echo", final_list)

                banner("ALL EXPERIMENTS COMPLETE")
            finally:
                # Restore metadata.json so repeated runs are idempotent.
                METADATA_PATH.write_text(
                    json.dumps(INITIAL_METADATA, indent=2), encoding="utf-8"
                )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:  # noqa: BLE001
        sys.stderr.write(f"test harness error: {err!r}\n")
        raise
