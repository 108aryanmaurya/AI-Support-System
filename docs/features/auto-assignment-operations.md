# Auto assignment — operations runbook

Parent: [auto-assignment-sprint.md](./auto-assignment-sprint.md) · Architecture: [auto-assignment.md](./auto-assignment.md)

## Processes

| Process | Command | Role |
|---------|---------|------|
| API | `npm run dev:server` / `start:server` | HTTP, enqueue `assignment.*` jobs |
| Automation worker | `npm run worker:automation --workspace server` | Runs `assignment.auto_route`, `assignment.reassign` |
| Redis | `REDIS_URL` | Presence, active-chat counters, conversation locks, rate limits |

Auto-route **does not** run in the API process alone — the worker must be running.

## Cron (daily unassigned backstop)

`POST /api/internal/cron/unassigned-auto-route-scan` with header `x-automation-cron-secret` (same secret as SLA/lifecycle cron). Schedule **once per UTC day**.

1. Enqueues `assignment.scan_unassigned_org` per organization (idempotent per org/day).
2. Worker scans up to **100** active, non-spam, unassigned conversations (`assignment_type` unassigned/null, no assignee).
3. For each thread with at least one customer message, enqueues `assignment.auto_route` (daily idempotency key; uses latest customer message id).

Requires org **AI enabled**, **`auto_route_enabled`**, Redis, and the automation worker. Inbound auto-route remains the primary path; this catches threads that never got routed.

## Metrics API

`GET /api/org/:orgId/assignment/metrics?days=7` (org member)

Returns:

- **latency** — p50/p95 job duration from completed `assignment.auto_route` / `assignment.reassign` rows
- **outcomes** — auto-applied/skipped/failed, reassigned, fallback %, lock contention skips
- **fairness** — stddev of active chats per agent (DB + Redis overlay)
- **queue** — pending/processing assignment jobs

Reports → Overview embeds a 7-day snapshot when data is available.

## Structured logs

Search server logs for JSON lines with `"component":"assignment"`.

| Field | Meaning |
|-------|---------|
| `organization_id` | Tenant |
| `conversation_id` | Thread |
| `strategy` | Scoring strategy when known |
| `error_code` | e.g. `redis_unavailable`, `lock_held`, `no_candidates`, `auto_route_failed` |
| `op` | `auto_route`, `reassign`, `acquire_lock` |
| `duration_ms` | Wall time for successful/failed runs |

No message bodies or customer email in these logs.

## Failure modes

### Redis unavailable

- **Auto-route / reassign:** Skipped with `assignment.auto_skipped` / `assignment.reassign_skipped` reason `redis_unavailable`. No partial assignment.
- **Presence/workload:** Falls back to DB counts; eligibility may be conservative.
- **Rate limits:** Follow `RATE_LIMIT_REDIS_FAIL_CLOSED` (503 in production when true).

**Remediation:** Restore Redis, verify `REDIS_URL`, restart API + worker.

### Lock contention

Concurrent jobs for the same conversation: second acquirer logs `error_code: lock_held` and skips. Idempotency keys prevent duplicate enqueue per message/trigger.

**Remediation:** Normal under retry; investigate if sustained (stuck lock TTL = `ASSIGNMENT_CONVERSATION_LOCK_TTL_SEC`).

### No eligible agents

Conversation stays unassigned; metadata `assignment.fallback = unassigned_queue`. Metrics `fallback_unassigned_pct` rises.

Staff email: `notify.staff_inbound` with `mode=routing_fallback` goes to `fallback_notify_member_ids` (or org admin if unset) — not the new assignee. Sent **after** `assignment.auto_route` completes, not at HTTP ingress time.

**Remediation:** Check agent presence, skills, shift hours, concurrency — use `POST .../assignment/preview` for drop codes.

### Inbound email routing

- **Auto-route applied:** one email to assignee (`auto_assigned_first_touch`) with assignment + customer message.
- **Already assigned / follow-up:** standard inbound email to current assignee only.
- **Unassigned after auto-route:** fallback/admin routing-failure email (not duplicate admin-on-every-message from ingress).

### Worker not running

Jobs accumulate in `automation_jobs` (`assignment.auto_route` pending). Inbox stays unassigned after workflow.

**Remediation:** Start automation worker; monitor queue depth via metrics API.

## Rate limits

`POST .../assignment/preview` — org-scoped cap (`RATE_LIMIT_ASSIGNMENT_PREVIEW_ORG_MAX` per minute). Returns **429** with `Retry-After` when exceeded.

## Phase 6 safety

Intelligent assignment does **not** send autonomous customer-visible AI replies. `assign_to_ai` / Phase 6 outbound remains gated separately.

## Connections

| Doc | Topic |
|-----|--------|
| [operational-hardening.md](./operational-hardening.md) | General production checklist |
| [notifications-and-automation.md](./notifications-and-automation.md) | `automation_jobs` queue |
| [workflow-automation.md](./workflow-automation.md) | Rules before auto-route |
