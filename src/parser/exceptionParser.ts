import type { ParsedLogLine, ExceptionEntry } from "./types.js";
import { filterByEventType } from "./logLineParser.js";

export function parseExceptions(lines: ParsedLogLine[]): ExceptionEntry[] {
  const entries: ExceptionEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.eventType !== "EXCEPTION_THROWN") continue;

    const { exceptionType, message } = parseExceptionDetails(line.details);

    // Determine if this exception was handled (caught by try-catch)
    // If followed by FATAL_ERROR, it's unhandled. Otherwise, it was caught.
    const handled = !isFollowedByFatalError(lines, i);

    entries.push({
      lineNumber: line.lineNumber,
      timestamp: line.timestamp,
      exceptionType,
      message,
      handled,
    });
  }

  return entries;
}

function parseExceptionDetails(details: string): { exceptionType: string; message: string } {
  // Format: System.NullPointerException: Attempt to de-reference a null object
  const colonIndex = details.indexOf(":");
  if (colonIndex === -1) {
    return { exceptionType: details.trim(), message: "" };
  }
  return {
    exceptionType: details.substring(0, colonIndex).trim(),
    message: details.substring(colonIndex + 1).trim(),
  };
}

function isFollowedByFatalError(lines: ParsedLogLine[], fromIndex: number): boolean {
  // Look ahead within the next ~10 lines for a FATAL_ERROR event
  const lookAhead = Math.min(fromIndex + 10, lines.length);
  for (let i = fromIndex + 1; i < lookAhead; i++) {
    if (lines[i].eventType === "FATAL_ERROR") return true;
    // If we hit another EXCEPTION_THROWN or a METHOD_EXIT, this one was handled
    if (lines[i].eventType === "METHOD_EXIT" || lines[i].eventType === "EXCEPTION_THROWN") {
      return false;
    }
  }
  return false;
}

export function generateExceptionWarnings(entries: ExceptionEntry[]): string | undefined {
  const handled = entries.filter((e) => e.handled);
  const unhandled = entries.filter((e) => !e.handled);
  const warnings: string[] = [];

  if (unhandled.length > 0) {
    warnings.push(`${unhandled.length} unhandled exception(s)`);
  }
  if (handled.length > 0) {
    warnings.push(
      `${handled.length} exception(s) caught by try-catch — check if they should be reported`,
    );
  }

  return warnings.length > 0 ? warnings.join(". ") + "." : undefined;
}
