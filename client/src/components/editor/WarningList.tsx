import type { Warning } from "@/lib/metadataWarnings";
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
            w.severity === "error"
              ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700"
              : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700",
          )}
        >
          <span aria-hidden="true">⚠</span>
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}
