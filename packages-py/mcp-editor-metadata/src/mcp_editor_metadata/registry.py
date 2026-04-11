"""Apply metadata to tool handles via direct Pydantic attribute assignment."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

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


def patch_parameters_json_schema(
    parameters_schema: dict[str, Any],
    parameter_descriptions: dict[str, str] | None,
) -> dict[str, Any]:
    """
    Return a NEW JSON Schema dict with parameter description fields patched.

    Policy:
      - Always returns a deep copy; never mutates the input.
      - If parameter_descriptions is None or empty, returns the deep copy
        unchanged (predictable: callers can trust the return value is
        independent of the input in all cases).
      - Only patches parameters whose name exists in BOTH `parameter_descriptions`
        AND `parameters_schema['properties']`. Unknown names are silently
        ignored (the `missing` warning is raised at the apply_metadata level).
      - A schema with no `properties` key (parameterless tool) is returned
        unchanged after deep copy.

    The return value is safe to assign directly to a FastMCP FunctionTool's
    `.parameters` attribute — FastMCP stores parameters as a JSON Schema dict
    and reads it live on every `tools/list`.
    """
    result = copy.deepcopy(parameters_schema)
    if not parameter_descriptions:
        return result
    properties = result.get("properties")
    if not isinstance(properties, dict):
        return result
    for param_name, new_description in parameter_descriptions.items():
        if param_name in properties and isinstance(properties[param_name], dict):
            properties[param_name]["description"] = new_description
    return result


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
