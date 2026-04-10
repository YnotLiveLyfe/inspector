/**
 * Client for the metadata editor backend API.
 * All requests go to the Inspector proxy server at the same origin.
 */

export interface ToolMetadata {
  description: string;
  title?: string;
}

export interface MetadataFile {
  version: 1;
  tools: Record<string, ToolMetadata>;
}

export async function fetchMetadata(path: string): Promise<MetadataFile> {
  const url = `/api/metadata?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
  return (await res.json()) as MetadataFile;
}

export async function saveMetadata(
  path: string,
  data: MetadataFile,
): Promise<void> {
  const url = `/api/metadata?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
}
