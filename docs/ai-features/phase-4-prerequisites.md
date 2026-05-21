# Phase 4 — Prerequisites (Sprint 0)

Parent: [phase-4-sprint.md](./phase-4-sprint.md) | [AI-FEATURE-DESIGN.md](./AI-FEATURE-DESIGN.md) §6  

**Status:** Sprint 0 complete (2026-05-20). Safe to start Sprint 1.

---

## Sprint 0 checklist

| Item | Status | Evidence |
|------|--------|----------|
| `conversations.metadata.ai` for workflow conditions | Done | `ai.classify_inbound` writes `metadata.ai`; `parseConversationMetadataAi` in `@ai-support/shared` |
| `automation_jobs` Phase 4 job types + handlers | Done | `ai.workflow_inbound`, `ai.workflow_tag_added`, `ai.workflow_sla`, `ai.workflow_schedule_org`; tag hook in `tags.service.js` → `enqueueWorkflowTagAdded.service.js` |
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

## Workflow rules API (Sprint 1)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/org/:orgId/ai/workflows/rules` | Org member |
| `PUT` | `/api/org/:orgId/ai/workflows/rules` | `ADMIN` — body `{ rules: [...] }` |
| `POST` | `/api/org/:orgId/ai/workflows/dry-run` | Org member — body `{ conversationId, trigger, tagId?, isBusinessHours? }` |
| `GET` | `/api/org/:orgId/ai/workflows/metrics` | Org member — queue depth + `workflow.*` event counts |
| `POST` | `/api/org/:orgId/ai/workflows/test-notification` | `ADMIN` — test staff email delivery |

Storage: `organizations.settings.workflow.rules`.

## Ingress policy (Sprint 3)

Settings: `organizations.settings.ingress` (see `shared/src/ingressPolicy.js`).

| Field | Default | Meaning |
|-------|---------|---------|
| `spam_enabled` | `true` | Heuristic spam scoring |
| `spam_action` | `flag` | `flag` or `reject` (422) |
| `duplicate_enabled` | `true` | Content-hash duplicate window |
| `duplicate_window_minutes` | `30` | Lookback for duplicate suppress |

Service: `server/src/services/ingress/ingressPolicy.service.js`.

## SLA & schedule workflows (Sprint 4)

- **SLA:** `sla.scan_org` detects breach → enqueues `ai.workflow_sla` (idempotency per conv/day) → `sla_warning` rules + `workflow.sla_warning_applied`
- **Schedule:** Cron `POST /api/internal/cron/workflow-schedule-scan` with `x-automation-cron-secret`
- **Settings:** `PUT .../ai/workflows/rules` body may include `schedule: { enabled, timezone, start, end, days }`

Example schedule rule (business hours only):

```json
{
  "name": "After-hours bump",
  "trigger": "schedule",
  "conditions": { "op": "all", "conditions": [{ "field": "business_hours", "op": "eq", "value": false }] },
  "actions": [{ "type": "set_priority", "priority": "high" }]
}
```

## Inbound automation chain (Sprint 2)

`scheduleInboundPostCustomerMessage()` in `inboundAutomation.service.js` — called from web ingress + email webhook.

1. `ai.classify_inbound` when LLM + org/conversation AI allow (updates `metadata.ai`)
2. `ai.workflow_inbound` after classification (or immediately when classification is not queued)
3. Worker applies matched rule actions via `workflowApply.service.js`

---

## Tests

```bash
cd server && npm test
```

Includes `conversationMetadataAi.test.js` and `workflowIdempotencyKeys.test.js`.
