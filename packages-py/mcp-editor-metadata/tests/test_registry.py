"""Tests for the registry module."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from mcp_editor_metadata.registry import apply_metadata, ToolHandle
from mcp_editor_metadata.schema import MetadataFile


@dataclass
class FakeHandle:
    """Minimal object satisfying the ToolHandle protocol for tests.

    Phase 2a: parameters field added to match the extended Protocol. Defaults
    to an empty-properties object schema so existing Phase 1.5 tests that
    don't exercise parameters can still instantiate FakeHandle() without args.
    """

    description: str | None = None
    title: str | None = None
    parameters: dict[str, Any] = field(
        default_factory=lambda: {"type": "object", "properties": {}}
    )


def _build_metadata(tools: dict[str, dict]) -> MetadataFile:
    return MetadataFile.model_validate({"version": 1, "tools": tools})


def test_apply_metadata_updates_changed_description():
    handles = {"echo": FakeHandle(description="old desc")}
    metadata = _build_metadata({"echo": {"description": "new desc"}})

    result = apply_metadata(handles, metadata)

    assert result.updated == ["echo"]
    assert result.skipped == []
    assert result.missing == []
    assert handles["echo"].description == "new desc"


def test_apply_metadata_skips_matching_description():
    handles = {"echo": FakeHandle(description="same desc")}
    metadata = _build_metadata({"echo": {"description": "same desc"}})

    result = apply_metadata(handles, metadata)

    assert result.updated == []
    assert result.skipped == ["echo"]
    assert result.missing == []


def test_apply_metadata_updates_title_when_present():
    handles = {"echo": FakeHandle(description="d", title="Old")}
    metadata = _build_metadata(
        {"echo": {"description": "d", "title": "New"}}
    )

    result = apply_metadata(handles, metadata)

    # Title change counts as an update even if description matches.
    assert result.updated == ["echo"]
    assert handles["echo"].title == "New"


def test_apply_metadata_records_missing_tool():
    handles: dict[str, FakeHandle] = {}
    metadata = _build_metadata({"ghost": {"description": "gone"}})

    result = apply_metadata(handles, metadata)

    assert result.updated == []
    assert result.skipped == []
    assert result.missing == ["ghost"]


def test_apply_metadata_ignores_extra_handles_not_in_metadata():
    handles = {
        "a": FakeHandle(description="a-old"),
        "b": FakeHandle(description="b-old"),
    }
    metadata = _build_metadata({"a": {"description": "a-new"}})

    result = apply_metadata(handles, metadata)

    assert result.updated == ["a"]
    assert handles["a"].description == "a-new"
    assert handles["b"].description == "b-old"  # untouched


import copy

from mcp_editor_metadata.registry import patch_parameters_json_schema


class TestPatchParametersJsonSchema:
    def test_returns_deep_copy_when_descriptions_is_none(self) -> None:
        base = {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        }
        result = patch_parameters_json_schema(base, None)
        assert result == base
        # Must be a deep copy, not the same object.
        result["properties"]["city"]["type"] = "number"
        assert base["properties"]["city"]["type"] == "string"

    def test_returns_deep_copy_when_descriptions_is_empty(self) -> None:
        base = {"type": "object", "properties": {"city": {"type": "string"}}}
        result = patch_parameters_json_schema(base, {})
        assert result == base
        # Deep copy.
        assert result is not base
        assert result["properties"] is not base["properties"]

    def test_patches_description_on_existing_property(self) -> None:
        base = {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "units": {"type": "string", "enum": ["C", "F"]},
            },
            "required": ["city"],
        }
        result = patch_parameters_json_schema(
            base, {"city": "The city to look up"}
        )
        assert result["properties"]["city"]["description"] == "The city to look up"
        # `units` untouched.
        assert "description" not in result["properties"]["units"]
        # Original not mutated.
        assert "description" not in base["properties"]["city"]

    def test_ignores_parameters_not_in_schema(self) -> None:
        base = {
            "type": "object",
            "properties": {"city": {"type": "string"}},
        }
        result = patch_parameters_json_schema(
            base, {"city": "ok", "nonexistent": "ignored"}
        )
        assert result["properties"]["city"]["description"] == "ok"
        assert "nonexistent" not in result["properties"]

    def test_handles_schema_without_properties(self) -> None:
        # Edge case: parameterless tool has no `properties` key.
        base = {"type": "object"}
        result = patch_parameters_json_schema(base, {"x": "ignored"})
        assert result == {"type": "object"}

    def test_preserves_existing_description_on_unmentioned_property(self) -> None:
        base = {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "original"},
            },
        }
        result = patch_parameters_json_schema(base, {"other": "new"})
        # `city` was NOT in descriptions; its original description survives.
        assert result["properties"]["city"]["description"] == "original"


# New in Phase 2a Task 7: tests for apply_metadata patching parameters.
# Uses the shared FakeHandle from Step 1 (already has a parameters field now).


class TestApplyMetadataWithParameters:
    def test_patches_parameters_when_metadata_has_them(self) -> None:
        handle = FakeHandle(
            description="old",
            parameters={
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        )
        handles: dict[str, ToolHandle] = {"get_weather": handle}
        metadata = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {
                    "get_weather": {
                        "description": "new",
                        "parameters": {
                            "city": {"description": "City name"}
                        },
                    }
                },
            }
        )

        result = apply_metadata(handles, metadata)

        assert result.updated == ["get_weather"]
        assert handle.description == "new"
        assert (
            handle.parameters["properties"]["city"]["description"]
            == "City name"
        )

    def test_leaves_parameters_untouched_when_metadata_has_no_parameters(
        self,
    ) -> None:
        handle = FakeHandle(
            description="old",
            parameters={
                "type": "object",
                "properties": {"city": {"type": "string"}},
            },
        )
        original_params = copy.deepcopy(handle.parameters)
        handles: dict[str, ToolHandle] = {"get_weather": handle}
        metadata = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {"get_weather": {"description": "new"}},
            }
        )

        result = apply_metadata(handles, metadata)

        assert result.updated == ["get_weather"]
        assert handle.description == "new"
        assert handle.parameters == original_params

    def test_skipped_logic_respects_parameter_changes(self) -> None:
        # Same description AND no parameters block → skipped.
        handle = FakeHandle(
            description="same",
            parameters={"type": "object", "properties": {"x": {}}},
        )
        handles: dict[str, ToolHandle] = {"t": handle}
        metadata = MetadataFile.model_validate(
            {"version": 1, "tools": {"t": {"description": "same"}}}
        )
        result = apply_metadata(handles, metadata)
        assert result.skipped == ["t"]
        assert result.updated == []

    def test_parameters_block_forces_update_even_if_description_matches(
        self,
    ) -> None:
        # Same description BUT parameters block is present → always apply.
        handle = FakeHandle(
            description="same",
            parameters={"type": "object", "properties": {"x": {}}},
        )
        handles: dict[str, ToolHandle] = {"t": handle}
        metadata = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {
                    "t": {
                        "description": "same",
                        "parameters": {"x": {"description": "new x"}},
                    }
                },
            }
        )
        result = apply_metadata(handles, metadata)
        assert result.updated == ["t"]
        assert handle.parameters["properties"]["x"]["description"] == "new x"

    def test_missing_handle_still_reported(self) -> None:
        handles: dict[str, ToolHandle] = {}
        metadata = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {"ghost": {"description": "gone"}},
            }
        )
        result = apply_metadata(handles, metadata)
        assert result.missing == ["ghost"]
        assert result.updated == []
