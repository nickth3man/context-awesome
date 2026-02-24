# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-24 | **Commit:** `817139d` | **Branch:** `dev`

Guidelines for AI coding agents working on the context-awesome MCP server codebase.

## Project Overview

MCP server providing AI agents access to 8500+ curated awesome lists via two tools:
- `find_awesome_section` — Discover sections matching a query
- `get_awesome_items` — Retrieve items from a specific list/section

Stack: TypeScript 5.3 (strict), ESM (`"type": "module"`), Node.js >=18, MCP SDK ^1.0.0, Zod, Commander, node-fetch. Backend API: `https://api.context-awesome.com`.

## Commands

```bash
npm install                                           # Install dependencies
npm run build                                         # Compile TS → ./build/ (MUST exit 0)
npm test                                              # Run all tests (Jest)
npm test -- --testPathPattern=api-client              # Single test file
npm test -- --testNamePattern="findSections"           # Single test by name
npm run dev                                           # Dev mode (stdio)
npm run dev -- --debug                                # With debug logging
npm run dev -- --transport http --port 3001           # HTTP transport
npm run inspector                                     # MCP Inspector (interactive)
```

> **No test files exist yet.** Place tests alongside source as `src/<name>.test.ts`.

### Build Validation

TypeScript is strict — all of these are enforced:
`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`

## Project Structure

```
src/
├── index.ts          # Entry point: CLI parsing, MCP server setup, tool registration
├── api-client.ts     # AwesomeContextAPIClient — HTTP client for backend API
└── types.ts          # All TypeScript interfaces and type definitions
```

## Where to Look

| Task | File | Notes |
|------|------|-------|
| Add/modify MCP tools | `src/index.ts` | `server.registerTool()` calls inside `createServerInstance()` (line 103) |
| Add API endpoints | `src/api-client.ts` | New method on `AwesomeContextAPIClient`, follow `findSections()`/`getItems()` pattern |
| Add/change types | `src/types.ts` | All interfaces live here — single source of truth |
| CLI flags | `src/index.ts` | `commander` setup at top (lines 17-24), validation (lines 36-60) |
| HTTP routing | `src/index.ts` | `createServer` callback (line 395), routes: `/mcp`, `/sse`, `/messages`, `/ping`, `/health` |
| Auth header extraction | `src/index.ts` | `extractHeaderValue()` / `extractBearerToken()` (lines 415-446) |
| Error handling | `src/api-client.ts` | `request()` method (line 27), status-specific messages (lines 66-80) |
| Token management | `src/api-client.ts` | `estimateTokens()` (line 208), `truncateToTokenLimit()` (line 213) |
| Response formatting | `src/index.ts` | Markdown generation in tool handlers (lines 179-226, 315-369) |
| Docker/deploy | `Dockerfile` + `smithery.yaml` | Multi-stage build, exposes port 8080 |

## Architecture

```
CLI args (commander)          Backend API
       │                        ▲
       ▼                        │ GET /api/find-section
  McpServer ──► AwesomeContext  │ GET /api/get-items
  (tool handlers)  APIClient ───┘
       │
  ┌────┴────┐
  │         │
stdio    HTTP server
         ├── /mcp      (StreamableHTTP)
         ├── /sse      (SSE transport)
         ├── /messages (SSE POST relay)
         ├── /ping     (healthcheck)
         └── /health   (JSON status)
```

**Per-request instantiation** (HTTP mode only): Every HTTP request creates a fresh `McpServer` + `AwesomeContextAPIClient`. This is intentional — isolates auth context per caller. Never add module-level state.

**SSE session tracking**: SSE transports stored in `sseTransports` record keyed by `sessionId`. Cleaned up on connection close.

**CORS**: Manually set on every response. Allows `*` origin. Exposes `MCP-Session-Id` header.

## Code Map

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `createServerInstance()` | function | `index.ts:103` | Factory: creates McpServer + registers both tools. Central to architecture. |
| `AwesomeContextAPIClient` | class | `api-client.ts:10` | Sole HTTP client. All backend communication flows through `request()`. |
| `main()` | function | `index.ts:387` | Bootstrap: picks transport, starts server. |
| `getClientIp()` | function | `index.ts:71` | Extracts client IP from X-Forwarded-For or socket. |
| `startServer()` | closure | `index.ts:518` | Port fallback logic (EADDRINUSE → try port+1, up to 10 attempts). |
| `DEFAULT_MINIMUM_TOKENS` | const | `index.ts:14` | `10000` — floor for token param in `get_awesome_items`. |

## Code Style

### Imports

```typescript
// 1. MCP SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// 2. Third-party
import { z } from "zod";
// 3. Internal (ALWAYS .js extension — ESM requires it even for .ts sources)
import { AwesomeContextAPIClient } from "./api-client.js";
```

