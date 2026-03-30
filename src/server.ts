import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerConfig } from "./config.js";
import { listDebugLogsSchema, listDebugLogs } from "./tools/listDebugLogs.js";
import { fetchDebugLogSchema, fetchDebugLog } from "./tools/fetchDebugLog.js";
import { fetchLatestLogsSchema, fetchLatestLogs } from "./tools/fetchLatestLogs.js";
import { getLogContentSchema, getLogContent } from "./tools/getLogContent.js";

export class SfLogMcpServer {
  private server: McpServer;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new McpServer({
      name: "sf-log-mcp",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private registerTools() {
    // Tool 1: list_debug_logs
    this.server.tool(
      "list_debug_logs",
      "List available debug logs from a Salesforce org. Returns metadata (ID, operation, status, duration, size, user) for each log. Does NOT filter by status by default — most real issues are silent failures where status shows Success.",
      listDebugLogsSchema,
      async (params) => {
        try {
          const result = await listDebugLogs(this.config.allowedOrgs, params);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error listing debug logs: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 2: fetch_debug_log
    this.server.tool(
      "fetch_debug_log",
      "Download a specific debug log by ID from a Salesforce org and save it locally. Returns the local file path so other tools (like get_log_content or Certinia's analyzers) can read it.",
      fetchDebugLogSchema,
      async (params) => {
        try {
          const result = await fetchDebugLog(
            this.config.allowedOrgs,
            this.config.outputDir,
            params,
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching debug log: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 3: fetch_latest_logs
    this.server.tool(
      "fetch_latest_logs",
      "Download the N most recent debug logs from a Salesforce org in one call. Saves all logs locally and returns file paths. Use this when investigating recent issues — fetch first, then use get_log_content to inspect each log's callouts, exceptions, SOQL, governor limits, etc.",
      fetchLatestLogsSchema,
      async (params) => {
        try {
          const result = await fetchLatestLogs(
            this.config.allowedOrgs,
            this.config.outputDir,
            params,
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error fetching latest logs: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 4: get_log_content (Content Intelligence)
    this.server.tool(
      "get_log_content",
      "Extract structured sections from a downloaded debug log file. This is the core content intelligence tool — it detects silent failures that the Status field misses. Use section='callouts' to find integration errors hidden in HTTP 200 responses, 'exceptions' for try-catch swallowed errors, 'soql' for zero-row queries, 'governor' for approaching limits, 'flow' for skipped automation, 'debug_messages' for developer logs, or 'full' for everything.",
      getLogContentSchema,
      async (params) => {
        try {
          const result = await getLogContent(params);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error reading log content: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("sf-log-mcp server running on stdio");
  }
}
