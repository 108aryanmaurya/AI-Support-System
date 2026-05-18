# AI stubs & Phase 3 prerequisites

> **Superseded by [phase-3-prerequisites.md](./phase-3-prerequisites.md)** for current status. This file is kept as a redirect for older links.

Phase 3 **prerequisites are shipped** (May 2026):

- `openai` package + `llm.client.js`
- `LLM_*` environment variables
- `ai_runs` writes via `recordAiRun()`
- Org-scoped rate limits on **all** `/api/org/:orgId/ai/*` routes
- Copilot API endpoints: `assist`, `suggest-reply`, `summarize`, `translate`, `rewrite`

**Still partial:** inbox Copilot UI calling these APIs end-to-end; classification/auto-tag workers; autonomous replies (Phase 6).

See [phase-3-prerequisites.md](./phase-3-prerequisites.md) and [AI-FEATURE-DESIGN.md](./AI-FEATURE-DESIGN.md) §5.