**CRITICAL:** Always use `.js` extension in relative imports. Omitting it causes runtime failures.

### Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| Interfaces | PascalCase | `FindSectionParams`, `APIError` |
| Classes | PascalCase | `AwesomeContextAPIClient` |
| Methods/functions | camelCase | `findSections()`, `getItems()` |
| Private methods | `private` + camelCase | `private log()`, `private request()` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_MINIMUM_TOKENS` |
| Files | kebab-case | `api-client.ts`, `types.ts` |

### Types

```typescript
// PREFER interface for object shapes
export interface FindSectionParams {
  query: string;
  confidence?: number;
}

// USE type for unions/utility types only
export type TransportType = 'stdio' | 'http';

// ALWAYS annotate return types on public methods
async findSections(params: FindSectionParams): Promise<FindSectionResponse> { }

// `any` is ONLY acceptable at:
//   - Variadic logging: private log(...args: any[])
//   - Generic request methods: private async request<T>(endpoint: string, params?: Record<string, any>): Promise<T>
//   - JSON parsing boundary: const data = await response.json() as any;
```

Prefix intentionally unused parameters with `_` (e.g., `_clientIp`).

### Error Handling

Errors are plain objects satisfying `APIError` — not class instances:

```typescript
const error: APIError = { code: 'INVALID_PARAMS', message: '...', statusCode: 400 };
throw error;
```

Tool handlers catch errors and return user-friendly text — never re-throw to MCP:

```typescript
try {
  const response = await apiClient.findSections(params);
} catch (error: any) {
  const apiError = error as APIError;
  return { content: [{ type: "text", text: apiError.message || "Operation failed." }] };
}
```

Error codes: `RATE_LIMIT` (429), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `TIMEOUT` (AbortError), `NETWORK_ERROR` (fetch failure), `API_ERROR` (other).

### Async Patterns

- ALWAYS `async/await` — never `.then()`/`.catch()` chains
- Use `AbortController` for all fetch calls (30s timeout)

### Zod Schemas

```typescript
// Use .describe() on every parameter — it becomes LLM-visible documentation
query: z.string().describe("Search terms for finding sections"),
// Use z.preprocess for string→number coercion (HTTP/CLI sends strings)
tokens: z.preprocess((val) => (typeof val === "string" ? Number(val) : val), z.number())
```

Tool `inputSchema` uses a plain Zod field map — not `z.object()`.

### API Response Normalization

Backend may return `results` or `sections`, `snake_case` or `camelCase`. Always normalize in `api-client.ts` using `||` fallbacks:

```typescript
const sections = response.results || response.sections || [];
listName: section.listName || section.list_name || '',
```

## What NOT to Do

- **NEVER** use `@ts-ignore` or `@ts-expect-error`
- **NEVER** use `as any` in public API method signatures
- **NEVER** omit `.js` from import paths
- **NEVER** use `.then()`/`.catch()` — always `async/await`
- **NEVER** commit the `build/` directory
- **NEVER** add module-level state (per-request server instances in HTTP mode)

## Pre-Commit Checklist

- [ ] `npm run build` exits 0
- [ ] All imports use `.js` extension
- [ ] No `@ts-ignore` or `@ts-expect-error`
- [ ] Unused vars prefixed with `_`

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `AWESOME_CONTEXT_API_HOST` | `https://api.context-awesome.com` | Backend API base URL |

No `.env` required. Use `--api-host` CLI flag or shell env var.

## Key Pitfalls

1. **Missing `.js` extension** — Runtime ESM failure. Always `./types.js`, never `./types`.
2. **Unused variables** — Build fails. Prefix with `_` if intentional.
3. **HTTP port conflicts** — Server auto-increments port on EADDRINUSE (up to +10). Check stderr.
4. **Token estimation** — `Math.ceil(JSON.stringify(items).length / 4)` is an approximation.
5. **Flag constraints** — `--api-key` forbidden with `--transport http`; `--port` forbidden with `--transport stdio`.
6. **Unknown CLI flags allowed** — `allowUnknownOption()` (line 23) lets MCP Inspector pass extra flags. Don't rely on commander rejecting bad flags.

## Deployment

- **Docker**: Multi-stage build (`Dockerfile`). Production image uses `node:lts-alpine`, runs on port 8080 with HTTP transport.
- **Smithery**: `smithery.yaml` configures container runtime. No env vars required.
- **Remote**: Hosted at `https://www.context-awesome.com/api/mcp` — no local setup needed for consumers.

## Unused devDependencies

`@types/express` and `@types/yargs` are in `devDependencies` but not used — the server uses native `http` module and `commander`. Safe to remove.
