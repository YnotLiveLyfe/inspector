"""Tests for the metadata schema module."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from mcp_editor_metadata.schema import MetadataFile, ToolMetadata


def test_valid_tool_metadata_parses():
    meta = ToolMetadata(description="A tool that does a thing.")
    assert meta.description == "A tool that does a thing."
    assert meta.title is None


def test_tool_metadata_with_title():
    meta = ToolMetadata(description="A thing", title="The Thing")
    assert meta.title == "The Thing"


def test_tool_metadata_empty_description_raises():
    with pytest.raises(ValidationError):
        ToolMetadata(description="")


def test_tool_metadata_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ToolMetadata(description="ok", unknown_field="nope")  # type: ignore[call-arg]


def test_valid_metadata_file_parses():
    raw = {
        "version": 1,
        "tools": {
            "get_weather": {"description": "Get the weather for a city."},
            "convert_temp": {
                "description": "Convert units.",
                "title": "Convert Temperature",
            },
        },
    }
    meta_file = MetadataFile.model_validate(raw)
    assert meta_file.version == 1
    assert "get_weather" in meta_file.tools
    assert meta_file.tools["convert_temp"].title == "Convert Temperature"


def test_metadata_file_missing_version_raises():
    with pytest.raises(ValidationError):
        MetadataFile.model_validate({"tools": {}})


def test_metadata_file_wrong_version_raises():
    with pytest.raises(ValidationError):
        MetadataFile.model_validate({"version": 2, "tools": {}})


def test_metadata_file_rejects_extra_top_level_fields():
    with pytest.raises(ValidationError):
        MetadataFile.model_validate({"version": 1, "tools": {}, "extra": "nope"})
