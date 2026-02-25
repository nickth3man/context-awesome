export interface RawSection {
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

export interface RawItem {
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

export interface RawMetadata {
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

export interface APIFindSectionResponse {
  results?: RawSection[];
  sections?: RawSection[];
  total?: number;
}

export interface APIGetItemsResponse {
  items?: RawItem[];
  data?: RawItem[];
  metadata?: RawMetadata;
  meta?: RawMetadata;
}

export interface RawList {
  id?: string | number;
  _id?: string | number;
  name?: string;
  githubRepo?: string;
  github_repo?: string;
  description?: string;
  itemCount?: number;
  item_count?: number;
}

export interface APIListListsResponse {
  lists?: RawList[];
  data?: RawList[];
  total?: number;
}
