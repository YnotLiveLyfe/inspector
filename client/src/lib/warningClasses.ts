/**
 * Shared Tailwind class strings for Phase 2b warning severity levels.
 *
 * severityClasses: full bg/border/text block used by WarningBadge and
 * WarningList list items.
 *
 * severityTextClasses: text-color only, used by the lightweight ToolsTab
 * summary row where bg/border would be visual overkill.
 *
 * Both keep the red/amber color scheme consistent across all three surfaces.
 */

const ERROR_CLASSES =
  "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700";

const ADVISORY_CLASSES =
  "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700";

const ERROR_TEXT_CLASSES = "text-red-600 dark:text-red-400";
const ADVISORY_TEXT_CLASSES = "text-amber-600 dark:text-amber-400";

export function severityClasses(hasError: boolean): string {
  return hasError ? ERROR_CLASSES : ADVISORY_CLASSES;
}

export function severityTextClasses(hasError: boolean): string {
  return hasError ? ERROR_TEXT_CLASSES : ADVISORY_TEXT_CLASSES;
}
