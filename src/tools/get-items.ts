import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "../api-client.js";
import { APIError } from "../types.js";
import { DEFAULT_MINIMUM_TOKENS } from "../config.js";
import { formatItemResults } from "./formatters.js";

export function registerGetAwesomeItemsTool(
  server: McpServer,
  apiClient: AwesomeContextAPIClient
) {
  server.registerTool(
    "get_awesome_items",
    {
      title: "Get Awesome List Items",
      description:
        "Retrieves items from a specific awesome list or section with token limiting. You must call 'find_awesome_section' first to discover available sections, UNLESS the user explicitly provides a githubRepo or listId.",
      inputSchema: {
        listId: z
          .string()
          .optional()
          .describe("UUID of the list (from find_awesome_section results)"),
        githubRepo: z
          .string()
          .optional()
          .describe("GitHub repo path (e.g., 'sindresorhus/awesome') from find_awesome_section results"),
        section: z
          .string()
          .optional()
          .describe("Category/section name to filter"),
        subcategory: z
          .string()
          .optional()
          .describe("Subcategory to filter"),
        tokens: z
          .preprocess((val) => (typeof val === "string" ? Number(val) : val), z.number())
          .transform((val) => (val < DEFAULT_MINIMUM_TOKENS ? DEFAULT_MINIMUM_TOKENS : val))
          .optional()
          .describe(
            `Maximum number of tokens to return (default: ${DEFAULT_MINIMUM_TOKENS}). Higher values provide more items but consume more tokens.`
          ),
        offset: z
          .number()
          .min(0)
          .optional()
          .default(0)
          .describe("Pagination offset for retrieving more items"),
      },
    },
    async ({ listId, githubRepo, section, subcategory, tokens = DEFAULT_MINIMUM_TOKENS, offset = 0 }) => {
      if (!listId && !githubRepo) {
        return {
          content: [
            {
              type: "text",
              text: "Either listId or githubRepo must be provided. Use 'find_awesome_section' first to discover available lists and sections.",
            },
          ],
        };
      }

      try {
        const response = await apiClient.getItems({
          listId,
          githubRepo,
          section,
          subcategory,
          tokens,
          offset,
        });
        
        if (!response.items || response.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No items found for the specified criteria. Try adjusting your filters or use find_awesome_section to discover available sections.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatItemResults(response),
            },
          ],
        };
      } catch (error: unknown) {
        const apiError = error as APIError;
        return {
          content: [
            {
              type: "text",
              text: apiError.message || "Failed to retrieve items. Please check your parameters and try again.",
            },
          ],
        };
      }
    }
  );
}
