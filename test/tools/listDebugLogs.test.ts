import { buildLogQuery } from "../../src/salesforce/logs.js";

describe("buildLogQuery", () => {
  it("builds correct SOQL with no filters — no status filter by default", () => {
    const query = buildLogQuery({ limit: 20 });
    expect(query).toContain("FROM ApexLog");
    expect(query).toContain("ORDER BY StartTime DESC");
    expect(query).toContain("LIMIT 20");
    expect(query).not.toContain("WHERE"); // No filters by default
  });

  it("builds correct SOQL with operation filter", () => {
    const query = buildLogQuery({ limit: 10, operation: "ApexTrigger" });
    expect(query).toContain("Operation = 'ApexTrigger'");
  });

  it("builds correct SOQL with status filter when explicitly provided", () => {
    const query = buildLogQuery({ limit: 10, status: "Fatal Error" });
    expect(query).toContain("Status = 'Fatal Error'");
  });

  it("enforces limit bounds — caps at 100", () => {
    const query = buildLogQuery({ limit: 500 });
    expect(query).toContain("LIMIT 100");
  });

  it("enforces limit bounds — minimum 1", () => {
    const query = buildLogQuery({ limit: 0 });
    expect(query).toContain("LIMIT 1");
  });

  it("defaults limit to 20", () => {
    const query = buildLogQuery({});
    expect(query).toContain("LIMIT 20");
  });

  it("builds SOQL with time range filters", () => {
    const query = buildLogQuery({
      startTimeAfter: "2026-03-28T00:00:00Z",
      startTimeBefore: "2026-03-28T23:59:59Z",
    });
    expect(query).toContain("StartTime > 2026-03-28T00:00:00Z");
    expect(query).toContain("StartTime < 2026-03-28T23:59:59Z");
  });

  it("builds SOQL with userId filter", () => {
    const query = buildLogQuery({ userId: "0055g000004XXXX" });
    expect(query).toContain("LogUserId = '0055g000004XXXX'");
  });

  it("builds SOQL with minDuration filter", () => {
    const query = buildLogQuery({ minDuration: 5000 });
    expect(query).toContain("DurationMilliseconds >= 5000");
  });

  it("builds SOQL with minSize filter", () => {
    const query = buildLogQuery({ minSize: 1000000 });
    expect(query).toContain("LogLength >= 1000000");
  });

  it("combines multiple filters with AND", () => {
    const query = buildLogQuery({
      operation: "API",
      minDuration: 1000,
      userId: "005xxx",
    });
    expect(query).toContain("AND");
    expect((query.match(/AND/g) || []).length).toBe(2); // 3 conditions = 2 ANDs
  });

  it("escapes single quotes in filter values", () => {
    const query = buildLogQuery({ operation: "O'Reilly" });
    expect(query).toContain("O\\'Reilly");
  });
});
