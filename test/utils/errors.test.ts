import { classifySfError } from "../../src/utils/errors.js";

describe("classifySfError", () => {
  it("classifies session expired errors", () => {
    const result = classifySfError(new Error("INVALID_SESSION_ID: Session expired or invalid"));
    expect(result).toContain("Re-authenticate");
    expect(result).toContain("sf org login web");
  });

  it("classifies API limit errors", () => {
    const result = classifySfError(new Error("REQUEST_LIMIT_EXCEEDED: TotalRequests Limit exceeded"));
    expect(result).toContain("API request limit exceeded");
  });

  it("classifies insufficient access errors", () => {
    const result = classifySfError(new Error("INSUFFICIENT_ACCESS: no access to entity"));
    expect(result).toContain("Insufficient permissions");
  });

  it("classifies entity already traced errors", () => {
    const result = classifySfError(new Error("entity already being traced"));
    expect(result).toContain("active trace flag");
    expect(result).toContain("manage_trace_flags");
  });

  it("classifies 24-hour trace flag errors", () => {
    const result = classifySfError(new Error("Trace flags cannot exceed 24 hour"));
    expect(result).toContain("delete and recreate");
  });

  it("classifies malformed ID errors", () => {
    const result = classifySfError(new Error("MALFORMED_ID: bad id"));
    expect(result).toContain("15 or 18 character");
  });

  it("classifies not found errors", () => {
    const result = classifySfError(new Error("NOT_FOUND: record not found"));
    expect(result).toContain("may have been deleted");
  });

  it("classifies network errors", () => {
    const result = classifySfError(new Error("ECONNREFUSED 0.0.0.0:443"));
    expect(result).toContain("Network error");
  });

  it("classifies auth not found errors", () => {
    const result = classifySfError(new Error("NamedOrgInfoNotFound"));
    expect(result).toContain("No SF CLI auth found");
  });

  it("passes through unknown errors as-is", () => {
    const result = classifySfError(new Error("something completely different"));
    expect(result).toBe("something completely different");
  });

  it("handles non-Error objects", () => {
    const result = classifySfError("string error");
    expect(result).toBe("string error");
  });
});
