import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AwesomeContextAPIClient } from "./api-client.js";
import { registerFindAwesomeSectionTool } from "./tools/find-section.js";
import { registerGetAwesomeItemsTool } from "./tools/get-items.js";
import { registerRandomAwesomeItemTool } from "./tools/random-awesome-item.js";
import { registerListAwesomeListsTool } from "./tools/list-awesome-lists.js";
import { registerFindAndGetTool } from "./tools/find-and-get.js";

// Function to create a new server instance with all tools registered
export function createServerInstance(
  apiHost: string,
  debug: boolean,
  _clientIp?: string,
  apiKey?: string
) {
  const apiClient = new AwesomeContextAPIClient(apiHost, apiKey, debug);

  const server = new McpServer(
    {
      name: "context-awesome",
      version: "1.0.0",
    },
    {
      instructions:
        "Use this server to search and retrieve curated awesome lists of resources. Always use find_awesome_section first to discover relevant sections, then use get_awesome_items to retrieve specific items.",
    }
  );

  // Register tools
  registerFindAwesomeSectionTool(server, apiClient);
  registerGetAwesomeItemsTool(server, apiClient);
  registerRandomAwesomeItemTool(server, apiClient);
  registerListAwesomeListsTool(server, apiClient);
  registerFindAndGetTool(server, apiClient);

  return server;
}
