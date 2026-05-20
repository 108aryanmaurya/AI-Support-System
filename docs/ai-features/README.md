# AI feature documentation

Implementation guides for the AI roadmap ([AI-FEATURE-DESIGN.md](./AI-FEATURE-DESIGN.md)). Use these docs for **what is shipped today**; the design doc remains the long-term blueprint.

| Doc | Scope | Status |
|-----|--------|--------|
| [phase-1-foundation.md](./phase-1-foundation.md) | Events, automation, org AI settings, `ai_enabled`, reports shell | **Shipped** |
| [phase-2-knowledge-base.md](./phase-2-knowledge-base.md) | Articles, chunks, FTS search, file ingest, analytics | **Shipped** |
| [phase-2-conversation-tags.md](./phase-2-conversation-tags.md) | Tag definitions, inbox filters, conversation tagging | **Shipped** |
| [phase-3-prerequisites.md](./phase-3-prerequisites.md) | LLM client, env, `ai_runs`, copilot API endpoints | **Shipped** |
| [phase-3-sprints.md](./phase-3-sprints.md) | Sprint 0–6 breakdown (Copilot, classification, analytics, guardrails) | **Shipped** |
| [phase-4-sprint.md](./phase-4-sprint.md) | Phase 4 workflow automation: sprints 0–6 (rules engine, ingress, SLA, UX) | **Planned** |
| [phase-4-prerequisites.md](./phase-4-prerequisites.md) | Sprint 0 gate: metadata, jobs, idempotency, authz, flags | **Shipped** |
| [ai-guardrails.md](./ai-guardrails.md) | Output policy, prompt injection, tests | **Shipped** |
| [ai-streaming.md](./ai-streaming.md) | SSE suggest-reply (deferred) | Planned |
| [ai-stubs-and-phase-3-prerequisites.md](./ai-stubs-and-phase-3-prerequisites.md) | Redirect to phase-3-prerequisites | — |
| [phase-2-plan.md](./phase-2-plan.md) | Original sprint plan (historical) | Reference |

**Also see**

- [IMPLEMENTED-FEATURES.md](../../IMPLEMENTED-FEATURES.md) — full product inventory
- [docs/features/knowledge-base.md](../features/knowledge-base.md) — knowledge feature (connections to inbox/reports)
- [docs/features/ai-capabilities.md](../features/ai-capabilities.md) — AI stubs and schema hooks
- [docs/features/org-ai-settings.md](../features/org-ai-settings.md) — org toggles and automation JSON

**Last updated:** 2026-05-20 (Phase 4 sprint plan)
