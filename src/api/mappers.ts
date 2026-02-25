import { Section, AwesomeItem, GetItemsParams, ListMetadata } from '../types.js';
import { RawSection, RawItem, RawMetadata, RawList } from '../api-types.js';

export function mapSection(section: RawSection): Section {
  return {
    id: String(section.id || section._id || ''),
    listId: String(section.listId || ''),
    listName: String(section.listName || section.list_name || ''),
    githubRepo: String(section.githubRepo || section.github_repo || ''),
    category: String(section.category || section.section || ''),
    subcategory: String(section.subcategory || section.sub_category || ''),
    itemCount: Number(section.itemCount || section.item_count || 0),
    confidence: Number(section.confidence || section.score || 0),
    description: String(section.description || ''),
  };
}

export function mapItem(item: RawItem): AwesomeItem {
  return {
    id: String(item.id || item._id || ''),
    name: String(item.name || item.title || ''),
    description: String(item.description || ''),
    url: String(item.url || item.link || ''),
    githubStars: item.stars ?? item.githubStars ?? item.github_stars,
    githubRepo: item.repo ?? item.githubRepo ?? item.github_repo,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    lastUpdated: item.lastUpdated ?? item.updated_at ?? item.last_updated,
  };
}

export function mapListMetadata(
  metadata: RawMetadata,
  params: Pick<GetItemsParams, 'listId' | 'githubRepo'>,
  itemCount: number
) {
  return {
    id: String(metadata.listId || metadata.list_id || params.listId || ''),
    name: String(metadata.listName || metadata.list_name || ''),
    githubRepo: String(metadata.githubRepo || metadata.github_repo || params.githubRepo || ''),
    description: String(metadata.description || ''),
    totalItems: Number(metadata.totalItems || metadata.total_items || itemCount),
  };
}

export function mapList(list: RawList): ListMetadata {
  return {
    id: String(list.id || list._id || ''),
    name: String(list.name || ''),
    githubRepo: String(list.githubRepo || list.github_repo || ''),
    description: String(list.description || '') || undefined,
    totalItems: Number(list.itemCount || list.item_count || 0),
  };
}
