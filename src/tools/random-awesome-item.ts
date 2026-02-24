import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AwesomeContextAPIClient } from "../api-client.js";
import { APIError } from "../types.js";

export function registerRandomAwesomeItemTool(
  server: McpServer,
  apiClient: AwesomeContextAPIClient
) {
  server.registerTool(
    "random_awesome_item",
    {
      title: "Random Awesome Item",
      description: `Discovers a random item from awesome lists, great for exploring new tools, libraries, and resources.

Optionally provide a topic to narrow the discovery to a specific domain (e.g., "machine learning", "rust", "devops").
If no topic is provided, a random broad topic is selected automatically.

Use this tool when the user wants to:
- Discover something new or interesting
- Get a random recommendation
- Explore awesome lists serendipitously
- Find trending or noteworthy tools in a domain`,
      inputSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "Optional topic to narrow the random selection (e.g., 'web development', 'python', 'databases')"
          ),
      },
    },
    async ({ topic }) => {
      try {
        const { section, item } = await apiClient.getRandomAwesomeItem(topic);

        const githubUrl = `https://github.com/${section.githubRepo}`;

        let text = `# 🎲 Random Awesome Discovery\n\n`;
        text += `## ${item.name}\n\n`;

        if (item.description) {
          text += `${item.description}\n\n`;
        }

        text += `**URL**: ${item.url}\n`;

        if (item.githubRepo) {
          text += `**GitHub**: https://github.com/${item.githubRepo}\n`;
        }

        if (item.githubStars) {
          text += `**Stars**: ${item.githubStars.toLocaleString()}\n`;
        }

        if (item.tags && item.tags.length > 0) {
          text += `**Tags**: ${item.tags.join(", ")}\n`;
        }

        text += `\n---\n\n`;
        text += `**Found in**: ${section.listName} - ${section.category}`;
        if (section.subcategory) {
          text += ` > ${section.subcategory}`;
        }
        text += `\n`;
        text += `**Repository**: \`${section.githubRepo}\`\n`;
        text += `**GitHub URL**: ${githubUrl}\n`;
        text += `\n---\n\n`;
        text += `💡 *Want more from this list? Use \`get_awesome_items\` with githubRepo \`"${section.githubRepo}"\` and section \`"${section.category}"\`.*`;

        return {
          content: [
            {
              type: "text",
              text,
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
                "Failed to discover a random awesome item. Please try again.",
            },
          ],
          isError: true,
        };
      }
    }
  );
}
