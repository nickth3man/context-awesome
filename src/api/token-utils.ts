import { getEncoding } from 'js-tiktoken';
import { RawItem } from '../api-types.js';

let encoder: ReturnType<typeof getEncoding> | null = null;

function getEncoder(): ReturnType<typeof getEncoding> | null {
  if (encoder) return encoder;
  try {
    encoder = getEncoding('cl100k_base');
    return encoder;
  } catch {
    return null;
  }
}

export function estimateTokens(items: RawItem[]): number {
  const text = JSON.stringify(items);
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }
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
