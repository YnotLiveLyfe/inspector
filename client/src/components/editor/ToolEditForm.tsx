import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  saveMetadata,
  type MetadataFile,
  type ToolMetadata,
} from "@/lib/metadataApi";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface ToolEditFormProps {
  toolName: string;
  initialDescription: string;
  /**
   * The tool's input schema, as surfaced by `listTools()`. Used ONLY to know
   * which parameters exist so the form can render a textarea per parameter.
   * The form never edits the schema itself — only parameter description text.
   */
  toolInputSchema: Tool["inputSchema"];
  currentMetadata: MetadataFile;
  metadataPath: string;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}

type SchemaProperties = Record<string, { description?: string }>;

/**
 * Build the initial per-parameter description map.
 *
 * Priority order for each param:
 *   1. metadata.json value (if present) — the user's previous override
 *   2. Empty string (placeholder will show the source-code description)
 *
 * The inputSchema's own `description` field is intentionally NOT used as the
 * seed because surfacing it would confuse users about what's being edited —
 * the placeholder text handles that cue instead.
 */
function buildInitialParamDescriptions(
  toolName: string,
  inputSchema: Tool["inputSchema"],
  metadata: MetadataFile,
): Record<string, string> {
  const properties = (inputSchema?.properties as SchemaProperties) ?? {};
  const existing = metadata.tools[toolName]?.parameters ?? {};
  const result: Record<string, string> = {};
  for (const paramName of Object.keys(properties)) {
    result[paramName] = existing[paramName]?.description ?? "";
  }
  return result;
}

export function ToolEditForm({
  toolName,
  initialDescription,
  toolInputSchema,
  currentMetadata,
  metadataPath,
  onSaved,
  onCancel,
}: ToolEditFormProps) {
  const [description, setDescription] = useState(initialDescription);
  const [paramDescriptions, setParamDescriptions] = useState<
    Record<string, string>
  >(() =>
    buildInitialParamDescriptions(toolName, toolInputSchema, currentMetadata),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const properties = (toolInputSchema?.properties as SchemaProperties) ?? {};
  const paramNames = Object.keys(properties);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Build a parameters block containing ONLY params with non-empty
      // descriptions. Empty fields mean "no override" — the param falls back
      // to its source-code default on reload.
      const parametersBlock: Record<string, { description: string }> = {};
      for (const [name, desc] of Object.entries(paramDescriptions)) {
        const trimmed = desc.trim();
        if (trimmed.length > 0) {
          parametersBlock[name] = { description: trimmed };
        }
      }

      const existingTool: ToolMetadata = currentMetadata.tools[toolName] ?? {
        description: "",
      };
      const newTool: ToolMetadata = {
        ...existingTool,
        description,
      };
      if (Object.keys(parametersBlock).length > 0) {
        newTool.parameters = parametersBlock;
      } else {
        // No param overrides → omit the key entirely for cleaner JSON.
        delete newTool.parameters;
      }

      const updated: MetadataFile = {
        ...currentMetadata,
        tools: {
          ...currentMetadata.tools,
          [toolName]: newTool,
        },
      };

      await saveMetadata(metadataPath, updated);
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="tool-edit-description" className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id="tool-edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          disabled={saving}
          placeholder="Describe when the AI should use this tool..."
        />
        <div className="text-xs text-muted-foreground">
          {description.length} chars
        </div>
      </div>

      {paramNames.length > 0 && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="text-sm font-medium">Parameters</div>
          {paramNames.map((paramName) => {
            const sourceDoc = properties[paramName]?.description ?? "";
            const value = paramDescriptions[paramName] ?? "";
            return (
              <div key={paramName} className="flex flex-col gap-1">
                <label
                  htmlFor={`tool-edit-param-${paramName}`}
                  className="text-xs font-medium"
                >
                  Parameter: <code>{paramName}</code>
                </label>
                <Textarea
                  id={`tool-edit-param-${paramName}`}
                  aria-label={`Parameter: ${paramName}`}
                  value={value}
                  onChange={(e) =>
                    setParamDescriptions((prev) => ({
                      ...prev,
                      [paramName]: e.target.value,
                    }))
                  }
                  rows={2}
                  disabled={saving}
                  placeholder={
                    sourceDoc
                      ? `Current: ${sourceDoc}`
                      : "Describe this parameter..."
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || description.trim().length === 0}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
