import { fetchMetadata, saveMetadata } from "./metadataApi";

describe("metadataApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetchMetadata GETs /api/metadata with path query", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, tools: { echo: { description: "x" } } }),
    });

    const result = await fetchMetadata("/abs/path.json");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/metadata?path=%2Fabs%2Fpath.json"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.tools.echo.description).toBe("x");
  });

  it("fetchMetadata throws on non-ok response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });
    await expect(fetchMetadata("/missing.json")).rejects.toThrow(/not found/);
  });

  it("saveMetadata PUTs the body to /api/metadata", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    await saveMetadata("/abs/path.json", {
      version: 1,
      tools: { echo: { description: "new" } },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/metadata?path="),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("fetchMetadata sends X-MCP-Proxy-Auth header when token is provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, tools: {} }),
    });

    await fetchMetadata("/path.json", "my-token-abc");

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers["X-MCP-Proxy-Auth"]).toBe("Bearer my-token-abc");
  });

  it("fetchMetadata omits X-MCP-Proxy-Auth header when token is not provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, tools: {} }),
    });

    await fetchMetadata("/path.json");

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty("X-MCP-Proxy-Auth");
  });

  it("saveMetadata sends X-MCP-Proxy-Auth header when token is provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await saveMetadata("/path.json", { version: 1, tools: {} }, "my-token-abc");

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers["X-MCP-Proxy-Auth"]).toBe("Bearer my-token-abc");
    expect(callArgs.headers["Content-Type"]).toBe("application/json");
  });

  it("saveMetadata omits X-MCP-Proxy-Auth header when token is not provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await saveMetadata("/path.json", { version: 1, tools: {} });

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBe("application/json");
    expect(callArgs.headers).not.toHaveProperty("X-MCP-Proxy-Auth");
  });
});
