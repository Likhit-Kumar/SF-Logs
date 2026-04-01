import { parseCallouts, generateCalloutWarnings } from "../../src/parser/calloutParser.js";
import { parseLogLines } from "../../src/parser/logLineParser.js";

describe("parseCallouts", () => {
  it("pairs CALLOUT_REQUEST with CALLOUT_RESPONSE", () => {
    const content = [
      '12:22:48.0 (128982981)|CALLOUT_REQUEST|[153]|System.HttpRequest[Endpoint=https://example.com/api, Method=GET]',
      '12:22:48.0 (239992657)|CALLOUT_RESPONSE|[153]|System.HttpResponse[Status=OK, StatusCode=200]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(1);
    expect(callouts[0].request.endpoint).toBe("https://example.com/api");
    expect(callouts[0].request.method).toBe("GET");
    expect(callouts[0].response.statusCode).toBe(200);
  });

  it("captures full endpoint URLs with encoded query parameters", () => {
    const content = [
      '12:22:48.0 (128982981)|CALLOUT_REQUEST|[153]|System.HttpRequest[Endpoint=https://my.salesforce.com/services/data/v61.0/tooling/query?q=SELECT+Id%2C+Name%2C+Status+FROM+Flow+WHERE+Status+IN+%28%27Active%27%2C%27Obsolete%27%29+LIMIT+100, Method=GET]',
      '12:22:48.0 (239992657)|CALLOUT_RESPONSE|[153]|System.HttpResponse[Status=OK, StatusCode=200]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(1);
    // Should NOT truncate at %2C (encoded comma)
    expect(callouts[0].request.endpoint).toContain("%2C");
    expect(callouts[0].request.endpoint).toContain("LIMIT+100");
    expect(callouts[0].request.endpoint).toBe(
      "https://my.salesforce.com/services/data/v61.0/tooling/query?q=SELECT+Id%2C+Name%2C+Status+FROM+Flow+WHERE+Status+IN+%28%27Active%27%2C%27Obsolete%27%29+LIMIT+100",
    );
  });

  it("handles HTTP error status codes", () => {
    const content = [
      '12:22:49.1 (1361188428)|CALLOUT_REQUEST|[153]|System.HttpRequest[Endpoint=https://example.com/api, Method=GET]',
      '12:22:49.1 (1362083031)|CALLOUT_RESPONSE|[153]|System.HttpResponse[Status=Bad Request, StatusCode=400]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(1);
    expect(callouts[0].response.statusCode).toBe(400);
  });

  it("handles POST method", () => {
    const content = [
      '12:00:00.000 (100)|CALLOUT_REQUEST|[10]|System.HttpRequest[Endpoint=https://api.example.com/data, Method=POST]',
      '12:00:00.500 (200)|CALLOUT_RESPONSE|[10]|System.HttpResponse[Status=Created, StatusCode=201]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(1);
    expect(callouts[0].request.method).toBe("POST");
    expect(callouts[0].response.statusCode).toBe(201);
  });

  it("handles multiple callout pairs", () => {
    const content = [
      '12:00:00.000 (100)|CALLOUT_REQUEST|[10]|System.HttpRequest[Endpoint=https://api1.com, Method=GET]',
      '12:00:00.100 (200)|CALLOUT_RESPONSE|[10]|System.HttpResponse[Status=OK, StatusCode=200]',
      '12:00:01.000 (300)|CALLOUT_REQUEST|[20]|System.HttpRequest[Endpoint=https://api2.com, Method=POST]',
      '12:00:01.100 (400)|CALLOUT_RESPONSE|[20]|System.HttpResponse[Status=OK, StatusCode=200]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(2);
    expect(callouts[0].request.endpoint).toBe("https://api1.com");
    expect(callouts[1].request.endpoint).toBe("https://api2.com");
  });

  it("handles 1-digit timestamp decimals from real SF logs", () => {
    const content = [
      '12:22:49.1 (1361188428)|CALLOUT_REQUEST|[153]|System.HttpRequest[Endpoint=https://example.com/query?q=SELECT+Id%2C+Name, Method=GET]',
      '12:22:49.1 (1362083031)|CALLOUT_RESPONSE|[153]|System.HttpResponse[Status=OK, StatusCode=200]',
    ].join("\n");

    const lines = parseLogLines(content);
    const callouts = parseCallouts(lines);

    expect(callouts).toHaveLength(1);
    expect(callouts[0].request.endpoint).toContain("%2C");
  });
});

describe("generateCalloutWarnings", () => {
  it("warns on HTTP error responses", () => {
    const entries = [
      {
        timestamp: "12:00:00.000",
        request: { endpoint: "https://api.com", method: "GET" },
        response: { statusCode: 400 },
      },
    ];
    const warning = generateCalloutWarnings(entries);
    expect(warning).toContain("HTTP 400");
  });

  it("warns on error keywords in 2xx response body", () => {
    const entries = [
      {
        timestamp: "12:00:00.000",
        request: { endpoint: "https://api.com", method: "GET" },
        response: { statusCode: 200, body: '{"error":"rate_limit_exceeded"}' },
      },
    ];
    const warning = generateCalloutWarnings(entries);
    expect(warning).toContain("error keywords");
  });

  it("returns undefined when no issues", () => {
    const entries = [
      {
        timestamp: "12:00:00.000",
        request: { endpoint: "https://api.com", method: "GET" },
        response: { statusCode: 200 },
      },
    ];
    const warning = generateCalloutWarnings(entries);
    expect(warning).toBeUndefined();
  });
});
