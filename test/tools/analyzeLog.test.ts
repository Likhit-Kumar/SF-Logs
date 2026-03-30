import { analyzeLog } from "../../src/tools/analyzeLog.js";
import * as path from "node:path";

const sampleLog = path.resolve("test/fixtures/sampleLog.log");

describe("analyzeLog", () => {
  it("returns a health analysis with all sections", async () => {
    const result = await analyzeLog({ filePath: sampleLog });

    expect(result.filePath).toBe(sampleLog);
    expect(result.summary).toBeDefined();
    expect(result.summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.healthScore).toBeLessThanOrEqual(100);
    expect(["HEALTHY", "WARNING", "DEGRADED", "CRITICAL"]).toContain(result.summary.healthRating);
    expect(result.summary.lineCount).toBeGreaterThan(0);
    expect(result.summary.sizeBytes).toBeGreaterThan(0);
  });

  it("includes counts for all sections", async () => {
    const result = await analyzeLog({ filePath: sampleLog });

    expect(result.counts).toBeDefined();
    expect(typeof result.counts.soqlQueries).toBe("number");
    expect(typeof result.counts.dmlOperations).toBe("number");
    expect(typeof result.counts.callouts).toBe("number");
    expect(typeof result.counts.exceptions).toBe("number");
    expect(typeof result.counts.flowEvents).toBe("number");
  });

  it("throws for non-existent file", async () => {
    await expect(analyzeLog({ filePath: "/tmp/nonexistent.log" })).rejects.toThrow(
      "Log file not found",
    );
  });
});
