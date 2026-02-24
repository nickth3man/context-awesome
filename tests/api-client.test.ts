import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node-fetch', () => {
  return {
    default: jest.fn(),
  };
});

const fetchMock = (await import('node-fetch')).default as jest.Mock;
const { AwesomeContextAPIClient } = await import('../src/api-client.js');

describe('AwesomeContextAPIClient', () => {
  let client: InstanceType<typeof AwesomeContextAPIClient>;

  beforeEach(() => {
    client = new AwesomeContextAPIClient('https://test-api.com', 'test-key', false);
    jest.clearAllMocks();
  });

  describe('findSections', () => {
    it('should return sections when successful', async () => {
      const mockResponse = {
        sections: [
          {
            id: '1',
            listName: 'Awesome List',
            githubRepo: 'test/repo',
            category: 'Testing',
            itemCount: 10,
            confidence: 0.9,
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.findSections({ query: 'test' });
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.origin).toBe('https://test-api.com');
      expect(url.pathname).toBe('/api/find-section');
      expect(url.searchParams.get('query')).toBe('test');

      expect(response.sections.length).toBe(1);
      expect(response.sections[0].githubRepo).toBe('test/repo');
    });

    it('should throw APIError on failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Not Found Error' }),
      });

      await expect(client.findSections({ query: 'unknown' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    // Edge Case 1: Normalize snake_case properties and `results` array
    it('should normalize snake_case properties and fallback to `results` array', async () => {
      const mockResponse = {
        results: [
          {
            _id: '123',
            list_name: 'Snake Case List',
            github_repo: 'user/snake_case',
            section: 'Backend',
            sub_category: 'Databases',
            item_count: 42,
            score: 0.85
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.findSections({ query: 'database' });
      
      expect(response.sections.length).toBe(1);
      const section = response.sections[0];
      expect(section.id).toBe('123');
      expect(section.listName).toBe('Snake Case List');
      expect(section.githubRepo).toBe('user/snake_case');
      expect(section.category).toBe('Backend');
      expect(section.subcategory).toBe('Databases');
      expect(section.itemCount).toBe(42);
      expect(section.confidence).toBe(0.85);
    });

    // Edge Case 2: Handle missing optional fields gracefully
    it('should handle sections with missing optional fields gracefully', async () => {
      const mockResponse = {
        sections: [
          {
            // Missing id, listName, githubRepo, subcategory, description
            category: 'Minimal',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.findSections({ query: 'minimal' });
      
      expect(response.sections.length).toBe(1);
      const section = response.sections[0];
      expect(section.id).toBe('');
      expect(section.listName).toBe('');
      expect(section.githubRepo).toBe('');
      expect(section.category).toBe('Minimal');
      expect(section.subcategory).toBe('');
      expect(section.itemCount).toBe(0);
      expect(section.confidence).toBe(0);
      expect(section.description).toBe('');
    });
  });

  describe('getItems', () => {
    it('should return items when successful', async () => {
      const mockResponse = {
        items: [
          {
            id: '1',
            name: 'Test Item',
            url: 'https://test.com',
            githubStars: 100,
            githubRepo: 'test/item',
          },
        ],
        metadata: {
          listId: 'list1',
          listName: 'Awesome List',
          githubRepo: 'test/repo',
          totalItems: 1,
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.getItems({ githubRepo: 'test/repo', tokens: 10000 });
      
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(response.items.length).toBe(1);
      expect(response.items[0].name).toBe('Test Item');
      expect(response.metadata.list.githubRepo).toBe('test/repo');
    });

    it('should throw INVALID_PARAMS if neither listId nor githubRepo is provided', async () => {
      await expect(client.getItems({ tokens: 10000 })).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Edge Case 3: Normalize snake_case properties and `data`/`meta` objects
    it('should normalize snake_case properties and fallback to `data`/`meta` objects', async () => {
      const mockResponse = {
        data: [
          {
            _id: '456',
            title: 'Snake Case Item',
            link: 'https://snake.case',
            github_stars: 500,
            github_repo: 'snake/case',
            updated_at: '2023-01-01'
          },
        ],
        meta: {
          list_id: 'list2',
          list_name: 'Snake Case List',
          github_repo: 'list/repo',
          total_items: 10,
          has_more: true,
          offset: 5
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.getItems({ listId: 'list2', tokens: 10000 });
      
      expect(response.items.length).toBe(1);
      const item = response.items[0];
      expect(item.id).toBe('456');
      expect(item.name).toBe('Snake Case Item');
      expect(item.url).toBe('https://snake.case');
      expect(item.githubStars).toBe(500);
      expect(item.githubRepo).toBe('snake/case');
      expect(item.lastUpdated).toBe('2023-01-01');

      const meta = response.metadata;
      expect(meta.list.id).toBe('list2');
      expect(meta.list.name).toBe('Snake Case List');
      expect(meta.list.githubRepo).toBe('list/repo');
      expect(meta.totalItems).toBe(10);
      expect(meta.hasMore).toBe(true);
      expect(meta.offset).toBe(5);
    });

    // Edge Case 4: Truncate items when the token limit is exceeded
    it('should truncate items array if token limit is exceeded', async () => {
      // Create a large item that will consume many tokens
      const largeItem = {
        id: '1',
        name: 'A very very long name to consume tokens',
        description: 'A very long description '.repeat(100), // This will be several hundred chars
        url: 'https://example.com'
      };

      const mockResponse = {
        items: [largeItem, largeItem, largeItem], // 3 large items
        metadata: {
          listId: 'list1',
          totalItems: 3,
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // The estimateTokens logic is Math.ceil(JSON.stringify(items).length / 4)
      // One large item is roughly ~2500 chars / 4 = ~625 tokens.
      // 3 items = ~1875 tokens.
      // Let's set a strict token limit of 1000, which should only fit 1 item.
      const response = await client.getItems({ listId: 'list1', tokens: 1000 });
      
      // Should have been truncated to 1 item
      expect(response.items.length).toBeLessThan(3);
      expect(response.tokenUsage.truncated).toBe(true);
      expect(response.tokenUsage.limit).toBe(1000);
      expect(response.tokenUsage.used).toBeLessThanOrEqual(1000);
    });

    // Edge Case 4.5: Exhaustive missing optional fields for getItems
    it('should handle items and metadata with missing optional fields gracefully', async () => {
      const mockResponse = {
        items: [
          {
            // Missing id, _id, description, stars, githubStars, github_stars, repo, githubRepo, github_repo, tags, lastUpdated, updated_at, last_updated
            name: 'Minimal Item',
            url: 'https://minimal.com'
          },
        ],
        metadata: {
          // Missing listId, list_id, listName, list_name, githubRepo, github_repo, description, totalItems, total_items, section, subcategory, offset, hasMore, has_more
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await client.getItems({ listId: 'minimal-list' });
      
      expect(response.items.length).toBe(1);
      const item = response.items[0];
      expect(item.id).toBe('');
      expect(item.description).toBe('');
      expect(item.githubStars).toBeUndefined();
      expect(item.githubRepo).toBeUndefined();
      expect(item.tags).toEqual([]);
      expect(item.lastUpdated).toBeUndefined();

      const meta = response.metadata;
      expect(meta.list.id).toBe('minimal-list');
      expect(meta.list.name).toBe('');
      expect(meta.list.githubRepo).toBe('');
      expect(meta.list.description).toBe('');
      expect(meta.list.totalItems).toBe(1);
      expect(meta.section).toBeUndefined();
      expect(meta.subcategory).toBeUndefined();
      expect(meta.totalItems).toBe(1);
      expect(meta.offset).toBe(0);
      expect(meta.hasMore).toBe(false);
    });
  });

  describe('HTTP & Network Edge Cases', () => {
    it('should log when debug is true', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const debugClient = new AwesomeContextAPIClient('https://test-api.com', undefined, true);
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

      await debugClient.findSections({ query: 'test' });
      expect(consoleSpy).toHaveBeenCalledWith('[API Client]', expect.stringContaining('Request:'));
      consoleSpy.mockRestore();
    });

    // Edge Case 5: API Key included in Authorization header
    it('should include the API Key in the Authorization header if provided', async () => {
      const clientWithKey = new AwesomeContextAPIClient('https://test-api.com', 'my-secret-key', false);
      
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sections: [] }),
      });

      await clientWithKey.findSections({ query: 'test' });
      
      const fetchOptions = fetchMock.mock.calls[0][1];
      expect(fetchOptions.headers).toHaveProperty('Authorization', 'Bearer my-secret-key');
    });

    // Edge Case 6: Rate limit (429) mapping
    it('should map HTTP 429 to RATE_LIMIT APIError', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({}),
      });

      await expect(client.findSections({ query: 'test' })).rejects.toMatchObject({
        code: 'RATE_LIMIT',
        statusCode: 429,
      });
    });

    // Edge Case 7: Unauthorized (401) mapping
    it('should map HTTP 401 to UNAUTHORIZED APIError', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
      });

      await expect(client.findSections({ query: 'test' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
    });

    // Edge Case 8: Generic network failure mapping
    it('should map generic fetch errors to NETWORK_ERROR', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(client.findSections({ query: 'test' })).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    // Edge Case 9: AbortError (Timeout) mapping
    it('should map AbortError to TIMEOUT error', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      fetchMock.mockRejectedValueOnce(abortError);

      await expect(client.findSections({ query: 'test' })).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    // Edge Case 10: Null/undefined query parameter omission
    it('should not append null or undefined values to query parameters', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      // Call getItems with explicit undefined/null values (simulating what might be passed)
      await client.getItems({
        listId: '123',
        section: undefined, // Should be omitted
        // subcategory is not provided (undefined)
      });
      
      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.searchParams.has('listId')).toBe(true);
      expect(url.searchParams.has('section')).toBe(false);
      expect(url.searchParams.has('subcategory')).toBe(false);
    });
  });
});
