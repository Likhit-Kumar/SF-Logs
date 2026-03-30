import { z } from "zod";
import { getOrgConnection } from "../salesforce/connection.js";
import { listLogs, deleteLog, deleteLogsBatch } from "../salesforce/logs.js";

export const deleteDebugLogsSchema = {
  targetOrg: z.string().optional().describe("Org alias or username. Uses default org if omitted."),
  logIds: z
    .array(z.string())
    .optional()
    .describe("Specific log IDs to delete. Takes priority over filter-based deletion."),
  deleteAll: z
    .boolean()
    .default(false)
    .describe("Delete ALL debug logs in the org. Use with caution."),
  olderThanMinutes: z
    .number()
    .min(1)
    .optional()
    .describe("Delete logs older than N minutes ago."),
  userId: z.string().optional().describe("Delete only logs belonging to this user ID (005...)."),
  operation: z.string().optional().describe("Delete only logs matching this operation type."),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Preview which logs would be deleted without actually deleting them."),
};

export async function deleteDebugLogs(
  allowedOrgs: string[],
  params: {
    targetOrg?: string;
    logIds?: string[];
    deleteAll?: boolean;
    olderThanMinutes?: number;
    userId?: string;
    operation?: string;
    dryRun?: boolean;
  },
) {
  const { connection, org } = await getOrgConnection(allowedOrgs, params.targetOrg);
  const dryRun = params.dryRun ?? false;

  // Mode 1: Delete specific IDs
  if (params.logIds && params.logIds.length > 0) {
    if (dryRun) {
      return {
        dryRun: true,
        wouldDelete: params.logIds.length,
        logIds: params.logIds,
        message: `Would delete ${params.logIds.length} log(s).`,
      };
    }

    if (params.logIds.length === 1) {
      await deleteLog(connection, params.logIds[0]);
      return {
        deleted: 1,
        failed: 0,
        logIds: params.logIds,
        message: "1 log deleted successfully.",
      };
    }

    const result = await deleteLogsBatch(connection, params.logIds);
    return {
      deleted: result.deleted.length,
      failed: result.failed.length,
      deletedIds: result.deleted,
      failures: result.failed.length > 0 ? result.failed : undefined,
      message: `${result.deleted.length} log(s) deleted, ${result.failed.length} failed.`,
    };
  }

  // Mode 2: Filter-based deletion (deleteAll, olderThan, userId, operation)
  if (!params.deleteAll && !params.olderThanMinutes && !params.userId && !params.operation) {
    throw new Error(
      "Specify logIds, deleteAll, olderThanMinutes, userId, or operation to determine which logs to delete.",
    );
  }

  // Build filter to find matching logs
  const filterOptions: {
    limit?: number;
    userId?: string;
    operation?: string;
    startTimeBefore?: string;
  } = { limit: 100 };

  if (params.userId) filterOptions.userId = params.userId;
  if (params.operation) filterOptions.operation = params.operation;
  if (params.olderThanMinutes) {
    const cutoff = new Date(Date.now() - params.olderThanMinutes * 60000);
    filterOptions.startTimeBefore = cutoff.toISOString();
  }

  const records = await listLogs(connection, filterOptions);

  if (records.length === 0) {
    return {
      deleted: 0,
      message: "No logs matched the filter criteria.",
      orgUsername: org.getUsername(),
    };
  }

  const ids = records.map((r) => r.Id);

  if (dryRun) {
    return {
      dryRun: true,
      wouldDelete: ids.length,
      logs: records.map((r) => ({
        id: r.Id,
        operation: r.Operation,
        startTime: r.StartTime,
        status: r.Status,
        sizeBytes: r.LogLength,
      })),
      message: `Would delete ${ids.length} log(s). Set dryRun=false to proceed.`,
    };
  }

  const result = await deleteLogsBatch(connection, ids);

  return {
    deleted: result.deleted.length,
    failed: result.failed.length,
    failures: result.failed.length > 0 ? result.failed : undefined,
    orgUsername: org.getUsername(),
    message: `${result.deleted.length} log(s) deleted, ${result.failed.length} failed.`,
  };
}
