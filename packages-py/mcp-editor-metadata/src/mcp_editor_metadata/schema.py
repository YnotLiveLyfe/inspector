"""Pydantic models mirroring @mcp-editor/metadata's Zod schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ParameterMetadata(BaseModel):
    """
    Per-parameter metadata. Currently only holds a description override.
    Mirrors the TS `ParameterMetadataSchema`. Phase 2a is description-only;
    future phases may add name/type/required.
    """

    model_config = ConfigDict(extra="forbid")

    description: str = Field(
        min_length=1, description="Parameter description is required"
    )


class ToolMetadata(BaseModel):
    """
    Per-tool metadata. Mirrors @mcp-editor/metadata's ToolMetadataSchema.
    Phase 2a adds the optional `parameters` field.
    """

    model_config = ConfigDict(extra="forbid")

    description: str = Field(
        min_length=1, description="Tool description is required"
    )
    title: str | None = None
    parameters: dict[str, ParameterMetadata] | None = None


class MetadataFile(BaseModel):
    """
    Top-level metadata file format.
    Phase 2a change is backward-compatible (parameters is optional),
    so version stays at 1.
    """

    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    tools: dict[str, ToolMetadata]
