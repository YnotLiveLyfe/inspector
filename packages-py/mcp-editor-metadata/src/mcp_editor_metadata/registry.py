"""Apply metadata to tool handles via direct Pydantic attribute assignment."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from .schema import MetadataFile


@runtime_checkable
class ToolHandle(Protocol):
    """
    Structural protocol for any object with mutable description/title attributes.

    FastMCP's FunctionTool satisfies this naturally because its description and
    title are Pydantic attributes on a non-frozen model. Tests can use dataclasses
    or SimpleNamespace to satisfy it without importing FastMCP.
    """

    description: str | None
    title: str | None


@dataclass
class ApplyResult:
    """Diff describing what apply_metadata did."""

    updated: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def apply_metadata(
    handles: dict[str, ToolHandle],
    metadata: MetadataFile,
) -> ApplyResult:
    """
    Apply a metadata file to a dict of tool handles.

    For each tool in ``metadata.tools``:
      - If the handle's description and title already match, record as skipped.
      - If the handle is missing from ``handles``, record as missing.
      - Otherwise mutate the handle via direct attribute assignment and record
        as updated.

    The caller is responsible for sending ``tools/list_changed`` via the
    FastMCP Context after this returns (the notification is not automatic in
    Python).
    """
    result = ApplyResult()

    for tool_name, tool_meta in metadata.tools.items():
        handle = handles.get(tool_name)
        if handle is None:
            result.missing.append(tool_name)
            continue

        description_matches = handle.description == tool_meta.description
        no_title_update = tool_meta.title is None

        if description_matches and no_title_update:
            result.skipped.append(tool_name)
            continue

        handle.description = tool_meta.description
        if tool_meta.title is not None:
            handle.title = tool_meta.title
        result.updated.append(tool_name)

    return result
