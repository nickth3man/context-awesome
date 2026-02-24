import { Section, GetItemsResponse } from '../types.js';

export function formatSectionResults(query: string, sections: Section[]): string {
  const formattedSections = sections
    .map((section) => {
      const githubUrl = `https://github.com/${section.githubRepo}`;
      const sectionPath = section.category.toLowerCase().replace(/\s+/g, '-');
      const sectionUrl = `${githubUrl}#${sectionPath}`;

      return `### ${section.listName} - ${section.category}${
        section.subcategory ? ` > ${section.subcategory}` : ''
      }

- **Repository**: \`${section.githubRepo}\`
- **GitHub URL**: ${githubUrl}
- **Section URL**: ${sectionUrl}
- **Items**: ${section.itemCount}
- **Confidence**: ${(section.confidence * 100).toFixed(1)}%
- **Description**: ${
        section.description ||
        `A curated collection of ${section.itemCount} ${section.category.toLowerCase()} resources from ${section.listName}`
      }`;
    })
    .join('\n\n');

  return `# Search Results for "${query}"

Found ${sections.length} relevant sections across awesome lists.

${formattedSections}

---

## How to retrieve items

To get detailed items from any section above, use the \`get_awesome_items\` tool with:
- **githubRepo**: The repository path (e.g., \`"${sections[0]?.githubRepo || 'repo/name'}"\`)
- **section** (optional): The category name to filter results (e.g., \`"${sections[0]?.category || 'Section Name'}"\`)
- **tokens** (optional): Maximum tokens to return (default: 10000)
- **offset** (optional): For pagination (default: 0)

Higher confidence scores indicate better matches for your search query.`;
}

export function formatItemResults(response: GetItemsResponse): string {
  const { metadata, items, tokenUsage } = response;

  const header =
    `# ${metadata.list.name}` +
    (metadata.section ? ` - ${metadata.section}` : '') +
    (metadata.subcategory ? ` > ${metadata.subcategory}` : '') +
    '\n\n';

  const listDescription = metadata.list.description
    ? `> ${metadata.list.description}\n\n`
    : '';

  const formattedItems = items
    .map((item, index) => {
      let itemText = `## ${index + 1}. ${item.name}\n\n`;

      if (item.description) {
        itemText += `${item.description}\n\n`;
      }

      itemText += `**URL**: ${item.url}\n`;

      if (item.githubRepo) {
        itemText += `**GitHub**: https://github.com/${item.githubRepo}\n`;
      }

      if (item.githubStars) {
        itemText += `**Stars**: ${item.githubStars.toLocaleString()}\n`;
      }

      if (item.tags && item.tags.length > 0) {
        itemText += `**Tags**: ${item.tags.join(', ')}\n`;
      }

      return itemText;
    })
    .join('\n---\n\n');

  const footer =
    `\n---\n\n` +
    `## Metadata\n\n` +
    `- **Token usage**: ${tokenUsage.used.toLocaleString()}/${tokenUsage.limit.toLocaleString()}` +
    (tokenUsage.truncated ? ' (truncated)' : '') +
    '\n' +
    `- **Items displayed**: ${items.length} of ${metadata.totalItems}\n` +
    (metadata.hasMore
      ? `- **Next page**: Use \`offset: ${metadata.offset + items.length}\` to get more items\n`
      : '');

  return header + listDescription + formattedItems + footer;
}
