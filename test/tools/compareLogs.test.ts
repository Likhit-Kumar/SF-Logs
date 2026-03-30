import { compareLogs } from "../../src/tools/compareLogs.js";
import * as path from "node:path";

const sampleLog = path.resolve("test/fixtures/sampleLog.log");

describe("compareLogs", () => {
  it("compares a log against itself with no diffs", async () => {
    const result = await compareLogs({
      filePathA: sampleLog,
      filePathB: sampleLog,
    });

    expect(result.fileA).toBe(sampleLog);
    expect(result.fileB).toBe(sampleLog);
    expect(result.sectionsCompared).toContain("governor");
    expect(result.sectionsCompared).toContain("soql");

    // Same log compared to itself: deltas should be 0
    const gov = result.comparison.governor as any;
    if (gov && gov.diffs) {
      // All diffs should be unchanged (filtered out) when comparing same file
      expect(gov.diffs.length).toBe(0);
    }

    const soqlComp = result.comparison.soql as any;
    expect(soqlComp.delta).toBe(0);
    expect(soqlComp.countA).toBe(soqlComp.countB);
  });

  it("compares specific sections only", async () => {
    const result = await compareLogs({
      filePathA: sampleLog,
      filePathB: sampleLog,
      sections: ["governor"],
    });

    expect(result.sectionsCompared).toEqual(["governor"]);
    expect(result.comparison.governor).toBeDefined();
    expect(result.comparison.soql).toBeUndefined();
  });

  it("throws for non-existent file", async () => {
    await expect(
      compareLogs({
        filePathA: "/tmp/nonexistent-a.log",
        filePathB: sampleLog,
      }),
    ).rejects.toThrow("Log file not found");
  });
});
