# sf-log-mcp

> An MCP server that **fetches, manages, and AI-analyzes** Salesforce debug logs — bridging the gap between your org and your AI assistant.

Neither Certinia's `@certinia/apex-log-mcp` (parser only, no fetch) nor Salesforce's official `@salesforce/mcp` (60+ tools, zero debug log tools) can retrieve debug logs from an org. **sf-log-mcp fills that gap** — giving AI assistants autonomous access to list, download, analyze, search, and compare Salesforce debug logs.

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **Salesforce CLI** (`sf`) installed and authenticated to at least one org
- An MCP-compatible AI client (Claude Desktop, VS Code with Copilot, Cursor, Windsurf)

### Install & Build

```bash
git clone https://github.com/Likhit-Kumar/SF-Logs.git
cd SF-Logs
npm install
npm run build
```

### Configure Your MCP Client

Add this to your MCP client's configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/SF-Logs/dist/index.js", "--allowed-orgs", "ALLOW_ALL_ORGS"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "sf-log-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/SF-Logs/dist/index.js", "--allowed-orgs", "ALLOW_ALL_ORGS"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "sf-log-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/SF-Logs/dist/index.js", "--allowed-orgs", "ALLOW_ALL_ORGS"]
    }
  }
}
```

### Verify It Works

After configuring, restart your MCP client. You should see **9 tools** from `sf-log-mcp` available. Ask your AI:

> "List my recent Salesforce debug logs"

If no logs exist, the AI will create a trace flag and guide you to generate some.

---

## How It Works

### The Flow

```
You (natural language)
  |
  v
AI Assistant (Claude / Copilot / etc.)
  |  MCP tool calls via stdio
  v
sf-log-mcp server (this project)
  |  Salesforce Tooling API (REST)
  v
Your Salesforce Org (auth via SF CLI)
```

**sf-log-mcp reuses your existing SF CLI authentication** — no passwords, tokens, or OAuth setup needed. If `sf org list` shows your org, sf-log-mcp can connect to it.

### Example Conversation

**You:** "Something's off with our Vendor X integration — check the recent logs"

**AI does this autonomously:**

| Step | Tool Called | What Happens |
|------|-----------|--------------|
| 1 | `manage_trace_flags` (list) | Checks if debug logging is active |
| 2 | `manage_trace_flags` (create) | Starts tracing if needed |
| 3 | `fetch_latest_logs` (count: 5) | Downloads 5 most recent logs to disk |
| 4 | `analyze_log` | Gets health score for each log (0-100) |
| 5 | `get_log_content` (callouts) | Drills into integration callouts |
| 6 | `get_log_content` (exceptions) | Checks for swallowed exceptions |

**AI responds:** "Found the issue. Log `07L...` shows the callout to `api.vendorx.com/sync` returned HTTP 200, but the response body contains `{"error":"rate_limit_exceeded"}`. The integration appears healthy from the Status field (shows Success), but the actual payload is being rejected. This happened in 3 of the 5 recent logs."

### Why This Matters: Silent Failures

The `ApexLog.Status` field is unreliable. Most real issues are **silent failures** where Status = "Success":

| Status says "Success" but... | What actually happened |
|---|---|
| HTTP 200 with `{"error":"rate_limit"}` in body | Integration silently failing |
| Exception caught by try-catch | Error swallowed, moved on |
| SOQL returned 0 rows | Wrong filter, no data processed |
| Governor limits at 95% | Works now, breaks at scale |
| Flow path skipped | Expected automation never fired |

**sf-log-mcp doesn't filter by status — it reads the actual log content and lets the AI reason about what happened.**

---

## Tools Reference

### Tier 1: Log Acquisition

#### `list_debug_logs`
List available debug logs with rich filtering.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetOrg` | string | default org | Org alias or username |
| `limit` | number | 20 | Max logs to return (1-100) |
| `userId` | string | - | Filter by user ID (005...) |
| `operation` | string | - | Filter: API, ApexTrigger, ApexTest, VF |
| `status` | string | - | Filter by status (not set by default) |
| `startTimeAfter` | string | - | ISO datetime lower bound |
| `startTimeBefore` | string | - | ISO datetime upper bound |
| `minDuration` | number | - | Minimum duration (ms) |
| `minSize` | number | - | Minimum log size (bytes) |

#### `fetch_debug_log`
Download a specific debug log by ID.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetOrg` | string | default org | Org alias or username |
| `logId` | string | *required* | ApexLog record ID (07L...) |
| `outputDir` | string | ./sf-logs/ | Where to save the file |
| `returnContent` | boolean | false | Also return raw content (truncated at 100KB) |

#### `fetch_latest_logs`
Batch-download the N most recent logs.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetOrg` | string | default org | Org alias or username |
| `count` | number | 5 | Number of logs to fetch (1-25) |
| `outputDir` | string | ./sf-logs/ | Where to save files |
| `userId` | string | - | Filter by user ID |
| `operation` | string | - | Filter by operation type |

