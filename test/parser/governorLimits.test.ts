import { parseGovernorLimits, generateGovernorWarnings } from "../../src/parser/governorLimits.js";

describe("parseGovernorLimits", () => {
  const sampleLines = [
    "10:15:02.000 (2000000000)|LIMIT_USAGE_FOR_NS|(default)|",
    "  Number of SOQL queries: 85 out of 100",
    "  Number of query rows: 847 out of 50000",
    "  Number of DML statements: 42 out of 150",
    "  Number of DML rows: 3200 out of 10000",
    "  Maximum CPU time: 9200 out of 10000",
    "  Maximum heap size: 4800000 out of 6000000",
    "  Number of callouts: 8 out of 100",
    "  Number of future calls: 3 out of 50",
  ];

  it("parses limit values correctly", () => {
    const limits = parseGovernorLimits(sampleLines);
    expect(limits.soqlQueries?.used).toBe(85);
    expect(limits.soqlQueries?.max).toBe(100);
    expect(limits.cpuTime?.used).toBe(9200);
    expect(limits.cpuTime?.max).toBe(10000);
  });

  it("calculates percentages correctly", () => {
    const limits = parseGovernorLimits(sampleLines);
    expect(limits.soqlQueries?.percent).toBe(85);
    expect(limits.cpuTime?.percent).toBe(92);
    expect(limits.callouts?.percent).toBe(8);
  });

  it("assigns correct status thresholds", () => {
    const limits = parseGovernorLimits(sampleLines);
    expect(limits.cpuTime?.status).toBe("CRITICAL"); // 92%
    expect(limits.soqlQueries?.status).toBe("WARNING"); // 85%
    expect(limits.heapSize?.status).toBe("WARNING"); // 80%
    expect(limits.callouts?.status).toBe("OK"); // 8%
    expect(limits.dmlStatements?.status).toBe("OK"); // 28%
  });
});

describe("generateGovernorWarnings", () => {
  it("generates warnings for critical and warning limits", () => {
    const limits = parseGovernorLimits([
      "10:15:02.000 (2000000000)|LIMIT_USAGE_FOR_NS|(default)|",
      "  Maximum CPU time: 9200 out of 10000",
      "  Number of SOQL queries: 85 out of 100",
      "  Number of callouts: 8 out of 100",
    ]);

    const warning = generateGovernorWarnings(limits);
    expect(warning).toContain("CRITICAL");
    expect(warning).toContain("WARNING");
    expect(warning).not.toContain("callouts");
  });

  it("returns undefined when all limits are OK", () => {
    const limits = parseGovernorLimits([
      "10:15:02.000 (2000000000)|LIMIT_USAGE_FOR_NS|(default)|",
      "  Number of callouts: 2 out of 100",
      "  Number of future calls: 1 out of 50",
    ]);

    const warning = generateGovernorWarnings(limits);
    expect(warning).toBeUndefined();
  });
});
