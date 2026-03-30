# SF Log AI Analyzer

> An MCP server that **fetches, manages, and AI-analyzes** Salesforce debug logs — bridging the gap between your org and your AI assistant.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Architecture](#architecture)
4. [Approach Breakdown](#approach-breakdown)
5. [Feature Specification](#feature-specification)
6. [Technical Requirements](#technical-requirements)
7. [Salesforce API Reference](#salesforce-api-reference)
8. [MCP Server Design](#mcp-server-design)
9. [Project Structure](#project-structure)
10. [Implementation Plan](#implementation-plan)
11. [Deployment & Distribution](#deployment--distribution)
12. [MCP Client Configuration](#mcp-client-configuration)
13. [Security Considerations](#security-considerations)
14. [Testing Strategy](#testing-strategy)
15. [Roadmap](#roadmap)

---

## Problem Statement

### The Current Gap

Certinia's `@certinia/apex-log-mcp` (v1.0.0, released March 2026) is a solid **log parser** — but it is NOT a log fetcher. Here's the reality:

| Tool | Connects to Salesforce? | Input Required |
|------|------------------------|----------------|
| `get_apex_log_summary` | No | Local `.log` file path |
| `analyze_apex_log_performance` | No | Local `.log` file path |
| `find_performance_bottlenecks` | No | Local `.log` file path |
| `execute_anonymous` | Yes (only one) | Authenticated SF CLI org |

**The workflow today, even with MCP:**
```
1. Open SF Dev Console / Setup > Debug Logs
2. Manually download the .log file (or run `sf apex get log`)
3. Save it to your local filesystem
4. Tell the AI: "Analyze /path/to/mylog.log"
5. MCP tools parse the file and return structured JSON
6. AI gives you insights
```

Steps 2-3 are fully manual. There is **no tool** to list, browse, search, or download debug logs from an org. The AI cannot autonomously go fetch the logs it needs.

### What About @salesforce/mcp (Official)?

The official Salesforce DX MCP Server (`@salesforce/mcp`) has 60+ tools across toolsets (data, metadata, testing, LWC, Aura, DevOps, Code Analysis, etc.) but:

- **No debug log tools exist.** No `list_logs`, `fetch_log`, `download_log`, or `manage_trace_flags`.
- It has `run_soql_query` (data toolset) and `run_apex_test` (testing toolset), but no log retrieval.
- It cannot be used to fetch debug logs.

**Bottom line:** Neither Certinia's MCP server nor Salesforce's official MCP server can fetch debug logs from an org. This project fills that gap.

### The Deeper Problem: "Success" Doesn't Mean Correct

Even if you could fetch logs, filtering by `Status = 'Fatal Error'` only catches **unhandled exceptions**. The `ApexLog.Status` field is unreliable for real-world debugging because most production issues are **silent failures**:

| Status says "Success" but... | Why Status misses it |
|---|---|
| Integration callout returned HTTP 200 with `{"error":"rate_limit_exceeded"}` | Code only checked HTTP status, not response body |
| DML inserted 50 records but only 30 committed | Partial failures in Database.insert(records, false) |
| Try-catch swallowed an exception, logged it, moved on | Exception was handled — Apex didn't crash |
| Business logic skipped records due to bad data | No exception thrown, just wrong IF branch |
| Future/Queueable enqueued but never executed | Enqueue succeeded, execution failed separately |
| SOQL returned 0 rows when it should have matched records | Wrong filter/sharing rules — not an error |
| Governor limits at 95% — works now, fails at scale | No failure yet, but imminent |
| Flow path never entered — expected automation didn't fire | Process completed without error, just skipped |
| Outbound message queued but target system rejected it | SF logged success, target logged failure |

**This means the real value is not filtering by status — it's reading the actual log content and reasoning about what happened.** This is exactly what AI does better than any rule-based tool.

---

## Solution Overview

Build a custom MCP server — **`sf-log-mcp`** — that provides the **missing log acquisition + content intelligence layer** and works **alongside** the Certinia parser (or includes its own analysis).

### Core Design Philosophy

> **Don't filter. Fetch. Read. Reason.**
>
> Status-based filtering catches <10% of real issues. The AI must read log content — callout responses, DML results, debug messages, governor limits, flow paths — and reason about whether the *right thing* happened, not just whether Apex crashed.

### Three-Tier Architecture

```
Tier 1: LOG ACQUISITION  (This project — the missing piece)
  - List debug logs from org (NO status filter by default)
  - Download debug log content
  - Manage trace flags & debug levels
  - Stream logs in real-time
  - Auto-save logs to local filesystem

Tier 2: LOG CONTENT INTELLIGENCE  (This project — the critical layer)
  - Extract callout request/response pairs (detect silent integration failures)
  - Extract DML operations with outcomes (detect partial failures)
  - Extract System.debug() messages (where devs log errors the system misses)
  - Extract SOQL queries with row counts (detect empty result sets)
  - Extract handled exceptions (try-catch swallowed errors)
  - Extract governor limit usage (detect approaching limits)
  - Extract flow/process builder paths (detect skipped automation)

Tier 3: LOG ANALYSIS  (Leverage Certinia's parser for structured metrics)
  - Performance profiling (method timings, rankings)
  - Governor limit percentages
  - Bottleneck detection
  - Namespace-level analysis

Tier 4: AI ORCHESTRATION  (The AI client ties it together)
  - "Our integration to Vendor X stopped working yesterday"
  - "Data isn't syncing to the external system"
  - "Something is wrong but I don't know what — check recent logs"
  - "Is our org healthy? Anything concerning in recent activity?"
```

### Two Deployment Strategies

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **A: Standalone MCP Server** | Build `sf-log-mcp` as a separate server that runs alongside `@certinia/apex-log-mcp` | Clean separation of concerns; can use both independently | User configures 2 MCP servers |
| **B: All-in-One MCP Server** | Build a single server that does BOTH acquisition + analysis | Single config; seamless workflow | More complex; duplicates Certinia's parser work |

**Recommended: Strategy A** (standalone) for v1, with the option to bundle analysis in v2.

---

## Architecture

### System Architecture

```
                         AI Client
                    (Claude / Cursor / Copilot)
                            |
                    MCP Protocol (stdio)
                     /              \
            ┌───────────────┐  ┌──────────────────────┐
            │  sf-log-mcp   │  │ @certinia/apex-log-mcp│
            │  (THIS PROJECT)│  │   (Existing Parser)   │
            │               │  │                        │
            │ - list_logs   │  │ - get_apex_log_summary │
            │ - fetch_log   │  │ - analyze_performance  │
            │ - tail_logs   │  │ - find_bottlenecks     │
            │ - set_trace   │  │ - execute_anonymous    │
            │ - delete_logs │  │                        │
            └───────┬───────┘  └────────────┬───────────┘
                    |                       |
                    v                       v
            ┌───────────────┐      ┌────────────────┐
            │  Salesforce    │      │  Local .log     │
            │  Tooling API   │      │  Files on Disk  │
            │  (REST)        │      │                 │
            └───────────────┘      └─────────────────┘
                    |
            ┌───────────────┐
            │  Authenticated │
            │  SF CLI Orgs   │
            │  (@salesforce/ │
            │   core)        │
            └───────────────┘
```

### Data Flow

```
User: "What's wrong with my latest debug log?"

AI Client
  │
  ├─> sf-log-mcp: list_debug_logs(targetOrg, limit: 1)
  │     └─> Tooling API: SELECT Id, StartTime, Operation, Status,
  │         LogLength, LogUser.Name FROM ApexLog ORDER BY StartTime DESC LIMIT 1
  │     └─> Returns: [{ id: "07L...", operation: "API", status: "Success", ... }]
  │
  ├─> sf-log-mcp: fetch_debug_log(logId: "07L...", saveTo: "./logs/")
  │     └─> Tooling API: GET /sobjects/ApexLog/07L.../Body
  │     └─> Saves to: ./logs/07L....log
  │     └─> Returns: { filePath: "./logs/07L....log", sizeBytes: 45230 }
  │
  ├─> sf-log-mcp: get_log_content(filePath: "./logs/07L....log", section: "callouts")
  │     └─> Returns: { entries: [{ endpoint: "...", statusCode: 200,
  │         body: '{"error":"duplicate"}' }], warning: "Error inside HTTP 200" }
  │
  ├─> sf-log-mcp: get_log_content(filePath: "./logs/07L....log", section: "exceptions")
  │     └─> Returns: { entries: [{ type: "NullPointerException", handled: true }],
  │         warning: "1 exception caught by try-catch" }
  │
  ├─> @certinia/apex-log-mcp: get_apex_log_summary(logFilePath: "./logs/07L....log")
  │     └─> Returns: { totalTime: 1523ms, soqlQueries: 12, dmlStatements: 5, ... }
  │
  ├─> @certinia/apex-log-mcp: find_performance_bottlenecks(logFilePath: "./logs/07L....log")
  │     └─> Returns: { cpuTime: 89%, soqlQueries: 62%, ... }
  │
  └─> AI synthesizes: "The log shows Success but the integration callout to
      vendor.com returned an error inside HTTP 200. Also, a NullPointerException
      was caught on line 78 but silently swallowed. CPU is at 89%. Here's what
      you should fix..."
```

---

## Approach Breakdown

### Approach 1: SF CLI Wrapper (Simple, Fast to Build)

Use the Salesforce CLI commands as the backend. The MCP server spawns `sf` commands as child processes.

**How it works:**
```
MCP Tool Call → spawn("sf", ["apex", "list", "log", "--json"]) → Parse JSON → Return to AI
```

**SF CLI Commands Available:**

| Command | Purpose | Key Flags |
|---------|---------|-----------|
| `sf apex list log` | List debug log IDs and metadata | `-o <org>`, `--json`, `--api-version` |
| `sf apex get log` | Fetch log content by ID or latest N | `-i <logId>`, `-n <count>`, `-d <outputDir>`, `--json` |
| `sf apex tail log` | Stream logs in real-time | `-c` (color), `-d <debugLevel>`, `-s` (skip trace flag) |
| `sf apex run` | Execute anonymous Apex | `-f <file>`, `--json` |

**Pros:**
- Fastest to build (shell out to CLI)
- Authentication handled by SF CLI (already configured)
- Battle-tested commands
- Trace flag management built into `tail log`

**Cons:**
- Requires SF CLI installed on user's machine
- Child process overhead
- Limited control over API calls
- `tail log` is streaming (harder to MCP-ify)
- Cannot do fine-grained Tooling API queries

**Best for:** Quick MVP, users who already have SF CLI installed.

---

### Approach 2: Direct Tooling API (More Powerful, Production-Grade)

Connect directly to Salesforce via `@salesforce/core` (same library Certinia uses), bypassing the CLI.

**How it works:**
```
MCP Tool Call → @salesforce/core → Salesforce Tooling API (REST) → Parse Response → Return to AI
```

**Tooling API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/services/data/vXX.0/tooling/query/?q=SELECT...FROM ApexLog...` | GET | Query log metadata |
| `/services/data/vXX.0/sobjects/ApexLog/{id}/Body` | GET | Download log content |
| `/services/data/vXX.0/tooling/sobjects/ApexLog/{id}` | DELETE | Delete a log |
| `/services/data/vXX.0/tooling/sobjects/TraceFlag/` | POST | Create trace flag |
| `/services/data/vXX.0/tooling/sobjects/TraceFlag/{id}` | PATCH | Update trace flag |
| `/services/data/vXX.0/tooling/query/?q=SELECT...FROM TraceFlag...` | GET | List trace flags |
| `/services/data/vXX.0/tooling/sobjects/DebugLevel/` | POST | Create debug level |
| `/services/data/vXX.0/tooling/query/?q=SELECT...FROM DebugLevel...` | GET | List debug levels |

**Pros:**
- No SF CLI dependency at runtime (only needs authenticated orgs)
- Full control over API requests
- Can do complex queries (filter by user, operation, date range, status)
- Efficient — direct HTTP, no process spawning
- Same approach Certinia uses for `execute_anonymous`

**Cons:**
- More code to write
- Must handle API versioning
- Must handle auth token refresh
- Must handle API limits

**Best for:** Production-grade tool, maximum capability.

---

### Recommended: Hybrid Approach

**Use `@salesforce/core` for authentication** (reuse SF CLI's auth store — no new credentials needed) + **Direct Tooling API calls for all operations** (no CLI subprocess overhead).

This is exactly what Certinia does for `execute_anonymous`, so the pattern is proven.

```typescript
import { Org } from "@salesforce/core";

// Reuse SF CLI's authenticated orgs
const org = await Org.create({ aliasOrUsername: "my-dev-org" });
const connection = org.getConnection();

// Direct Tooling API calls
const logs = await connection.tooling.query(
  "SELECT Id, StartTime, Operation, Status, LogLength, LogUser.Name " +
  "FROM ApexLog ORDER BY StartTime DESC LIMIT 20"
);

// Download log body
const logBody = await connection.request(`/sobjects/ApexLog/${logId}/Body`);
```

---

## Feature Specification

### MCP Tools to Build

#### Tool 1: `list_debug_logs`
**Purpose:** List available debug logs from a Salesforce org.

```typescript
// Parameters
{
  targetOrg: z.string().optional(),        // Org alias/username (default: project default)
  limit: z.number().default(20),           // Max logs to return (1-100)
  userId: z.string().optional(),           // Filter by user ID or username
  operation: z.string().optional(),        // Filter: "API", "ApexTrigger", "ApexTest", etc.
  status: z.string().optional(),           // Filter: "Success", "Assertion Failed", etc.
  startTimeAfter: z.string().optional(),   // ISO datetime: logs after this time
  startTimeBefore: z.string().optional(),  // ISO datetime: logs before this time
  minDuration: z.number().optional(),      // Min duration in ms
  minSize: z.number().optional(),          // Min log size in bytes
}

// Returns
{
  logs: [
    {
      id: "07L5g00000XXXX",
      application: "Browser",
      durationMs: 1523,
      location: "Monitoring",
      logLength: 45230,          // bytes
      logUser: { id: "005...", name: "John Doe" },
      operation: "API",
      request: "API",
      startTime: "2026-03-28T14:30:00.000Z",
      status: "Success"
    }
  ],
  totalSize: 15,
  orgUsername: "dev@example.com"
}
```

**SOQL Query:**
```sql
SELECT Id, Application, DurationMilliseconds, Location, LogLength,
       LogUser.Id, LogUser.Name, Operation, Request, StartTime, Status,
       SystemModstamp
FROM ApexLog
WHERE StartTime > {startTimeAfter}
  AND StartTime < {startTimeBefore}
  AND LogUserId = '{userId}'
  AND Operation = '{operation}'
  AND Status = '{status}'
  AND DurationMilliseconds >= {minDuration}
  AND LogLength >= {minSize}
ORDER BY StartTime DESC
LIMIT {limit}
```

---

#### Tool 2: `fetch_debug_log`
**Purpose:** Download a specific debug log's content and save it locally.

```typescript
// Parameters
{
  targetOrg: z.string().optional(),
  logId: z.string(),                    // ApexLog record ID (07L...)
  outputDir: z.string().default("./sf-logs/"),  // Where to save
  returnContent: z.boolean().default(false),     // Also return raw content in response
}

// Returns
{
  filePath: "/absolute/path/to/sf-logs/07L5g00000XXXX.log",
  logId: "07L5g00000XXXX",
  sizeBytes: 45230,
  operation: "API",
  startTime: "2026-03-28T14:30:00.000Z",
  status: "Success",
  content?: "..." // Only if returnContent=true (truncated if >100KB)
}
```

**API Call:**
```
GET /services/data/v66.0/sobjects/ApexLog/{logId}/Body
```

---

#### Tool 3: `fetch_latest_logs`
**Purpose:** Download the N most recent debug logs in one call.

```typescript
// Parameters
{
  targetOrg: z.string().optional(),
  count: z.number().default(5).max(25),   // How many to fetch
  outputDir: z.string().default("./sf-logs/"),
  userId: z.string().optional(),           // Filter by user
  operation: z.string().optional(),        // Filter by operation type
}

// Returns
{
  logs: [
    {
      filePath: "/absolute/path/to/sf-logs/07L...1.log",
      logId: "07L...1",
      sizeBytes: 45230,
      operation: "ApexTrigger",
      startTime: "2026-03-28T14:30:00.000Z",
      status: "Success"
    },
    // ... more logs
  ],
  totalFetched: 5,
  outputDir: "/absolute/path/to/sf-logs/"
}
```

---

#### Tool 4: `manage_trace_flags`
**Purpose:** Create, list, update, or delete trace flags for debug log generation.

```typescript
// Parameters
{
  targetOrg: z.string().optional(),
  action: z.enum(["list", "create", "update", "delete"]),

  // For create/update:
  tracedEntityId: z.string().optional(),   // User ID, Apex Class ID, or Apex Trigger ID
  tracedEntityType: z.enum(["USER", "APEX_CLASS", "APEX_TRIGGER"]).optional(),
  expirationMinutes: z.number().default(60).max(1440),  // Max 24 hours
  debugLevel: z.object({
    apexCode: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("FINE"),
    apexProfiling: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("FINE"),
    callout: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("DEBUG"),
    database: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("FINEST"),
    system: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("DEBUG"),
    validation: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("DEBUG"),
    visualforce: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("FINE"),
    workflow: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("FINE"),
    nba: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("INFO"),
    wave: z.enum(["NONE","ERROR","WARN","INFO","DEBUG","FINE","FINER","FINEST"]).default("INFO"),
  }).optional(),

  // For update/delete:
  traceFlagId: z.string().optional(),
}

// Returns (for "create")
{
  traceFlagId: "7tf...",
  debugLevelId: "7dl...",
  tracedEntityId: "005...",
  tracedEntityType: "USER",
  expirationDate: "2026-03-28T15:30:00.000Z",
  debugLevel: { apexCode: "FINE", database: "FINEST", ... },
  message: "Trace flag created. Debug logs will be generated for the next 60 minutes."
}
```

**API Calls:**
```
# List trace flags
GET /services/data/v66.0/tooling/query/?q=SELECT Id, TracedEntityId, TracedEntity.Name,
    DebugLevelId, ExpirationDate, LogType FROM TraceFlag

# Create debug level
POST /services/data/v66.0/tooling/sobjects/DebugLevel/
Body: { "DeveloperName": "sf_log_mcp_XXXX", "MasterLabel": "SF Log MCP",
        "ApexCode": "FINE", "Database": "FINEST", ... }

# Create trace flag
POST /services/data/v66.0/tooling/sobjects/TraceFlag/
Body: { "TracedEntityId": "005...", "DebugLevelId": "7dl...",
        "ExpirationDate": "2026-03-28T15:30:00Z", "LogType": "DEVELOPER_LOG" }

# Delete trace flag
DELETE /services/data/v66.0/tooling/sobjects/TraceFlag/{id}
```

---

#### Tool 5: `delete_debug_logs`
**Purpose:** Clean up old debug logs from the org.

```typescript
// Parameters
{
  targetOrg: z.string().optional(),
  logIds: z.array(z.string()).optional(),          // Specific IDs to delete
  deleteAll: z.boolean().default(false),           // Delete all logs (requires confirmation)
  olderThan: z.string().optional(),                // ISO datetime: delete logs before this
  userId: z.string().optional(),                   // Delete only this user's logs
}

// Returns
{
  deletedCount: 15,
  deletedIds: ["07L...1", "07L...2", ...],
  errors: []
}
```

---

#### Tool 6: `get_log_content` (Content Intelligence — CORE TOOL)
**Purpose:** Extract structured sections from a debug log so the AI can reason about what actually happened — not just whether Apex crashed.

This is the most important tool for detecting **silent failures**: integrations that returned errors inside HTTP 200, DML partial failures, swallowed exceptions, empty SOQL results, and governor limits approaching capacity.

```typescript
// Parameters
{
  filePath: z.string(),                    // Path to local .log file
  section: z.enum([
    "full",              // Everything (truncated to maxLines)
    "callouts",          // CALLOUT_REQUEST + CALLOUT_RESPONSE pairs — detect integration failures
    "dml",               // DML_BEGIN/END with record counts + outcomes — detect partial failures
    "soql",              // SOQL_EXECUTE with queries + row counts — detect empty results
    "exceptions",        // EXCEPTION_THROWN (both handled AND unhandled) — detect swallowed errors
    "debug_messages",    // USER_DEBUG lines — where devs log errors the system misses
    "governor",          // LIMIT_USAGE lines — detect approaching limits (>80%)
    "flow",              // FLOW_START/ASSIGNMENT/DECISION — detect skipped automation paths
    "head",              // First N lines (log header + initial context)
    "tail",              // Last N lines (final state + outcomes)
  ]).default("full"),
  maxLines: z.number().default(500),       // Truncation limit
}

// Returns (example for section: "callouts")
{
  section: "callouts",
  entries: [
    {
      lineNumber: 45,
      timestamp: "10:15:00.050",
      request: {
        endpoint: "https://api.vendor.com/sync",
        method: "POST",
        // body not captured in logs for security
      },
      response: {
        statusCode: 200,
        body: "{\"status\":\"failed\",\"error\":\"duplicate record\"}"
      },
      duration: "1180ms",
      callingMethod: "IntegrationService.sendToVendor()"
    },
    {
      lineNumber: 112,
      timestamp: "10:15:02.500",
      request: {
        endpoint: "https://api.vendor.com/batch",
        method: "POST",
      },
      response: {
        statusCode: 429,
        body: "{\"error\":\"rate_limit_exceeded\",\"retry_after\":60}"
      },
      duration: "230ms",
      callingMethod: "IntegrationService.sendBatch()"
    }
  ],
  totalEntries: 2,
  filePath: "/path/to/log.log",
  warning: "1 callout returned HTTP 200 with error in body. 1 callout returned HTTP 429."
}

// Returns (example for section: "exceptions")
{
  section: "exceptions",
  entries: [
    {
      lineNumber: 78,
      timestamp: "10:15:01.800",
      exceptionType: "System.NullPointerException",
      message: "Attempt to de-reference a null object",
      handled: true,                    // ← Caught by try-catch (invisible to Status field)
      handlerMethod: "AccountService.processRecords()",
      stackTrace: "Class.AccountService.processRecords: line 78, column 1"
    }
  ],
  totalEntries: 1,
  unhandledCount: 0,
  handledCount: 1,                      // ← This is the silent failure
  filePath: "/path/to/log.log",
  warning: "1 exception was caught and swallowed by try-catch. Check if it should have been re-thrown or reported."
}

// Returns (example for section: "soql")
{
  section: "soql",
  entries: [
    {
      lineNumber: 23,
      timestamp: "10:15:00.010",
      query: "SELECT Id, Name FROM Account WHERE External_Id__c = 'EXT-001'",
      rowCount: 0,                      // ← Expected to find a record, found nothing
      duration: "12ms",
      callingMethod: "IntegrationService.findAccount()",
      aggregations: 0
    },
    {
      lineNumber: 55,
      timestamp: "10:15:00.030",
      query: "SELECT Id FROM Contact WHERE AccountId IN :accountIds",
      rowCount: 847,                    // ← Might be pulling too many records
      duration: "234ms",
      callingMethod: "ContactService.getRelated()",
      aggregations: 0
    }
  ],
  totalQueries: 2,
  totalRowsFetched: 847,
  zeroRowQueries: 1,                    // ← Flag for AI attention
  filePath: "/path/to/log.log",
  warning: "1 query returned 0 rows — verify if this is expected."
}

// Returns (example for section: "governor")
{
  section: "governor",
  limits: {
    cpuTime: { used: 9200, max: 10000, percent: 92, status: "CRITICAL" },
    soqlQueries: { used: 85, max: 100, percent: 85, status: "WARNING" },
    soqlRows: { used: 12400, max: 50000, percent: 25, status: "OK" },
    dmlStatements: { used: 42, max: 150, percent: 28, status: "OK" },
    dmlRows: { used: 3200, max: 10000, percent: 32, status: "OK" },
    heapSize: { used: 4800000, max: 6000000, percent: 80, status: "WARNING" },
    callouts: { used: 8, max: 100, percent: 8, status: "OK" },
    futureCalls: { used: 3, max: 50, percent: 6, status: "OK" },
  },
  criticalCount: 1,
  warningCount: 2,                      // ← 80%+ usage
  filePath: "/path/to/log.log",
  warning: "CPU time at 92% — will fail with slightly more data. SOQL queries at 85%. Heap at 80%."
}
```

**Why this tool is critical:**

| What Status field says | What get_log_content reveals |
|---|---|
| "Success" | Callout returned `{"error":"duplicate record"}` inside HTTP 200 |
| "Success" | NullPointerException was caught and silently swallowed |
| "Success" | SOQL query returned 0 rows — integration record not found |
| "Success" | CPU at 92% — one more record and it crashes |
| "Success" | Flow decision branch was never entered — automation skipped |

**Debug log line patterns used for extraction:**

```
CALLOUT_REQUEST|[line]|System.HttpRequest[Endpoint=...]
CALLOUT_RESPONSE|[line]|StatusCode=200|...
DML_BEGIN|[line]|Op:Insert|Type:Account|Rows:50
DML_END|[line]
EXCEPTION_THROWN|[line]|System.NullPointerException|...
USER_DEBUG|[line]|DEBUG|...
SOQL_EXECUTE_BEGIN|[line]|...
SOQL_EXECUTE_END|[line]|Rows:0
LIMIT_USAGE_FOR_NS|namespace|...
FLOW_START_INTERVIEWS_BEGIN|...
FLOW_ASSIGNMENT_DETAIL|...
FLOW_START_INTERVIEWS_END|...
```

---

## Technical Requirements

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | >= 20.19.0 | Runtime |
| TypeScript | 5.x | Language |
| Salesforce CLI | Latest | Org authentication (`sf org login web`) |
| Authenticated SF Org | Any edition with API access | Target org for log operations |

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@salesforce/core": "^8.26.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "jest": "^29.0.0",
    "@swc/jest": "^0.2.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0"
  }
}
```

### Salesforce Org Requirements

- API access enabled (API Enabled permission)
- User must have "Manage Users" or "View All Data" permission to see other users' logs
- User must have "View Debug Logs" permission (included in standard admin profiles)
- Debug logs are retained for 24 hours (Salesforce limit)
- Maximum 250 MB of debug logs per org (oldest deleted when limit reached)
- Maximum 20 trace flags per org
- Each debug log can be up to 20 MB (truncated at 20 MB)

---

## Salesforce API Reference

### ApexLog Object (Tooling API)

**Object:** `ApexLog`
**API:** Tooling API (not standard REST API)
**Supported Operations:** Query, Retrieve, Delete (NOT Create/Update — logs are system-generated)

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `Id` | ID | Unique identifier (starts with `07L`) |
| `Application` | String | Application type: "Browser", "Application", etc. |
| `DurationMilliseconds` | Integer | Total transaction duration in ms |
| `Location` | String | "Monitoring" or "SystemLog" |
| `LogLength` | Integer | Size of log body in bytes |
| `LogUserId` | Reference | ID of the user whose actions generated the log |
| `LogUser.Name` | String | Name of the user (via relationship query) |
| `Operation` | String | Type: "API", "ApexTrigger", "ApexTest", "VF", etc. |
| `Request` | String | Request type: "API", "Application", etc. |
| `StartTime` | DateTime | When the transaction started |
| `Status` | String | "Success", "Assertion Failed", "Fatal Error", etc. |
| `SystemModstamp` | DateTime | Last system modification timestamp |
| `LastModifiedDate` | DateTime | Last modified date |

#### Key API Endpoints

```
# Query logs (metadata only — body NOT included in SOQL)
GET /services/data/v66.0/tooling/query/?q=SELECT+Id,StartTime,Operation,Status,LogLength,DurationMilliseconds,LogUser.Name+FROM+ApexLog+ORDER+BY+StartTime+DESC+LIMIT+20

# Download log body (raw text)
GET /services/data/v66.0/sobjects/ApexLog/{LOG_ID}/Body

# Delete a log
DELETE /services/data/v66.0/tooling/sobjects/ApexLog/{LOG_ID}
```

**Important:** You CANNOT query the log body via SOQL. The body must be fetched separately via the `/Body` endpoint.

#### API Limits & Constraints

| Constraint | Value | Impact |
|-----------|-------|--------|
| Max log size | 20 MB per log | Logs truncated with `***LOG TRUNCATED***` after 20 MB |
| Max logs retained | ~50 MB per user, ~1000 logs org-wide | Oldest auto-deleted when limit hit |
| Log retention | 24 hours | Logs auto-deleted after 24h — fetch promptly |
| Max trace flags | ~20 concurrent per org | Plan trace flag lifecycle carefully |
| TraceFlag max TTL | 24 hours from creation | Must recreate for longer monitoring |
| API call cost | Each query/download = 1 API call | Downloads count against daily API limit |
| Log body download | Separate API call per log | Cannot batch-download bodies |
| Composite batch | Up to 25 sub-requests per composite call | Useful for bulk delete operations |

#### Composite Batch Delete (Bulk Cleanup)

```http
POST /services/data/v66.0/tooling/composite
Content-Type: application/json

{
  "compositeRequest": [
    {
      "method": "DELETE",
      "url": "/services/data/v66.0/tooling/sobjects/ApexLog/07L5g000000AAA",
      "referenceId": "del1"
    },
    {
      "method": "DELETE",
      "url": "/services/data/v66.0/tooling/sobjects/ApexLog/07L5g000000BBB",
      "referenceId": "del2"
    }
  ]
}
```

#### Real-Time Log Streaming (Future — v2.0)

Salesforce provides a push topic `/systemTopic/Logging` via the Streaming API (CometD/Bayeux long-polling). When a new `ApexLog` record is created, this topic fires with the log ID. This is how `sf apex tail log` works under the hood:

1. Creates/updates a TraceFlag for the current user
2. Subscribes to `/systemTopic/Logging` via CometD
3. On each event, fetches the log body via `GET /sobjects/ApexLog/{id}/Body`
4. Prints to stdout

This could be adapted for an MCP server in a future version using MCP's notification capabilities.

#### SOQL Query Examples for Common Use Cases

```sql
-- Most recent 50 logs
SELECT Id, StartTime, Operation, Status, LogLength, DurationMilliseconds, LogUser.Name
FROM ApexLog ORDER BY StartTime DESC LIMIT 50

-- Logs for a specific user
SELECT Id, StartTime, Operation, Status, LogLength
FROM ApexLog WHERE LogUserId = '0055g000004XXXX' ORDER BY StartTime DESC

-- Error logs only
SELECT Id, StartTime, Operation, Status, LogLength, DurationMilliseconds
FROM ApexLog WHERE Status != 'Success' ORDER BY StartTime DESC

-- Large logs (> 1MB) — likely complex transactions
SELECT Id, StartTime, Operation, LogLength, DurationMilliseconds
FROM ApexLog WHERE LogLength > 1000000 ORDER BY LogLength DESC

-- Slow transactions (> 5 seconds)
SELECT Id, StartTime, Operation, Status, DurationMilliseconds
FROM ApexLog WHERE DurationMilliseconds > 5000 ORDER BY DurationMilliseconds DESC

-- Logs from today
SELECT Id, StartTime, Operation, Status, LogLength
FROM ApexLog WHERE StartTime = TODAY ORDER BY StartTime DESC

-- Trigger-specific logs
SELECT Id, StartTime, Operation, Status, DurationMilliseconds
FROM ApexLog WHERE Operation LIKE '%Trigger%' ORDER BY StartTime DESC
```

### TraceFlag Object

| Field | Type | Description |
|-------|------|-------------|
| `Id` | ID | Unique identifier |
| `TracedEntityId` | Reference | User, Apex Class, or Apex Trigger ID |
| `DebugLevelId` | Reference | Link to DebugLevel record |
| `ExpirationDate` | DateTime | When the trace flag expires |
| `LogType` | String | "DEVELOPER_LOG", "CLASS_TRACING", "PROFILING" |
| `StartDate` | DateTime | When the trace flag starts |

### DebugLevel Object

| Field | Type | Description |
|-------|------|-------------|
| `Id` | ID | Unique identifier |
| `DeveloperName` | String | Unique API name |
| `MasterLabel` | String | Display label |
| `ApexCode` | String | NONE through FINEST |
| `ApexProfiling` | String | NONE through FINEST |
| `Callout` | String | NONE through FINEST |
| `Database` | String | NONE through FINEST |
| `System` | String | NONE through FINEST |
| `Validation` | String | NONE through FINEST |
| `Visualforce` | String | NONE through FINEST |
| `Workflow` | String | NONE through FINEST |
| `Nba` | String | NONE through FINEST |
| `Wave` | String | NONE through FINEST |

### TraceFlag & DebugLevel API Examples (Using @salesforce/core)

```typescript
import { Org } from "@salesforce/core";

const org = await Org.create({ aliasOrUsername: "my-dev-org" });
const conn = org.getConnection();

// --- Query existing debug levels ---
const debugLevels = await conn.tooling.query(
  "SELECT Id, DeveloperName, MasterLabel FROM DebugLevel"
);

// --- Create a custom debug level ---
const newLevel = await conn.tooling.create("DebugLevel", {
  DeveloperName: "sf_log_mcp_" + Date.now(),
  MasterLabel: "SF Log MCP Custom",
  ApexCode: "FINE",
  ApexProfiling: "FINE",
  Callout: "DEBUG",
  Database: "FINEST",
  System: "DEBUG",
  Validation: "DEBUG",
  Visualforce: "FINE",
  Workflow: "FINE",
  Nba: "INFO",
  Wave: "INFO",
});
// newLevel.id = "7dl..."

// --- Create a trace flag for a user ---
const userId = org.getConnection().getAuthInfoFields().userId;
const traceFlag = await conn.tooling.create("TraceFlag", {
  TracedEntityId: userId,
  DebugLevelId: newLevel.id,
  LogType: "DEVELOPER_LOG",
  StartDate: new Date().toISOString(),
  ExpirationDate: new Date(Date.now() + 60 * 60000).toISOString(), // 60 min
});
// traceFlag.id = "7tf..."

// --- Extend a trace flag's expiration ---
await conn.tooling.update("TraceFlag", {
  Id: traceFlag.id,
  ExpirationDate: new Date(Date.now() + 120 * 60000).toISOString(),
});

// --- Query active trace flags ---
const activeFlags = await conn.tooling.query(
  `SELECT Id, TracedEntityId, DebugLevelId, LogType, ExpirationDate
   FROM TraceFlag
   WHERE ExpirationDate > ${new Date().toISOString()}`
);

// --- Delete a trace flag ---
await conn.tooling.delete("TraceFlag", traceFlag.id);

// --- Query and download debug logs ---
const logs = await conn.tooling.query(
  "SELECT Id, StartTime, Operation, Status, LogLength, DurationMilliseconds, LogUser.Name " +
  "FROM ApexLog ORDER BY StartTime DESC LIMIT 10"
);

for (const log of logs.records) {
  const body = await conn.request(`/sobjects/ApexLog/${log.Id}/Body`);
  // body is the raw debug log text string
  await fs.promises.writeFile(`./sf-logs/${log.Id}.log`, body as string);
}

// --- Bulk delete logs using composite ---
const logIds = logs.records.map(r => r.Id);
const compositeRequest = logIds.slice(0, 25).map((id, i) => ({
  method: "DELETE",
  url: `/services/data/v66.0/tooling/sobjects/ApexLog/${id}`,
  referenceId: `del${i}`,
}));
await conn.request({
  method: "POST",
  url: "/services/data/v66.0/tooling/composite",
  body: JSON.stringify({ compositeRequest }),
});
```

---

### SF CLI Command Reference (Alternative Backend)

These are the existing SF CLI commands that could be used as a simpler backend (Approach 1: CLI Wrapper). Documented here for reference.

#### `sf apex list log`

```bash
sf apex list log -o <org> [--json] [--api-version <value>]
```

| Flag | Description |
|------|-------------|
| `-o, --target-org` | (Required) Org username or alias |
| `--json` | Output as JSON |
| `--api-version` | Override API version |

**JSON output shape:**
```json
{
  "status": 0,
  "result": [
    {
      "Id": "07L5g00000XXXXXXEAZ",
      "Application": "Unknown",
      "DurationMilliseconds": 42,
      "Location": "SystemLog",
      "LogLength": 1234,
      "LogUser": { "Name": "John Doe", "attributes": {} },
      "Operation": "/apex/MyPage",
      "Request": "Api",
      "StartTime": "2026-03-28T10:30:00.000+0000",
      "Status": "Success"
    }
  ],
  "warnings": []
}
```

#### `sf apex get log`

```bash
sf apex get log -o <org> [-i <logId>] [-n <count>] [-d <outputDir>] [--json]
```

| Flag | Description |
|------|-------------|
| `-i, --log-id` | Specific log ID to fetch |
| `-n, --number` | Number of most recent logs (default: 1) |
| `-d, --output-dir` | Directory to save .log files |
| `-o, --target-org` | Org username or alias |
| `--json` | Output as JSON |

**Examples:**
```bash
sf apex get log --log-id 07L5g00000XXX                    # Fetch specific log
sf apex get log --number 5 --output-dir ./logs            # Fetch 5 most recent
sf apex get log --number 2 --output-dir ./logs --json     # Save + JSON metadata
```

#### `sf apex tail log`

```bash
sf apex tail log -o <org> [-c] [-d <debugLevel>] [-s]
```

| Flag | Description |
|------|-------------|
| `-c, --color` | Colorize log output by level |
| `-d, --debug-level` | Named DebugLevel to use |
| `-s, --skip-trace-flag` | Skip trace flag setup (assumes already exists) |

**How it works internally:**
1. Creates/updates a `DEVELOPER_LOG` trace flag (30 min TTL)
2. Subscribes to `/systemTopic/Logging` Streaming API (CometD)
3. On each event → fetches log body → prints to stdout
4. `Ctrl+C` to stop (trace flag NOT auto-cleaned)

#### `sf apex log delete`

```bash
sf apex log delete -o <org> [--no-prompt] [--json]
```

**Caveat:** Deletes ALL logs. No selective delete by ID or date. For selective deletion, use Tooling API directly.

---

## MCP Server Design

### Critical Development Notes

1. **Never use `console.log()` in stdio servers** — it writes to stdout and corrupts JSON-RPC messages. Always use `console.error()` for logging (writes to stderr).

2. **Multiple MCP servers work simultaneously** — AI clients (Claude Desktop, VS Code, Cursor) create one MCP client per server. All tools from all servers are aggregated into a unified registry the LLM can access. Servers do NOT communicate with each other — the LLM orchestrates across them.

3. **`@salesforce/core` reuses SF CLI auth** — When a user runs `sf org login web`, credentials are stored in `~/.sf/` (or `~/.sfdx/` legacy). `@salesforce/core` reads from both locations automatically. No separate auth flow needed.

4. **Token refresh is handled transparently** — `@salesforce/core` handles OAuth token refresh automatically when tokens expire.

5. **The Zod → JSON Schema conversion is automatic** — The MCP SDK converts Zod parameter schemas to JSON Schema automatically. You define parameters as Zod objects; the SDK handles the rest.

### Core Server Pattern

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Org } from "@salesforce/core";

class SfLogMcpServer {
  private server: McpServer;
  private allowedOrgs: string[];

  constructor(allowedOrgs: string[]) {
    this.allowedOrgs = allowedOrgs;
    this.server = new McpServer({
      name: "sf-log-mcp",
      version: "1.0.0",
    });

    this.registerTools();
  }

  private registerTools() {
    // Tool 1: list_debug_logs
    this.server.tool(
      "list_debug_logs",
      "List available debug logs from a Salesforce org with optional filters",
      {
        targetOrg: z.string().optional().describe("Org alias or username"),
        limit: z.number().default(20).describe("Max logs to return (1-100)"),
        userId: z.string().optional().describe("Filter by user ID"),
        operation: z.string().optional().describe("Filter by operation type"),
        status: z.string().optional().describe("Filter by status"),
      },
      async (params) => {
        const org = await this.getOrg(params.targetOrg);
        const conn = org.getConnection();
        const query = this.buildLogQuery(params);
        const result = await conn.tooling.query(query);
        return {
          content: [{ type: "text", text: JSON.stringify(result.records) }],
        };
      }
    );

    // Tool 2: fetch_debug_log
    this.server.tool(
      "fetch_debug_log",
      "Download a debug log by ID and save it locally",
      {
        targetOrg: z.string().optional(),
        logId: z.string().describe("ApexLog record ID"),
        outputDir: z.string().default("./sf-logs/"),
      },
      async (params) => {
        const org = await this.getOrg(params.targetOrg);
        const conn = org.getConnection();
        const body = await conn.request(`/sobjects/ApexLog/${params.logId}/Body`);
        // Save to disk, return file path
        const filePath = path.join(params.outputDir, `${params.logId}.log`);
        await fs.promises.mkdir(params.outputDir, { recursive: true });
        await fs.promises.writeFile(filePath, body as string);
        return {
          content: [{ type: "text", text: JSON.stringify({ filePath, logId: params.logId }) }],
        };
      }
    );

    // ... more tools registered similarly
  }

  private async getOrg(aliasOrUsername?: string): Promise<Org> {
    // Validates against allowedOrgs list
    // Uses @salesforce/core to get authenticated org
    return Org.create({ aliasOrUsername });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### CLI Entry Point

```typescript
// src/index.ts
#!/usr/bin/env node

import { SfLogMcpServer } from "./server.js";

// Parse CLI args
const args = process.argv.slice(2);
const allowedOrgsIndex = args.indexOf("--allowed-orgs");
const allowedOrgs = allowedOrgsIndex !== -1
  ? args[allowedOrgsIndex + 1].split(",")
  : [];

const outputDirIndex = args.indexOf("--output-dir");
const outputDir = outputDirIndex !== -1
  ? args[outputDirIndex + 1]
  : "./sf-logs/";

const server = new SfLogMcpServer(allowedOrgs, outputDir);
server.start();
```

---

## Project Structure

```
sf-log-mcp/
├── package.json
├── tsconfig.json
├── eslint.config.js
├── jest.config.js
├── README.md
├── LICENSE                    # BSD-3-Clause (match Certinia)
├── .github/
│   └── workflows/
│       ├── ci.yml             # Lint + test on PR
│       └── publish.yml        # npm publish on release tag
├── src/
│   ├── index.ts               # CLI entry point (arg parsing + server start)
│   ├── server.ts              # McpServer setup + tool registration
│   ├── config.ts              # CLI arg parsing, org validation
│   ├── salesforce/
│   │   ├── connection.ts      # Org auth via @salesforce/core
│   │   ├── logs.ts            # ApexLog query + download logic
│   │   ├── traceFlags.ts      # TraceFlag + DebugLevel management
│   │   └── types.ts           # Salesforce API response types
│   ├── tools/
│   │   ├── listDebugLogs.ts   # list_debug_logs tool implementation
│   │   ├── fetchDebugLog.ts   # fetch_debug_log tool implementation
│   │   ├── fetchLatestLogs.ts # fetch_latest_logs tool implementation
│   │   ├── getLogContent.ts   # get_log_content tool — CORE content intelligence
│   │   ├── manageTraceFlags.ts# manage_trace_flags tool implementation
│   │   └── deleteDebugLogs.ts # delete_debug_logs tool implementation
│   ├── parser/
│   │   ├── logLineParser.ts   # Parse individual debug log lines by event type
│   │   ├── sectionExtractor.ts# Extract sections: callouts, DML, SOQL, exceptions, etc.
│   │   ├── governorLimits.ts  # Parse LIMIT_USAGE_FOR_NS lines, calculate percentages
│   │   ├── calloutParser.ts   # Parse CALLOUT_REQUEST/RESPONSE pairs, detect errors in body
│   │   ├── dmlParser.ts       # Parse DML_BEGIN/END, detect partial failures
│   │   ├── soqlParser.ts      # Parse SOQL_EXECUTE, flag zero-row results
│   │   ├── exceptionParser.ts # Parse EXCEPTION_THROWN, distinguish handled vs unhandled
│   │   ├── flowParser.ts      # Parse FLOW_* events, detect skipped paths
│   │   └── types.ts           # Parsed log entry types
│   └── utils/
│       ├── fileSystem.ts      # File save, directory creation
│       └── queryBuilder.ts    # SOQL query builder for ApexLog
├── test/
│   ├── tools/
│   │   ├── listDebugLogs.test.ts
│   │   ├── fetchDebugLog.test.ts
│   │   └── ...
│   ├── salesforce/
│   │   ├── logs.test.ts
│   │   ├── traceFlags.test.ts
│   │   └── connection.test.ts
│   └── fixtures/
│       ├── sampleLog.log      # Sample debug log for testing
│       └── apiResponses.json  # Mock Tooling API responses
└── docs/
    └── TOOLS.md               # Detailed tool documentation
```

---

## Implementation Plan

### Phase 1: Foundation + Content Intelligence (MVP)
**Goal:** Fetch debug logs AND read their content intelligently — the complete pipeline for detecting silent failures.
**Scope:** Core infrastructure + 4 tools (acquisition + content intelligence from day one)

| Step | Task | Details |
|------|------|---------|
| 1.1 | Project scaffolding | `package.json`, `tsconfig.json`, ESLint, Jest, directory structure |
| 1.2 | CLI arg parsing | `--allowed-orgs`, `--output-dir` flags |
| 1.3 | SF connection module | `@salesforce/core` integration, org validation, allowlist enforcement |
| 1.4 | MCP server skeleton | `McpServer` setup with stdio transport |
| 1.5 | `list_debug_logs` tool | SOQL query builder, filters (NO status filter by default), response formatting |
| 1.6 | `fetch_debug_log` tool | Download body via REST, save to disk, return file path |
| 1.7 | `fetch_latest_logs` tool | Batch download N most recent logs |
| 1.8 | **`get_log_content` tool** | **CRITICAL — content intelligence: extract callouts, exceptions, SOQL, DML, governor limits, debug messages, flow paths. This is what detects silent failures.** |
| 1.9 | Log line parser module | Parse debug log line format: `timestamp\|EVENT_TYPE\|[line]\|details`. Extract structured data from CALLOUT_REQUEST, CALLOUT_RESPONSE, DML_BEGIN/END, SOQL_EXECUTE_BEGIN/END, EXCEPTION_THROWN, USER_DEBUG, LIMIT_USAGE_FOR_NS, FLOW_* events. |
| 1.10 | Unit tests | Mock Tooling API responses, test log line parser against real log samples, test section extraction |
| 1.11 | Integration test | Connect to a real scratch org, list + fetch + extract content from a log |
| 1.12 | README + docs | Usage instructions, MCP config examples |

**Deliverable:** Working MCP server that can fetch logs AND intelligently extract content — AI can detect silent integration failures, swallowed exceptions, empty SOQL results, and approaching governor limits without relying on the Status field.

### Phase 2: Log Lifecycle Management
**Goal:** Full lifecycle management of trace flags, debug levels, and log cleanup.

| Step | Task | Details |
|------|------|---------|
| 2.1 | `manage_trace_flags` tool | Create, list, update, delete trace flags + debug levels |
| 2.2 | `delete_debug_logs` tool | Delete by ID, by age, by user, or all. Composite batch for bulk delete. |
| 2.3 | Error handling | Graceful handling of expired sessions, API limits, missing permissions, token refresh |
| 2.4 | Tests for new tools | Unit + integration tests |

**Deliverable:** Complete log lifecycle management — AI can set up tracing, trigger logs, fetch, analyze, and clean up.

### Phase 3: Advanced Analysis & Cross-Log Intelligence
**Goal:** Analysis across multiple logs and deeper content intelligence.

| Step | Task | Details |
|------|------|---------|
| 3.1 | `compare_logs` tool | Diff two logs — before/after optimization, regression detection |
| 3.2 | `search_logs` tool | Search across all downloaded logs for patterns (grep across log directory) |
| 3.3 | `analyze_log` tool | Built-in performance summary, governor limits, bottlenecks (optional — complements Certinia) |
| 3.4 | Enhanced content intelligence | Cross-reference callout failures with DML outcomes, detect cascading failures, correlate async job enqueue with execution |

**Deliverable:** Deep cross-log analysis and pattern detection.

### Phase 4: Polish & Publish
**Goal:** Production-ready npm package.

| Step | Task | Details |
|------|------|---------|
| 4.1 | CI/CD pipeline | GitHub Actions for lint, test, publish |
| 4.2 | npm publish | `@yourscope/sf-log-mcp` on npm |
| 4.3 | Documentation site | GitHub Pages or docs folder |
| 4.4 | MCP Inspector testing | Verify with MCP Inspector tool |
| 4.5 | Client testing | Test with Claude Desktop, VS Code, Cursor |

---

## Deployment & Distribution

### Option 1: npm Package (Recommended)

```bash
# Users install and run via npx (no global install needed)
npx -y @yourscope/sf-log-mcp --allowed-orgs DEFAULT_TARGET_ORG
```

**Publishing:**
```bash
npm login
npm publish --access public
```

### Option 2: GitHub Release

Users clone the repo and build:
```bash
git clone https://github.com/youruser/sf-log-mcp.git
cd sf-log-mcp
npm install && npm run build
node dist/index.js --allowed-orgs ALLOW_ALL_ORGS
```

### Option 3: Docker (For CI/CD or Shared Environments)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
ENTRYPOINT ["node", "dist/index.js"]
```

---

## MCP Client Configuration

### Claude Desktop / Claude Code

**File:** `~/.claude.json` or project-level `.mcp.json`

#### Standalone (alongside Certinia)
```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "npx",
      "args": ["-y", "@yourscope/sf-log-mcp", "--allowed-orgs", "DEFAULT_TARGET_ORG"]
    },
    "apex-log-mcp": {
      "command": "npx",
      "args": ["-y", "@certinia/apex-log-mcp", "--allowed-orgs", "DEFAULT_TARGET_ORG"]
    }
  }
}
```

#### All-in-One (if analysis is built-in)
```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "npx",
      "args": [
        "-y", "@yourscope/sf-log-mcp",
        "--allowed-orgs", "ALLOW_ALL_ORGS",
        "--output-dir", "./sf-logs/"
      ]
    }
  }
}
```

### VS Code (Copilot / Continue)

**File:** `.vscode/mcp.json`

```json
{
  "servers": {
    "sf-log-mcp": {
      "command": "npx",
      "args": ["-y", "@yourscope/sf-log-mcp", "--allowed-orgs", "DEFAULT_TARGET_ORG"]
    }
  }
}
```

### Cursor

**File:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "npx",
      "args": ["-y", "@yourscope/sf-log-mcp", "--allowed-orgs", "DEFAULT_TARGET_ORG"]
    }
  }
}
```

### Windsurf

**File:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "npx",
      "args": ["-y", "@yourscope/sf-log-mcp", "--allowed-orgs", "DEFAULT_TARGET_ORG"]
    }
  }
}
```

---

## Security Considerations

### Org Access Control

1. **Allowlist enforcement** — Same pattern as Certinia: `--allowed-orgs` CLI flag required. No org access without explicit opt-in.
2. **Token types:**
   - `ALLOW_ALL_ORGS` — Any authenticated org (use with caution)
   - `DEFAULT_TARGET_ORG` — Only the project's default target org
   - `DEFAULT_TARGET_DEV_HUB` — Only the default Dev Hub
   - Direct usernames/aliases — Specific orgs only

### Data Safety

3. **Logs may contain sensitive data** — Debug logs can contain:
   - User data (names, emails, record contents)
   - API keys or tokens (if logged via `System.debug()`)
   - SOQL query results with PII
   - Business logic and IP

4. **Local storage** — All downloaded logs are saved to the local filesystem. No data is sent to external services. The MCP protocol is local (stdio), not networked.

5. **No credential storage** — Uses `@salesforce/core` which reads from SF CLI's existing auth store (`~/.sfdx/` or `~/.sf/`). No passwords or tokens are stored by this server.

### Mutation Safety

6. **Read-heavy, minimal writes:**
   - `list_debug_logs` — Read only
   - `fetch_debug_log` — Read only (writes to local disk only)
   - `manage_trace_flags` — Creates/modifies trace flags (time-limited, auto-expire)
   - `delete_debug_logs` — Destructive, requires explicit IDs or confirmation flag

7. **Trace flag auto-expiry** — All trace flags created by this tool have a maximum TTL (default 60 min, max 24 hours). They automatically expire and stop generating logs.

---

## Testing Strategy

### Unit Tests

```typescript
// test/tools/listDebugLogs.test.ts
describe("list_debug_logs", () => {
  it("builds correct SOQL with no filters — no status filter by default", () => {
    const query = buildLogQuery({ limit: 20 });
    expect(query).toContain("FROM ApexLog");
    expect(query).toContain("ORDER BY StartTime DESC");
    expect(query).toContain("LIMIT 20");
    expect(query).not.toContain("Status");  // No status filter by default
  });

  it("builds correct SOQL with operation filter", () => {
    const query = buildLogQuery({ limit: 10, operation: "ApexTrigger" });
    expect(query).toContain("Operation = 'ApexTrigger'");
  });

  it("enforces limit bounds", () => {
    const query = buildLogQuery({ limit: 500 });
    expect(query).toContain("LIMIT 100"); // Capped at 100
  });
});

// test/parser/calloutParser.test.ts
describe("calloutParser", () => {
  it("extracts callout request/response pairs", () => {
    const logLines = [
      "10:15:00.050 (50234)|CALLOUT_REQUEST|[45]|System.HttpRequest[Endpoint=https://api.vendor.com/sync, Method=POST]",
      "10:15:01.230 (1230456)|CALLOUT_RESPONSE|[45]|StatusCode=200, Status=OK",
    ];
    const result = parseCallouts(logLines);
    expect(result[0].request.endpoint).toBe("https://api.vendor.com/sync");
    expect(result[0].response.statusCode).toBe(200);
  });

  it("flags HTTP 200 responses containing error in body", () => {
    // Test that the parser detects silent failures
  });
});

// test/parser/exceptionParser.test.ts
describe("exceptionParser", () => {
  it("distinguishes handled vs unhandled exceptions", () => {
    const logLines = [
      "10:15:00.050 (50234)|EXCEPTION_THROWN|[78]|System.NullPointerException: Attempt to de-reference a null object",
      // Followed by METHOD_EXIT (not FATAL_ERROR) = handled
    ];
    const result = parseExceptions(logLines);
    expect(result[0].handled).toBe(true);
    expect(result[0].exceptionType).toBe("System.NullPointerException");
  });
});

// test/parser/governorLimits.test.ts
describe("governorLimits", () => {
  it("parses LIMIT_USAGE lines and calculates percentages", () => {
    const logLines = [
      "10:15:02.000 (2000000)|LIMIT_USAGE_FOR_NS|(default)|",
      "  Number of SOQL queries: 85 out of 100",
      "  Number of DML statements: 42 out of 150",
      "  Maximum CPU time: 9200 out of 10000",
    ];
    const result = parseGovernorLimits(logLines);
    expect(result.soqlQueries.percent).toBe(85);
    expect(result.cpuTime.percent).toBe(92);
    expect(result.cpuTime.status).toBe("CRITICAL");
  });
});
```

### Integration Tests (Requires Scratch Org)

```typescript
// test/integration/logs.test.ts
describe("Integration: Debug Logs", () => {
  let org: Org;

  beforeAll(async () => {
    org = await Org.create({ aliasOrUsername: "sf-log-mcp-test" });
  });

  it("can list debug logs from org", async () => {
    const result = await listDebugLogs(org, { limit: 5 });
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("can fetch a debug log body", async () => {
    const logs = await listDebugLogs(org, { limit: 1 });
    if (logs.logs.length > 0) {
      const fetched = await fetchDebugLog(org, logs.logs[0].id, "./test-output/");
      expect(fs.existsSync(fetched.filePath)).toBe(true);
    }
  });
});
```

### MCP Protocol Testing

```bash
# Use MCP Inspector to test the server interactively
npx @modelcontextprotocol/inspector npx -y @yourscope/sf-log-mcp --allowed-orgs ALLOW_ALL_ORGS
```

---

## Roadmap

| Version | Features | Status |
|---------|----------|--------|
| **v0.1.0** | `list_debug_logs`, `fetch_debug_log`, `fetch_latest_logs`, **`get_log_content`** (content intelligence) | Planned |
| **v0.2.0** | `manage_trace_flags`, `delete_debug_logs` | Planned |
| **v1.0.0** | npm publish, CI/CD, full documentation | Planned |
| **v1.1.0** | `compare_logs`, `search_logs`, cross-log pattern detection | Future |
| **v1.2.0** | Built-in performance analysis (optional, complement Certinia) | Future |
| **v2.0.0** | Real-time log streaming via MCP Streaming API | Future |

---

## Example AI Conversations (What This Enables)

### Scenario 1: Silent Integration Failure (Status = "Success" but data not syncing)
```
User: "Our integration to Vendor X stopped sending data yesterday afternoon.
       No errors showing up anywhere."

AI: Let me pull recent API logs and inspect the callout responses.
  → Calls: list_debug_logs(operation: "API", limit: 20)
  → Calls: fetch_latest_logs(count: 5, operation: "API")
  → Calls: get_log_content(filePath: "07L...1.log", section: "callouts")
  → Calls: get_log_content(filePath: "07L...2.log", section: "callouts")

AI: "Found it. All 5 logs show Status: 'Success' — Apex didn't crash. But
    looking at the callout responses:

    - Log 07L...1 (2:47 PM): POST to vendor.com/api/sync returned HTTP 200
      but the body contains: {"status":"error","message":"rate_limit_exceeded",
      "retry_after":3600}

    - Logs 07L...2 through 07L...5 show the same pattern.

    Your code in IntegrationService.cls line 67 only checks the HTTP status
    code (200 = success), but doesn't parse the response body for errors.
    The vendor started rate-limiting you at 2:47 PM and every sync since
    then has silently failed.

    Fix: Check response.getBody() for error fields, not just response.getStatusCode().
    Also add retry logic with exponential backoff for 429/rate limit responses."
```

### Scenario 2: Swallowed Exception (Try-Catch Hiding Bugs)
```
User: "Some accounts aren't getting processed but there are no errors in the logs."

AI: Let me check for handled exceptions that might be getting swallowed.
  → Calls: fetch_latest_logs(count: 10)
  → Calls: get_log_content(filePath: "07L...1.log", section: "exceptions")
  → Calls: get_log_content(filePath: "07L...1.log", section: "debug_messages")

AI: "I found 3 NullPointerExceptions in the last 10 logs — all caught by
    try-catch in AccountService.processRecords() at line 78. The catch block
    does System.debug('Error: ' + e.getMessage()) but doesn't re-throw,
    doesn't add to an error collection, and doesn't notify anyone.

    The debug messages show:
      'Error: Attempt to de-reference a null object'
      'Error: Attempt to de-reference a null object'
      'Error: Attempt to de-reference a null object'

    3 accounts silently skipped because account.Related_Contact__r was null
    and the code assumed it would always be populated.

    Fix: Add a null check before accessing Related_Contact__r, or change the
    SOQL query to include WHERE Related_Contact__c != null."
```

### Scenario 3: Performance Time Bomb (Governor Limits at 92%)
```
User: "Everything's working fine but I'm worried about scale. We're about
       to import 10x more data."

AI: Let me check governor limit usage in your recent logs.
  → Calls: fetch_latest_logs(count: 10)
  → Calls: get_log_content(filePath: "07L...1.log", section: "governor")
  → Calls: get_log_content(filePath: "07L...1.log", section: "soql")

AI: "You should be worried. Current usage on a typical transaction:
    - CPU Time: 9,200ms / 10,000ms (92%) ← CRITICAL
    - SOQL Queries: 85 / 100 (85%) ← WARNING
    - Heap Size: 4.8MB / 6MB (80%) ← WARNING

    With 10x more data, this WILL fail. The bottleneck is in
    ContactService.getRelated() — it's running 47 SOQL queries inside a
    for loop (N+1 pattern). One query returns 847 rows.

    Fix: Bulkify the query — collect all AccountIds first, then run a
    single query: SELECT Id FROM Contact WHERE AccountId IN :accountIds.
    This should drop SOQL from 85 to ~40 and CPU by ~60%."
```

### Scenario 4: Missing Automation (Flow Never Fired)
```
User: "New accounts should automatically get a welcome email via Flow but
       some customers say they never got it."

AI: Let me check the flow execution in recent account creation logs.
  → Calls: list_debug_logs(operation: "ApexTrigger", limit: 10)
  → Calls: fetch_latest_logs(count: 5)
  → Calls: get_log_content(filePath: "07L...1.log", section: "flow")
  → Calls: get_log_content(filePath: "07L...1.log", section: "dml")

AI: "I see the issue. Looking at the flow execution paths:

    - FLOW_START: 'Welcome_Email_Flow' started
    - FLOW_DECISION: 'Check_Record_Type' evaluated
    - Decision outcome: 'No match' ← Flow took the default path (no email)

    The Flow's decision element checks if RecordType = 'Customer', but the
    DML section shows the Account was created with RecordType = 'Prospect'
    and then updated to 'Customer' in a separate transaction.

    The Flow fires on insert, sees 'Prospect', skips the email. The update
    to 'Customer' happens after, but the Flow doesn't fire on update.

    Fix: Either change the Flow to also trigger on record update when
    RecordType changes to 'Customer', or ensure RecordType is set correctly
    before the insert."
```

### Scenario 5: Quick Org Health Check
```
User: "Give me a health check of my org's recent activity."

AI: → Calls: list_debug_logs(limit: 50)
   → Calls: fetch_latest_logs(count: 10)
   → For each log: get_log_content(section: "governor")
   → For suspicious logs: get_log_content(section: "callouts")
   → For suspicious logs: get_log_content(section: "exceptions")

AI: "Org health report (last 50 logs):

    Summary:
    - 47 logs total, 44 show Status 'Success', 3 show 'Fatal Error'
    - Average duration: 234ms | Longest: 12.4s (API @ 2:30 PM)

    Issues found:
    1. CRITICAL: 3 Fatal Errors — NullPointerException in OrderTrigger.cls
    2. WARNING: 7 logs have CPU usage above 80% (highest: 94%)
    3. WARNING: 2 callouts returned HTTP 200 with error bodies
       (vendor.com returning 'maintenance mode' since 1:15 PM)
    4. SILENT: 5 handled exceptions caught and swallowed in BatchProcessor
    5. INFO: 1 SOQL query returning 0 rows in IntegrationService.findAccount()
       (possible data sync issue)

    Recommendation: Fix #1 and #3 immediately. #2 will break at higher
    volumes. #4 and #5 need investigation — they may be causing the data
    issues users have been reporting."
```

---

## References

- [Certinia Apex Log MCP Server](https://github.com/certinia/debug-log-analyzer-mcp) — Parser we complement
- [Salesforce DX MCP Server](https://github.com/salesforcecli/mcp) — Official SF MCP (no log tools)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — MCP server framework
- [Salesforce Tooling API — ApexLog](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm)
- [Salesforce Tooling API — TraceFlag](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_traceflag.htm)
- [Salesforce Tooling API — DebugLevel](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_debuglevel.htm)
- [SF CLI Apex Commands](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_apex_commands_unified.htm)
- [Salesforce CLI Plugin Apex](https://github.com/salesforcecli/plugin-apex) — CLI source for log commands
- [MCP Server Build Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [Building MCP Servers with TypeScript](https://dev.to/shadid12/how-to-build-mcp-servers-with-typescript-sdk-1c28)
