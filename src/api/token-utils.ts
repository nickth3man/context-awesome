import { RawItem } from '../api-types.js';

export function estimateTokens(items: RawItem[]): number {
  const text = JSON.stringify(items);
  return Math.ceil(text.length / 4);
}

export function truncateToTokenLimit(items: RawItem[], limit: number): RawItem[] {
  const result: RawItem[] = [];
  let currentTokens = 0;

  for (const item of items) {
    const itemTokens = estimateTokens([item]);
    if (currentTokens + itemTokens > limit) {
      break;
    }
    result.push(item);
    currentTokens += itemTokens;
  }

  return result;
}
