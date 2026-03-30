import { z } from "zod";
import { getOrgConnection } from "../salesforce/connection.js";
import {
  listTraceFlags,
  createTraceFlag,
  deleteTraceFlag,
  updateTraceFlag,
} from "../salesforce/traceFlags.js";
import type { LogLevel } from "../salesforce/types.js";

const logLevelEnum = z.enum(["NONE", "ERROR", "WARN", "INFO", "DEBUG", "FINE", "FINER", "FINEST"]);

export const manageTraceFlagsSchema = {
  targetOrg: z.string().optional().describe("Org alias or username. Uses default org if omitted."),
  action: z
    .enum(["list", "create", "delete", "update"])
    .describe(
      "Action to perform: " +
        "list (show all trace flags), " +
        "create (new trace flag for a user), " +
        "delete (remove a trace flag), " +
        "update (extend or modify an existing trace flag)",
    ),
  traceFlagId: z
    .string()
    .optional()
    .describe("Trace flag ID — required for delete and update actions"),
  tracedEntityId: z
    .string()
    .optional()
    .describe(
      "User ID (005...) to trace — required for create. " +
        "Use 'me' to trace the authenticated user.",
    ),
  expirationMinutes: z
    .number()
    .min(1)
    .max(1440)
    .optional()
    .describe("Trace flag duration in minutes (1-1440, default 60). Used for create and update."),
  debugLevel: z
    .object({
      apexCode: logLevelEnum.optional(),
      apexProfiling: logLevelEnum.optional(),
      callout: logLevelEnum.optional(),
      database: logLevelEnum.optional(),
      system: logLevelEnum.optional(),
      validation: logLevelEnum.optional(),
      visualforce: logLevelEnum.optional(),
      workflow: logLevelEnum.optional(),
    })
    .optional()
    .describe(
      "Custom debug level overrides. Defaults: apexCode=FINE, database=FINEST, callout=DEBUG. " +
        "Only used for create action.",
    ),
};

export async function manageTraceFlags(
  allowedOrgs: string[],
  params: {
    targetOrg?: string;
    action: string;
    traceFlagId?: string;
    tracedEntityId?: string;
    expirationMinutes?: number;
    debugLevel?: Partial<Record<string, LogLevel>>;
  },
) {
  const { connection, org } = await getOrgConnection(allowedOrgs, params.targetOrg);

  switch (params.action) {
    case "list": {
      const flags = await listTraceFlags(connection);
      return {
        action: "list",
        traceFlags: flags.map((f) => ({
          id: f.Id,
          tracedEntityId: f.TracedEntityId,
          tracedEntityName: f.TracedEntity?.Name ?? null,
          debugLevelId: f.DebugLevelId,
          logType: f.LogType,
          startDate: f.StartDate,
          expirationDate: f.ExpirationDate,
          isActive: new Date(f.ExpirationDate) > new Date(),
        })),
        totalSize: flags.length,
        orgUsername: org.getUsername(),
      };
    }

    case "create": {
      let tracedEntityId = params.tracedEntityId;
      if (!tracedEntityId) {
        throw new Error("tracedEntityId is required for create action. Use 'me' for the current user.");
      }

      // Resolve 'me' to the authenticated user's ID
      if (tracedEntityId.toLowerCase() === "me") {
        const userInfo = await connection.query<{ Id: string }>(
          `SELECT Id FROM User WHERE Username = '${org.getUsername()}'`,
        );
        if (userInfo.records.length === 0) {
          throw new Error("Could not resolve current user ID.");
        }
        tracedEntityId = userInfo.records[0].Id;
      }

      const result = await createTraceFlag(
        connection,
        tracedEntityId,
        params.debugLevel,
        params.expirationMinutes ?? 60,
      );

      const expiresAt = new Date(
        Date.now() + (params.expirationMinutes ?? 60) * 60000,
      ).toISOString();

      return {
        action: "create",
        traceFlagId: result.traceFlagId,
        debugLevelId: result.debugLevelId,
        tracedEntityId,
        expiresAt,
        message: `Trace flag created. Debug logs will be generated for this user until ${expiresAt}.`,
      };
    }

    case "delete": {
      if (!params.traceFlagId) {
        throw new Error("traceFlagId is required for delete action. Use list action to find IDs.");
      }

      await deleteTraceFlag(connection, params.traceFlagId);

      return {
        action: "delete",
        traceFlagId: params.traceFlagId,
        message: "Trace flag deleted successfully.",
      };
    }

    case "update": {
      if (!params.traceFlagId) {
        throw new Error("traceFlagId is required for update action. Use list action to find IDs.");
      }

      const expirationMinutes = params.expirationMinutes ?? 60;
      await updateTraceFlag(connection, params.traceFlagId, expirationMinutes);

      const expiresAt = new Date(Date.now() + expirationMinutes * 60000).toISOString();

      return {
        action: "update",
        traceFlagId: params.traceFlagId,
        expiresAt,
        message: `Trace flag updated. New expiration: ${expiresAt}.`,
      };
    }

    default:
      throw new Error(`Unknown action: ${params.action}`);
  }
}
