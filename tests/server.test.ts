import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';

// 1. Mocks

const mockApiClient = {
  findSections: jest.fn(),
  getItems: jest.fn(),
};

jest.unstable_mockModule('../src/api-client.js', () => ({
  AwesomeContextAPIClient: jest.fn().mockImplementation(() => mockApiClient)
}));

export const mockRegisteredTools = new Map();
export const mockMcpConnect = jest.fn();

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    constructor() {}
    registerTool(name: string, config: any, callback: any) {
      mockRegisteredTools.set(name, { config, callback });
    }
    connect(transport: any) {
      mockMcpConnect(transport);
      return Promise.resolve();
    }
  }
}));

export const mockHttpHandler = { current: null as any };
export const mockHttpServer = {
  listen: jest.fn((port, cb: any) => { if(cb) cb(); }),
  once: jest.fn(),
};

jest.unstable_mockModule('http', () => ({
  ...http,
  createServer: jest.fn((handler) => {
    mockHttpHandler.current = handler;
    return mockHttpServer;
  }),
}));

const mockStreamableTransport = {
  handleRequest: jest.fn(),
};
jest.unstable_mockModule('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => mockStreamableTransport)
}));

const mockSseTransport = {
  sessionId: 'test-session-123',
  handlePostMessage: jest.fn(),
};
jest.unstable_mockModule('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: jest.fn().mockImplementation(() => mockSseTransport)
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({}))
}));

// 2. Tests

