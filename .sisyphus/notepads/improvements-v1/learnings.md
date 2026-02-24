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

## Task 7: findSectionsAndItems batching convenience method (2026-02-24)

- Pattern: call findSections first, slice top N, then Promise.all getItems in parallel
- Map key format: '${listId}:${category}[:${subcategory}]' — uniquely identifies a section result
- Both listId AND githubRepo are passed to getItems — the client validates that at least one is provided
- Return type uses Map<string, GetItemsResponse> — callers can iterate sections.sections and lookup results
- This is an internal helper only — not registered as MCP tool

## Task 10: Prometheus /metrics endpoint (2026-02-24)

- Module-level Map<string, number> works well as a simple Prometheus counter store — no external dependency needed
- Prometheus text exposition format requires Content-Type: `text/plain; version=0.0.4; charset=utf-8`
- Each metric line uses format: `metric_name{label1="val1",label2="val2"} numeric_value`
- `# HELP` and `# TYPE` lines must precede the metric data lines
- incrementMetric builds a composite key from name + serialized labels — simple and effective for hand-rolled counters
- /metrics was already in the rate-limit exemptPaths array from the prior rate-limiting task — no extra work needed
- The edit tool struggles with literal backslash-n in string arguments — using Write tool for files containing newline-in-strings is more reliable

## Task 8: list_awesome_lists MCP tool (2026-02-24)

- Backend API does NOT support a list-browsing endpoint — `/api/lists` timed out, `/api/awesome-lists` and `/api/list-awesome-lists` returned 404
- Graceful fallback pattern: catch 404 in `listAwesomeLists()` method and return empty `{ lists: [], total: 0, offset: 0, hasMore: false }` — tool then shows a helpful message suggesting `find_awesome_section`
- Tool still calls the backend on every invocation (with LRU cache) — if the endpoint is added later, it will automatically work without code changes
- New types added to `types.ts`: `ListAwesomeListsParams`, `AwesomeListSummary`, `ListAwesomeListsResponse`
- Registration pattern: import `registerListAwesomeListsTool` in `mcp-server.ts` and call it with `(server, apiClient)`
- The formatter function (`formatListResults`) is kept local to the tool file — no shared formatter needed since the output format is unique to this tool

## Task 9: random_awesome_item MCP tool (2026-02-24)

- Backend API has no /api/random or /api/trending endpoint (both return 404)
- Fallback approach: reuse findSections + getItems to simulate random discovery
- 18 broad topics hardcoded as fallback pool: developer tools, ML, web dev, python, JS, devops, security, databases, etc.
- Low confidence threshold (0.2) + high limit (20) gives diverse section pool for random picking
- Math.floor(Math.random() * arr.length) for random selection — simple and sufficient
- Inline import types in return signatures (import("./types.js").Section) cause tsc errors — must import types at top of file instead
- Tool pattern: register function takes (McpServer, AwesomeContextAPIClient), uses server.registerTool() with zod schema
- Optional zod params: z.string().optional().describe(...) — no .default() needed for optional string
