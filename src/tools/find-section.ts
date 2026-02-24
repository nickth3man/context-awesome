import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "../api-client.js";
import { APIError } from "../types.js";
import { formatSectionResults } from "./formatters.js";

export function registerFindAwesomeSectionTool(
  server: McpServer,
  apiClient: AwesomeContextAPIClient
) {
  server.registerTool(
    "find_awesome_section",
    {
      title: "Find Awesome List Section",
      description: `Discovers sections/categories across awesome lists matching a search query and returns matching sections from awesome lists.

You MUST call this function before 'get_awesome_items' to discover available sections UNLESS the user explicitly provides a githubRepo or listId.

Selection Process:
1. Analyze the query to understand what type of resources the user is looking for
2. Return the most relevant matches based on:
   - Name similarity to the query and the awesome lists section
   - Category/section relevance of the awesome lists 
   - Number of items in the section
   - Confidence score

Response Format:
- Returns matching sections of the awesome lists with metadata
- Includes repository information, item counts, and confidence score
- Use the githubRepo or listId with relevant sections from results for get_awesome_items

For ambiguous queries, multiple relevant sections will be returned for the user to choose from.`,
      inputSchema: {
        query: z
          .string()
          .describe("Search terms for finding sections across awesome lists"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.3)
          .describe("Minimum confidence score (0-1)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Maximum sections to return"),
      },
    },
    async ({ query, confidence = 0.3, limit = 10 }) => {
      try {
        const response = await apiClient.findSections({ query, confidence, limit });
        
        if (!response.sections || response.sections.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No sections found matching "${query}". Try different search terms or browse available lists.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatSectionResults(query, response.sections),
            },
          ],
        };
      } catch (error: unknown) {
        const apiError = error as APIError;
        return {
          content: [
            {
              type: "text",
              text: apiError.message || "Failed to search for sections. Please try again.",
            },
          ],
          isError: true,
        };
      }
    }
  );
}
