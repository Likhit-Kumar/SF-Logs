import type { ParsedLogLine } from "./types.js";

// Matches: HH:MM:SS.mmm (nanos)|EVENT_TYPE|[line]|details
const LOG_LINE_REGEX =
  /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*\((\d+)\)\|([A-Z_]+)\|(?:\[(\d+)\]\|)?(.*)$/;

export function parseLogLine(raw: string): ParsedLogLine | null {
  const match = raw.match(LOG_LINE_REGEX);
  if (!match) return null;

  return {
    timestamp: match[1],
    nanoseconds: parseInt(match[2], 10),
    eventType: match[3],
    lineNumber: match[4] ? parseInt(match[4], 10) : undefined,
    details: match[5],
    raw,
  };
}

export function parseLogLines(content: string): ParsedLogLine[] {
  const lines = content.split("\n");
  const parsed: ParsedLogLine[] = [];

  for (const line of lines) {
    const result = parseLogLine(line);
    if (result) {
      parsed.push(result);
    }
  }

  return parsed;
}

export function filterByEventType(lines: ParsedLogLine[], ...eventTypes: string[]): ParsedLogLine[] {
  const types = new Set(eventTypes);
  return lines.filter((line) => types.has(line.eventType));
}
