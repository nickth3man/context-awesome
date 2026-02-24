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

