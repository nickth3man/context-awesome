import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "../api-client.js";
import { APIError } from "../types.js";
import { DEFAULT_MINIMUM_TOKENS } from "../config.js";
import { formatFindAndGetResults } from "./formatters.js";

export function registerFindAndGetTool(
  server: McpServer,
  apiClient: AwesomeContextAPIClient
) {
  server.registerTool(
    "find_and_get_awesome_items",
    {
      title: "Find and Get Awesome Items",
      description: `Discovers relevant awesome list sections AND immediately retrieves their items in a single call.

Use this when you want curated resources for a topic without a separate find + get workflow.

Fetches from the top matching sections in parallel. Each section's items are returned together with the section metadata.`,
      inputSchema: {
        query: z
          .string()
          .describe("Topic or keywords to search for across awesome lists"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.3)
          .describe("Minimum confidence score for section matching (0-1, default: 0.3)"),
        sectionLimit: z
          .number()
          .min(1)
          .max(5)
          .optional()
          .default(3)
          .describe("Number of top sections to fetch items from (1-5, default: 3)"),
        tokens: z
          .number()
          .optional()
          .default(DEFAULT_MINIMUM_TOKENS)
          .describe(
            `Max tokens to return per section (default: ${DEFAULT_MINIMUM_TOKENS})`
          ),
      },
    },
    async ({
      query,
      confidence = 0.3,
      sectionLimit = 3,
      tokens = DEFAULT_MINIMUM_TOKENS,
    }) => {
      try {
        const response = await apiClient.findSectionsAndItems(
          { query, confidence, limit: sectionLimit },
          { sectionLimit, tokens }
        );

        if (!response.sections || response.sections.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No sections found matching "${query}". Try different search terms or use \`find_awesome_section\` for broader exploration.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatFindAndGetResults(query, response),
            },
          ],
        };
      } catch (error: unknown) {
        const apiError = error as APIError;
        return {
          content: [
            {
              type: "text",
              text:
                apiError.message ||
                "Failed to find and retrieve items. Please try again.",
            },
          ],
          isError: true,
        };
      }
    }
  );
}
