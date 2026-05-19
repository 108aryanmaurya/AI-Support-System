# AI streaming (deferred)

Phase 3 Sprint 6 **defers** SSE streaming for suggest-reply.

## Planned shape

- `POST /api/org/:orgId/ai/suggest-reply/stream` when `AI_STREAMING_ENABLED=true`
- Server-Sent Events chunks; client renders incrementally in Copilot
- Same guardrails and rate limits as non-streaming suggest-reply

## Why deferred

- Requires streaming support in `openaiCompatible.provider.js` and JSON assembly for partial tokens
- Copilot UX needs careful abort/reconnect handling
- Non-streaming suggest-reply meets MVP; token budget + guardrails are higher priority

## Env (reserved)

```env
# AI_STREAMING_ENABLED=false
```

When implemented, document in `server/.env.example` and enable per environment after load testing.
