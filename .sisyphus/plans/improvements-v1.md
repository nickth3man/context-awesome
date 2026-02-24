# Context-Awesome Improvements & Features Plan (v1)

## TL;DR

> **Quick Summary**: Implement 10 critical reliability, performance, and discovery improvements to the `context-awesome` MCP server, focusing on robust error handling, caching, rate limiting, and new data exploration tools.
> 
> **Deliverables**:
> - Fix API Key extraction middleware (lowercase HTTP headers fix)
> - Structured tool error responses (`isError: true` support)
> - More accurate token counting (`js-tiktoken` replacement)
> - Robust 429/5xx retry logic
> - In-memory LRU response caching (`tiny-lru`)
> - Sliding-window IP rate limiting (`rate-limiter-flexible`)
> - Internal request batching (`findSectionsAndItems`)
> - New `list_awesome_lists` tool
> - New `random_awesome_item` tool
> - Prometheus `/metrics` endpoint
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: API Key Fix → Retry Logic → Caching (singleton setup) → Rate Limiting

---

## Context

### Original Request
Implement 10 specific improvements/features to the project based on current state analysis and a provided list of enhancements (caching, batching, token estimation, retries, structured errors, key extraction, lists tool, random tool, metrics, rate limiting).

### Interview Summary
**Key Discussions**:
- Explored codebase: Strict TS ESM, `node-fetch`, multi-transport support (stdio, HTTP, SSE).
- Explored SDK: Confirmed `isError: true` support in `CallToolResult`.
- Researched Node ecosystem: Selected `tiny-lru@11.4.7` (cache), `rate-limiter-flexible@9.0.1` (rate limits), and `js-tiktoken@1.0.20` (token counts) for ESM compatibility and minimal footprint.

### Metis Review
**Identified Gaps** (addressed):
- **Cache Lifecycle (CRITICAL)**: Identified that `AwesomeContextAPIClient` is instantiated *per request*. A naive cache inside the client class would be useless. **Resolution**: Implement the cache as a module-level singleton or pass it into the client.
- **API Key Extraction Bug**: Node.js lowercases all incoming headers. The existing extraction logic attempts mixed-case lookups which always fail. **Resolution**: Fix to only use lowercase lookups.
- **Backend API Unknowns**: The new tools (`list_awesome_lists`, `random_awesome_item`) require backend API support which is external. **Resolution**: Tasks include verifying endpoint existence via mock or actual call before building full tool.
- **Rate Limiter Scope**: Rate limiter state must also live at the module level (outer closure of `createRequestHandler`), not per-request.

---

## Work Objectives

### Core Objective
Fortify the MCP server's HTTP layer with production-grade caching and rate limiting, improve error signaling to LLMs, and expand the discovery surface area with new tools.

### Concrete Deliverables
- `middleware.ts` updated with lowercase header checks
- `find-section.ts` and `get-items.ts` returning `{ isError: true }` on failure
- `token-utils.ts` using `js-tiktoken`
- `api-client.ts` implementing `tiny-lru` (singleton) and retry loops
- `request-handler.ts` applying `rate-limiter-flexible` and exposing `/metrics`
- Two new tools registered in `src/tools/`

### Definition of Done
- [ ] All 10 features implemented
- [ ] TypeScript compiles cleanly (`npm run build`)
- [ ] Agent-Executed QA confirms cache hits (faster subsequent requests)
- [ ] Agent-Executed QA confirms 429 behavior on rate limit

### Must Have
- Caching and rate limiting state MUST persist across HTTP requests (module-level singletons)
- Rate limiting MUST only apply to HTTP transport
- `js-tiktoken` MUST gracefully handle WASM load failure (fallback)

### Must NOT Have (Guardrails)
- Do NOT change the CORS header case in `middleware.ts`
- Do NOT add distributed caching (Redis, etc)
- Do NOT expose `findSectionsAndItems` as an MCP tool (internal batching only)
- Do NOT add tool-specific retry/cache logic (handle in the client)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (tests exist in `/tests` directory)
- **Automated tests**: Tests-after
- **Framework**: jest
- **QA Policy**: Every task MUST include agent-executed QA scenarios (Bash/curl).

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — Foundations & Fixes):
├── Task 1: Fix API Key Extraction [quick]
├── Task 2: Structured Tool Errors [quick]
└── Task 3: Tiktoken Estimation [unspecified-high]

Wave 2 (After Wave 1 — Resiliency & Performance):
├── Task 4: Retry Logic with Backoff [unspecified-high]
└── Task 5: In-Memory Response Caching (Singleton) [deep]

