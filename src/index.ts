#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseConfig } from "./config.js";
import { createServerInstance } from "./mcp-server.js";
import { startHttpServer } from "./http-server.js";

async function main() {
  const config = parseConfig(process.argv);

  if (config.transport === "http") {
    startHttpServer(config);
  } else {
    // Stdio transport - this is already stateless by nature
    const server = createServerInstance(
      config.apiHost,
      config.debug,
      undefined,
      config.apiKey
    );
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Context Awesome MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
