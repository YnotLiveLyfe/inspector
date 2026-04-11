"""Tests for the metadata loader."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from mcp_editor_metadata.loader import load_metadata


def test_load_valid_metadata(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "version": 1,
                "tools": {
                    "echo": {"description": "An echo tool."},
                },
            }
        ),
        encoding="utf-8",
    )

    result = load_metadata(metadata_path)

    assert result.version == 1
    assert result.tools["echo"].description == "An echo tool."


def test_load_accepts_string_path(tmp_path: Path):
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(
        json.dumps({"version": 1, "tools": {}}), encoding="utf-8"
    )

    result = load_metadata(str(metadata_path))

    assert result.version == 1


def test_load_missing_file_raises_file_not_found(tmp_path: Path):
    missing = tmp_path / "does-not-exist.json"

    with pytest.raises(FileNotFoundError, match="Metadata file not found"):
        load_metadata(missing)


def test_load_invalid_json_raises_value_error(tmp_path: Path):
    bad = tmp_path / "bad.json"
    bad.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(ValueError, match="Failed to parse metadata file"):
        load_metadata(bad)


def test_load_schema_violation_raises_value_error(tmp_path: Path):
    invalid = tmp_path / "invalid.json"
    invalid.write_text(
        json.dumps({"version": 2, "tools": {}}), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="failed validation"):
        load_metadata(invalid)
