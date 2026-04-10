import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveMetadata, type MetadataFile } from "@/lib/metadataApi";

interface ToolEditFormProps {
  toolName: string;
  initialDescription: string;
  currentMetadata: MetadataFile;
  metadataPath: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function ToolEditForm({
  toolName,
  initialDescription,
  currentMetadata,
  metadataPath,
  onSaved,
  onCancel,
}: ToolEditFormProps) {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated: MetadataFile = {
        ...currentMetadata,
        tools: {
          ...currentMetadata.tools,
          [toolName]: {
            ...currentMetadata.tools[toolName],
            description,
          },
        },
      };
      await saveMetadata(metadataPath, updated);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Description</label>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        disabled={saving}
        placeholder="Describe when the AI should use this tool..."
      />
      <div className="text-xs text-muted-foreground">
        {description.length} chars
      </div>
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
