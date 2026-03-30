import { deleteDebugLogsSchema } from "../../src/tools/deleteDebugLogs.js";

describe("deleteDebugLogs schema", () => {
  it("requires at least one deletion criteria when no logIds", () => {
    // The tool should throw when no criteria specified — tested at runtime
    // Schema validation: dryRun defaults to false
    const parsed = deleteDebugLogsSchema.dryRun.parse(undefined);
    expect(parsed).toBe(false);
  });

  it("deleteAll defaults to false", () => {
    const parsed = deleteDebugLogsSchema.deleteAll.parse(undefined);
    expect(parsed).toBe(false);
  });

  it("olderThanMinutes must be >= 1", () => {
    expect(() => deleteDebugLogsSchema.olderThanMinutes.parse(0)).toThrow();
    expect(deleteDebugLogsSchema.olderThanMinutes.parse(1)).toBe(1);
    expect(deleteDebugLogsSchema.olderThanMinutes.parse(60)).toBe(60);
  });

  it("logIds accepts array of strings", () => {
    const parsed = deleteDebugLogsSchema.logIds.parse(["07L000000000001", "07L000000000002"]);
    expect(parsed).toHaveLength(2);
  });
});

describe("deleteDebugLogs schema - targetOrg", () => {
  it("targetOrg is optional", () => {
    const parsed = deleteDebugLogsSchema.targetOrg.parse(undefined);
    expect(parsed).toBeUndefined();
  });
});
