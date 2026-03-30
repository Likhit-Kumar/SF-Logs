import type { ParsedLogLine, DmlEntry } from "./types.js";

export function parseDmlOperations(lines: ParsedLogLine[]): DmlEntry[] {
  const entries: DmlEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.eventType !== "DML_BEGIN") continue;

    const { operation, objectType, rowCount } = parseDmlDetails(line.details);

    entries.push({
      lineNumber: line.lineNumber,
      timestamp: line.timestamp,
      operation,
      objectType,
      rowCount,
    });
  }

  return entries;
}

function parseDmlDetails(details: string): {
  operation: string;
  objectType: string;
  rowCount: number;
} {
  // Format: Op:Insert|Type:Account|Rows:50
  const opMatch = details.match(/Op:(\w+)/);
  const typeMatch = details.match(/Type:(\w+)/);
  const rowMatch = details.match(/Rows:(\d+)/);

  return {
    operation: opMatch?.[1] ?? "unknown",
    objectType: typeMatch?.[1] ?? "unknown",
    rowCount: rowMatch ? parseInt(rowMatch[1], 10) : 0,
  };
}

export function generateDmlWarnings(entries: DmlEntry[]): string | undefined {
  const warnings: string[] = [];
  const highRowOps = entries.filter((e) => e.rowCount > 200);

  if (highRowOps.length > 0) {
    warnings.push(
      `${highRowOps.length} DML operation(s) affecting >200 rows — check for bulk safety`,
    );
  }

  return warnings.length > 0 ? warnings.join(". ") + "." : undefined;
}