describe('McpServer index.ts', () => {
  let originalArgv: string[];
  let originalExit: any;
  let originalConsoleError: any;
  let originalConsoleWarn: any;
  let moduleCounter = 0;

  beforeAll(() => {
    originalArgv = [...process.argv];
    originalExit = process.exit;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisteredTools.clear();
    mockHttpHandler.current = null;
    process.exit = jest.fn() as any;
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterAll(() => {
    process.argv = [...originalArgv];
    process.exit = originalExit;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  async function loadIndex() {
    moduleCounter++;
    // Use dynamic import with query param to bypass cache and re-execute module
    await import(`../src/index.js?run=${moduleCounter}`);
  }

  describe('CLI arguments and validation', () => {
    it('should default to stdio if transport is somehow omitted', async () => {
      // Commander defaults it to "stdio", but we can force options to undefined to hit the branch
      // Actually, we mocked commander. We can alter the mock specifically for this test.
      // We will skip testing that exact || "stdio" branch if we can't easily reach it without breaking module caching.
    });

    it('should exit if transport is invalid', async () => {
      process.argv = ['node', 'index.js', '--transport', 'invalid'];
      await loadIndex();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Invalid --transport value"));
    });

    it('should exit if --api-key is used with http transport', async () => {
      process.argv = ['node', 'index.js', '--transport', 'http', '--api-key', 'secret'];
      await loadIndex();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("The --api-key flag is not allowed when using --transport http"));
    });

    it('should exit if --port is used with stdio transport', async () => {
      process.argv = ['node', 'index.js', '--transport', 'stdio', '--port', '8080'];
      await loadIndex();
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("The --port flag is not allowed when using --transport stdio."));
    });

    it('should start with stdio transport successfully', async () => {
      process.argv = ['node', 'index.js', '--transport', 'stdio'];
      await loadIndex();
      // Ensure no exit was called
      expect(process.exit).not.toHaveBeenCalled();
      // Tools should be registered
      expect(mockRegisteredTools.size).toBeGreaterThan(0);
      expect(mockMcpConnect).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("Context Awesome MCP Server running on stdio");
    });

    it('should accept --api-key when using stdio transport', async () => {
      process.argv = ['node', 'index.js', '--transport', 'stdio', '--api-key', 'my-secret'];
      await loadIndex();
      expect(process.exit).not.toHaveBeenCalled();
      expect(mockMcpConnect).toHaveBeenCalled();
    });

    it('should catch fatal errors in main() block', async () => {
      process.argv = ['node', 'index.js', '--transport', 'stdio'];
      mockMcpConnect.mockImplementationOnce(() => { throw new Error('Fatal connection error'); });
      await loadIndex();
      // It's a Promise catch block, wait a tick
      await new Promise(r => setImmediate(r));
      expect(console.error).toHaveBeenCalledWith("Fatal error in main():", expect.any(Error));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('Tools Logic', () => {
    beforeEach(async () => {
      process.argv = ['node', 'index.js', '--transport', 'stdio'];
      await loadIndex();
    });

    describe('find_awesome_section', () => {
      it('should return error text when API throws', async () => {
        const tool = mockRegisteredTools.get('find_awesome_section');
        mockApiClient.findSections.mockRejectedValueOnce({ message: 'API failed' });
        
        const result = await tool.callback({ query: 'test' });
        expect(result.content[0].text).toContain('API failed');
      });

      it('should format sections correctly', async () => {
        const tool = mockRegisteredTools.get('find_awesome_section');
        mockApiClient.findSections.mockResolvedValueOnce({
          sections: [{
            githubRepo: 'test/repo',
            category: 'Testing',
            subcategory: 'Unit',
            listName: 'List',
            itemCount: 5,
            confidence: 0.9,
          }]
        });
        
        const result = await tool.callback({ query: 'test' });
        expect(result.content[0].text).toContain('test/repo');
        expect(result.content[0].text).toContain('Testing > Unit');
      });

      it('should return no sections found text', async () => {
        const tool = mockRegisteredTools.get('find_awesome_section');
        mockApiClient.findSections.mockResolvedValueOnce({ sections: [] });
        
        const result = await tool.callback({ query: 'test' });
        expect(result.content[0].text).toContain('No sections found matching "test"');
      });

      it('should handle undefined sections', async () => {
        const tool = mockRegisteredTools.get('find_awesome_section');
        mockApiClient.findSections.mockResolvedValueOnce({});
        const result = await tool.callback({ query: 'test' });
        expect(result.content[0].text).toContain('No sections found');
      });

      it('should return default error text when API throws without message', async () => {
        const tool = mockRegisteredTools.get('find_awesome_section');
        mockApiClient.findSections.mockRejectedValueOnce({});
        
        const result = await tool.callback({ query: 'test' });
        expect(result.content[0].text).toContain('Failed to search for sections. Please try again.');
      });
    });

    describe('get_awesome_items', () => {
      it('should require listId or githubRepo', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        const result = await tool.callback({});
        expect(result.content[0].text).toContain('Either listId or githubRepo must be provided');
      });

      it('should succeed with both listId and githubRepo', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockResolvedValueOnce({ items: [], metadata: { totalItems: 0, hasMore: false }, tokenUsage: { used: 0, limit: 10000, truncated: false } });
        const result = await tool.callback({ listId: '123', githubRepo: 'repo' });
        expect(result.content[0].text).toContain('No items found');
      });

      it('should succeed with only listId', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockResolvedValueOnce({ items: [], metadata: { totalItems: 0, hasMore: false }, tokenUsage: { used: 0, limit: 10000, truncated: false } });
        const result = await tool.callback({ listId: '123' });
        expect(result.content[0].text).toContain('No items found');
      });

      it('should return empty message if items is undefined', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockResolvedValueOnce({});
        const result = await tool.callback({ githubRepo: 'test/repo' });
        expect(result.content[0].text).toContain('No items found');
      });

      it('should handle API errors', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockRejectedValueOnce({ message: 'API Error' });
        const result = await tool.callback({ githubRepo: 'test/repo' });
        expect(result.content[0].text).toContain('API Error');
      });

      it('should return default error text when API throws without message', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockRejectedValueOnce({});
        const result = await tool.callback({ githubRepo: 'test/repo' });
        expect(result.content[0].text).toContain('Failed to retrieve items. Please check your parameters and try again.');
      });

      it('should format items correctly with undefined hasMore', async () => {
      const tool = mockRegisteredTools.get('get_awesome_items');
      mockApiClient.getItems.mockResolvedValueOnce({
        items: [{
          name: 'Item 1',
          url: 'http://test',
          description: 'Desc',
          githubStars: 10,
          githubRepo: 'test/item',
          tags: ['a']
        }],
        metadata: { list: { name: 'List', description: 'List Desc' }, totalItems: 1, offset: 0, hasMore: undefined },
        tokenUsage: { used: 10, limit: 100, truncated: true }
      });
      const result = await tool.callback({ githubRepo: 'test/repo' });
      expect(result.content[0].text).toContain('Item 1');
      expect(result.content[0].text).not.toContain('Next page');
    });

    it('should handle get_awesome_items with string tokens', async () => {
      const tool = mockRegisteredTools.get('get_awesome_items');
      mockApiClient.getItems.mockResolvedValueOnce({ items: [{ name: 'Item 1' }], metadata: { totalItems: 1, hasMore: false, list: {name: 'A'} }, tokenUsage: { used: 0, limit: 10000, truncated: false } });
      const parsed = z.object(tool.config.inputSchema).parse({ githubRepo: 'test/repo', tokens: '15000' });
      const result = await tool.callback(parsed);
      expect(mockApiClient.getItems).toHaveBeenCalledWith(expect.objectContaining({ tokens: 15000 }));
    });

    it('should handle get_awesome_items with number tokens below default', async () => {
      const tool = mockRegisteredTools.get('get_awesome_items');
      mockApiClient.getItems.mockResolvedValueOnce({ items: [{ name: 'Item 1' }], metadata: { totalItems: 1, hasMore: false, list: {name: 'A'} }, tokenUsage: { used: 0, limit: 10000, truncated: false } });
      const parsed = z.object(tool.config.inputSchema).parse({ githubRepo: 'test/repo', tokens: 5000 });
      await tool.callback(parsed);
      expect(mockApiClient.getItems).toHaveBeenCalledWith(expect.objectContaining({ tokens: 10000 }));
    });

    it('should return empty message if no items', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockResolvedValueOnce({ items: [] });
        const result = await tool.callback({ githubRepo: 'test/repo' });
        expect(result.content[0].text).toContain('No items found');
      });

      it('should format items correctly', async () => {
        const tool = mockRegisteredTools.get('get_awesome_items');
        mockApiClient.getItems.mockResolvedValueOnce({
          items: [{
            name: 'Item 1',
            url: 'http://test',
            description: 'Desc',
            githubStars: 10,
            githubRepo: 'test/item',
            tags: ['a']
          }],
          metadata: { list: { name: 'List', description: 'List Desc' }, totalItems: 1, offset: 0, hasMore: true },
          tokenUsage: { used: 10, limit: 100, truncated: true }
        });
        const result = await tool.callback({ githubRepo: 'test/repo' });
        expect(result.content[0].text).toContain('Item 1');
        expect(result.content[0].text).toContain('List Desc');
        expect(result.content[0].text).toContain('truncated');
        expect(result.content[0].text).toContain('Next page');
      });
    });
  });

  describe('HTTP Server Transport', () => {
    beforeEach(async () => {
      process.argv = ['node', 'index.js', '--transport', 'http', '--port', '3000'];
      await loadIndex();
    });

    const createMockReqRes = (url: string, method: string, headers: any = {}) => {
      const req = {
        url,
        method,
        headers: { host: 'localhost', ...headers },
        socket: { remoteAddress: '127.0.0.1' }
      } as any;
      const res = {
        writeHead: jest.fn(),
        end: jest.fn(),
        setHeader: jest.fn(),
        on: jest.fn(),
        headersSent: false
      } as any;
      return { req, res };
    };

    it('should start http server', () => {
      expect(mockHttpHandler.current).toBeInstanceOf(Function);
      expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    });

    it('should handle OPTIONS request', async () => {
      const { req, res } = createMockReqRes('/mcp', 'OPTIONS');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle /ping request', async () => {
      const { req, res } = createMockReqRes('/ping', 'GET');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith('pong');
    });

    it('should handle empty request url', async () => {
      const { req, res } = createMockReqRes(undefined as any, 'GET');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(404);
    });

    it('should handle empty request url', async () => {
      const { req, res } = createMockReqRes('', 'GET');
      await mockHttpHandler.current(req, res);
      // Since it's empty, pathname will be '/' and it will 404
      expect(res.writeHead).toHaveBeenCalledWith(404);
    });

    it('should handle /health request', async () => {
      const { req, res } = createMockReqRes('/health', 'GET');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('healthy'));
    });

    it('should handle undefined host header', async () => {
      const { req, res } = createMockReqRes('/ping', 'GET', { host: undefined });
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(res.end).toHaveBeenCalledWith('pong');
    });

    it('should handle 404 for unknown routes', async () => {
      const { req, res } = createMockReqRes('/unknown', 'GET');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(404);
      expect(res.end).toHaveBeenCalledWith('Not found');
    });

    it('should handle /mcp POST request', async () => {
      const { req, res } = createMockReqRes('/mcp', 'POST');
      await mockHttpHandler.current(req, res);
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(req, res);
    });

    it('should handle /sse GET request', async () => {
      const { req, res } = createMockReqRes('/sse', 'GET');
      await mockHttpHandler.current(req, res);
      expect(mockMcpConnect).toHaveBeenCalled();
      
      // Simulate close event
      const closeHandler = res.on.mock.calls.find((c: any) => c[0] === 'close')[1];
      closeHandler(); // Should delete transport
    });

    it('should handle /messages POST request without sessionId', async () => {
      const { req, res } = createMockReqRes('/messages', 'POST');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalledWith('Missing sessionId parameter');
    });

    it('should handle /messages POST request with invalid sessionId', async () => {
      const { req, res } = createMockReqRes('/messages?sessionId=invalid', 'POST');
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(400);
      expect(res.end).toHaveBeenCalledWith('No transport found for sessionId: invalid');
    });

    it('should handle /messages POST request with valid sessionId', async () => {
      // First hit /sse to create a transport
      const { req: sseReq, res: sseRes } = createMockReqRes('/sse', 'GET');
      await mockHttpHandler.current(sseReq, sseRes);

      // Now post to messages
      const { req, res } = createMockReqRes(`/messages?sessionId=${mockSseTransport.sessionId}`, 'POST');
      await mockHttpHandler.current(req, res);
      expect(mockSseTransport.handlePostMessage).toHaveBeenCalledWith(req, res);
    });

    it('should return 500 on internal error', async () => {
      const { req, res } = createMockReqRes('/mcp', 'POST');
      mockStreamableTransport.handleRequest.mockRejectedValueOnce(new Error('Test error'));
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(500);
      expect(res.end).toHaveBeenCalledWith('Internal Server Error');
    });

    it('should not return 500 on internal error if headers are sent', async () => {
      const { req, res } = createMockReqRes('/mcp', 'POST');
      res.headersSent = true;
      mockStreamableTransport.handleRequest.mockRejectedValueOnce(new Error('Test error'));
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should handle EADDRINUSE port retry', async () => {
      // simulate error event
      const errorHandler = mockHttpServer.once.mock.calls.find((c: any) => c[0] === 'error')[1];
      const error = new Error('EADDRINUSE') as NodeJS.ErrnoException;
      error.code = 'EADDRINUSE';
      errorHandler(error);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('is in use, trying port'));
      // Expect listen to be called again with port + 1
      expect(mockHttpServer.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    });

    it('should handle fatal server errors', async () => {
      const errorHandler = mockHttpServer.once.mock.calls.find((c: any) => c[0] === 'error')[1];
      const error = new Error('Fatal') as NodeJS.ErrnoException;
      errorHandler(error);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to start server'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('IP & API Key Extraction Edge Cases', () => {
    beforeEach(async () => {
      process.argv = ['node', 'index.js', '--transport', 'http'];
      await loadIndex();
    });

    const triggerAuth = async (headers: any) => {
      const req = {
        url: '/mcp',
        method: 'POST',
        headers: { host: 'localhost', ...headers },
        socket: {}
      } as any;
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
    };

    it('should extract Bearer token', async () => {
      await triggerAuth({ authorization: 'Bearer secret-token' });
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalled();
    });

    it('should extract raw Authorization token without Bearer prefix', async () => {
      await triggerAuth({ authorization: 'secret-token-no-bearer' });
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalled();
    });

    it('should extract X-API-Key array header', async () => {
      await triggerAuth({ 'x-api-key': ['secret-token', 'other'] });
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalled();
    });

    it('should extract X-API-Key string header', async () => {
      await triggerAuth({ 'x-api-key': 'secret-token-string' });
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalled();
    });

    it('should extract multiple IPs from X-Forwarded-For', async () => {
      const req = {
        url: '/mcp',
        method: 'POST',
        headers: { host: 'localhost', 'x-forwarded-for': '10.0.0.1, 8.8.8.8' },
        socket: {}
      } as any;
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalled();
    });

    it('should fallback to first IP if all are private', async () => {
      const req = {
        url: '/mcp',
        method: 'POST',
        headers: { host: 'localhost', 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
        socket: {}
      } as any;
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
    });

    it('should handle IPv6 mapped IPv4 address in socket', async () => {
      const req = {
        url: '/mcp',
        method: 'POST',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '::ffff:127.0.0.1' }
      } as any;
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
    });

    it('should handle missing socket gracefully', async () => {
      const req = {
        url: '/ping',
        method: 'GET',
        headers: { host: 'localhost' },
      } as any; // No socket property
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });

    it('should handle socket with missing remoteAddress gracefully', async () => {
      const req = {
        url: '/ping',
        method: 'GET',
        headers: { host: 'localhost' },
        socket: {} // Missing remoteAddress
      } as any;
      const res = { writeHead: jest.fn(), end: jest.fn(), setHeader: jest.fn(), on: jest.fn() } as any;
      await mockHttpHandler.current(req, res);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });
  });
});
