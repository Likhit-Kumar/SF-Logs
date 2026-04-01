import { parseExceptions, generateExceptionWarnings } from "../../src/parser/exceptionParser.js";
import { parseLogLines } from "../../src/parser/logLineParser.js";

describe("parseExceptions", () => {
  it("detects handled exceptions (followed by METHOD_EXIT)", () => {
    const content = [
      '12:22:49.1 (1363160295)|EXCEPTION_THROWN|[156]|ToolingApiClient.ToolingApiException: Tooling API error 400',
      '12:22:49.1 (1363181850)|METHOD_EXIT|[63]|ToolingApiClient.executePage(String)',
    ].join("\n");

    const lines = parseLogLines(content);
    const exceptions = parseExceptions(lines);

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].exceptionType).toBe("ToolingApiClient.ToolingApiException");
    expect(exceptions[0].message).toContain("Tooling API error 400");
    expect(exceptions[0].handled).toBe(true);
  });

  it("detects unhandled exceptions (followed by FATAL_ERROR)", () => {
    const content = [
      '12:00:00.000 (100)|EXCEPTION_THROWN|[10]|System.NullPointerException: Attempt to de-reference a null object',
      '12:00:00.000 (200)|FATAL_ERROR|System.NullPointerException: Attempt to de-reference a null object',
    ].join("\n");

    const lines = parseLogLines(content);
    const exceptions = parseExceptions(lines);

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].exceptionType).toBe("System.NullPointerException");
    expect(exceptions[0].handled).toBe(false);
  });

  it("detects DmlException", () => {
    const content = [
      '12:00:00.000 (100)|EXCEPTION_THROWN|[25]|System.DmlException: Insert failed. REQUIRED_FIELD_MISSING',
      '12:00:00.000 (200)|METHOD_EXIT|[25]|MyClass.doInsert()',
    ].join("\n");

    const lines = parseLogLines(content);
    const exceptions = parseExceptions(lines);

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].exceptionType).toBe("System.DmlException");
    expect(exceptions[0].handled).toBe(true);
  });

  it("handles multiple exceptions", () => {
    const content = [
      '12:00:00.000 (100)|EXCEPTION_THROWN|[10]|System.QueryException: List has no rows',
      '12:00:00.000 (200)|METHOD_EXIT|[10]|MyClass.query()',
      '12:00:01.000 (300)|EXCEPTION_THROWN|[20]|System.NullPointerException: null object',
      '12:00:01.000 (400)|FATAL_ERROR|System.NullPointerException: null object',
    ].join("\n");

    const lines = parseLogLines(content);
    const exceptions = parseExceptions(lines);

    expect(exceptions).toHaveLength(2);
    expect(exceptions[0].handled).toBe(true);
    expect(exceptions[1].handled).toBe(false);
  });

  it("handles 1-digit timestamp decimals from real SF logs", () => {
    const content = [
      '12:22:49.1 (1363160295)|EXCEPTION_THROWN|[156]|Custom.MyException: something broke',
      '12:22:49.1 (1363181850)|METHOD_EXIT|[63]|MyClass.doWork()',
    ].join("\n");

    const lines = parseLogLines(content);
    const exceptions = parseExceptions(lines);

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].exceptionType).toBe("Custom.MyException");
  });
});

describe("generateExceptionWarnings", () => {
  it("reports handled and unhandled counts separately", () => {
    const entries = [
      { timestamp: "12:00:00.000", exceptionType: "System.DmlException", message: "Insert failed", handled: true },
      { timestamp: "12:00:01.000", exceptionType: "System.NullPointerException", message: "null", handled: false },
    ];
    const warning = generateExceptionWarnings(entries);
    expect(warning).toContain("1 unhandled");
    expect(warning).toContain("1 exception(s) caught");
  });

  it("returns undefined when no exceptions", () => {
    const warning = generateExceptionWarnings([]);
    expect(warning).toBeUndefined();
  });
});