### Tier 2: Content Intelligence

#### `get_log_content`
Extract structured sections from a downloaded log file. **This is the core tool for detecting silent failures.**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePath` | string | *required* | Path to a local .log file |
| `section` | enum | full | Section to extract (see below) |
| `maxLines` | number | 500 | Max lines for full/head/tail |

**Sections:**

| Section | What it extracts | Silent failures it catches |
|---------|-----------------|--------------------------|
| `callouts` | HTTP request/response pairs | Error keywords inside HTTP 200 bodies |
| `exceptions` | Handled + unhandled exceptions | Try-catch swallowed errors |
| `soql` | Queries with row counts | Zero-row results (data issues) |
| `dml` | Insert/update/delete with counts | Bulk operations (>200 rows) |
| `governor` | All limits with % and status | Approaching limits (80%+) |
| `flow` | Flow event paths | FLOW_ELEMENT_ERROR, FLOW_ELEMENT_FAULT |
| `debug_messages` | System.debug() output | Developer-logged errors |
| `head` / `tail` | First/last N lines | Quick peek at log |
| `full` | Everything (truncated) | Full context |

#### `analyze_log`
Single-call health analysis — start here before drilling into sections.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePath` | string | *required* | Path to a local .log file |

**Returns:** Health score (0-100), health rating (HEALTHY/WARNING/DEGRADED/CRITICAL), counts for all section types, critical issues list, warnings list, and details of specific failures.

### Tier 3: Lifecycle Management

#### `manage_trace_flags`
Create, list, update, and delete trace flags. **Required for debug log generation.**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetOrg` | string | default org | Org alias or username |
| `action` | enum | *required* | `list`, `create`, `update`, `delete` |
| `traceFlagId` | string | - | Required for update/delete |
| `tracedEntityId` | string | - | User ID or `"me"` — required for create |
| `expirationMinutes` | number | 60 | Duration (1-1440 min) |
| `debugLevel` | object | - | Custom log level overrides |

#### `delete_debug_logs`
Delete logs from the org. Supports dry run.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetOrg` | string | default org | Org alias or username |
| `logIds` | string[] | - | Specific log IDs to delete |
| `deleteAll` | boolean | false | Delete all logs |
| `olderThanMinutes` | number | - | Delete logs older than N minutes |
| `userId` | string | - | Delete only this user's logs |
| `operation` | string | - | Delete by operation type |
| `dryRun` | boolean | false | Preview without deleting |

### Tier 4: Cross-Log Intelligence

#### `search_logs`
Regex search across all downloaded log files.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pattern` | string | *required* | Text or regex pattern |
| `directory` | string | ./sf-logs/ | Directory to search |
| `caseSensitive` | boolean | false | Case-sensitive search |
| `maxResults` | number | 50 | Max matches to return |
| `contextLines` | number | 2 | Lines of context around matches |

#### `compare_logs`
Diff two logs side-by-side for regression detection.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePathA` | string | *required* | Baseline log file |
| `filePathB` | string | *required* | Comparison log file |
| `sections` | string[] | governor, soql, callouts, exceptions | Sections to compare |

**Returns:** Per-section diffs with deltas, direction (increased/decreased), and regression warnings.

---

## CLI Options

```bash
node dist/index.js [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--allowed-orgs <list>` | Comma-separated org usernames or tokens | (required) |
| `--output-dir <path>` | Where to save downloaded logs | `./sf-logs/` |

**Allowed org tokens:**

| Token | Meaning |
|-------|---------|
| `ALLOW_ALL_ORGS` | Any authenticated SF CLI org |
| `DEFAULT_TARGET_ORG` | Only the default target org |
| `DEFAULT_TARGET_DEV_HUB` | Only the default dev hub |
| `user@org.com` | Specific org username |

**Examples:**
```bash
# Allow all orgs
node dist/index.js --allowed-orgs ALLOW_ALL_ORGS

# Allow specific orgs only
node dist/index.js --allowed-orgs "user@prod.com,user@sandbox.com"

# Custom output directory
node dist/index.js --allowed-orgs ALLOW_ALL_ORGS --output-dir /tmp/sf-debug-logs
```

---

## Multi-Server Architecture

sf-log-mcp is designed to work **alongside** other MCP servers:

