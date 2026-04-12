import type { Warning } from "@/lib/metadataWarnings";
import { severityClasses } from "@/lib/warningClasses";
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
        severityClasses(hasError),
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
