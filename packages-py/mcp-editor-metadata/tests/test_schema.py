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


class TestParameterMetadata:
    def test_accepts_valid_description(self) -> None:
        from mcp_editor_metadata.schema import ParameterMetadata
        pm = ParameterMetadata.model_validate({"description": "City name"})
        assert pm.description == "City name"

    def test_rejects_empty_description(self) -> None:
        from mcp_editor_metadata.schema import ParameterMetadata
        with pytest.raises(ValidationError):
            ParameterMetadata.model_validate({"description": ""})

    def test_rejects_missing_description(self) -> None:
        from mcp_editor_metadata.schema import ParameterMetadata
        with pytest.raises(ValidationError):
            ParameterMetadata.model_validate({})

    def test_rejects_extra_keys(self) -> None:
        # Pydantic `extra="forbid"` means unknown keys fail.
        from mcp_editor_metadata.schema import ParameterMetadata
        with pytest.raises(ValidationError):
            ParameterMetadata.model_validate(
                {"description": "ok", "type": "string"}
            )


class TestToolMetadataParameters:
    def test_accepts_tool_with_parameters(self) -> None:
        tm = ToolMetadata.model_validate(
            {
                "description": "Get weather",
                "parameters": {"city": {"description": "City name"}},
            }
        )
        assert tm.parameters is not None
        assert tm.parameters["city"].description == "City name"

    def test_accepts_tool_without_parameters_backward_compat(self) -> None:
        tm = ToolMetadata.model_validate({"description": "Get weather"})
        assert tm.parameters is None

    def test_rejects_empty_param_description(self) -> None:
        with pytest.raises(ValidationError):
            ToolMetadata.model_validate(
                {
                    "description": "Get weather",
                    "parameters": {"city": {"description": ""}},
                }
            )


class TestMetadataFileParameters:
    def test_accepts_full_file_with_parameters(self) -> None:
        mf = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {
                    "get_weather": {
                        "description": "Get the weather",
                        "parameters": {
                            "city": {"description": "City name"}
                        },
                    }
                },
            }
        )
        tool = mf.tools["get_weather"]
        assert tool.parameters is not None
        assert "city" in tool.parameters

    def test_still_accepts_phase1_file(self) -> None:
        mf = MetadataFile.model_validate(
            {
                "version": 1,
                "tools": {"echo": {"description": "Echo back input"}},
            }
        )
        assert mf.tools["echo"].parameters is None
