\n## Task 1: API Key Extraction - Lowercase Headers (Tue, Feb 24, 2026  4:59:10 PM)\n- Node.js HTTP module lowercases ALL incoming request headers automatically\n- Checking mixed-case header names (e.g., 'X-API-Key') against req.headers always fails\n- Only lowercase lookups work: 'x-awesome-context-api-key', 'authorization'\n- CORS Access-Control-Allow-Headers response headers can remain mixed-case (browser compatibility)\n- The primary header name is 'x-awesome-context-api-key'

## Task 3: js-tiktoken integration (2026-02-24)
- js-tiktoken@1.0.20 is a pure JS tiktoken implementation — no WASM or native bindings needed
- `getEncoding('cl100k_base')` works out of the box in Node ESM without any special config
- Encoder initialization is synchronous (no async needed)
- Token counts differ significantly from chars/4: `[{"name":"test"}]` = 7 tokens (tiktoken) vs 4 (chars/4)
- Lazy singleton pattern for encoder avoids repeated initialization cost
- The `truncateToTokenLimit` function benefits automatically since it calls `estimateTokens` internally
## Task 2: isError flag on tool failures (2026-02-24)

- CallToolResult from @modelcontextprotocol/sdk supports optional isError?: boolean field
- Both find-section.ts and get-items.ts had 2 error paths each; get-items.ts also had an input validation error path (missing listId/githubRepo)
- Total 5 error paths updated across 2 files
- Pattern: add isError: true at the same level as the 'content' array in the return object
- tsc compilation validates the type is accepted (isError is part of the SDK type)
- Edit tool hashes can mismatch if multiple edits touch the same file snapshot — batch all edits for one file in a single call to avoid re-reads

## Task 4: Retry logic with exponential backoff (2026-02-24)

- Retry logic wraps the fetch call in a `for` loop (0 to MAX_RETRIES), not a recursive function — simpler control flow
- Only retry on specific status codes via a Set: 429, 500, 502, 503, 504. Non-retryable errors (400, 401, 403, 404) throw immediately
- AbortError (timeout) must NOT be retried — it's caught in the catch block and thrown immediately before any retry logic
- `Retry-After` header value is in seconds; must multiply by 1000 for ms delay
- node-fetch response headers use `.get()` method (lowercase key lookup works: `response.headers.get('retry-after')`)
- Jest fake timers (`jest.useFakeTimers()` + `advanceTimersByTimeAsync`) have complex interactions with async/await chains — `runAllTimersAsync()` also unreliable. Real timers with extended test timeout (10s) is more reliable for retry tests
- When adding retry logic, existing tests that mock single responses for retryable status codes (e.g., 429) break — they need to mock N responses (one per attempt) and add `headers: { get: () => null }` to the mock
- The exhaustive `throw` after the for-loop is needed for TypeScript — even though logically unreachable (loop always returns on success or throws), the compiler can't prove it


## Task 5: In-memory LRU response caching (2026-02-24)

- `tiny-lru@11.4.7` uses named exports: `import { lru } from 'tiny-lru'` — NOT a default export
- Cache MUST be at module scope (outside class) to persist across requests — inside constructor would reset per instantiation
- Module-level singletons persist across test cases in Jest — must export a `clearResponseCache()` function and call it in `beforeEach`
- Cache key built from endpoint + sorted query params (excluding API key, which is in headers not params)
- `lru<unknown>(100, 300000)` — 100 items max, 5 min TTL. Generic type param works fine
- Cached response is the fully-mapped result object, not the raw API response — avoids re-mapping on cache hit
- Second call clocks at ~0.03ms vs ~3600ms for first network call — 100,000x speedup
