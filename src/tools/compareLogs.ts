import { z } from "zod";
import { readLogFile, fileExists } from "../utils/fileSystem.js";
import { extractSection } from "../parser/sectionExtractor.js";
import type { GovernorLimits, CalloutEntry, SoqlEntry, ExceptionEntry } from "../parser/types.js";

export const compareLogsSchema = {
  filePathA: z.string().describe("Path to the first (baseline) log file"),
  filePathB: z.string().describe("Path to the second (comparison) log file"),
  sections: z
    .array(z.enum(["governor", "soql", "callouts", "exceptions", "dml"]))
    .default(["governor", "soql", "callouts", "exceptions"])
    .describe("Sections to compare (default: governor, soql, callouts, exceptions)"),
};

interface LimitDiff {
  name: string;
  usedA: number;
  usedB: number;
  max: number;
  delta: number;
  deltaPercent: number;
  direction: "increased" | "decreased" | "unchanged";
}

export async function compareLogs(params: {
  filePathA: string;
  filePathB: string;
  sections?: string[];
}) {
  for (const fp of [params.filePathA, params.filePathB]) {
    if (!(await fileExists(fp))) {
      throw new Error(`Log file not found: ${fp}. Use fetch_debug_log to download it first.`);
    }
  }

  const [contentA, contentB] = await Promise.all([
    readLogFile(params.filePathA),
    readLogFile(params.filePathB),
  ]);

  const sections = params.sections ?? ["governor", "soql", "callouts", "exceptions"];
  const comparison: Record<string, unknown> = {};

  for (const section of sections) {
    const resultA = extractSection(contentA, section as any, params.filePathA, 5000);
    const resultB = extractSection(contentB, section as any, params.filePathB, 5000);

    switch (section) {
      case "governor":
        comparison.governor = compareGovernor(resultA.entries as GovernorLimits[], resultB.entries as GovernorLimits[]);
        break;
      case "soql":
        comparison.soql = compareSoql(resultA.entries as SoqlEntry[], resultB.entries as SoqlEntry[]);
        break;
      case "callouts":
        comparison.callouts = compareCallouts(resultA.entries as CalloutEntry[], resultB.entries as CalloutEntry[]);
        break;
      case "exceptions":
        comparison.exceptions = compareExceptions(resultA.entries as ExceptionEntry[], resultB.entries as ExceptionEntry[]);
        break;
      case "dml":
        comparison.dml = {
          countA: resultA.totalEntries,
          countB: resultB.totalEntries,
          delta: resultB.totalEntries - resultA.totalEntries,
        };
        break;
    }
  }

  return {
    fileA: params.filePathA,
    fileB: params.filePathB,
    sectionsCompared: sections,
    comparison,
  };
}

function compareGovernor(entriesA: GovernorLimits[], entriesB: GovernorLimits[]): {
  diffs: LimitDiff[];
  warnings: string[];
} {
  const limitsA = entriesA[0] ?? {};
  const limitsB = entriesB[0] ?? {};
  const diffs: LimitDiff[] = [];
  const warnings: string[] = [];

  // Get all limit keys from both
  const allKeys = new Set([...Object.keys(limitsA), ...Object.keys(limitsB)]);

  for (const key of allKeys) {
    const a = (limitsA as any)[key];
    const b = (limitsB as any)[key];
    if (!a || !b) continue;

    const delta = b.used - a.used;
    const deltaPercent = a.used === 0 ? (b.used > 0 ? 100 : 0) : Math.round((delta / a.used) * 100);

    diffs.push({
      name: a.name || key,
      usedA: a.used,
      usedB: b.used,
      max: a.max,
      delta,
      deltaPercent,
      direction: delta > 0 ? "increased" : delta < 0 ? "decreased" : "unchanged",
    });

    if (b.status === "CRITICAL" && a.status !== "CRITICAL") {
      warnings.push(`${a.name || key} went from ${a.status} to CRITICAL (${b.percent}%)`);
    }
    if (delta > 0 && b.percent > 50) {
      warnings.push(`${a.name || key} increased by ${delta} (${a.used} → ${b.used}, now ${b.percent}% of limit)`);
    }
  }

  // Sort by absolute delta descending
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { diffs: diffs.filter((d) => d.direction !== "unchanged"), warnings };
}

function compareSoql(entriesA: SoqlEntry[], entriesB: SoqlEntry[]): {
  countA: number;
  countB: number;
  delta: number;
  totalRowsA: number;
  totalRowsB: number;
  zeroRowQueriesA: number;
  zeroRowQueriesB: number;
  warnings: string[];
} {
  const totalRowsA = entriesA.reduce((sum, e) => sum + (e.rowCount ?? 0), 0);
  const totalRowsB = entriesB.reduce((sum, e) => sum + (e.rowCount ?? 0), 0);
  const zeroRowA = entriesA.filter((e) => e.rowCount === 0).length;
  const zeroRowB = entriesB.filter((e) => e.rowCount === 0).length;
  const warnings: string[] = [];

  if (entriesB.length > entriesA.length) {
    warnings.push(`SOQL query count increased: ${entriesA.length} → ${entriesB.length}`);
  }
  if (zeroRowB > zeroRowA) {
    warnings.push(`Zero-row queries increased: ${zeroRowA} → ${zeroRowB}`);
  }

  return {
    countA: entriesA.length,
    countB: entriesB.length,
    delta: entriesB.length - entriesA.length,
    totalRowsA,
    totalRowsB,
    zeroRowQueriesA: zeroRowA,
    zeroRowQueriesB: zeroRowB,
    warnings,
  };
}

function compareCallouts(entriesA: CalloutEntry[], entriesB: CalloutEntry[]): {
  countA: number;
  countB: number;
  failuresA: number;
  failuresB: number;
  warnings: string[];
} {
  const failA = entriesA.filter((e) => e.response?.statusCode && e.response.statusCode >= 400).length;
  const failB = entriesB.filter((e) => e.response?.statusCode && e.response.statusCode >= 400).length;
  const warnings: string[] = [];

  if (failB > failA) {
    warnings.push(`Callout failures increased: ${failA} → ${failB}`);
  }
  if (entriesB.length > entriesA.length) {
    warnings.push(`Callout count increased: ${entriesA.length} → ${entriesB.length}`);
  }

  return {
    countA: entriesA.length,
    countB: entriesB.length,
    failuresA: failA,
    failuresB: failB,
    warnings,
  };
}

function compareExceptions(entriesA: ExceptionEntry[], entriesB: ExceptionEntry[]): {
  countA: number;
  countB: number;
  unhandledA: number;
  unhandledB: number;
  warnings: string[];
} {
  const unhandledA = entriesA.filter((e) => !e.handled).length;
  const unhandledB = entriesB.filter((e) => !e.handled).length;
  const warnings: string[] = [];

  if (entriesB.length > entriesA.length) {
    warnings.push(`Exception count increased: ${entriesA.length} → ${entriesB.length}`);
  }
  if (unhandledB > unhandledA) {
    warnings.push(`Unhandled exceptions increased: ${unhandledA} → ${unhandledB}`);
  }

  // Flag new exception types
  const typesA = new Set(entriesA.map((e) => e.exceptionType));
  const newTypes = entriesB.filter((e) => !typesA.has(e.exceptionType)).map((e) => e.exceptionType);
  if (newTypes.length > 0) {
    warnings.push(`New exception types in log B: ${[...new Set(newTypes)].join(", ")}`);
  }

  return {
    countA: entriesA.length,
    countB: entriesB.length,
    unhandledA,
    unhandledB,
    warnings,
  };
}
