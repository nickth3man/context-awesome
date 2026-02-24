import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { IncomingMessage } from 'http';

// We need to mock commander so that we don't accidentally process real CLI args when importing index.ts
jest.unstable_mockModule('commander', () => {
  return {
    Command: jest.fn().mockImplementation(() => {
      const mockOpts = {
        transport: 'stdio',
        port: '3000',
        apiHost: 'https://api.context-awesome.com',
        apiKey: undefined,
        debug: false,
      };

      const commandMock = {
        option: jest.fn().mockReturnThis(),
        allowUnknownOption: jest.fn().mockReturnThis(),
        parse: jest.fn().mockReturnThis(),
        opts: jest.fn().mockReturnValue(mockOpts),
      };
      return commandMock;
    }),
  };
});

jest.unstable_mockModule('../src/api-client.js', () => {
  return {
    AwesomeContextAPIClient: jest.fn().mockImplementation(() => {
      return {
        findSections: jest.fn(),
        getItems: jest.fn(),
      };
    })
  };
});

// Delay import until after mocks are set up
let indexModule: any;
let mockApiClient: any;

describe('McpServer Tools', () => {
  beforeEach(async () => {
    // Dynamic import to ensure the mock is used
    indexModule = await import('../src/index.js');
    
    const { AwesomeContextAPIClient } = await import('../src/api-client.js');
    // Ensure we start with fresh mocks for each test
    (AwesomeContextAPIClient as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getClientIp', () => {
    it('should return undefined if no headers or socket present', () => {
      const req = { headers: {} } as IncomingMessage;
      expect(indexModule.getClientIp(req)).toBeUndefined();
    });

    it('should prefer x-forwarded-for over remoteAddress', () => {
      const req = {
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '5.6.7.8' }
      } as IncomingMessage;
      expect(indexModule.getClientIp(req)).toBe('1.2.3.4');
    });

    it('should return the first public IP from a list in x-forwarded-for', () => {
      // 10.0.0.1 and 192.168.1.1 are private. 1.2.3.4 is public.
      const req = {
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1, 1.2.3.4' },
      } as IncomingMessage;
      expect(indexModule.getClientIp(req)).toBe('1.2.3.4');
    });

    it('should fallback to remoteAddress if x-forwarded-for is missing', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '5.6.7.8' }
      } as IncomingMessage;
      expect(indexModule.getClientIp(req)).toBe('5.6.7.8');
    });

    it('should strip IPv6-mapped IPv4 prefix (::ffff:)', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '::ffff:127.0.0.1' }
      } as IncomingMessage;
      expect(indexModule.getClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('createServerInstance', () => {
    let server: any;
    let findSectionTool: any;
    let getItemsTool: any;

    beforeEach(async () => {
      server = indexModule.createServerInstance('127.0.0.1', 'test-key');
      
      const { AwesomeContextAPIClient } = await import('../src/api-client.js');
      mockApiClient = (AwesomeContextAPIClient as jest.Mock).mock.results[0].value;

      // Extract the registered tools from the server instance
      // Using internal properties to test the tool execution logic
      const tools = server._registeredTools;
      if (tools) {
         findSectionTool = tools.find_awesome_section;
         getItemsTool = tools.get_awesome_items;
      }
    });

    it('should register find_awesome_section tool', () => {
      expect(findSectionTool).toBeDefined();
      expect(findSectionTool.title).toBe('Find Awesome List Section');
    });

    it('should register get_awesome_items tool', () => {
      expect(getItemsTool).toBeDefined();
      expect(getItemsTool.title).toBe('Get Awesome List Items');
    });

    // Test find_awesome_section formatting
    it('find_awesome_section should format response correctly', async () => {
      const mockResponse = {
        sections: [
          {
            id: '1',
            listName: 'Awesome List',
            githubRepo: 'test/repo',
            category: 'Testing',
            subcategory: 'Unit',
            itemCount: 10,
            confidence: 0.9,
            description: 'Test desc'
          }
        ]
      };
      
      mockApiClient.findSections.mockResolvedValueOnce(mockResponse);

      // Execute the tool logic
      const result = await findSectionTool.callback({ query: 'testing' });
      
      expect(mockApiClient.findSections).toHaveBeenCalledWith({
        query: 'testing',
        confidence: 0.3,
        limit: 10
      });

      // Verify the output text formatting
      const text = result.content[0].text;
      expect(text).toContain('# Search Results for "testing"');
      expect(text).toContain('### Awesome List - Testing > Unit');
      expect(text).toContain('- **Repository**: `test/repo`');
      expect(text).toContain('https://github.com/test/repo');
    });

    it('find_awesome_section should return empty message when no sections found', async () => {
      mockApiClient.findSections.mockResolvedValueOnce({ sections: [] });

      const result = await findSectionTool.callback({ query: 'nonexistent' });
      expect(result.content[0].text).toContain('No sections found matching "nonexistent"');
    });

    // Test get_awesome_items formatting
    it('get_awesome_items should format response correctly', async () => {
      const mockResponse = {
        items: [
          {
            name: 'Test Item',
            description: 'Item desc',
            url: 'https://test.com',
            githubRepo: 'test/item',
            githubStars: 100,
            tags: ['test']
          }
        ],
        metadata: {
          list: { name: 'Awesome List' },
          section: 'Testing',
          totalItems: 1,
          offset: 0,
          hasMore: false
        },
        tokenUsage: { used: 100, limit: 10000, truncated: false }
      };
      
      mockApiClient.getItems.mockResolvedValueOnce(mockResponse);

      const result = await getItemsTool.callback({ 
        githubRepo: 'test/repo',
        section: 'Testing'
      });

      expect(mockApiClient.getItems).toHaveBeenCalledWith({
        githubRepo: 'test/repo',
        section: 'Testing',
        tokens: 10000, // DEFAULT_MINIMUM_TOKENS
        offset: 0,
        listId: undefined,
        subcategory: undefined
      });

      const text = result.content[0].text;
      expect(text).toContain('# Awesome List - Testing');
      expect(text).toContain('## 1. Test Item');
      expect(text).toContain('Item desc');
      expect(text).toContain('**URL**: https://test.com');
      expect(text).toContain('**GitHub**: https://github.com/test/item');
      expect(text).toContain('**Stars**: 100');
      expect(text).toContain('**Tags**: test');
      expect(text).toContain('- **Token usage**: 100/10,000');
    });

    it('get_awesome_items should throw an error if missing repo/listId', async () => {
      const result = await getItemsTool.callback({});
      expect(result.content[0].text).toContain('Either listId or githubRepo must be provided');
    });
  });
});