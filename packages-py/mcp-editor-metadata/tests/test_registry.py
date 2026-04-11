"""Tests for the registry module."""

from __future__ import annotations

from dataclasses import dataclass

from mcp_editor_metadata.registry import apply_metadata
from mcp_editor_metadata.schema import MetadataFile


@dataclass
class FakeHandle:
    """Minimal object satisfying the ToolHandle protocol for tests."""

    description: str | None = None
    title: str | None = None


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
