#!/usr/bin/env node

import { SfLogMcpServer } from "./server.js";
import { parseCliArgs } from "./config.js";

async function main() {
  const config = parseCliArgs(process.argv.slice(2));
  const server = new SfLogMcpServer(config);
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error starting sf-log-mcp:", error);
  process.exit(1);
});
