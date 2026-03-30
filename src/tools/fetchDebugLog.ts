import { z } from "zod";
import { getOrgConnection } from "../salesforce/connection.js";
import { downloadLogBody, listLogs } from "../salesforce/logs.js";
import { saveLogFile } from "../utils/fileSystem.js";

export const fetchDebugLogSchema = {
  targetOrg: z.string().optional().describe("Org alias or username. Uses default org if omitted."),
  logId: z.string().describe("ApexLog record ID (starts with 07L)"),
  outputDir: z
    .string()
    .default("./sf-logs/")
    .describe("Directory to save the downloaded log file"),
  returnContent: z
    .boolean()
    .default(false)
    .describe("Also return raw log content in response (truncated if >100KB)"),
};

export async function fetchDebugLog(
  allowedOrgs: string[],
  defaultOutputDir: string,
  params: {
    targetOrg?: string;
    logId: string;
    outputDir?: string;
    returnContent?: boolean;
  },
) {
  const { connection } = await getOrgConnection(allowedOrgs, params.targetOrg);
  const outputDir = params.outputDir || defaultOutputDir;

  // Download the log body
  const body = await downloadLogBody(connection, params.logId);

  // Save to disk
  const filePath = await saveLogFile(outputDir, params.logId, body);
  const sizeBytes = Buffer.byteLength(body, "utf-8");

  // Optionally fetch metadata for this log
  let metadata: { operation?: string; startTime?: string; status?: string } = {};
  try {
    const records = await listLogs(connection, { limit: 1 });
    const match = records.find((r) => r.Id === params.logId);
    if (match) {
      metadata = {
        operation: match.Operation,
        startTime: match.StartTime,
        status: match.Status,
      };
    }
  } catch {
    // Metadata fetch is best-effort
  }

  const result: Record<string, unknown> = {
    filePath,
    logId: params.logId,
    sizeBytes,
    ...metadata,
  };

  if (params.returnContent) {
    const maxContentSize = 100 * 1024; // 100KB
    result.content =
      body.length > maxContentSize
        ? body.substring(0, maxContentSize) + "\n... [TRUNCATED — full content saved to file]"
        : body;
  }

  return result;
}
