import fetch from 'node-fetch';
import {
  FindSectionParams,
  FindSectionResponse,
  GetItemsParams,
  GetItemsResponse,
  APIError,
} from './types.js';

interface RawSection {
  id?: string | number;
  _id?: string | number;
  listId?: string;
  listName?: string;
  list_name?: string;
  githubRepo?: string;
  github_repo?: string;
  category?: string;
  section?: string;
  subcategory?: string;
  sub_category?: string;
  itemCount?: number;
  item_count?: number;
  confidence?: number;
  score?: number;
  description?: string;
}

interface RawItem {
  id?: string | number;
  _id?: string | number;
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  link?: string;
  stars?: number;
  githubStars?: number;
  github_stars?: number;
  repo?: string;
  githubRepo?: string;
  github_repo?: string;
  tags?: string[];
  lastUpdated?: string;
  updated_at?: string;
  last_updated?: string;
}

interface RawMetadata {
  listId?: string;
  list_id?: string;
  listName?: string;
  list_name?: string;
  githubRepo?: string;
  github_repo?: string;
  description?: string;
  totalItems?: number;
  total_items?: number;
  section?: string;
  subcategory?: string;
  offset?: number;
  hasMore?: boolean;
  has_more?: boolean;
}

interface APIFindSectionResponse {
  results?: RawSection[];
  sections?: RawSection[];
  total?: number;
}

interface APIGetItemsResponse {
  items?: RawItem[];
  data?: RawItem[];
  metadata?: RawMetadata;
  meta?: RawMetadata;
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Source': 'context-awesome',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    this.log(`Request: ${url.toString()}`);

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
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
        
        // Handle timeout specifically
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

  async findSections(params: FindSectionParams): Promise<FindSectionResponse> {
    this.log('Finding sections with params:', params);
    
    const response = await this.request<APIFindSectionResponse>('/api/find-section', {
      query: params.query,
      confidence: params.confidence,
      limit: params.limit,
    });

    const sections = response.results || response.sections || [];
    
    return {
      sections: sections.map((section: RawSection) => ({
        id: String(section.id || section._id || ''),
        listId: String(section.listId || ''),
        listName: String(section.listName || section.list_name || ''),
        githubRepo: String(section.githubRepo || section.github_repo || ''),
        category: String(section.category || section.section || ''),
        subcategory: String(section.subcategory || section.sub_category || ''),
        itemCount: Number(section.itemCount || section.item_count || 0),
        confidence: Number(section.confidence || section.score || 0),
        description: String(section.description || ''),
      })),
      total: Number(response.total || sections.length),
    };
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

    const response = await this.request<APIGetItemsResponse>('/api/get-items', {
      listId: params.listId,
      githubRepo: params.githubRepo,
      section: params.section,
      subcategory: params.subcategory,
      limit: params.tokens ? Math.floor(params.tokens / 50) : undefined,
      offset: params.offset,
    });

    const items = response.items || response.data || [];
    const metadata = response.metadata || response.meta || {};
    
    const tokenCount = this.estimateTokens(items);
    const tokenLimit = params.tokens || 10000;
    const truncated = tokenCount > tokenLimit;
    
    const truncatedItems = truncated 
      ? this.truncateToTokenLimit(items, tokenLimit)
      : items;

    return {
      items: truncatedItems.map((item: RawItem) => ({
        id: String(item.id || item._id || ''),
        name: String(item.name || item.title || ''),
        description: String(item.description || ''),
        url: String(item.url || item.link || ''),
        githubStars: item.stars ?? item.githubStars ?? item.github_stars,
        githubRepo: item.repo ?? item.githubRepo ?? item.github_repo,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        lastUpdated: item.lastUpdated ?? item.updated_at ?? item.last_updated,
      })),
      metadata: {
        list: {
          id: String(metadata.listId || metadata.list_id || params.listId || ''),
          name: String(metadata.listName || metadata.list_name || ''),
          githubRepo: String(metadata.githubRepo || metadata.github_repo || params.githubRepo || ''),
          description: String(metadata.description || ''),
          totalItems: Number(metadata.totalItems || metadata.total_items || items.length),
        },
        section: metadata.section ?? params.section,
        subcategory: metadata.subcategory ?? params.subcategory,
        totalItems: Number(metadata.totalItems || metadata.total_items || items.length),
        offset: Number(metadata.offset || params.offset || 0),
        hasMore: Boolean(metadata.hasMore || metadata.has_more || false),
      },
      tokenUsage: {
        used: this.estimateTokens(truncatedItems),
        limit: tokenLimit,
        truncated,
      },
    };
  }

  private estimateTokens(items: RawItem[]): number {
    const text = JSON.stringify(items);
    return Math.ceil(text.length / 4);
  }

  private truncateToTokenLimit(items: RawItem[], limit: number): RawItem[] {
    const result: RawItem[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemTokens = this.estimateTokens([item]);
      if (currentTokens + itemTokens > limit) {
        break;
      }
      result.push(item);
      currentTokens += itemTokens;
    }

    return result;
  }
}