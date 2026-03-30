import { z } from "zod";
import { readLogFile, fileExists } from "../utils/fileSystem.js";
import { extractSection, type SectionType } from "../parser/sectionExtractor.js";

export const getLogContentSchema = {
  filePath: z.string().describe("Absolute or relative path to a local .log file"),
  section: z
    .enum([
      "full",
      "callouts",
      "exceptions",
      "soql",
      "dml",
      "governor",
      "flow",
      "debug_messages",
      "head",
      "tail",
    ])
    .default("full")
    .describe(
      "Section to extract: " +
        "callouts (detect silent integration failures), " +
        "exceptions (handled AND unhandled), " +
        "soql (queries with row counts — flag zero results), " +
        "dml (operations with record counts), " +
        "governor (limit usage with % and status), " +
        "flow (automation paths — detect skipped), " +
        "debug_messages (System.debug output), " +
        "head/tail (first/last N lines), " +
        "full (everything truncated to maxLines)",
    ),
  maxLines: z
    .number()
    .min(10)
    .max(5000)
    .default(500)
    .describe("Max lines to return for full/head/tail sections (default 500)"),
};

export async function getLogContent(params: {
  filePath: string;
  section?: string;
  maxLines?: number;
}) {
  const exists = await fileExists(params.filePath);
  if (!exists) {
    throw new Error(
      `Log file not found: ${params.filePath}. ` +
        `Use fetch_debug_log or fetch_latest_logs to download logs first.`,
    );
  }

  const content = await readLogFile(params.filePath);
  const section = (params.section ?? "full") as SectionType;
  const maxLines = params.maxLines ?? 500;

  return extractSection(content, section, params.filePath, maxLines);
}
