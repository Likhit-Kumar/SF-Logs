export interface ParsedLogLine {
  timestamp: string;
  nanoseconds: number;
  eventType: string;
  lineNumber?: number;
  details: string;
  raw: string;
}

export interface CalloutEntry {
  lineNumber?: number;
  timestamp: string;
  request: {
    endpoint: string;
    method: string;
  };
  response: {
    statusCode: number;
    body?: string;
  };
  durationMs?: number;
  callingMethod?: string;
}

export interface ExceptionEntry {
  lineNumber?: number;
  timestamp: string;
  exceptionType: string;
  message: string;
  handled: boolean;
  handlerMethod?: string;
  stackTrace?: string;
}

export interface SoqlEntry {
  lineNumber?: number;
  timestamp: string;
  query: string;
  rowCount: number;
  durationMs?: number;
  callingMethod?: string;
  aggregations: number;
}

export interface DmlEntry {
  lineNumber?: number;
  timestamp: string;
  operation: string;
  objectType: string;
  rowCount: number;
  callingMethod?: string;
}

export interface GovernorLimitEntry {
  name: string;
  used: number;
  max: number;
  percent: number;
  status: "OK" | "WARNING" | "CRITICAL";
}

export interface GovernorLimits {
  cpuTime?: GovernorLimitEntry;
  soqlQueries?: GovernorLimitEntry;
  soqlRows?: GovernorLimitEntry;
  dmlStatements?: GovernorLimitEntry;
  dmlRows?: GovernorLimitEntry;
  heapSize?: GovernorLimitEntry;
  callouts?: GovernorLimitEntry;
  futureCalls?: GovernorLimitEntry;
  [key: string]: GovernorLimitEntry | undefined;
}

export interface FlowEntry {
  timestamp: string;
  eventType: string;
  flowName?: string;
  elementName?: string;
  details: string;
}

export interface LogSection<T> {
  section: string;
  entries: T[];
  totalEntries: number;
  filePath: string;
  warning?: string;
}
