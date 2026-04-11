"""Pydantic models mirroring @mcp-editor/metadata's Zod schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ToolMetadata(BaseModel):
    """Per-tool metadata. Mirrors @mcp-editor/metadata's ToolMetadataSchema."""

    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, description="Tool description is required")
    title: str | None = None


class MetadataFile(BaseModel):
    """Top-level metadata file format. Mirrors @mcp-editor/metadata's MetadataFileSchema."""

    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    tools: dict[str, ToolMetadata]
