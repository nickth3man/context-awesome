# AGENTS.md

> **Purpose:** This file exists to correct consistent agent mistakes and specify required tooling — nothing more.
> Do NOT auto-generate or expand this file. If you encounter something surprising or confusing in this codebase,
> flag it to the developer and suggest an edit here. The developer will decide whether to fix the code or update this file.

---

## Required Tooling

<!-- PLACEHOLDER: List only the non-obvious tools the agent must use.
     Example: "Always use pnpm (not npm or yarn) to run scripts."
     If the tool is detectable from package.json or config files, omit it. -->
- [x] `npm` — always use `npm` to run scripts (not yarn or pnpm)
- [x] `tsc` — run after every change: `npm run build`
- [x] `jest` — run affected tests before marking a task complete: `npm test`

---

## Consistent Mistakes to Avoid

<!-- PLACEHOLDER: Only add entries here when the agent repeatedly makes the same error
     despite the codebase structure making the correct path clear.
     Each entry should be a single, specific correction. -->
- DO NOT edit `CLAUDE.md` or `GEMINI.md` directly — edit `AGENTS.md` instead. Reason: pre-commit hook syncs AGENTS.md to both files automatically.
- DO NOT use CommonJS (`require`, `module.exports`) — use ESM (`import`/`export`). Reason: `"type": "module"` in package.json.
- Always use `.js` extensions in TypeScript import paths (e.g., `import { foo } from "./bar.js"`). Reason: Node ESM resolution requires it.
- DO NOT use `fetch` from globals — use `node-fetch`. Reason: explicit dependency used throughout the codebase.

---

## Legacy / Deprecated Technologies

<!-- PLACEHOLDER: List technologies still present in the codebase but no longer preferred.
     This prevents the agent from reaching for outdated patterns it finds in older files. -->
- No legacy technologies identified. This is a young (v0.1.0) codebase.

---

## Project State Context

<!-- PLACEHOLDER: Use this section to intentionally frame the project's current state
     in a way that steers agent behavior. Update as the project matures.
     Examples of useful framings:
     - "This project is early-stage. Schema changes are welcome."
     - "This app has no production users yet. Don't generate data migration scripts."
     - "All new features must be backward-compatible — production data exists."
-->
- This project is early-stage (v0.1.0). Schema changes and API surface changes are welcome.
- The MCP server is a thin client — it connects to an external backend API (`api.context-awesome.com`) for all data. Do not implement data storage or awesome-list parsing locally.
- The backend API is not open-sourced. Do not assume you can modify it; treat it as a third-party service.

---

## Agent Self-Reporting

If you encounter anything in this codebase that is surprising, ambiguous, or contradicts your expectations,
**do not silently work around it**. Instead:

1. Flag it to the developer in your response.
2. Propose a one-line addition to this file describing the confusion.

The developer will determine whether the fix belongs in the code or here.

---

<!-- MAINTENANCE REMINDER:
     - Review this file when upgrading major dependencies or refactoring architecture.
     - If a section has been empty for a long time, delete it.
     - If the model no longer makes a listed mistake, remove that entry.
     - Outdated entries actively degrade agent performance.
-->