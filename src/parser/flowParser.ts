import type { ParsedLogLine, FlowEntry } from "./types.js";

const FLOW_EVENT_TYPES = new Set([
  "FLOW_START_INTERVIEWS_BEGIN",
  "FLOW_START_INTERVIEWS_END",
  "FLOW_START_INTERVIEW_BEGIN",
  "FLOW_START_INTERVIEW_END",
  "FLOW_ELEMENT_BEGIN",
  "FLOW_ELEMENT_END",
  "FLOW_ELEMENT_DEFERRED",
  "FLOW_ELEMENT_ERROR",
  "FLOW_ELEMENT_FAULT",
  "FLOW_ASSIGNMENT_DETAIL",
  "FLOW_RULE_DETAIL",
  "FLOW_VALUE_ASSIGNMENT",
  "FLOW_ACTIONCALL_DETAIL",
  "FLOW_LOOP_DETAIL",
  "FLOW_SUBFLOW_DETAIL",
  "FLOW_CREATE_INTERVIEW_BEGIN",
  "FLOW_CREATE_INTERVIEW_END",
]);

export function parseFlowEvents(lines: ParsedLogLine[]): FlowEntry[] {
  const entries: FlowEntry[] = [];

  for (const line of lines) {
    if (!FLOW_EVENT_TYPES.has(line.eventType)) continue;

    const flowName = extractFlowName(line.details);
    const elementName = extractElementName(line.details);

    entries.push({
      timestamp: line.timestamp,
      eventType: line.eventType,
      flowName,
      elementName,
      details: line.details,
    });
  }

  return entries;
}

function extractFlowName(details: string): string | undefined {
  // Flow names typically appear at the start of the details
  const match = details.match(/^(\w+(?:[-_]\w+)*)/);
  return match?.[1];
}

function extractElementName(details: string): string | undefined {
  const match = details.match(/\|(\w+(?:[-_]\w+)*)\|/);
  return match?.[1];
}

export function generateFlowWarnings(entries: FlowEntry[]): string | undefined {
  const warnings: string[] = [];

  const errors = entries.filter(
    (e) => e.eventType === "FLOW_ELEMENT_ERROR" || e.eventType === "FLOW_ELEMENT_FAULT",
  );

  if (errors.length > 0) {
    warnings.push(`${errors.length} flow element error(s)/fault(s) detected`);
  }

  if (entries.length === 0) {
    return undefined;
  }

  return warnings.length > 0 ? warnings.join(". ") + "." : undefined;
}
