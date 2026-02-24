import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/index.js"]
  });

  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  console.log("Connecting to MCP server...");
  await client.connect(transport);
  console.log("Connected!");

  try {
    console.log("--- Testing find_awesome_section ---");
    const result1 = await client.callTool({
      name: "find_awesome_section",
      arguments: {
        query: "rust web frameworks"
      }
    });
    console.log(JSON.stringify(result1, null, 2));

    console.log("--- Testing get_awesome_items ---");
    const result2 = await client.callTool({
      name: "get_awesome_items",
      arguments: {
        githubRepo: "avelino/awesome-go",
        section: "Web Frameworks",
        tokens: 2000
      }
    });
    console.log(JSON.stringify(result2, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

main().catch(console.error);
