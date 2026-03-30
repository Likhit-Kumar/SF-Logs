import { z } from "zod";
import { getOrgConnection } from "../salesforce/connection.js";
import { listLogs, downloadLogBody } from "../salesforce/logs.js";
import { saveLogFile, ensureDir } from "../utils/fileSystem.js";

export const fetchLatestLogsSchema = {
  targetOrg: z.string().optional().describe("Org alias or username. Uses default org if omitted."),
  count: z
    .number()
    .min(1)
    .max(25)
    .default(5)
    .describe("Number of most recent logs to fetch (1-25, default 5)"),
  outputDir: z
    .string()
    .default("./sf-logs/")
    .describe("Directory to save downloaded log files"),
  userId: z.string().optional().describe("Filter by user ID before fetching"),
  operation: z.string().optional().describe("Filter by operation type before fetching"),
};

export async function fetchLatestLogs(
  allowedOrgs: string[],
  defaultOutputDir: string,
  params: {
    targetOrg?: string;
    count?: number;
    outputDir?: string;
    userId?: string;
    operation?: string;
  },
) {
  const { connection } = await getOrgConnection(allowedOrgs, params.targetOrg);
  const outputDir = params.outputDir || defaultOutputDir;
  const count = params.count ?? 5;

  await ensureDir(outputDir);

  // List the most recent logs
  const records = await listLogs(connection, {
    limit: count,
    userId: params.userId,
    operation: params.operation,
  });

  if (records.length === 0) {
    return {
      logs: [],
      totalFetched: 0,
      outputDir,
      message: "No debug logs found matching the criteria. Ensure a TraceFlag is active.",
    };
  }

  // Download each log
  const logs: Array<{
    filePath: string;
    logId: string;
    sizeBytes: number;
    operation: string;
    startTime: string;
    status: string;
    durationMs: number;
  }> = [];

  for (const record of records) {
    try {
      const body = await downloadLogBody(connection, record.Id);
      const filePath = await saveLogFile(outputDir, record.Id, body);

      logs.push({
        filePath,
        logId: record.Id,
        sizeBytes: Buffer.byteLength(body, "utf-8"),
        operation: record.Operation,
        startTime: record.StartTime,
        status: record.Status,
        durationMs: record.DurationMilliseconds,
      });
    } catch (error) {
      console.error(`Failed to download log ${record.Id}:`, error);
    }
  }

  return {
    logs,
    totalFetched: logs.length,
    outputDir,
  };
}
