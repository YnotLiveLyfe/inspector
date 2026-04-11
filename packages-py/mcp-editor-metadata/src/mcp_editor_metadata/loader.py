"""Load and validate metadata.json from disk."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from .schema import MetadataFile


def load_metadata(path: str | Path) -> MetadataFile:
    """
    Load and validate a metadata.json file from disk.

    Raises:
        FileNotFoundError: if the file does not exist.
        ValueError: if the file is not valid JSON or fails schema validation.
    """
    p = Path(path)

    try:
        raw = p.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"Metadata file not found: {p}")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse metadata file {p}: {e.msg}") from e

    try:
        return MetadataFile.model_validate(parsed)
    except ValidationError as e:
        first = e.errors()[0]
        loc = ".".join(str(x) for x in first["loc"])
        raise ValueError(
            f"Metadata file {p} failed validation: {loc} — {first['msg']}"
        ) from e
