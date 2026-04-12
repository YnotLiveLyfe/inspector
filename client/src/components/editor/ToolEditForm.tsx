import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  saveMetadata,
  type MetadataFile,
  type ToolMetadata,
} from "@/lib/metadataApi";
import {
  computeWarnings,
  isBlockingInContext,
  type Draft,
} from "@/lib/metadataWarnings";
import { WarningList } from "./WarningList";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface ToolEditFormProps {
  /**
   * The full Tool object as returned by `listTools()`. ToolEditForm derives
   * `name`, `initialDescription`, and the parameter schema from this.
   */
  tool: Tool;
  /** Auth token forwarded from the MCP proxy config. Undefined when auth is disabled. */
  authToken?: string;
  currentMetadata: MetadataFile;
  metadataPath: string;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}

type SchemaProperties = Record<string, { description?: string }>;

/**
 * Build the initial per-parameter description map.
 *
 * Only initializes entries where metadata already has an override. Params
 * without a saved override are NOT added to the map — leaving them
 * `undefined` lets Phase 2b's `computeWarnings` fall through to the server-
 * effective description (from `listTools()`) instead of treating an empty
 * string as a literal missing value. The textarea's `value={value ?? ""}`
 * still renders empty for those params (showing the source-doc placeholder).
 */
function buildInitialParamDescriptions(
  savedParameters: Record<string, { description?: string }> | undefined,
): Record<string, string> {
  if (!savedParameters) return {};
  const result: Record<string, string> = {};
  for (const paramName of Object.keys(savedParameters)) {
    const desc = savedParameters[paramName]?.description;
    if (typeof desc === "string") {
      result[paramName] = desc;
    }
  }
  return result;
}

export function ToolEditForm({
  tool,
  authToken,
  currentMetadata,
  metadataPath,
  onSaved,
  onCancel,
}: ToolEditFormProps) {
  const toolName = tool.name;
  const initialDescription = tool.description ?? "";
  const toolInputSchema = tool.inputSchema;

  const [description, setDescription] = useState(initialDescription);
  const [paramDescriptions, setParamDescriptions] = useState<
    Record<string, string>
  >(() =>
    buildInitialParamDescriptions(currentMetadata.tools[toolName]?.parameters),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const properties = (toolInputSchema?.properties as SchemaProperties) ?? {};
  const paramNames = Object.keys(properties);

  // -- Phase 2b: live warnings derived from draft state ----------------------
  const draftWarnings = useMemo(() => {
    const draft: Draft = {
      toolName,
      description,
      parameters: paramDescriptions,
    };
    return computeWarnings([tool], currentMetadata, draft);
  }, [tool, currentMetadata, toolName, description, paramDescriptions]);

  const blockingErrors = useMemo(
    () => draftWarnings.filter((w) => isBlockingInContext(w, currentMetadata)),
    [draftWarnings, currentMetadata],
  );
  const hasBlockingError = blockingErrors.length > 0;
  // --------------------------------------------------------------------------

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

      await saveMetadata(metadataPath, updated, authToken);
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
          aria-label="Description"
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

      <WarningList warnings={draftWarnings} />

      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || hasBlockingError}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
        {hasBlockingError && (
          <div className="text-xs text-destructive">
            Fix missing descriptions to save.
          </div>
        )}
      </div>
    </div>
  );
}
