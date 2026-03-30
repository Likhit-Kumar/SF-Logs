import { parseLogLines } from "./logLineParser.js";
import { parseCallouts, generateCalloutWarnings } from "./calloutParser.js";
import { parseExceptions, generateExceptionWarnings } from "./exceptionParser.js";
import { parseSoqlQueries, generateSoqlWarnings } from "./soqlParser.js";
import { parseDmlOperations, generateDmlWarnings } from "./dmlParser.js";
import { parseGovernorLimits, generateGovernorWarnings } from "./governorLimits.js";
import { parseFlowEvents, generateFlowWarnings } from "./flowParser.js";
import type { LogSection } from "./types.js";

export type SectionType =
  | "full"
  | "callouts"
  | "exceptions"
  | "soql"
  | "dml"
  | "governor"
  | "flow"
  | "debug_messages"
  | "head"
  | "tail";

export function extractSection(
  content: string,
  section: SectionType,
  filePath: string,
  maxLines: number = 500,
): LogSection<unknown> {
  const rawLines = content.split("\n");

  switch (section) {
    case "full":
      return {
        section: "full",
        entries: rawLines.slice(0, maxLines),
        totalEntries: rawLines.length,
        filePath,
        warning: rawLines.length > maxLines ? `Truncated: showing ${maxLines} of ${rawLines.length} lines` : undefined,
      };

    case "head":
      return {
        section: "head",
        entries: rawLines.slice(0, maxLines),
        totalEntries: Math.min(rawLines.length, maxLines),
        filePath,
      };

    case "tail":
      return {
        section: "tail",
        entries: rawLines.slice(-maxLines),
        totalEntries: Math.min(rawLines.length, maxLines),
        filePath,
      };

    case "callouts": {
      const parsed = parseLogLines(content);
      const entries = parseCallouts(parsed);
      return {
        section: "callouts",
        entries,
        totalEntries: entries.length,
        filePath,
        warning: generateCalloutWarnings(entries),
      };
    }

    case "exceptions": {
      const parsed = parseLogLines(content);
      const entries = parseExceptions(parsed);
      return {
        section: "exceptions",
        entries,
        totalEntries: entries.length,
        filePath,
        warning: generateExceptionWarnings(entries),
      };
    }

    case "soql": {
      const parsed = parseLogLines(content);
      const entries = parseSoqlQueries(parsed);
      return {
        section: "soql",
        entries,
        totalEntries: entries.length,
        filePath,
        warning: generateSoqlWarnings(entries),
      };
    }

    case "dml": {
      const parsed = parseLogLines(content);
      const entries = parseDmlOperations(parsed);
      return {
        section: "dml",
        entries,
        totalEntries: entries.length,
        filePath,
        warning: generateDmlWarnings(entries),
      };
    }

    case "governor": {
      const limits = parseGovernorLimits(rawLines);
      return {
        section: "governor",
        entries: [limits],
        totalEntries: Object.keys(limits).filter((k) => limits[k] !== undefined).length,
        filePath,
        warning: generateGovernorWarnings(limits),
      };
    }

    case "flow": {
      const parsed = parseLogLines(content);
      const entries = parseFlowEvents(parsed);
      return {
        section: "flow",
        entries,
        totalEntries: entries.length,
        filePath,
        warning: generateFlowWarnings(entries),
      };
    }

    case "debug_messages": {
      const parsed = parseLogLines(content);
      const entries = parsed
        .filter((l) => l.eventType === "USER_DEBUG")
        .slice(0, maxLines)
        .map((l) => ({
          lineNumber: l.lineNumber,
          timestamp: l.timestamp,
          message: l.details,
        }));
      return {
        section: "debug_messages",
        entries,
        totalEntries: entries.length,
        filePath,
      };
    }

    default:
      throw new Error(`Unknown section type: ${section}`);
  }
}
