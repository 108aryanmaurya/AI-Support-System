# Phase 4 — Prerequisites (Sprint 0)

Parent: [phase-4-sprint.md](./phase-4-sprint.md) | [AI-FEATURE-DESIGN.md](./AI-FEATURE-DESIGN.md) §6  

**Status:** Sprint 0 complete (2026-05-20). Safe to start Sprint 1.

---

## Sprint 0 checklist

| Item | Status | Evidence |
|------|--------|----------|
| `conversations.metadata.ai` for workflow conditions | Done | `ai.classify_inbound` writes `metadata.ai`; `parseConversationMetadataAi` in `@ai-support/shared` |
| `automation_jobs` Phase 4 job types + handlers | Done | `ai.workflow_inbound`, `ai.workflow_tag_added`, `ai.workflow_sla` in `AUTOMATION_JOB_TYPES`; stubs in `processJob.service.js` |
| Idempotency keys for workflow jobs | Done | `workflow*IdempotencyKey` in `shared/src/workflowIdempotencyKeys.js`; unique index on `(organization_id, idempotency_key)` |
| AuthZ for org workflow settings | Done | `PATCH /api/org/:orgId/settings/ai` requires `ADMIN` (`orgSettings.routes.js`); Sprint 1+ rule routes must use same |
| Feature flags (`assign_to_ai`, workflow jobs) | Done | `workflowAiGates.service.js`; `workflow_automation_enabled` org toggle (default `false`) |

---

## Classification metadata shape

Written by `server/src/services/ai/classification.service.js` into `conversations.metadata.ai`:

| Field | Used by Phase 4 conditions |
|-------|---------------------------|
| `intent` | Yes |
| `sentiment` | Yes |
| `sentiment_score` | Yes |
| `language` | Yes |
| `auto_tags` | Yes |
| `classified_at` | Audit / freshness |
| `classified_message_id` | Tie-break to triggering message |
| `run_id` | Links to `ai_runs` |

Read path: `getConversationAiSignals()` → `parseConversationMetadataAi(metadata)`.

---

## Registering a new automation handler

1. Add job type to `shared/src/workflowAutomationJobTypes.js` or `automationJobTypes.js`.
2. Implement `server/src/services/automation/jobHandlers/<name>.js` exporting `async function handleX(job)`.
3. Register in `HANDLERS` in `server/src/services/automation/processJob.service.js`.
4. Enqueue via `enqueueAutomationJob` / `emitAutomationJob` with an **idempotency key** when duplicate runs are costly.
5. Gate org-level enablement in `enqueueJob.service.js` (`workflow_automation_enabled` + `ai_enabled` for `ai.workflow_*`).

Worker process: `npm run worker:automation` (separate from API).

---

## Idempotency key conventions

| Trigger | Key helper | Example |
|---------|------------|---------|
| Inbound message workflow | `workflowInboundIdempotencyKey(orgId, messageId)` | `workflow:inbound:{org}:{msg}` |
| Tag added | `workflowTagAddedIdempotencyKey(orgId, convId, tagId)` | `workflow:tag:{org}:{conv}:{tag}` |
| SLA warning (daily) | `workflowSlaWarningIdempotencyKey(orgId, day)` | `workflow:sla:{org}:2026-05-20` |

Inbound **message** dedupe remains on `incoming_message_idempotency` (RPC `handle_incoming_message`).

---

## Org settings (Phase 4)

| Field | Default | Meaning |
|-------|---------|---------|
| `workflow_automation_enabled` | `false` | Allows enqueue/process of `ai.workflow_*` jobs |
| `auto_route_to_ai` | `false` | Sprint 2+ routing action (still gated by conversation `ai_enabled`) |

Patch via `PATCH /api/org/:orgId/settings/ai` (**ADMIN** only). Body: `{ "ai": { "workflow_automation_enabled": true } }`.

---

## Enqueue helper (not wired to ingress until Sprint 2)

`scheduleInboundWorkflow({ organizationId, conversationId, messageId })` in `enqueueWorkflowInbound.service.js` — call from ingress after Sprint 2.

---

## Tests

```bash
cd server && npm test
```

Includes `conversationMetadataAi.test.js` and `workflowIdempotencyKeys.test.js`.
