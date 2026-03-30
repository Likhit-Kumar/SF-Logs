import { searchLogs } from "../../src/tools/searchLogs.js";
import * as path from "node:path";

const fixturesDir = path.resolve("test/fixtures");

describe("searchLogs", () => {
  it("finds matching lines in log files", async () => {
    const result = await searchLogs({
      pattern: "SOQL_EXECUTE",
      directory: fixturesDir,
    });
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.filesSearched).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].file).toContain(".log");
  });

  it("returns context lines around matches", async () => {
    const result = await searchLogs({
      pattern: "SOQL_EXECUTE_BEGIN",
      directory: fixturesDir,
      contextLines: 3,
    });
    if (result.totalMatches > 0) {
      // Context should have up to 7 lines (3 before + match + 3 after)
      expect(result.matches[0].context.length).toBeGreaterThanOrEqual(1);
      expect(result.matches[0].context.length).toBeLessThanOrEqual(7);
    }
  });

  it("respects maxResults limit", async () => {
    const result = await searchLogs({
      pattern: "\\|",
      directory: fixturesDir,
      maxResults: 3,
    });
    expect(result.totalMatches).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
  });

  it("supports case-insensitive search by default", async () => {
    const resultLower = await searchLogs({
      pattern: "soql_execute",
      directory: fixturesDir,
    });
    const resultUpper = await searchLogs({
      pattern: "SOQL_EXECUTE",
      directory: fixturesDir,
    });
    expect(resultLower.totalMatches).toBe(resultUpper.totalMatches);
  });

  it("returns empty results for non-matching pattern", async () => {
    const result = await searchLogs({
      pattern: "ZZZZZ_NONEXISTENT_PATTERN_ZZZZZ",
      directory: fixturesDir,
    });
    expect(result.totalMatches).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("handles empty directory gracefully", async () => {
    const result = await searchLogs({
      pattern: "test",
      directory: "/tmp/nonexistent-log-dir-12345",
    });
    expect(result.totalMatches).toBe(0);
    expect(result.filesSearched).toBe(0);
  });

  it("handles invalid regex by falling back to literal search", async () => {
    const result = await searchLogs({
      pattern: "[invalid(regex",
      directory: fixturesDir,
    });
    // Should not throw, falls back to escaped literal
    expect(result).toBeDefined();
    expect(result.filesSearched).toBeGreaterThanOrEqual(1);
  });
});
