import type { GovernorLimits, GovernorLimitEntry } from "./types.js";

// Maps the debug log limit names to our normalized keys
const LIMIT_MAP: Record<string, keyof GovernorLimits> = {
  "Number of SOQL queries": "soqlQueries",
  "Number of query rows": "soqlRows",
  "Number of SOSL queries": "soslQueries",
  "Number of DML statements": "dmlStatements",
  "Number of DML rows": "dmlRows",
  "Maximum CPU time": "cpuTime",
  "Maximum heap size": "heapSize",
  "Number of callouts": "callouts",
  "Number of future calls": "futureCalls",
  "Number of queueable jobs added to the queue": "queueableJobs",
  "Number of Mobile Apex push calls": "mobilePushCalls",
};

// Matches: "  Number of SOQL queries: 85 out of 100"
const LIMIT_LINE_REGEX = /^\s+(.+?):\s*(\d+)\s+out of\s+(\d+)/;

export function parseGovernorLimits(rawLines: string[]): GovernorLimits {
  const limits: GovernorLimits = {};
  let inLimitBlock = false;

  for (const line of rawLines) {
    if (line.includes("LIMIT_USAGE_FOR_NS")) {
      inLimitBlock = true;
      continue;
    }

    if (inLimitBlock) {
      const match = line.match(LIMIT_LINE_REGEX);
      if (match) {
        const name = match[1].trim();
        const used = parseInt(match[2], 10);
        const max = parseInt(match[3], 10);
        const key = LIMIT_MAP[name];

        if (key) {
          limits[key] = createLimitEntry(name, used, max);
        }
      }

      // End of limit block if we hit a non-whitespace line that isn't a limit
      if (line.trim() !== "" && !match && !line.includes("LIMIT_USAGE")) {
        inLimitBlock = false;
      }
    }
  }

  return limits;
}

function createLimitEntry(name: string, used: number, max: number): GovernorLimitEntry {
  const percent = max > 0 ? Math.round((used / max) * 100) : 0;
  let status: GovernorLimitEntry["status"] = "OK";
  if (percent >= 90) status = "CRITICAL";
  else if (percent >= 80) status = "WARNING";

  return { name, used, max, percent, status };
}

export function generateGovernorWarnings(limits: GovernorLimits): string | undefined {
  const warnings: string[] = [];
  let criticalCount = 0;
  let warningCount = 0;

  for (const [, entry] of Object.entries(limits)) {
    if (!entry) continue;
    if (entry.status === "CRITICAL") {
      criticalCount++;
      warnings.push(`${entry.name}: ${entry.used}/${entry.max} (${entry.percent}%) CRITICAL`);
    } else if (entry.status === "WARNING") {
      warningCount++;
      warnings.push(`${entry.name}: ${entry.used}/${entry.max} (${entry.percent}%) WARNING`);
    }
  }

  if (warnings.length === 0) return undefined;
  return `${criticalCount} critical, ${warningCount} warning. ${warnings.join(". ")}.`;
}
