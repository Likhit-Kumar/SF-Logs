#!/usr/bin/env node

/**
 * MCP Server smoke test — verifies the server starts, initializes,
 * and exposes all expected tools via the MCP protocol.
 *
 * Usage: node scripts/test-mcp.js [--allowed-orgs ALLOW_ALL_ORGS]
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = test failure
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const EXPECTED_TOOLS = [
  "list_debug_logs",
  "fetch_debug_log",
  "fetch_latest_logs",
  "get_log_content",
  "manage_trace_flags",
  "delete_debug_logs",
  "search_logs",
  "compare_logs",
  "analyze_log",
];

const args = process.argv.slice(2);
const allowedOrgs = args.includes("--allowed-orgs")
  ? args[args.indexOf("--allowed-orgs") + 1]
  : "ALLOW_ALL_ORGS";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name} — ${detail}`);
    failed++;
  }
}

async function run() {
  console.log("MCP Server Smoke Test");
  console.log("=====================\n");

  const child = spawn("node", [serverPath, "--allowed-orgs", allowedOrgs], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));

  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

  const responses = new Map();

  const waitForResponse = (id, timeoutMs = 5000) =>
    new Promise((resolve, reject) => {
      const check = () => {
        if (responses.has(id)) return resolve(responses.get(id));
        setTimeout(check, 50);
      };
      check();
      setTimeout(() => reject(new Error(`Timeout waiting for response id=${id}`)), timeoutMs);
    });

  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
      } catch {}
    }
  });

  try {
    // Test 1: Initialize
    console.log("1. Initialize");
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-test", version: "1.0.0" },
      },
    });

    const initResp = await waitForResponse(1);
    check("Server responds to initialize", !!initResp.result, "No response");
    check(
      "Protocol version matches",
      initResp.result?.protocolVersion === "2024-11-05",
      `Got: ${initResp.result?.protocolVersion}`,
    );
    check(
      "Server name is sf-log-mcp",
      initResp.result?.serverInfo?.name === "sf-log-mcp",
      `Got: ${initResp.result?.serverInfo?.name}`,
    );
    check(
      "Server version is 1.0.0",
      initResp.result?.serverInfo?.version === "1.0.0",
      `Got: ${initResp.result?.serverInfo?.version}`,
    );
    check("Tools capability advertised", !!initResp.result?.capabilities?.tools, "Missing tools capability");

    // Send initialized notification
    send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // Test 2: List tools
    console.log("\n2. Tools List");
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

    const toolsResp = await waitForResponse(2);
    const tools = toolsResp.result?.tools || [];
    const toolNames = tools.map((t) => t.name);

    check(`${EXPECTED_TOOLS.length} tools registered`, tools.length === EXPECTED_TOOLS.length, `Got: ${tools.length}`);

    for (const name of EXPECTED_TOOLS) {
      check(`Tool '${name}' exists`, toolNames.includes(name), "Missing");
    }

    // Test 3: Tool schemas
    console.log("\n3. Tool Schemas");
    for (const tool of tools) {
      check(
        `'${tool.name}' has input schema`,
        !!tool.inputSchema && tool.inputSchema.type === "object",
        "Missing or invalid schema",
      );
      check(
        `'${tool.name}' has description`,
        typeof tool.description === "string" && tool.description.length > 10,
        "Missing or too short",
      );
    }

    // Test 4: Stderr message
    console.log("\n4. Server Output");
    check("Startup message on stderr", stderr.includes("sf-log-mcp server running"), `stderr: ${stderr.trim()}`);

    // Summary
    console.log(`\n${"=".repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    child.kill();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("\nTest error:", error.message);
    child.kill();
    process.exit(1);
  }
}

run();
