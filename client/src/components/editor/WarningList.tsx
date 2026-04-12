import type { Warning } from "@/lib/metadataWarnings";
import { severityClasses } from "@/lib/warningClasses";
import { cn } from "@/lib/utils";

interface WarningListProps {
  warnings: Warning[];
}

/**
 * Inline list of warnings displayed inside ToolEditForm above the Save
 * button. One row per warning, severity-coded styling, keyboard accessible.
 */
export function WarningList({ warnings }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <ul
      className="flex flex-col gap-1 text-sm"
      aria-label="Description warnings"
    >
      {warnings.map((w, idx) => (
        <li
          key={`${w.toolName}:${w.paramName ?? ""}:${w.kind}:${idx}`}
          className={cn(
            "flex items-start gap-2 px-2 py-1 rounded border",
            severityClasses(w.severity === "error"),
          )}
        >
          <span aria-hidden="true">⚠</span>
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}
