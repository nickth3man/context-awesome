import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "../api-client.js";
import { APIError } from "../types.js";

function formatListResults(
  lists: Array<{
    id: string;
    name: string;
    githubRepo: string;
    description?: string;
    totalItems: number;
    category?: string;
  }>,
  total: number,
  offset: number,
  hasMore: boolean
): string {
  const lines: string[] = [];

  lines.push(`Found ${total} awesome list(s).`);
  if (offset > 0) {
    lines.push(`Showing from offset ${offset}.`);
  }
  lines.push("");

  for (const list of lists) {
    lines.push(`## ${list.name}`);
    lines.push(`- **Repository**: ${list.githubRepo}`);
    if (list.description) {
      lines.push(`- **Description**: ${list.description}`);
    }
    lines.push(`- **Items**: ${list.totalItems}`);
    if (list.category) {
      lines.push(`- **Category**: ${list.category}`);
    }
    lines.push(`- **List ID**: ${list.id}`);
    lines.push("");
  }

  if (hasMore) {
    lines.push(
      `_More lists available. Use offset=${offset + lists.length} to see the next page._`
    );
  }

  return lines.join("\n");
}

export function registerListAwesomeListsTool(
  server: McpServer,
  apiClient: AwesomeContextAPIClient
) {
  server.registerTool(
    "list_awesome_lists",
    {
      title: "List Awesome Lists",
      description: `Browse available awesome lists without requiring a search query.

Use this tool to discover what awesome lists are available. Returns a paginated list of awesome lists with their names, repositories, descriptions, and item counts.

Note: This feature depends on backend API support. If the backend does not yet support listing, a helpful message will be returned suggesting to use find_awesome_section instead.`,
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Maximum number of lists to return (1-50)"),
        offset: z
          .number()
          .min(0)
          .optional()
          .default(0)
          .describe("Pagination offset"),
        category: z
          .string()
          .optional()
          .describe(
            "Filter lists by category (e.g. 'programming', 'data-science')"
          ),
      },
    },
    async ({ limit = 10, offset = 0, category }) => {
      try {
        const response = await apiClient.listAwesomeLists({
          limit,
          offset,
          category,
        });

        // Backend doesn't support the endpoint yet — return graceful fallback
        if (response.lists.length === 0 && response.total === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Browsing awesome lists is not yet supported by the backend API. To discover lists, use the **find_awesome_section** tool with a search query instead.\n\nExample queries:\n- "machine learning" — find ML-related awesome lists\n- "react" — find React ecosystem lists\n- "devops" — find DevOps tool lists\n- "python" — find Python library lists`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatListResults(
                response.lists,
                response.total,
                response.offset,
                response.hasMore
              ),
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
                "Failed to list awesome lists. Please try again.",
            },
          ],
          isError: true,
        };
      }
    }
  );
}
