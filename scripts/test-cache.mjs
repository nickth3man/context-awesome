// QA script: Verify LRU response caching behavior
import { AwesomeContextAPIClient, clearResponseCache } from '../build/api-client.js';

const client = new AwesomeContextAPIClient('https://api.context-awesome.com', undefined, false);

clearResponseCache();

console.log('=== Cache QA Test ===\n');

// Test 1: findSections caching
console.log('Test 1: findSections - identical queries should return cached results');
const start1 = performance.now();
const result1 = await client.findSections({ query: 'react hooks' });
const elapsed1 = performance.now() - start1;
console.log(`  First call:  ${elapsed1.toFixed(1)}ms (network) - ${result1.sections.length} sections`);

const start2 = performance.now();
const result2 = await client.findSections({ query: 'react hooks' });
const elapsed2 = performance.now() - start2;
console.log(`  Second call: ${elapsed2.toFixed(1)}ms (cached) - ${result2.sections.length} sections`);
console.log(`  Cache hit: ${elapsed2 < 10 ? 'YES' : 'NO'} (${elapsed2.toFixed(3)}ms < 10ms)`);
console.log(`  Results identical: ${JSON.stringify(result1) === JSON.stringify(result2)}`);
console.log();

// Test 2: getItems caching
console.log('Test 2: getItems - identical queries should return cached results');
if (result1.sections.length > 0) {
  const section = result1.sections[0];
  const repo = section.githubRepo;
  
  const start3 = performance.now();
  const items1 = await client.getItems({ githubRepo: repo, tokens: 2000 });
  const elapsed3 = performance.now() - start3;
  console.log(`  First call:  ${elapsed3.toFixed(1)}ms (network) - ${items1.items.length} items`);

  const start4 = performance.now();
  const items2 = await client.getItems({ githubRepo: repo, tokens: 2000 });
  const elapsed4 = performance.now() - start4;
  console.log(`  Second call: ${elapsed4.toFixed(1)}ms (cached) - ${items2.items.length} items`);
  console.log(`  Cache hit: ${elapsed4 < 10 ? 'YES' : 'NO'} (${elapsed4.toFixed(3)}ms < 10ms)`);
  console.log(`  Results identical: ${JSON.stringify(items1) === JSON.stringify(items2)}`);
} else {
  console.log('  Skipped (no sections found)');
}
console.log();

// Test 3: Different params should NOT be cached
console.log('Test 3: Different params produce separate cache entries');
const start5 = performance.now();
const result3 = await client.findSections({ query: 'python machine learning' });
const elapsed5 = performance.now() - start5;
console.log(`  Different query: ${elapsed5.toFixed(1)}ms (should be network, >50ms): ${elapsed5 > 10 ? 'PASS' : 'MAYBE CACHED'}`);
console.log();

// Test 4: clearResponseCache works
console.log('Test 4: clearResponseCache forces re-fetch');
clearResponseCache();
const start6 = performance.now();
const result4 = await client.findSections({ query: 'react hooks' });
const elapsed6 = performance.now() - start6;
console.log(`  After clear: ${elapsed6.toFixed(1)}ms (should be network, >50ms): ${elapsed6 > 10 ? 'PASS' : 'FAST'}`);

console.log('\n=== All cache tests complete ===');
