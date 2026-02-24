import fetch from 'node-fetch';
import { lru } from 'tiny-lru';
import {
  FindSectionParams,
  FindSectionResponse,
  GetItemsParams,
  GetItemsResponse,
  ListAwesomeListsParams,
  ListAwesomeListsResponse,
  Section,
  AwesomeItem,
  APIError,
} from './types.js';
import {
  RawSection,
  RawMetadata,
  APIFindSectionResponse,
  APIGetItemsResponse,
} from './api-types.js';
import { mapSection, mapItem, mapListMetadata } from './api/mappers.js';
import { estimateTokens, truncateToTokenLimit } from './api/token-utils.js';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Module-level LRU cache singleton: 100 items, 5 min TTL
const responseCache = lru<unknown>(100, 300000);

function buildCacheKey(endpoint: string, params?: Record<string, unknown>): string {
  if (!params) return endpoint;
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return sorted ? `${endpoint}?${sorted}` : endpoint;
}

/** Clear the response cache. Exported for testing. */
export function clearResponseCache(): void {
  responseCache.clear();
}

export class AwesomeContextAPIClient {
  private baseUrl: string;
  private apiKey?: string;
  private debug: boolean;

  constructor(baseUrl: string, apiKey?: string, debug = false) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.debug = debug;
  }

  private log(...args: unknown[]) {
    if (this.debug) {
      console.error('[API Client]', ...args);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Source': 'context-awesome',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    this.log(`Request: ${url.toString()}`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await response.json() as Record<string, unknown>;

        if (!response.ok) {
          // Check if this is a retryable status and we have attempts left
          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES - 1) {
            let delayMs = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];

            // Respect Retry-After header on 429
            if (response.status === 429) {
              const retryAfter = response.headers.get('retry-after');
              if (retryAfter) {
                const parsed = Number(retryAfter);
                if (!isNaN(parsed) && parsed > 0) {
                  delayMs = parsed * 1000;
                }
              }
            }

            this.log(`Retryable error (HTTP ${response.status}), attempt ${attempt + 1}/${MAX_RETRIES}. Retrying in ${delayMs}ms...`);
            await sleep(delayMs);
            continue;
          }

          let errorMessage = String(data.message || `HTTP ${response.status}: ${response.statusText}`);
          let errorCode = String(data.error || 'API_ERROR');
          
          // Provide better error messages for specific status codes
          if (response.status === 429) {
            errorMessage = 'Rate limited due to too many requests. Please try again later.';
            errorCode = 'RATE_LIMIT';
          } else if (response.status === 401) {
            errorMessage = 'Unauthorized. Please check your API key.';
            errorCode = 'UNAUTHORIZED';
          } else if (response.status === 404) {
            errorMessage = 'The requested resource was not found.';
            errorCode = 'NOT_FOUND';
          }
          
          const error: APIError = {
            code: errorCode,
            message: errorMessage,
            statusCode: response.status,
          };
          throw error;
        }

        this.log(`Response:`, data);
        return data as T;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        
        if (error && typeof error === 'object') {
          const err = error as Record<string, unknown>;
          if (err.code && typeof err.code === 'string') {
            throw error;
          }
          
          // Handle timeout specifically - do NOT retry AbortError
          if (err.name === 'AbortError') {
            const apiError: APIError = {
              code: 'TIMEOUT',
              message: 'Request timeout after 30 seconds',
            };
            throw apiError;
          }
          
          const apiError: APIError = {
            code: 'NETWORK_ERROR',
            message: `Failed to connect to API: ${err.message || String(error)}`,
          };
          throw apiError;
        }
        
        const apiError: APIError = {
          code: 'NETWORK_ERROR',
          message: `Failed to connect to API: ${String(error)}`,
        };
        throw apiError;
      }
    }

    // TypeScript exhaustiveness: loop always returns or throws, but compiler needs this
    const exhaustedError: APIError = {
      code: 'NETWORK_ERROR',
      message: 'Request failed after maximum retry attempts',
    };
    throw exhaustedError;
  }

  async findSections(params: FindSectionParams): Promise<FindSectionResponse> {
    this.log('Finding sections with params:', params);

    const queryParams = {
      query: params.query,
      confidence: params.confidence,
      limit: params.limit,
    };
    const cacheKey = buildCacheKey('/api/find-section', queryParams);

    const cached = responseCache.get(cacheKey);
    if (cached !== undefined) {
      this.log('Cache hit for:', cacheKey);
      return cached as FindSectionResponse;
    }

    const response = await this.request<APIFindSectionResponse>('/api/find-section', queryParams);

    const sections = response.results || response.sections || [];

    const result: FindSectionResponse = {
      sections: sections.map((section: RawSection) => mapSection(section)),
      total: Number(response.total || sections.length),
    };

    responseCache.set(cacheKey, result);
    return result;
  }

  async getItems(params: GetItemsParams): Promise<GetItemsResponse> {
    this.log('Getting items with params:', params);

    if (!params.listId && !params.githubRepo) {
      const error: APIError = {
        code: 'INVALID_PARAMS',
        message: 'Either listId or githubRepo must be provided',
      };
      throw error;
    }

    const queryParams = {
      listId: params.listId,
      githubRepo: params.githubRepo,
      section: params.section,
      subcategory: params.subcategory,
      limit: params.tokens ? Math.floor(params.tokens / 50) : undefined,
      offset: params.offset,
    };
    const cacheKey = buildCacheKey('/api/get-items', queryParams);

    const cached = responseCache.get(cacheKey);
    if (cached !== undefined) {
      this.log('Cache hit for:', cacheKey);
      return cached as GetItemsResponse;
    }

    const response = await this.request<APIGetItemsResponse>('/api/get-items', queryParams);

    const items = response.items || response.data || [];
    const metadata: RawMetadata = response.metadata || response.meta || {};

    const tokenCount = estimateTokens(items);
    const tokenLimit = params.tokens || 10000;
    const truncated = tokenCount > tokenLimit;

    const truncatedItems = truncated
      ? truncateToTokenLimit(items, tokenLimit)
      : items;

    const result: GetItemsResponse = {
      items: truncatedItems.map(mapItem),
      metadata: {
        list: mapListMetadata(metadata, params, items.length),
        section: metadata.section ?? params.section,
        subcategory: metadata.subcategory ?? params.subcategory,
        totalItems: Number(metadata.totalItems || metadata.total_items || items.length),
        offset: Number(metadata.offset || params.offset || 0),
        hasMore: Boolean(metadata.hasMore || metadata.has_more || false),
      },
      tokenUsage: {
        used: estimateTokens(truncatedItems),
        limit: tokenLimit,
        truncated,
      },
    };

    responseCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get a random awesome item by searching a broad topic and picking randomly.
   * Fallback implementation since the backend has no /api/random endpoint.
   */
  async getRandomAwesomeItem(topic?: string): Promise<{ section: Section; item: AwesomeItem }> {
    const broadTopics = [
      'developer tools', 'machine learning', 'web development', 'python libraries',
      'javascript frameworks', 'devops', 'security', 'databases', 'cli tools',
      'rust', 'go', 'data science', 'mobile development', 'cloud computing',
      'open source', 'design resources', 'testing', 'api development',
    ];

    const searchQuery = topic || broadTopics[Math.floor(Math.random() * broadTopics.length)];

    // Find sections matching the broad query
    const sectionsResponse = await this.findSections({
      query: searchQuery,
      confidence: 0.2,
      limit: 20,
    });

    if (!sectionsResponse.sections || sectionsResponse.sections.length === 0) {
      const error: APIError = {
        code: 'NO_RESULTS',
        message: `No sections found for topic "${searchQuery}". Try a different topic.`,
      };
      throw error;
    }

    // Pick a random section
    const randomSection = sectionsResponse.sections[
      Math.floor(Math.random() * sectionsResponse.sections.length)
    ];

    // Get items from that section
    const itemsResponse = await this.getItems({
      listId: randomSection.listId,
      githubRepo: randomSection.githubRepo,
      section: randomSection.category,
      subcategory: randomSection.subcategory,
      tokens: 5000,
    });

    if (!itemsResponse.items || itemsResponse.items.length === 0) {
      const error: APIError = {
        code: 'NO_ITEMS',
        message: `No items found in section "${randomSection.category}" from ${randomSection.listName}.`,
      };
      throw error;
    }

    // Pick a random item
    const randomItem = itemsResponse.items[
      Math.floor(Math.random() * itemsResponse.items.length)
    ];

    return { section: randomSection, item: randomItem };
  }

  async listAwesomeLists(params: ListAwesomeListsParams): Promise<ListAwesomeListsResponse> {
    this.log('Listing awesome lists with params:', params);

    const queryParams = {
      limit: params.limit,
      offset: params.offset,
      category: params.category,
    };
    const cacheKey = buildCacheKey('/api/lists', queryParams);

    const cached = responseCache.get(cacheKey);
    if (cached !== undefined) {
      this.log('Cache hit for:', cacheKey);
      return cached as ListAwesomeListsResponse;
    }

    try {
      const response = await this.request<Record<string, unknown>>('/api/lists', queryParams);

      // If the backend supports the endpoint, map the response
      const lists = (response.lists || response.results || response.data || []) as Array<Record<string, unknown>>;
      const result: ListAwesomeListsResponse = {
        lists: lists.map((item) => ({
          id: String(item.id || item._id || ''),
          name: String(item.name || item.listName || item.list_name || ''),
          githubRepo: String(item.githubRepo || item.github_repo || ''),
          description: item.description ? String(item.description) : undefined,
          totalItems: Number(item.totalItems || item.total_items || item.itemCount || item.item_count || 0),
          category: item.category ? String(item.category) : undefined,
        })),
        total: Number(response.total || lists.length),
        offset: Number(response.offset || params.offset || 0),
        hasMore: Boolean(response.hasMore || response.has_more || false),
      };

      responseCache.set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      const apiError = error as APIError;

      // If 404, the backend doesn't support this endpoint yet
      if (apiError.statusCode === 404) {
        return {
          lists: [],
          total: 0,
          offset: 0,
          hasMore: false,
        };
      }

      throw error;
    }
  }

  async findSectionsAndItems(
    params: FindSectionParams,
    sectionLimit: number = 3
  ): Promise<{ sections: FindSectionResponse; itemsBySection: Map<string, GetItemsResponse> }> {
    this.log('findSectionsAndItems with params:', params, 'sectionLimit:', sectionLimit);

    const sections = await this.findSections(params);
    const topSections = sections.sections.slice(0, sectionLimit);

    const itemResults = await Promise.all(
      topSections.map(section =>
        this.getItems({
          listId: section.listId,
          githubRepo: section.githubRepo,
          section: section.category,
          subcategory: section.subcategory,
        })
      )
    );

    const itemsBySection = new Map<string, GetItemsResponse>();
    topSections.forEach((section, index) => {
      const key = `${section.listId}:${section.category}${section.subcategory ? ':' + section.subcategory : ''}`;
      itemsBySection.set(key, itemResults[index]);
    });

    return { sections, itemsBySection };
  }
}