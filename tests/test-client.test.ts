import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Integration test suite that connects an actual MCP client to the server running via Stdio
describe('MCP Server Integration Tests', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Connect to the server using stdio transport running tsx
    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/index.ts"],
    });

    client = new Client(
      { name: "jest-test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
  }, 10000); // 10s timeout for spin up

  afterAll(async () => {
    if (transport) {
      await transport.close();
    }
  });

  it('should list available tools correctly', async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t: any) => t.name);
    
    expect(toolNames).toContain('find_awesome_section');
    expect(toolNames).toContain('get_awesome_items');
  });

  it('find_awesome_section should return text output successfully', async () => {
    const findResult = await client.callTool({
      name: "find_awesome_section",
      arguments: {
        query: "react hooks",
        limit: 1 // Keep it small
      }
    });
    
    expect(findResult.content).toBeDefined();
    expect(findResult.content.length).toBeGreaterThan(0);
    
    const textContent = (findResult.content[0] as any).text;
    expect(typeof textContent).toBe('string');
    expect(textContent).toContain('# Search Results for "react hooks"');
  }, 15000); // Higher timeout for real network request

  it('get_awesome_items should return text output successfully', async () => {
    const getResult = await client.callTool({
      name: "get_awesome_items",
      arguments: {
        githubRepo: "rehooks/awesome-react-hooks",
        tokens: 10000,
        offset: 0
      }
    });
    
    expect(getResult.content).toBeDefined();
    expect(getResult.content.length).toBeGreaterThan(0);
    
    const textContent = (getResult.content[0] as any).text;
    expect(typeof textContent).toBe('string');
    expect(textContent).toContain('ahooks');
  }, 15000); // Higher timeout for real network request
});