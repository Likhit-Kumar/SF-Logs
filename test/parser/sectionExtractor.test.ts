import { extractSection } from "../../src/parser/sectionExtractor.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const sampleLogPath = path.resolve("test/fixtures/sampleLog.log");

describe("extractSection", () => {
  let sampleContent: string;

  beforeAll(async () => {
    sampleContent = await fs.readFile(sampleLogPath, "utf-8");
  });

  it("extracts full section with line truncation", () => {
    const result = extractSection(sampleContent, "full", sampleLogPath, 10);
    expect(result.section).toBe("full");
    expect(result.entries.length).toBeLessThanOrEqual(10);
  });

  it("extracts head section", () => {
    const result = extractSection(sampleContent, "head", sampleLogPath, 5);
    expect(result.section).toBe("head");
    expect(result.entries.length).toBeLessThanOrEqual(5);
  });

  it("extracts tail section", () => {
    const result = extractSection(sampleContent, "tail", sampleLogPath, 5);
    expect(result.section).toBe("tail");
    expect(result.entries.length).toBeLessThanOrEqual(5);
  });

  it("returns correct section names for each type", () => {
    const sections = ["callouts", "exceptions", "soql", "dml", "governor", "flow", "debug_messages"] as const;

    for (const section of sections) {
      const result = extractSection(sampleContent, section, sampleLogPath, 500);
      expect(result.section).toBe(section);
      expect(result.filePath).toBe(sampleLogPath);
      expect(typeof result.totalEntries).toBe("number");
    }
  });

  it("includes warning field when issues are detected", () => {
    // The governor section from sample log should have entries
    const result = extractSection(sampleContent, "governor", sampleLogPath, 500);
    expect(result.section).toBe("governor");
    // Warning may or may not be present depending on limit values
    expect(result).toHaveProperty("warning");
  });
});
