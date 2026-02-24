import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "./api-client.js";
import { APIError } from "./types.js";
import { DEFAULT_MINIMUM_TOKENS } from "./config.js";

// Function to create a new server instance with all tools registered
export function createServerInstance(
  apiHost: string,
  debug: boolean,
  _clientIp?: string,
  apiKey?: string
) {
  const apiClient = new AwesomeContextAPIClient(apiHost, apiKey, debug);

  const server = new McpServer(
    {
      name: "context-awesome",
      version: "1.0.0",
    },
    {
      instructions:
        "Use this server to search and retrieve curated awesome lists of resources. Always use find_awesome_section first to discover relevant sections, then use get_awesome_items to retrieve specific items.",
    }
  );

  // Register find_awesome_section tool
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
          };
        }

        const formattedSections = response.sections
          .map((section) => {
            const githubUrl = `https://github.com/${section.githubRepo}`;
            const sectionPath = section.category.toLowerCase().replace(/\s+/g, "-");
            const sectionUrl = `${githubUrl}#${sectionPath}`;
            
            return `### ${section.listName} - ${section.category}${
              section.subcategory ? ` > ${section.subcategory}` : ""
            }

- **Repository**: `${section.githubRepo}`
- **GitHub URL**: ${githubUrl}
- **Section URL**: ${sectionUrl}
- **Items**: ${section.itemCount}
- **Confidence**: ${(section.confidence * 100).toFixed(1)}%
- **Description**: ${
              section.description ||
              `A curated collection of ${section.itemCount} ${section.category.toLowerCase()} resources from ${section.listName}`
            }`;
          })
          .join("

");

        return {
          content: [
            {
              type: "text",
              text: `# Search Results for "${query}"

Found ${response.sections.length} relevant sections across awesome lists.

${formattedSections}

---

## How to retrieve items

To get detailed items from any section above, use the `get_awesome_items` tool with:
- **githubRepo**: The repository path (e.g., `"${response.sections[0]?.githubRepo || "repo/name"}"`)
- **section** (optional): The category name to filter results (e.g., `"${response.sections[0]?.category || "Section Name"}"`)
- **tokens** (optional): Maximum tokens to return (default: 10000)
- **offset** (optional): For pagination (default: 0)

Higher confidence scores indicate better matches for your search query.`,
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
        };
      }
    }
  );

  // Register get_awesome_items tool
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

        const { metadata, items, tokenUsage } = response;
        
        const header =
          `# ${metadata.list.name}` +
          (metadata.section ? ` - ${metadata.section}` : "") +
          (metadata.subcategory ? ` > ${metadata.subcategory}` : "") +
          "

";

        const listDescription = metadata.list.description
          ? `> ${metadata.list.description}

`
          : "";

        const formattedItems = items
          .map((item, index) => {
            let itemText = `## ${index + 1}. ${item.name}

`;
            
            if (item.description) {
              itemText += `${item.description}

`;
            }
            
            itemText += `**URL**: ${item.url}
`;
            
            if (item.githubRepo) {
              itemText += `**GitHub**: https://github.com/${item.githubRepo}
`;
            }
            
            if (item.githubStars) {
              itemText += `**Stars**: ${item.githubStars.toLocaleString()}
`;
            }
            
            if (item.tags && item.tags.length > 0) {
              itemText += `**Tags**: ${item.tags.join(", ")}
`;
            }
            
            return itemText;
          })
          .join("
---

");

        const footer =
          `
---

` +
          `## Metadata

` +
          `- **Token usage**: ${tokenUsage.used.toLocaleString()}/${tokenUsage.limit.toLocaleString()}` +
          (tokenUsage.truncated ? " (truncated)" : "") +
          "
" +
          `- **Items displayed**: ${items.length} of ${metadata.totalItems}
` +
          (metadata.hasMore
            ? `- **Next page**: Use `offset: ${metadata.offset + items.length}` to get more items
`
            : "");

        return {
          content: [
            {
              type: "text",
              text: header + listDescription + formattedItems + footer,
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

  return server;
}
