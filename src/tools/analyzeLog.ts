import { z } from "zod";
import { readLogFile, fileExists } from "../utils/fileSystem.js";
import { extractSection } from "../parser/sectionExtractor.js";
import type {
  GovernorLimits,
  CalloutEntry,
  SoqlEntry,
  DmlEntry,
  ExceptionEntry,
  FlowEntry,
} from "../parser/types.js";

export const analyzeLogSchema = {
  filePath: z.string().describe("Path to a downloaded .log file"),
};

export async function analyzeLog(params: { filePath: string }) {
  if (!(await fileExists(params.filePath))) {
    throw new Error(
      `Log file not found: ${params.filePath}. Use fetch_debug_log or fetch_latest_logs first.`,
    );
  }

  const content = await readLogFile(params.filePath);
  const lineCount = content.split("\n").length;

  // Extract all sections in parallel
  const [governor, soql, dml, callouts, exceptions, flow] = await Promise.all([
    extractSection(content, "governor", params.filePath, 5000),
    extractSection(content, "soql", params.filePath, 5000),
    extractSection(content, "dml", params.filePath, 5000),
    extractSection(content, "callouts", params.filePath, 5000),
    extractSection(content, "exceptions", params.filePath, 5000),
    extractSection(content, "flow", params.filePath, 5000),
  ]);

  const soqlEntries = soql.entries as SoqlEntry[];
  const dmlEntries = dml.entries as DmlEntry[];
  const calloutEntries = callouts.entries as CalloutEntry[];
  const exceptionEntries = exceptions.entries as ExceptionEntry[];
  const flowEntries = flow.entries as FlowEntry[];
  const limits = (governor.entries as GovernorLimits[])[0] ?? {};

  // Build summary
  const warnings: string[] = [];
  const criticalIssues: string[] = [];

  // Governor limits analysis
  const criticalLimits: string[] = [];
  const warningLimits: string[] = [];
  for (const [, limit] of Object.entries(limits)) {
    const l = limit as { name: string; used: number; max: number; percent: number; status: string };
    if (l.status === "CRITICAL") criticalLimits.push(`${l.name}: ${l.used}/${l.max} (${l.percent}%)`);
    else if (l.status === "WARNING") warningLimits.push(`${l.name}: ${l.used}/${l.max} (${l.percent}%)`);
  }
  if (criticalLimits.length > 0) {
    criticalIssues.push(`Governor limits CRITICAL: ${criticalLimits.join("; ")}`);
  }
  if (warningLimits.length > 0) {
    warnings.push(`Governor limits approaching: ${warningLimits.join("; ")}`);
  }

  // SOQL analysis
  const zeroRowQueries = soqlEntries.filter((e) => e.rowCount === 0);
  const largeQueries = soqlEntries.filter((e) => (e.rowCount ?? 0) > 500);
  if (zeroRowQueries.length > 0) {
    warnings.push(
      `${zeroRowQueries.length} SOQL quer${zeroRowQueries.length === 1 ? "y" : "ies"} returned 0 rows — possible data issue`,
    );
  }
  if (largeQueries.length > 0) {
    warnings.push(`${largeQueries.length} SOQL quer${largeQueries.length === 1 ? "y" : "ies"} returned >500 rows`);
  }

  // Callout analysis
  const failedCallouts = calloutEntries.filter((e) => e.response?.statusCode && e.response.statusCode >= 400);
  const silentCalloutFailures = calloutEntries.filter(
    (e) =>
      e.response?.statusCode &&
      e.response.statusCode >= 200 &&
      e.response.statusCode < 300 &&
      e.response.body &&
      /error|fail|exception|fault/i.test(e.response.body),
  );
  if (failedCallouts.length > 0) {
    criticalIssues.push(`${failedCallouts.length} callout(s) returned HTTP error status`);
  }
  if (silentCalloutFailures.length > 0) {
    criticalIssues.push(
      `${silentCalloutFailures.length} callout(s) returned HTTP 2xx but contain error keywords — SILENT FAILURE`,
    );
  }

  // Exception analysis
  const unhandled = exceptionEntries.filter((e) => !e.handled);
  const handled = exceptionEntries.filter((e) => e.handled);
  if (unhandled.length > 0) {
    criticalIssues.push(`${unhandled.length} unhandled exception(s)`);
  }
  if (handled.length > 0) {
    warnings.push(`${handled.length} handled exception(s) — verify error handling is correct`);
  }

  // Flow analysis
  const flowErrors = flowEntries.filter(
    (e) => e.eventType === "FLOW_ELEMENT_ERROR" || e.eventType === "FLOW_ELEMENT_FAULT",
  );
  if (flowErrors.length > 0) {
    criticalIssues.push(`${flowErrors.length} flow error(s)/fault(s) detected`);
  }

  // DML analysis
  const largeDml = dmlEntries.filter((e) => (e.rowCount ?? 0) > 200);
  if (largeDml.length > 0) {
    warnings.push(`${largeDml.length} DML operation(s) affected >200 rows`);
  }

  // Health score: 100 minus deductions
  let healthScore = 100;
  healthScore -= criticalIssues.length * 20;
  healthScore -= warnings.length * 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthRating =
    healthScore >= 90 ? "HEALTHY" : healthScore >= 70 ? "WARNING" : healthScore >= 50 ? "DEGRADED" : "CRITICAL";

  return {
    filePath: params.filePath,
    summary: {
      lineCount,
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      healthScore,
      healthRating,
    },
    counts: {
      soqlQueries: soqlEntries.length,
      dmlOperations: dmlEntries.length,
      callouts: calloutEntries.length,
      exceptions: exceptionEntries.length,
      flowEvents: flowEntries.length,
    },
    governorLimits: Object.fromEntries(
      Object.entries(limits)
        .filter(([, v]) => {
          const l = v as { status: string };
          return l.status !== "OK";
        })
        .map(([k, v]) => [k, v]),
    ),
    criticalIssues: criticalIssues.length > 0 ? criticalIssues : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    details: {
      zeroRowQueries: zeroRowQueries.length > 0
        ? zeroRowQueries.map((q) => ({ query: q.query, lineNumber: q.lineNumber }))
        : undefined,
      failedCallouts: failedCallouts.length > 0
        ? failedCallouts.map((c) => ({
            endpoint: c.request.endpoint,
            method: c.request.method,
            statusCode: c.response.statusCode,
          }))
        : undefined,
      unhandledExceptions: unhandled.length > 0
        ? unhandled.map((e) => ({ type: e.exceptionType, message: e.message, lineNumber: e.lineNumber }))
        : undefined,
      flowErrors: flowErrors.length > 0
        ? flowErrors.map((f) => ({
            eventType: f.eventType,
            flowName: f.flowName,
            elementName: f.elementName,
          }))
        : undefined,
    },
  };
}
