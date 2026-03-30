import { manageTraceFlagsSchema } from "../../src/tools/manageTraceFlags.js";

describe("manageTraceFlags schema", () => {
  it("action accepts list, create, delete, update", () => {
    expect(manageTraceFlagsSchema.action.parse("list")).toBe("list");
    expect(manageTraceFlagsSchema.action.parse("create")).toBe("create");
    expect(manageTraceFlagsSchema.action.parse("delete")).toBe("delete");
    expect(manageTraceFlagsSchema.action.parse("update")).toBe("update");
  });

  it("action rejects invalid values", () => {
    expect(() => manageTraceFlagsSchema.action.parse("invalid")).toThrow();
    expect(() => manageTraceFlagsSchema.action.parse("")).toThrow();
  });

  it("targetOrg is optional", () => {
    const parsed = manageTraceFlagsSchema.targetOrg.parse(undefined);
    expect(parsed).toBeUndefined();
  });

  it("expirationMinutes has valid range 1-1440", () => {
    expect(manageTraceFlagsSchema.expirationMinutes.parse(1)).toBe(1);
    expect(manageTraceFlagsSchema.expirationMinutes.parse(1440)).toBe(1440);
    expect(() => manageTraceFlagsSchema.expirationMinutes.parse(0)).toThrow();
    expect(() => manageTraceFlagsSchema.expirationMinutes.parse(1441)).toThrow();
  });

  it("debugLevel accepts partial config", () => {
    const parsed = manageTraceFlagsSchema.debugLevel.parse({
      apexCode: "FINEST",
      database: "DEBUG",
    });
    expect(parsed).toEqual({ apexCode: "FINEST", database: "DEBUG" });
  });

  it("debugLevel rejects invalid log levels", () => {
    expect(() =>
      manageTraceFlagsSchema.debugLevel.parse({ apexCode: "INVALID" }),
    ).toThrow();
  });

  it("traceFlagId is optional", () => {
    expect(manageTraceFlagsSchema.traceFlagId.parse(undefined)).toBeUndefined();
    expect(manageTraceFlagsSchema.traceFlagId.parse("7tf...")).toBe("7tf...");
  });

  it("tracedEntityId is optional", () => {
    expect(manageTraceFlagsSchema.tracedEntityId.parse(undefined)).toBeUndefined();
    expect(manageTraceFlagsSchema.tracedEntityId.parse("me")).toBe("me");
    expect(manageTraceFlagsSchema.tracedEntityId.parse("005xxxx")).toBe("005xxxx");
  });
});
