import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  loadRecentPaths,
  addRecentPath,
  RECENT_PATHS_KEY,
  MAX_RECENT_PATHS,
} from "../recentMetadataPaths";

describe("recentMetadataPaths", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadRecentPaths", () => {
    it("returns an empty array when localStorage is empty", () => {
      expect(loadRecentPaths()).toEqual([]);
    });

    it("returns the stored array when localStorage has valid JSON", () => {
      localStorage.setItem(
        RECENT_PATHS_KEY,
        JSON.stringify(["/a.json", "/b.json"]),
      );
      expect(loadRecentPaths()).toEqual(["/a.json", "/b.json"]);
    });

    it("returns an empty array when localStorage has invalid JSON", () => {
      localStorage.setItem(RECENT_PATHS_KEY, "{ not json");
      expect(loadRecentPaths()).toEqual([]);
    });

    it("filters out non-string entries", () => {
      localStorage.setItem(
        RECENT_PATHS_KEY,
        JSON.stringify(["/a.json", 42, null, "/b.json"]),
      );
      expect(loadRecentPaths()).toEqual(["/a.json", "/b.json"]);
    });
  });

  describe("addRecentPath", () => {
    it("adds a path to an empty list", () => {
      const result = addRecentPath("/foo.json");
      expect(result).toEqual(["/foo.json"]);
      expect(loadRecentPaths()).toEqual(["/foo.json"]);
    });

    it("prepends new paths (move-to-front)", () => {
      addRecentPath("/first.json");
      addRecentPath("/second.json");
      addRecentPath("/third.json");
      expect(loadRecentPaths()).toEqual([
        "/third.json",
        "/second.json",
        "/first.json",
      ]);
    });

    it("deduplicates — adding an existing path moves it to the front", () => {
      addRecentPath("/a.json");
      addRecentPath("/b.json");
      addRecentPath("/c.json");
      addRecentPath("/a.json"); // re-add
      expect(loadRecentPaths()).toEqual(["/a.json", "/c.json", "/b.json"]);
    });

    it("caps the list at MAX_RECENT_PATHS most-recent entries", () => {
      for (let i = 1; i <= MAX_RECENT_PATHS + 3; i++) {
        addRecentPath(`/file-${i}.json`);
      }
      const result = loadRecentPaths();
      expect(result).toHaveLength(MAX_RECENT_PATHS);
      expect(result[0]).toBe(`/file-${MAX_RECENT_PATHS + 3}.json`);
    });
  });
});