Wave 3 (After Wave 2 — HTTP Security & New Features):
├── Task 6: IP Rate Limiting [deep]
├── Task 7: Request Batching (`findSectionsAndItems`) [quick]
├── Task 8: `list_awesome_lists` Tool [unspecified-high]
├── Task 9: `random_awesome_item` Tool [unspecified-high]
└── Task 10: Prometheus Metrics Endpoint [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

### Dependency Matrix
- **1-3**: None
- **4**: 1-3
- **5**: 4
- **6-10**: 5
- **F1-F4**: 6-10

---

- [ ] 8. `list_awesome_lists` Tool

  **What to do**:
  - Create `src/tools/list-awesome-lists.ts`.
  - Register `list_awesome_lists` tool to browse available lists without a search query.
  - Define input schema (e.g. `limit`, `offset`, `category`).
  - Add corresponding method `listAwesomeLists` to `AwesomeContextAPIClient`.
  - **CRITICAL**: Before fully implementing, ping the backend API (e.g. `/api/lists` or `/api/awesome-lists`) to determine the correct endpoint path and payload. If the backend doesn't support this, implement the tool to return a predefined set of top popular lists, or a graceful error message indicating the endpoint is currently unavailable.
  - Add to `mcp-server.ts` registration.

  **Must NOT do**:
  - Do NOT break if backend fails; handle gracefully.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires discovering an undocumented backend endpoint or implementing a robust fallback.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/api-client.ts`
  - `src/tools/find-section.ts` - Example structure.
  
  **Acceptance Criteria**:
  - [ ] Tool is registered and available in the MCP server.

  **QA Scenarios**:
  ```
  Scenario: list_awesome_lists returns data or graceful fallback
    Tool: Bash (node)
    Preconditions: Code compiled.
    Steps:
      1. Write script invoking the new tool directly.
    Expected Result: Returns an array of lists or a clear string indicating the backend doesn't support the feature yet.
    Evidence: .sisyphus/evidence/task-8-list-tool.txt
  ```

  **Commit**: YES (Message: `feat(tools): add list_awesome_lists discovery tool`)

- [ ] 9. `random_awesome_item` Tool

  **What to do**:
  - Create `src/tools/random-awesome-item.ts`.
  - Register `random_awesome_item` tool to discover random/trending items.
  - Add corresponding method `getRandomAwesomeItem` to `AwesomeContextAPIClient`.
  - **CRITICAL**: Ping the backend API (e.g. `/api/random` or `/api/trending`) to determine the correct endpoint. If unsupported, implement a fallback that searches a broad query (e.g. "developer tools") and picks a random item from the results.
  - Add to `mcp-server.ts` registration.

  **Must NOT do**:
  - Do NOT crash on API failure.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Backend endpoint discovery and fallback logic.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/api-client.ts`
  - `src/tools/find-section.ts` - Example structure.
  
  **Acceptance Criteria**:
  - [ ] Tool is registered and available in the MCP server.

  **QA Scenarios**:
  ```
  Scenario: random_awesome_item returns a valid item
    Tool: Bash (node)
    Preconditions: Code compiled.
    Steps:
      1. Script invoking the tool.
    Expected Result: Returns details of a single awesome list item.
    Evidence: .sisyphus/evidence/task-9-random-tool.txt
  ```

  **Commit**: YES (Message: `feat(tools): add random_awesome_item discovery tool`)

- [ ] 10. Prometheus Metrics Endpoint

  **What to do**:
  - In `src/http/request-handler.ts`, add logic for the `/metrics` path.
  - Implement a basic hand-rolled Prometheus metrics text output (no need for the full `prom-client` library unless you prefer it; basic counters are fine).
  - Track: `mcp_requests_total{tool, status}` (e.g. increment inside route handlers).
  - Add to `src/http/routes.ts` as `handleMetricsRoute`.

  **Must NOT do**:
  - Do NOT apply rate limits to `/metrics`.
  - Do NOT add a dependency on `prom-client` unless explicitly needed (hand-rolling 2 metrics is fine).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Implementing specific text exposition format for metrics.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/http/routes.ts` - Where the new handler goes.
  - `src/http/request-handler.ts:49-50` - Where to route `/metrics`.
  
  **Acceptance Criteria**:
  - [ ] `/metrics` returns Prometheus text format.

  **QA Scenarios**:
  ```
  Scenario: /metrics endpoint returns correct exposition format
    Tool: Bash (curl)
    Preconditions: Server running locally.
    Steps:
      1. `curl -s http://localhost:3000/metrics | head -5`
    Expected Result: Output contains `# HELP` or `# TYPE` and formatted metric lines.
    Evidence: .sisyphus/evidence/task-10-metrics.txt
  ```

  **Commit**: YES (Message: `feat(http): add /metrics prometheus endpoint`)

---

## TODOs

- [ ] 1. Fix API Key Extraction

  **What to do**:
  - Update `src/http/middleware.ts` to exclusively check lowercase versions of API key headers, ignoring the mixed-case ones.
  - Specifically, ensure `'x-awesome-context-api-key'` (lowercase) is checked in `extractApiKey()`.

  **Must NOT do**:
  - Do NOT change the capitalization in the `Access-Control-Allow-Headers` response (line 9).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial string replacements in a single file.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/http/middleware.ts:14-25` - `extractApiKey` function to fix.

  **Acceptance Criteria**:
  - [ ] Node script testing `'x-awesome-context-api-key'` extraction succeeds.

  **QA Scenarios**:
  ```
  Scenario: API Key extracted successfully from lowercase header
    Tool: Bash (node)
    Preconditions: None
    Steps:
      1. Run `node -e "const { extractApiKey } = await import('./build/http/middleware.js'); const mock = { headers: { 'x-awesome-context-api-key': 'test-key-123' } }; const key = extractApiKey(mock); console.assert(key === 'test-key-123', 'Expected test-key-123, got ' + key); console.log('PASS');"`
    Expected Result: Output is "PASS" without assertion errors.
    Evidence: .sisyphus/evidence/task-1-api-key-extraction.txt
  ```

  **Commit**: YES (Message: `fix(http): lowercase API key header extraction`)

- [ ] 2. Structured Tool Error Responses

  **What to do**:
  - Update `src/tools/find-section.ts` and `src/tools/get-items.ts`.
  - In `catch` blocks and "no results found" conditions, add `isError: true` to the returned object.

  **Must NOT do**:
  - Do NOT modify the content text strings.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple property additions to return objects.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/tools/find-section.ts:58-66` - No results condition.
  - `src/tools/find-section.ts:76-86` - Catch block.
  - `src/tools/get-items.ts:72-81` - No items condition.
  - `src/tools/get-items.ts:91-102` - Catch block.

  **Acceptance Criteria**:
  - [ ] Returned objects correctly typecheck against `@modelcontextprotocol/sdk`.

  **QA Scenarios**:
  ```
  Scenario: Invalid query triggers isError: true
    Tool: Bash (node)
    Preconditions: Server built.
    Steps:
      1. Create test script that invokes `find_awesome_section` with guaranteed failure and checks for `isError: true`.
      2. Run the script.
    Expected Result: Logs `isError: true`.
    Evidence: .sisyphus/evidence/task-2-structured-errors.txt
  ```

  **Commit**: YES (Message: `feat(tools): add isError flag to tool failure responses`)

- [ ] 3. Tiktoken Estimation

  **What to do**:
  - Run `npm install js-tiktoken@1.0.20`.
  - Update `src/api/token-utils.ts` to use `js-tiktoken`.
  - Update `estimateTokens` to encode the stringified JSON and count the length.
  - Add a fallback mechanism to `chars / 4` if encoding fails.

  **Must NOT do**:
  - Do NOT change the signature of `estimateTokens(items: RawItem[]): number`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integrating a new library with fallback.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/api/token-utils.ts:3-6` - Current `estimateTokens` implementation.

  **Acceptance Criteria**:
  - [ ] `estimateTokens` returns a positive number for a sample item list.

  **QA Scenarios**:
  ```
  Scenario: Token estimation works correctly
    Tool: Bash (node)
    Preconditions: Code compiled.
    Steps:
      1. Run `node -e "const { estimateTokens } = await import('./build/api/token-utils.js'); const items = [{ name: 'test' }]; const tokens = estimateTokens(items); console.assert(typeof tokens === 'number' && tokens > 0);"`
    Expected Result: Success.
    Evidence: .sisyphus/evidence/task-3-tiktoken.txt
  ```

  **Commit**: YES (Message: `feat(api): implement js-tiktoken for accurate token counting`)

- [ ] 6. IP Rate Limiting

  **What to do**:
  - Run `npm install rate-limiter-flexible@9.0.1`.
  - Update `src/http/request-handler.ts`.
  - Create a `RateLimiterMemory` instance in the outer closure of `createRequestHandler` (e.g. 60 requests per minute).
  - In the returned request handler, check `limiter.consume(clientIp)`.
  - If rejected, return a 429 status code with a `Retry-After` header.
  
  **Must NOT do**:
  - Do NOT apply rate limits to `/health`, `/ping`, or `/metrics` paths.
  - Do NOT instantiate the rate limiter inside the inner request handling function.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: HTTP server request handling and promise rejection flows.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/http/request-handler.ts:15-18` - Outer closure where limiter must be defined.
  - `src/http/request-handler.ts:41` - Where rate limit logic should be checked before routes.
  
  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds.

  **QA Scenarios**:
  ```
  Scenario: Burst of HTTP requests triggers 429 Rate Limit
    Tool: Bash (curl)
    Preconditions: Server running locally.
    Steps:
      1. Execute a fast sequence of 100 requests to `/mcp`. (e.g., `for i in {1..100}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/mcp; done | sort | uniq -c`)
    Expected Result: Output shows a mix of 200s and 429s.
    Evidence: .sisyphus/evidence/task-6-ratelimit.txt
  ```

  **Commit**: YES (Message: `feat(http): add sliding-window ip rate limiting`)

- [ ] 7. Request Batching

  **What to do**:
  - Add a `findSectionsAndItems(params, limit)` method to `AwesomeContextAPIClient` in `src/api-client.ts`.
  - It should internally await `findSections`, take the top N sections, and run `Promise.all()` calling `getItems` for each.
  - Combine the results into a single structured response.

  **Must NOT do**:
  - Do NOT register this as a new MCP tool. It's an internal convenience method.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward async orchestration.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/api-client.ts` - Add new method here.
  
  **Acceptance Criteria**:
  - [ ] Method exists and TypeScript types are valid.

  **QA Scenarios**:
  ```
  Scenario: findSectionsAndItems executes successfully
    Tool: Bash (node)
    Preconditions: Code compiled.
    Steps:
      1. Script that calls `client.findSectionsAndItems({ query: "machine learning" }, 2)`.
    Expected Result: Returns a combined object containing sections and their respective items.
    Evidence: .sisyphus/evidence/task-7-batching.txt
  ```

  **Commit**: YES (Message: `feat(api): add findSectionsAndItems batching convenience method`)

---

- [ ] 4. Retry Logic with Backoff

  **What to do**:
  - Update `AwesomeContextAPIClient.request` in `src/api-client.ts`.
  - Add a retry loop (max 3 attempts).
  - ONLY retry on status 429 and transient 5xx (500, 502, 503, 504).
  - Respect `Retry-After` HTTP header if present on a 429.
  - Otherwise use exponential backoff (e.g., 1000ms, 2000ms, 4000ms).
  
  **Must NOT do**:
  - Do NOT retry on 400, 401, 403, 404.
  - Do NOT retry on `AbortError` (timeout).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Handling async retry loops and interpreting HTTP headers requires care.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (Blocks Caching)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/api-client.ts:46-133` - `request` method to wrap in retry logic.
  
  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds.

  **QA Scenarios**:
  ```
  Scenario: 404 does NOT trigger a retry
    Tool: Bash (node)
    Preconditions: Code compiled.
    Steps:
      1. Create a mock fetch that returns 404 immediately, then 200.
      2. Call the client's request method.
    Expected Result: The request immediately fails with a 404 APIError, no retry is attempted.
    Evidence: .sisyphus/evidence/task-4-retry.txt
  ```

  **Commit**: YES (Message: `feat(api): add 429/5xx retry logic to api client`)

- [ ] 5. In-Memory Response Caching (Singleton)

  **What to do**:
  - Run `npm install tiny-lru@11.4.7`.
  - In `src/api-client.ts`, instantiate a module-level `tiny-lru` cache (e.g. `const responseCache = lru(100, 300000);` // 100 items, 5 min TTL). This MUST be outside the `AwesomeContextAPIClient` class to persist across requests.
  - Wrap `findSections` and `getItems` methods to check the cache before making requests.
  - Cache key should be based on endpoint and sorted query params (excluding API key).

  **Must NOT do**:
  - Do NOT cache errors.
  - Do NOT instantiate the cache inside the class constructor (it would reset per request).

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Singleton management and safe serialization of cache keys requires careful implementation.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7, 8, 9, 10
  - **Blocked By**: Task 4

  **References**:
  - `src/api-client.ts` - Top level for singleton cache.
  - `src/api-client.ts:135` - `findSections`
  - `src/api-client.ts:152` - `getItems`
  
  **Acceptance Criteria**:
  - [ ] Cache instance exists at module scope.

  **QA Scenarios**:
  ```
  Scenario: Identical queries return cached results
    Tool: Bash (node)
    Preconditions: API server running (or mocked fetch).
    Steps:
      1. Create a script that initializes the client and calls `findSections` twice with identical parameters. Measure the time taken for each.
      2. Run the script.
    Expected Result: The second call completes in < 10ms (cached), whereas the first takes > 50ms.
    Evidence: .sisyphus/evidence/task-5-caching.txt
  ```

  **Commit**: YES (Message: `feat(api): implement in-memory lru response caching`)

---

