import { parseLogLine, parseLogLines, filterByEventType } from "../../src/parser/logLineParser.js";

describe("parseLogLine", () => {
  it("parses a standard log line with line number", () => {
    const line =
      "10:15:00.010 (10234567)|SOQL_EXECUTE_BEGIN|[1]|Aggregations:0|SELECT Id FROM Account";
    const result = parseLogLine(line);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe("10:15:00.010");
    expect(result!.nanoseconds).toBe(10234567);
    expect(result!.eventType).toBe("SOQL_EXECUTE_BEGIN");
    expect(result!.lineNumber).toBe(1);
    expect(result!.details).toContain("SELECT Id FROM Account");
  });

  it("parses a log line without line number", () => {
    const line = "10:15:02.000 (2000000000)|LIMIT_USAGE_FOR_NS|(default)|";
    const result = parseLogLine(line);

    expect(result).not.toBeNull();
    expect(result!.eventType).toBe("LIMIT_USAGE_FOR_NS");
    expect(result!.lineNumber).toBeUndefined();
  });

  it("returns null for non-log lines", () => {
    expect(parseLogLine("Execute Anonymous: System.debug('hello');")).toBeNull();
    expect(parseLogLine("66.0 APEX_CODE,FINE;")).toBeNull();
    expect(parseLogLine("  Number of SOQL queries: 85 out of 100")).toBeNull();
  });
});

describe("parseLogLines", () => {
  it("parses multiple lines and skips non-parseable ones", () => {
    const content = [
      "66.0 APEX_CODE,FINE;",
      "10:15:00.010 (10234567)|SOQL_EXECUTE_BEGIN|[1]|SELECT Id FROM Account",
      "10:15:00.025 (25678901)|SOQL_EXECUTE_END|[1]|Rows:5",
      "  some non-parseable line",
    ].join("\n");

    const results = parseLogLines(content);
    expect(results).toHaveLength(2);
    expect(results[0].eventType).toBe("SOQL_EXECUTE_BEGIN");
    expect(results[1].eventType).toBe("SOQL_EXECUTE_END");
  });
});

describe("filterByEventType", () => {
  it("filters lines by event type", () => {
    const content = [
      "10:15:00.010 (10234567)|SOQL_EXECUTE_BEGIN|[1]|query",
      "10:15:00.025 (25678901)|SOQL_EXECUTE_END|[1]|Rows:5",
      "10:15:00.030 (30123456)|USER_DEBUG|[2]|DEBUG|hello",
    ].join("\n");

    const lines = parseLogLines(content);
    const filtered = filterByEventType(lines, "USER_DEBUG");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventType).toBe("USER_DEBUG");
  });
});
