"""Metadata-based hot reload for FastMCP servers."""

from .loader import load_metadata
from .registry import ApplyResult, ToolHandle, apply_metadata
from .reload_tool import register_reload_tool
from .schema import MetadataFile, ToolMetadata

__version__ = "0.1.0"

__all__ = [
    "__version__",
    "MetadataFile",
    "ToolMetadata",
    "load_metadata",
    "ApplyResult",
    "ToolHandle",
    "apply_metadata",
    "register_reload_tool",
]
