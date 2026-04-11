import type { Warning } from "@/lib/metadataWarnings";
import { cn } from "@/lib/utils";

interface WarningBadgeProps {
  warnings: Warning[];
}

/**
 * Sidebar-row badge. Renders `⚠ N` when there are warnings. Red when any
 * warning has severity `error`, amber when all are advisory.
 */
export function WarningBadge({ warnings }: WarningBadgeProps) {
  if (warnings.length === 0) return null;

  const hasError = warnings.some((w) => w.severity === "error");

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border",
        hasError
          ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700"
          : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700",
      )}
      aria-label={
        hasError
          ? `${warnings.length} warnings, includes errors`
          : `${warnings.length} suggestions`
      }
    >
      ⚠ {warnings.length}
    </span>
  );
}