```
AI Client (Claude Desktop / VS Code / Cursor)
  |
  |--- sf-log-mcp (this project)
  |      Fetch, manage, analyze debug logs
  |
  |--- @certinia/apex-log-mcp (optional)
  |      Deep performance profiling, bottleneck detection
  |
  |--- @salesforce/mcp (optional)
         SOQL queries, metadata, deployments, test runs
```

**Workflow with Certinia:** sf-log-mcp fetches the log and saves it to disk. Certinia's tools read the same file for performance analysis. The AI combines both results.

---

## Project Structure

```
src/
  index.ts                  # CLI entry point
  config.ts                 # CLI arg parsing
  server.ts                 # MCP server with 9 tool registrations
  salesforce/
    connection.ts           # SF org auth via @salesforce/core
    logs.ts                 # Tooling API: list, download, delete logs
    traceFlags.ts           # Tooling API: trace flag CRUD
    types.ts                # SF API type definitions
  parser/
    logLineParser.ts        # Debug log line format parser
    calloutParser.ts        # HTTP callout request/response pairing
    exceptionParser.ts      # Handled vs unhandled exception detection
    soqlParser.ts           # SOQL query + row count extraction
    dmlParser.ts            # DML operation parsing
    governorLimits.ts       # Governor limit % and status
    flowParser.ts           # Flow event path tracking
    sectionExtractor.ts     # Central router for all parsers
    types.ts                # Parser type definitions
  tools/
    listDebugLogs.ts        # list_debug_logs tool
    fetchDebugLog.ts        # fetch_debug_log tool
    fetchLatestLogs.ts      # fetch_latest_logs tool
    getLogContent.ts        # get_log_content tool
    manageTraceFlags.ts     # manage_trace_flags tool
    deleteDebugLogs.ts      # delete_debug_logs tool
    searchLogs.ts           # search_logs tool
    compareLogs.ts          # compare_logs tool
    analyzeLog.ts           # analyze_log tool
  utils/
    errors.ts               # SF error classifier (9 categories)
    fileSystem.ts           # File I/O helpers
    queryBuilder.ts         # SOQL query builder
test/
  parser/                   # Parser unit tests
  tools/                    # Tool unit tests
  utils/                    # Utility tests
  fixtures/                 # Sample log files
```

---

## Development

```bash
# Build
npm run build

# Run tests (59 tests)
npm test

# Lint
npm run lint

# Format
npm run format
```

### Testing Against a Live Org

1. Authenticate: `sf org login web --alias my-org`
2. Create a trace flag (via the tool or manually in Setup)
3. Generate activity (run Apex, trigger API calls)
4. Test the server:

```bash
# Quick smoke test — sends MCP initialize + tools/list
node -e "
const { spawn } = require('child_process');
const child = spawn('node', ['dist/index.js', '--allowed-orgs', 'ALLOW_ALL_ORGS'], {stdio:['pipe','pipe','pipe']});
child.stdout.on('data', d => console.log(d.toString()));
child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1.0.0'}}}) + '\n');
setTimeout(() => {
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}) + '\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}) + '\n');
}, 1000);
setTimeout(() => { child.kill(); process.exit(); }, 3000);
"
```

---

## Security

- **Org allowlist** — The `--allowed-orgs` flag restricts which orgs the server can connect to. Use specific usernames in production, not `ALLOW_ALL_ORGS`.
- **No credentials stored** — Reuses SF CLI auth from `~/.sf/`. No passwords or tokens in config.
- **Stdio transport** — No HTTP server, no open ports. Communication is strictly via stdin/stdout with the MCP client.
- **Read-only by default** — Most tools only read data. `delete_debug_logs` and `manage_trace_flags` modify state but only affect debug infrastructure, not business data.

---

## Error Handling

sf-log-mcp classifies Salesforce API errors into actionable messages:

| Error | What You See |
|-------|-------------|
| Session expired | "Re-authenticate with: `sf org login web --alias <org>`" |
| API limit exceeded | "Wait and retry, or check API usage in Setup" |
| Insufficient permissions | "User needs View All Data or Manage Users permission" |
| Entity already traced | "Use manage_trace_flags to find and update the existing flag" |
| Network error | "Check internet connection and org instance URL" |
| Auth not found | "Authenticate with: `sf org login web`" |

---

## Roadmap

- [ ] CI/CD pipeline (GitHub Actions)
- [ ] npm publish as `sf-log-mcp`
- [ ] MCP Inspector testing
- [ ] Client compatibility testing (Claude Desktop, VS Code, Cursor, Windsurf)

---

## Planning & Architecture Docs

The original detailed planning document (problem analysis, API reference, implementation phases, competitive analysis) is in [`docs/PLANNING.md`](docs/PLANNING.md).

---

## License

MIT
