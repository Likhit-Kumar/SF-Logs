import { analyzeLog } from "../../src/tools/analyzeLog.js";
import { getLogContent } from "../../src/tools/getLogContent.js";
import { searchLogs } from "../../src/tools/searchLogs.js";
import { fileExists } from "../../src/utils/fileSystem.js";

// This test runs against real downloaded logs in sf-logs/
// Skip if no logs are available
const REAL_LOG = "./sf-logs/07LgK00000IxLpNUAV.log";

describe("real log analysis integration", () => {
  let logAvailable: boolean;

  beforeAll(async () => {
    logAvailable = await fileExists(REAL_LOG);
  });

  it("analyze_log detects exceptions in real QueueableHandler log", async () => {
    if (!logAvailable) return;

    const result = await analyzeLog({ filePath: REAL_LOG });

    expect(result.summary.healthRating).not.toBe("HEALTHY");
    expect(result.counts.exceptions).toBeGreaterThanOrEqual(1);
    expect(result.counts.callouts).toBeGreaterThan(0);
    expect(result.counts.soqlQueries).toBeGreaterThan(0);
    expect(result.criticalIssues).toBeDefined();
    expect(result.criticalIssues!.length).toBeGreaterThan(0);
  });

  it("get_log_content extracts ToolingApiException from real log", async () => {
    if (!logAvailable) return;

    const result = await getLogContent({ filePath: REAL_LOG, section: "exceptions" });

    expect(result.totalEntries).toBeGreaterThanOrEqual(1);
    const entries = result.entries as Array<{ exceptionType: string; handled: boolean; message: string }>;
    const toolingError = entries.find((e) => e.exceptionType.includes("ToolingApiException"));
    expect(toolingError).toBeDefined();
    expect(toolingError!.handled).toBe(true);
    expect(toolingError!.message).toContain("400");
  });

  it("get_log_content extracts callouts with full URLs from real log", async () => {
    if (!logAvailable) return;

    const result = await getLogContent({ filePath: REAL_LOG, section: "callouts" });

    expect(result.totalEntries).toBeGreaterThan(0);
    const entries = result.entries as Array<{ request: { endpoint: string }; response: { statusCode: number } }>;

    // Endpoints should contain full query params including encoded commas
    const toolingCallout = entries.find((e) => e.request.endpoint.includes("tooling/query"));
    expect(toolingCallout).toBeDefined();
    expect(toolingCallout!.request.endpoint).toContain("%2C");
  });

  it("get_log_content extracts debug messages from real log", async () => {
    if (!logAvailable) return;

    const result = await getLogContent({ filePath: REAL_LOG, section: "debug_messages" });

    expect(result.totalEntries).toBeGreaterThanOrEqual(1);
  });

  it("search_logs finds exception pattern across downloaded logs", async () => {
    if (!logAvailable) return;

    const result = await searchLogs({
      pattern: "EXCEPTION_THROWN",
      directory: "./sf-logs/",
      maxResults: 10,
    });

    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.filesWithMatches).toBeGreaterThan(0);
  });

  it("get_log_content governor section returns valid structure", async () => {
    if (!logAvailable) return;

    const result = await getLogContent({ filePath: REAL_LOG, section: "governor" });

    // Some logs may not have LIMIT_USAGE_FOR_NS blocks
    expect(result.section).toBe("governor");
    expect(typeof result.totalEntries).toBe("number");

    if (result.totalEntries > 0) {
      const entries = result.entries as Array<Record<string, { name: string; used: number; max: number; percent: number; status: string }>>;
      const limits = entries[0];
      const firstKey = Object.keys(limits)[0];
      const firstLimit = limits[firstKey];
      expect(firstLimit).toHaveProperty("name");
      expect(firstLimit).toHaveProperty("used");
      expect(firstLimit).toHaveProperty("max");
      expect(firstLimit).toHaveProperty("percent");
      expect(firstLimit).toHaveProperty("status");
    }
  });
});
