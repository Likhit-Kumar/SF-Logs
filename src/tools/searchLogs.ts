import { z } from "zod";
import { readLogFile, listLogFiles } from "../utils/fileSystem.js";

export const searchLogsSchema = {
  pattern: z.string().describe("Text or regex pattern to search for across log files"),
  directory: z
    .string()
    .default("./sf-logs/")
    .describe("Directory containing downloaded .log files"),
  caseSensitive: z
    .boolean()
    .default(false)
    .describe("Case-sensitive search (default false)"),
  maxResults: z
    .number()
    .min(1)
    .max(500)
    .default(50)
    .describe("Max total matches to return across all files (default 50)"),
  contextLines: z
    .number()
    .min(0)
    .max(10)
    .default(2)
    .describe("Number of lines of context before and after each match (default 2)"),
};

interface SearchMatch {
  file: string;
  lineNumber: number;
  line: string;
  context: string[];
}

export async function searchLogs(params: {
  pattern: string;
  directory?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  contextLines?: number;
}) {
  const directory = params.directory ?? "./sf-logs/";
  const caseSensitive = params.caseSensitive ?? false;
  const maxResults = params.maxResults ?? 50;
  const contextLines = params.contextLines ?? 2;

  const logFiles = await listLogFiles(directory);

  if (logFiles.length === 0) {
    return {
      matches: [],
      totalMatches: 0,
      filesSearched: 0,
      message: `No .log files found in ${directory}. Use fetch_debug_log or fetch_latest_logs first.`,
    };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(params.pattern, caseSensitive ? "g" : "gi");
  } catch {
    // Fall back to literal string search if regex is invalid
    const escaped = params.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, caseSensitive ? "g" : "gi");
  }

  const allMatches: SearchMatch[] = [];
  const fileMatchCounts: Record<string, number> = {};
  let totalMatches = 0;

  for (const filePath of logFiles) {
    if (totalMatches >= maxResults) break;

    const content = await readLogFile(filePath);
    const lines = content.split("\n");
    let fileMatches = 0;

    for (let i = 0; i < lines.length; i++) {
      if (totalMatches >= maxResults) break;

      // Reset regex lastIndex for each line
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        const contextStart = Math.max(0, i - contextLines);
        const contextEnd = Math.min(lines.length - 1, i + contextLines);
        const context = lines.slice(contextStart, contextEnd + 1);

        allMatches.push({
          file: filePath,
          lineNumber: i + 1,
          line: lines[i],
          context,
        });

        fileMatches++;
        totalMatches++;
      }
    }

    if (fileMatches > 0) {
      fileMatchCounts[filePath] = fileMatches;
    }
  }

  return {
    matches: allMatches,
    totalMatches,
    filesSearched: logFiles.length,
    filesWithMatches: Object.keys(fileMatchCounts).length,
    matchesPerFile: fileMatchCounts,
    pattern: params.pattern,
    truncated: totalMatches >= maxResults,
  };
}
