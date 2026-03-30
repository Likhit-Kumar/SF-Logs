import { Connection } from "@salesforce/core";
import type { ApexLogRecord, ApexLogQueryResult } from "./types.js";

export interface ListLogsOptions {
  limit?: number;
  userId?: string;
  operation?: string;
  status?: string;
  startTimeAfter?: string;
  startTimeBefore?: string;
  minDuration?: number;
  minSize?: number;
}

export async function listLogs(
  connection: Connection,
  options: ListLogsOptions = {},
): Promise<ApexLogRecord[]> {
  const query = buildLogQuery(options);
  const result = await connection.tooling.query<ApexLogRecord>(query);
  return result.records;
}

export function buildLogQuery(options: ListLogsOptions): string {
  const fields = [
    "Id",
    "Application",
    "DurationMilliseconds",
    "Location",
    "LogLength",
    "LogUserId",
    "LogUser.Id",
    "LogUser.Name",
    "Operation",
    "Request",
    "StartTime",
    "Status",
    "SystemModstamp",
  ].join(", ");

  const conditions: string[] = [];

  if (options.userId) {
    conditions.push(`LogUserId = '${escapeSoql(options.userId)}'`);
  }
  if (options.operation) {
    conditions.push(`Operation = '${escapeSoql(options.operation)}'`);
  }
  if (options.status) {
    conditions.push(`Status = '${escapeSoql(options.status)}'`);
  }
  if (options.startTimeAfter) {
    conditions.push(`StartTime > ${options.startTimeAfter}`);
  }
  if (options.startTimeBefore) {
    conditions.push(`StartTime < ${options.startTimeBefore}`);
  }
  if (options.minDuration !== undefined) {
    conditions.push(`DurationMilliseconds >= ${options.minDuration}`);
  }
  if (options.minSize !== undefined) {
    conditions.push(`LogLength >= ${options.minSize}`);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  return `SELECT ${fields} FROM ApexLog${where} ORDER BY StartTime DESC LIMIT ${limit}`;
}

export async function downloadLogBody(connection: Connection, logId: string): Promise<string> {
  const body = await connection.request(`/sobjects/ApexLog/${logId}/Body`);
  return body as string;
}

export async function deleteLog(connection: Connection, logId: string): Promise<void> {
  await connection.tooling.delete("ApexLog", logId);
}

export async function deleteLogsBatch(
  connection: Connection,
  logIds: string[],
): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Tooling API composite supports up to 25 per request; process in chunks
  const chunkSize = 25;
  for (let i = 0; i < logIds.length; i += chunkSize) {
    const chunk = logIds.slice(i, i + chunkSize);
    const promises = chunk.map(async (id) => {
      try {
        await connection.tooling.delete("ApexLog", id);
        deleted.push(id);
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    await Promise.all(promises);
  }

  return { deleted, failed };
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}
