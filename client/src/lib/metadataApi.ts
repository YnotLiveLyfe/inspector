/**
 * Client for the metadata editor backend API.
 * All requests go to the Inspector proxy server at the same origin.
 */

export interface ParameterMetadata {
  description: string;
}

export interface ToolMetadata {
  description: string;
  title?: string;
  parameters?: Record<string, ParameterMetadata>;
}

export interface MetadataFile {
  version: 1;
  tools: Record<string, ToolMetadata>;
}

function buildHeaders(
  token: string | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers["X-MCP-Proxy-Auth"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchMetadata(
  path: string,
  token?: string,
): Promise<MetadataFile> {
  const url = `/api/metadata?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
  return (await res.json()) as MetadataFile;
}

export async function saveMetadata(
  path: string,
  data: MetadataFile,
  token?: string,
): Promise<void> {
  const url = `/api/metadata?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
}
