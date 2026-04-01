import { parseSoqlQueries, generateSoqlWarnings } from "../../src/parser/soqlParser.js";
import { parseLogLines } from "../../src/parser/logLineParser.js";

describe("parseSoqlQueries", () => {
  it("extracts query text and row count from BEGIN/END pair", () => {
    const content = [
      "12:22:48.0 (77108319)|SOQL_EXECUTE_BEGIN|[148]|Aggregations:0|SELECT Id, Name FROM Account LIMIT 5",
      "12:22:48.0 (88688662)|SOQL_EXECUTE_END|[148]|Rows:5",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries).toHaveLength(1);
    expect(queries[0].query).toBe("SELECT Id, Name FROM Account LIMIT 5");
    expect(queries[0].rowCount).toBe(5);
  });

  it("extracts aggregation count from details", () => {
    const content = [
      "12:22:48.0 (100)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:3|SELECT COUNT(Id), Status FROM Case GROUP BY Status",
      "12:22:48.0 (200)|SOQL_EXECUTE_END|[10]|Rows:4",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries).toHaveLength(1);
    expect(queries[0].aggregations).toBe(3);
    expect(queries[0].query).toBe("SELECT COUNT(Id), Status FROM Case GROUP BY Status");
  });

  it("defaults aggregations to 0 when not present", () => {
    const content = [
      "12:22:48.0 (100)|SOQL_EXECUTE_BEGIN|[10]|SELECT Id FROM Account",
      "12:22:48.0 (200)|SOQL_EXECUTE_END|[10]|Rows:1",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries[0].aggregations).toBe(0);
  });

  it("detects zero-row queries", () => {
    const content = [
      "12:22:48.0 (100)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Contact WHERE LastName = 'NONEXISTENT'",
      "12:22:48.0 (200)|SOQL_EXECUTE_END|[10]|Rows:0",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries[0].rowCount).toBe(0);
  });

  it("handles multiple queries", () => {
    const content = [
      "12:00:00.000 (100)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account",
      "12:00:00.000 (200)|SOQL_EXECUTE_END|[10]|Rows:5",
      "12:00:01.000 (300)|SOQL_EXECUTE_BEGIN|[20]|Aggregations:0|SELECT Id FROM Contact",
      "12:00:01.000 (400)|SOQL_EXECUTE_END|[20]|Rows:10",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries).toHaveLength(2);
    expect(queries[0].rowCount).toBe(5);
    expect(queries[1].rowCount).toBe(10);
  });

  it("handles 1-digit timestamp decimals", () => {
    const content = [
      "12:22:49.1 (100)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account",
      "12:22:49.1 (200)|SOQL_EXECUTE_END|[10]|Rows:3",
    ].join("\n");

    const lines = parseLogLines(content);
    const queries = parseSoqlQueries(lines);

    expect(queries).toHaveLength(1);
    expect(queries[0].rowCount).toBe(3);
  });
});

describe("generateSoqlWarnings", () => {
  it("warns on zero-row queries", () => {
    const entries = [
      { timestamp: "12:00:00.000", query: "SELECT Id FROM Account", rowCount: 0, aggregations: 0 },
    ];
    const warning = generateSoqlWarnings(entries);
    expect(warning).toContain("0 rows");
  });

  it("warns on high-row queries", () => {
    const entries = [
      { timestamp: "12:00:00.000", query: "SELECT Id FROM Account", rowCount: 1000, aggregations: 0 },
    ];
    const warning = generateSoqlWarnings(entries);
    expect(warning).toContain(">500 rows");
  });

  it("returns undefined when no issues", () => {
    const entries = [
      { timestamp: "12:00:00.000", query: "SELECT Id FROM Account", rowCount: 10, aggregations: 0 },
    ];
    const warning = generateSoqlWarnings(entries);
    expect(warning).toBeUndefined();
  });
});
