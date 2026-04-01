import { parseDmlOperations, generateDmlWarnings } from "../../src/parser/dmlParser.js";
import { parseLogLines } from "../../src/parser/logLineParser.js";

describe("parseDmlOperations", () => {
  it("extracts DML operation details", () => {
    const content =
      "12:22:48.0 (100)|DML_BEGIN|[42]|Op:Insert|Type:Account|Rows:1";

    const lines = parseLogLines(content);
    const dml = parseDmlOperations(lines);

    expect(dml).toHaveLength(1);
    expect(dml[0].operation).toBe("Insert");
    expect(dml[0].objectType).toBe("Account");
    expect(dml[0].rowCount).toBe(1);
  });

  it("handles custom object types with underscores", () => {
    const content =
      "12:22:48.0 (100)|DML_BEGIN|[50]|Op:Insert|Type:Raw_Finding__c|Rows:33";

    const lines = parseLogLines(content);
    const dml = parseDmlOperations(lines);

    expect(dml).toHaveLength(1);
    expect(dml[0].objectType).toBe("Raw_Finding__c");
    expect(dml[0].rowCount).toBe(33);
  });

  it("handles multiple DML operations", () => {
    const content = [
      "12:00:00.000 (100)|DML_BEGIN|[10]|Op:Insert|Type:Account|Rows:5",
      "12:00:01.000 (200)|DML_BEGIN|[20]|Op:Update|Type:Contact|Rows:10",
      "12:00:02.000 (300)|DML_BEGIN|[30]|Op:Delete|Type:Task|Rows:3",
    ].join("\n");

    const lines = parseLogLines(content);
    const dml = parseDmlOperations(lines);

    expect(dml).toHaveLength(3);
    expect(dml[0].operation).toBe("Insert");
    expect(dml[1].operation).toBe("Update");
    expect(dml[2].operation).toBe("Delete");
  });

  it("handles 1-digit timestamp decimals", () => {
    const content =
      "12:22:49.1 (100)|DML_BEGIN|[42]|Op:Insert|Type:Account|Rows:1";

    const lines = parseLogLines(content);
    const dml = parseDmlOperations(lines);

    expect(dml).toHaveLength(1);
  });
});

describe("generateDmlWarnings", () => {
  it("warns on large DML operations", () => {
    const entries = [
      { timestamp: "12:00:00.000", operation: "Insert", objectType: "Account", rowCount: 250 },
    ];
    const warning = generateDmlWarnings(entries);
    expect(warning).toContain(">200");
  });

  it("returns undefined for normal DML", () => {
    const entries = [
      { timestamp: "12:00:00.000", operation: "Insert", objectType: "Account", rowCount: 10 },
    ];
    const warning = generateDmlWarnings(entries);
    expect(warning).toBeUndefined();
  });
});
