import type { ParsedLogLine, CalloutEntry } from "./types.js";
import { filterByEventType } from "./logLineParser.js";

export function parseCallouts(lines: ParsedLogLine[]): CalloutEntry[] {
  const calloutLines = filterByEventType(lines, "CALLOUT_REQUEST", "CALLOUT_RESPONSE");
  const entries: CalloutEntry[] = [];

  let currentRequest: Partial<CalloutEntry> | null = null;

  for (const line of calloutLines) {
    if (line.eventType === "CALLOUT_REQUEST") {
      currentRequest = {
        lineNumber: line.lineNumber,
        timestamp: line.timestamp,
        request: parseCalloutRequest(line.details),
      };
    } else if (line.eventType === "CALLOUT_RESPONSE" && currentRequest) {
      const response = parseCalloutResponse(line.details);
      entries.push({
        lineNumber: currentRequest.lineNumber,
        timestamp: currentRequest.timestamp ?? line.timestamp,
        request: currentRequest.request ?? { endpoint: "unknown", method: "unknown" },
        response,
      });
      currentRequest = null;
    }
  }

  return entries;
}

function parseCalloutRequest(details: string): { endpoint: string; method: string } {
  // Endpoint URLs may contain encoded characters like %2C (commas), so we can't stop at comma.
  // Format: System.HttpRequest[Endpoint=https://..., Method=GET]
  // Match everything between Endpoint= and the last ", Method=" before the closing bracket.
  const endpointMatch = details.match(/Endpoint=(https?:\/\/.+?)(?:,\s*Method=|\]|$)/);
  const methodMatch = details.match(/Method=(\w+)/);
  return {
    endpoint: endpointMatch?.[1] ?? "unknown",
    method: methodMatch?.[1] ?? "unknown",
  };
}

function parseCalloutResponse(details: string): { statusCode: number; body?: string } {
  const statusMatch = details.match(/StatusCode=(\d+)/);
  const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

  // Attempt to capture response body if present in the line
  const bodyMatch = details.match(/StatusCode=\d+[,|](.+)$/);
  const body = bodyMatch?.[1]?.trim();

  return { statusCode, body };
}

export function generateCalloutWarnings(entries: CalloutEntry[]): string | undefined {
  const warnings: string[] = [];

  const errorsInOkResponse = entries.filter(
    (e) =>
      e.response.statusCode >= 200 &&
      e.response.statusCode < 300 &&
      e.response.body &&
      /error|fail|rejected|denied|invalid|exceeded/i.test(e.response.body),
  );

  const httpErrors = entries.filter((e) => e.response.statusCode >= 400);

  if (errorsInOkResponse.length > 0) {
    warnings.push(
      `${errorsInOkResponse.length} callout(s) returned HTTP 2xx with error keywords in body`,
    );
  }
  if (httpErrors.length > 0) {
    warnings.push(`${httpErrors.length} callout(s) returned HTTP ${httpErrors.map((e) => e.response.statusCode).join(", ")}`);
  }

  return warnings.length > 0 ? warnings.join(". ") + "." : undefined;
}
