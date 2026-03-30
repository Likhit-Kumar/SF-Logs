export interface ApexLogRecord {
  Id: string;
  Application: string;
  DurationMilliseconds: number;
  Location: string;
  LogLength: number;
  LogUserId: string;
  LogUser?: {
    Id: string;
    Name: string;
  };
  Operation: string;
  Request: string;
  StartTime: string;
  Status: string;
  SystemModstamp: string;
}

export interface ApexLogQueryResult {
  totalSize: number;
  done: boolean;
  records: ApexLogRecord[];
}

export interface TraceFlagRecord {
  Id: string;
  TracedEntityId: string;
  DebugLevelId: string;
  ExpirationDate: string;
  LogType: string;
  StartDate: string;
  TracedEntity?: {
    Name: string;
  };
}

export interface DebugLevelRecord {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  ApexCode: string;
  ApexProfiling: string;
  Callout: string;
  Database: string;
  System: string;
  Validation: string;
  Visualforce: string;
  Workflow: string;
  Nba: string;
  Wave: string;
}

export type LogLevel = "NONE" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "FINE" | "FINER" | "FINEST";
