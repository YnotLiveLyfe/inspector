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
});
