import type { ParsedLogLine, SoqlEntry } from "./types.js";

export function parseSoqlQueries(lines: ParsedLogLine[]): SoqlEntry[] {
  const entries: SoqlEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.eventType !== "SOQL_EXECUTE_BEGIN") continue;

    const query = extractQuery(line.details);

    // Look for corresponding SOQL_EXECUTE_END
    const endLine = findMatchingEnd(lines, i, "SOQL_EXECUTE_END");
    const rowCount = endLine ? extractRowCount(endLine.details) : -1;

    entries.push({
      lineNumber: line.lineNumber,
      timestamp: line.timestamp,
      query,
      rowCount,
      aggregations: 0,
    });
  }

  return entries;
}

function extractQuery(details: string): string {
  // The query text usually follows the aggregations count
  // Format: Aggregations:0|SELECT Id, Name FROM Account WHERE ...
  const pipeIndex = details.indexOf("|");
  return pipeIndex !== -1 ? details.substring(pipeIndex + 1).trim() : details.trim();
}

function extractRowCount(details: string): number {
  // Format: Rows:15
  const match = details.match(/Rows:(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

function findMatchingEnd(
  lines: ParsedLogLine[],
  fromIndex: number,
  endEventType: string,
): ParsedLogLine | null {
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 50, lines.length); i++) {
    if (lines[i].eventType === endEventType) return lines[i];
  }
  return null;
}

export function generateSoqlWarnings(entries: SoqlEntry[]): string | undefined {
  const warnings: string[] = [];
  const zeroRows = entries.filter((e) => e.rowCount === 0);
  const highRows = entries.filter((e) => e.rowCount > 500);

  if (zeroRows.length > 0) {
    warnings.push(`${zeroRows.length} query(ies) returned 0 rows — verify if expected`);
  }
  if (highRows.length > 0) {
    warnings.push(
      `${highRows.length} query(ies) returned >500 rows (highest: ${Math.max(...highRows.map((e) => e.rowCount))})`,
    );
  }

  return warnings.length > 0 ? warnings.join(". ") + "." : undefined;
}
