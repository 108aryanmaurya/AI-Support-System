# Auto assignment — Prerequisites (Sprint 0)

Parent: [auto-assignment-sprint.md](./auto-assignment-sprint.md) | [auto-assignment.md](./auto-assignment.md)

**Status:** Sprint 0 complete (2026-05-23). Sprint 1 complete — see [auto-assignment-sprint.md](./auto-assignment-sprint.md#sprint-1--agent-profile-schema--assignment-audit).

---

## Sprint 0 checklist

| Item | Status | Evidence |
|------|--------|----------|
| Classification populates `metadata.ai` | Done | `ai.classify_inbound` → `classification.service.js` → `conversations.metadata.ai`; read via `getConversationAiSignals()` + `parseConversationMetadataAi` |
| Workflow after classify | Done | `handleClassifyInbound` calls `scheduleInboundWorkflow`; `ai.workflow_inbound` handler applies rules |
| Workflow actions (`set_assignment`, `set_priority`, `add_tag`) | Done | `workflowApply.service.js` → `updateConversationFromAutomation` |
| Assignable members API | Done | `GET /api/org/:orgId/conversations/members` → `listOrganizationMembersController` |
| Unassigned inbox + manual assign notify | Done | Filter `unassigned` in `client/src/config/inboxFilters.js`; PATCH assignment → `scheduleAssignmentWithFallback` → `notify.assignment` |
| Redis (no in-memory rate limits) | Done | `REDIS_URL` required in `rateLimit.config.js`; `rateLimitRedis.js` |
| Automation worker + idempotency | Done | `npm run worker:automation`; `enqueueAutomationJob` + unique `(organization_id, idempotency_key)`; keys in `workflowIdempotencyKeys.js` |
| Tenancy + assignment mutations | Done | Org routes under `/api/org/:orgId/*`; `updateConversationFields` / `updateConversationFromAutomation` scope `organization_id` |
| Feature flag stub | Done | `organizations.settings.assignment.auto_route_enabled` default `false` in `shared/src/assignmentSettings.js`; `getOrgAssignmentSettings` server helper |

---

## Classification metadata shape

Written by `server/src/services/ai/classification.service.js` into `conversations.metadata.ai`:

| Field | Auto-route use (later sprints) |
|-------|-------------------------------|
| `intent` | Skill / inbox matching |
| `sentiment` | Escalation, VIP rules |
| `language` | Inbox / agent language |
| `auto_tags` | Skill + workflow conditions |
| `classified_at` | Freshness |
| `classified_message_id` | Idempotency tie-break |
| `run_id` | Links to `ai_runs` |

Read path: `getConversationAiSignals(organizationId, conversationId)` → `classification` object.

---

## Inbound automation chain (prerequisite for Sprint 5)

```text
Customer message stored
  → scheduleInboundClassification
      → ai.classify_inbound (when LLM + org/conversation AI allow)
      → ai.workflow_inbound (after classify, or immediately if classify skipped)
  → [Sprint 5+] assignment.auto_route when still unassigned + auto_route_enabled
```

Handlers registered in `processJob.service.js` (`HANDLERS` map).

---

## Members & assignment permissions

| Surface | Auth | Notes |
|---------|------|-------|
| `GET .../conversations/members` | Org member (`requireOrgAccess`) | Returns `{ id, userId, role, email, displayName }` per `organization_members` |
| `PATCH .../conversations/:id` | Org member | Any member may assign to another member in the same org today |
| Assignment settings (Sprint 7) | `ADMIN` | Future `GET/PUT .../assignment/settings` — mirror `orgSettings.routes.js` |

Roles on `organization_members.role`: `ADMIN` vs agent membership is returned to the client for labels; **no separate assign-only role** in v1.

---

## Unassigned queue & notifications

- **DB:** `conversations.assignment_type` — `unassigned` \| `assigned_to_agent` \| `assigned_to_ai` \| `assigned_to_team` (see migration `20260515120000_conversation_workspace_states.sql`).
- **Inbox filter:** `assignmentType: 'unassigned'` via `client/src/config/inboxFilters.js`.
- **Manual assign:** `patchConversationController` → `updateConversationFields` → `scheduleAssignmentWithFallback` when `assignedToMemberId` or `assignmentType` changes.
- **Workflow assign:** `set_assignment` in `workflowApply.service.js` (does not enqueue assignee email today unless extended in Sprint 5).

---

## Redis & worker verification

**Local Redis**

```bash
docker compose -f docker-compose.redis.yml up -d
# server/.env
REDIS_URL=redis://localhost:6379
```

**Worker** (separate process from API; `npm run dev` starts it via root `concurrently`):

```bash
npm run worker:automation --workspace server
```

**Smoke:** send inbound message with `auto_tag_enabled` + LLM configured → `automation_jobs` rows for `ai.classify_inbound` then `ai.workflow_inbound` (when `workflow_automation_enabled`).

---

## Org settings — assignment (Sprint 0 stub)

Storage: `organizations.settings.assignment` (JSONB under org `settings`).

| Field | Default | Meaning |
|-------|---------|---------|
| `auto_route_enabled` | `false` | Allows Sprint 5+ `assignment.auto_route` enqueue |
| `strategy` | `weighted_hybrid` | Default scoring strategy (Sprint 4+) |

Merge helper: `mergeOrgAssignmentSettings` in `@ai-support/shared`.

Server read: `getOrgAssignmentSettings(organizationId)` in `assignmentSettings.service.js`.

Future admin API (Sprint 7): `PATCH` body `{ "assignment": { "auto_route_enabled": true } }` — not exposed in Sprint 0.

**Distinct from** `settings.ai.auto_route_to_ai` (workflow action: queue to AI, Phase 4).

---

## Idempotency key conventions

| Trigger | Key helper | Example |
|---------|------------|---------|
| Inbound workflow | `workflowInboundIdempotencyKey` | `workflow:inbound:{org}:{msg}` |
| Classify inbound | inline in enqueue | `classify:{org}:{msg}` |
| Auto-route (Sprint 5) | `autoRouteIdempotencyKey` | `assignment:auto_route:{org}:{conv}:{msg}` |

---

## Tests

```bash
cd shared && node --test src/assignmentSettings.test.js
cd server && npm test
```

---

## Gate sign-off (manual)

Before Sprint 1, confirm on a **test org**:

- [ ] ≥2 agents in `GET .../conversations/members`
- [ ] Classification enabled (`auto_tag_enabled` or equivalent) and `metadata.ai` present on a test thread
- [ ] Optional workflow rules; inbound chain runs without worker errors
- [ ] `REDIS_URL` set; API starts without rate-limit config throw
- [ ] Unassigned filter shows threads; manual assign delivers `notify.assignment` (or mock log when email unset)
