import { z } from "zod";
import { getOrgConnection } from "../salesforce/connection.js";
import { listLogs } from "../salesforce/logs.js";

export const listDebugLogsSchema = {
  targetOrg: z.string().optional().describe("Org alias or username. Uses default org if omitted."),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max number of logs to return (1-100, default 20)"),
  userId: z.string().optional().describe("Filter by Salesforce user ID (005...)"),
  operation: z
    .string()
    .optional()
    .describe("Filter by operation type: API, ApexTrigger, ApexTest, VF, etc."),
  status: z
    .string()
    .optional()
    .describe("Filter by status: Success, Fatal Error, etc. Not set by default — most issues are silent failures."),
  startTimeAfter: z
    .string()
    .optional()
    .describe("ISO datetime — only logs after this time (e.g. 2026-03-28T00:00:00Z)"),
  startTimeBefore: z
    .string()
    .optional()
    .describe("ISO datetime — only logs before this time"),
  minDuration: z.number().optional().describe("Minimum transaction duration in milliseconds"),
  minSize: z.number().optional().describe("Minimum log size in bytes"),
};

export async function listDebugLogs(
  allowedOrgs: string[],
  params: {
    targetOrg?: string;
    limit?: number;
    userId?: string;
    operation?: string;
    status?: string;
    startTimeAfter?: string;
    startTimeBefore?: string;
    minDuration?: number;
    minSize?: number;
  },
) {
  const { connection, org } = await getOrgConnection(allowedOrgs, params.targetOrg);

  const records = await listLogs(connection, {
    limit: params.limit,
    userId: params.userId,
    operation: params.operation,
    status: params.status,
    startTimeAfter: params.startTimeAfter,
    startTimeBefore: params.startTimeBefore,
    minDuration: params.minDuration,
    minSize: params.minSize,
  });

  const logs = records.map((r) => ({
    id: r.Id,
    application: r.Application,
    durationMs: r.DurationMilliseconds,
    location: r.Location,
    logLength: r.LogLength,
    logUser: r.LogUser ? { id: r.LogUser.Id, name: r.LogUser.Name } : { id: r.LogUserId },
    operation: r.Operation,
    request: r.Request,
    startTime: r.StartTime,
    status: r.Status,
  }));

  return {
    logs,
    totalSize: logs.length,
    orgUsername: org.getUsername(),
  };
}
