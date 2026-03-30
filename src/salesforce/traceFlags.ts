import { Connection } from "@salesforce/core";
import type { TraceFlagRecord, DebugLevelRecord, LogLevel } from "./types.js";

export interface DebugLevelConfig {
  apexCode?: LogLevel;
  apexProfiling?: LogLevel;
  callout?: LogLevel;
  database?: LogLevel;
  system?: LogLevel;
  validation?: LogLevel;
  visualforce?: LogLevel;
  workflow?: LogLevel;
  nba?: LogLevel;
  wave?: LogLevel;
}

const DEFAULT_DEBUG_LEVEL: Required<DebugLevelConfig> = {
  apexCode: "FINE",
  apexProfiling: "FINE",
  callout: "DEBUG",
  database: "FINEST",
  system: "DEBUG",
  validation: "DEBUG",
  visualforce: "FINE",
  workflow: "FINE",
  nba: "INFO",
  wave: "INFO",
};

export async function listTraceFlags(connection: Connection): Promise<TraceFlagRecord[]> {
  const result = await connection.tooling.query<TraceFlagRecord>(
    "SELECT Id, TracedEntityId, DebugLevelId, ExpirationDate, LogType, StartDate " +
      "FROM TraceFlag ORDER BY ExpirationDate DESC",
  );
  return result.records;
}

export async function createTraceFlag(
  connection: Connection,
  tracedEntityId: string,
  debugLevel?: DebugLevelConfig,
  expirationMinutes: number = 60,
): Promise<{ traceFlagId: string; debugLevelId: string }> {
  const mergedLevel = { ...DEFAULT_DEBUG_LEVEL, ...debugLevel };

  const debugLevelResult = await connection.tooling.create("DebugLevel", {
    DeveloperName: `sf_log_mcp_${Date.now()}`,
    MasterLabel: "SF Log MCP",
    ApexCode: mergedLevel.apexCode,
    ApexProfiling: mergedLevel.apexProfiling,
    Callout: mergedLevel.callout,
    Database: mergedLevel.database,
    System: mergedLevel.system,
    Validation: mergedLevel.validation,
    Visualforce: mergedLevel.visualforce,
    Workflow: mergedLevel.workflow,
    Nba: mergedLevel.nba,
    Wave: mergedLevel.wave,
  });

  if (!debugLevelResult.success) {
    throw new Error(`Failed to create DebugLevel: ${JSON.stringify(debugLevelResult.errors)}`);
  }

  const cappedMinutes = Math.min(Math.max(expirationMinutes, 1), 1440);
  const expirationDate = new Date(Date.now() + cappedMinutes * 60000).toISOString();

  const traceFlagResult = await connection.tooling.create("TraceFlag", {
    TracedEntityId: tracedEntityId,
    DebugLevelId: debugLevelResult.id,
    LogType: "DEVELOPER_LOG",
    StartDate: new Date().toISOString(),
    ExpirationDate: expirationDate,
  });

  if (!traceFlagResult.success) {
    throw new Error(`Failed to create TraceFlag: ${JSON.stringify(traceFlagResult.errors)}`);
  }

  return {
    traceFlagId: traceFlagResult.id,
    debugLevelId: debugLevelResult.id,
  };
}

export async function deleteTraceFlag(connection: Connection, traceFlagId: string): Promise<void> {
  await connection.tooling.delete("TraceFlag", traceFlagId);
}
