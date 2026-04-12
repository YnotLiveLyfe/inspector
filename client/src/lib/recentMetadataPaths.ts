/**
 * localStorage-backed store for the most-recently-used metadata paths.
 *
 * Only paths that successfully load via fetchMetadata should be recorded.
 * Move-to-front semantics keep the user's active working set at the top.
 */

export const RECENT_PATHS_KEY = "mcp-editor.recent-metadata-paths";
export const MAX_RECENT_PATHS = 5;

export function loadRecentPaths(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PATHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

export function addRecentPath(path: string): string[] {
  const current = loadRecentPaths();
  const filtered = current.filter((p) => p !== path);
  const updated = [path, ...filtered].slice(0, MAX_RECENT_PATHS);
  try {
    localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(updated));
  } catch {
    // localStorage can throw on quota exceeded — ignore.
  }
  return updated;
}
