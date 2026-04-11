"""Metadata-based hot reload for FastMCP servers."""

from .loader import load_metadata
from .registry import (
    ApplyResult,
    ToolHandle,
    apply_metadata,
    patch_parameters_json_schema,
)
from .reload_tool import register_reload_tool
from .schema import MetadataFile, ParameterMetadata, ToolMetadata

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "MetadataFile",
    "ParameterMetadata",
    "ToolMetadata",
    "load_metadata",
    "ApplyResult",
    "ToolHandle",
    "apply_metadata",
    "patch_parameters_json_schema",
    "register_reload_tool",
]
