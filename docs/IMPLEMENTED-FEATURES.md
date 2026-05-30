# Implemented Features — AI Support System

Inventory of features **implemented in the codebase today** (client, server, shared, Supabase). Items marked *(partial)* or *(placeholder)* have UI, API, or schema present but are not fully wired end-to-end.

**Detailed implementation guides:** [docs/README.md](./docs/README.md) (one markdown file per major feature).

---

## 1. Monorepo & platform foundation

- **npm workspaces** — `client`, `server`, `@ai-support/shared`
- **Development workflow** — concurrent `client` + `server` + automation worker (`npm run dev`)
- **Shared package** — API prefix, conversation/message constants, inbox sort, mentions, support event types, automation job types
- **Express API shell** — CORS, JSON body parsing, request logging, 404 handler, centralized error handler
- **Health endpoint** — `GET /health`
- **Environment configuration** — validated Supabase credentials, CORS origins, email/notification settings (`server/src/config/env.js`)
- **Supabase integration**
  - Client: anon key, browser auth session
  - Server: service-role admin client (never exposed to browser)
- **Database migrations** — 23 SQL migrations under `supabase/migrations/` (conversations, channels, multi-org, analytics, automation, etc.)

---

## 2. Authentication & session management

- **Email/password auth** (Supabase Auth) — sign up, sign in, sign out
- **Auth context** — `AuthProvider`, `useAuth`, session persistence
- **Protected routes** — `RequireAuth` wrapper for authenticated pages
- **API JWT validation** — `requireAuth` middleware (`Authorization: Bearer <token>`)
- **Current user API** — `GET /api/auth/me`
- **User profile on signup** — DB trigger syncs `public.users` from auth metadata (first/last name)
- **Post-auth routing** — `/continue` sends users to onboarding, org picker, or last-used workspace inbox
- **`GET /api/auth`** — auth namespace discovery (`/health`, `/me`)

---

## 3. Registration, onboarding & first-run experience

- **Landing page** — marketing site with feature highlights, testimonials, CTAs
- **Login page**
- **Registration page** — account creation (name, email, password); redirects to invite flow or `/continue`
- **Onboarding hub** (`/onboarding`)
  - Create new organization (multi-step: workspace name, company size, use case, teammate emails)
  - Join via invite token (URL or pasted token)
- **Register** uses `StepAccount`; org creation uses inline forms on `OnboardingPage` + `POST /api/org/create`
- **Route aliases** — `/getting-started` → `/onboarding`, `/dashboard` and `/inbox` → `/continue`

---

## 4. Multi-organization (SaaS tenancy)

- **Organizations** — create, list for current user, `created_by` provenance
- **Organization members** — roles `ADMIN` | `AGENT`, status `ACTIVE` | `INVITED`
- **Org-scoped API** — `/api/org/:orgId/*` with membership enforced from URL only (`requireOrgAccess`)
- **Role-based actions** — `requireRole('ADMIN')` for invites and batch invites
- **Organization context (client)** — loads `GET /api/org/my`, exposes memberships to UI
- **Org selector** — pick workspace when user belongs to multiple orgs
- **Org switcher** — change active workspace from navbar
- **Last organization memory** — `localStorage` restores preferred org on login when still a member
- **Org workspace layout** — shared shell (sidebar, navbar) for `/org/:orgId/*`
- **Row Level Security** — org/member/conversation policies in Supabase migrations

---

## 5. Team invitations & membership

- **Create invite** — `POST /api/org/:orgId/invite` (ADMIN); sends invite email via Resend notification config
- **Batch invites** — `POST /api/org/:orgId/invites/batch` (ADMIN); emails each created invite
- **List pending invites** — `GET /api/org/:orgId/invites`
- **Public invite preview** — `GET /api/org/invite/:token` (org name, role, expiry state)
- **Accept invite** — `POST /api/org/accept-invite` (authenticated)
- **Invite page** (`/invite`) — preview, login redirect, accept flow
- **Pending invite token storage** — survives register → login → accept
- **Teammates settings**
  - List members with search
  - Invite teammates UI (`/settings/teammates/invite/new`)
  - Deep link route for new invites (`/teammates/invite/new`)
- **List organization members** — inbox assignment picker + `GET .../conversations/members`

---

## 6. Support inbox (conversations)

- **Multiple customer-facing inboxes (v1)** — `inboxes` + `inbox_members`; `conversations.inbox_id`; inbox switcher (`?inbox=`); list/counts/send ACL by membership; admin **Settings → Inboxes**; manual `transfer-inbox` + `conversation.inbox_transferred`; routing on create + workflow `set_inbox`; migration script for legacy `settings.assignment.inboxes` — see [multiple-inbox.md](docs/features/multiple-inbox.md)
- **Conversation CRUD (API)**
  - Create conversation (customer, channel, priority, assignment, metadata)
  - List with inbox filters and pagination
  - Patch status, priority, assignment, subject-related fields
  - Mark/unmark spam
  - List messages for a conversation
- **Inbox filters (sidebar)**
  - Your inbox
  - Mentions
  - Created by you
  - All
  - Unassigned
  - Spam
  - SLA risk, Spam flagged (ingress metadata)
  - AI intent (`?filter=ai_intent&aiIntent=…`)
  - Resolved
  - Closed
- **Conversation lifecycle (Sprint 0–6)** — resolve/close/waiting inbox actions; Model C reopen; cron auto-close idle `resolved`; customer reminder email + auto-close `waiting_customer`; admin lifecycle settings (`/settings/lifecycle`); inbox badges and auto-close hints; lifecycle unit/integration tests; ops runbook in [operational-hardening.md](docs/features/operational-hardening.md); see [conversation-status-handling.md](docs/features/conversation-status-handling.md)
- **Automation list badges** — spam flagged, SLA risk, AI intent on conversation rows (Phase 4 metadata)
- **Filter counts** — `GET .../conversations/counts`
- **Conversation workspace fields**
  - Status: `open`, `pending`, `resolved`, `closed`, `spam`; **`waiting_status`**: `waiting_agent` | `waiting_customer` | empty; next-response SLA on `waiting_agent` + `last_customer_message_at`
  - Priority: `low`, `medium`, `high`, `urgent`
  - Assignment type: `unassigned`, `assigned_to_agent`, `assigned_to_team`, `assigned_to_ai`
- **Inbox UI** (`InboxPage`) — conversation list, thread view, composer, lifecycle buttons (Resolve / Close / Waiting on customer), lifecycle list badges and detail hints, status/priority/assignee controls
- **Inbox state (client)** — Zustand `inboxStore` (conversations, filters, typing, mention cues)
- **Filter caching & debounced refetch** — faster sidebar switching
- **Periodic HTTP sync** — backup when realtime is quiet
- **Claim-on-first-reply** — sending a customer reply on an **unassigned** thread self-assigns the agent (server; respects `client_request_id` idempotency)
- **RBAC & collaboration** — org capabilities (`settings.permissions` + role presets); `requirePermission`; assignment steal prevention; `POST .../conversations/:id/claim`; spam/close/analytics/invite gates; audit `GET .../audit/events`; send collision `stale_thread` warning — see [rba-sprints.md](docs/features/rba-sprints.md)
- **One open conversation per customer** — DB constraint for email/web threads
- **Active thread index / RPC helpers** — migrations for performant inbox queries
- **Intelligent assignment (Sprint 1–8)** — Settings → Assignment; `GET .../assignment/metrics` + Reports overview KPIs; structured assignment logs; preview rate limits; ops runbook [auto-assignment-operations.md](docs/features/auto-assignment-operations.md); worker jobs `assignment.auto_route` / `assignment.reassign`

---

## 7. Messages & composer

- **Message sender types** — `customer`, `agent`, `system`, `ai`, `internal_note`
- **Agent outbound send** — insert `pending` row → channel send → `sent` or `failed` on same row
- **Dedicated send endpoint** — `POST /api/org/:orgId/messages/send`
- **Send idempotency** — `client_request_id` + Redis lock/result cache + `agent_send_idempotency` table (no duplicate outbound on retry)
- **Generic message create** — `POST /api/org/:orgId/messages` (supports internal notes, metadata)
- **Internal notes** — distinct styling; not customer-visible
- **@Mentions & internal notes**
  - Inbox composer: **Reply** (customer) vs **Internal note** (team-only)
  - `@` autocomplete for org members on internal notes
  - Mentions parsed only on internal notes; customer replies do not update mention metadata
  - `POST .../messages/internal-note` with send idempotency
  - Email via `notify.mention` (org `mention_notify_enabled`, default on)
  - Mentions filter + realtime sidebar cue; highlighted `@` in bubbles
- **Delivery status UI** — sending / sent / failed states in thread
- **Message validation** — sanitization, max length, incoming payload checks
- **Customers API** — create or get customer by email (`POST /api/org/:orgId/customers`)

---

## 8. Real-time communication

- **Supabase Realtime** — subscribe to conversation/message changes per org + user
- **Reconnect handling** — exponential backoff; HTTP refetch after reconnect to fill gaps
- **Typing presence** — broadcast and display “X is typing…” in active thread
- **Realtime publication** — migrations enable inbox tables for realtime
- **RLS on messages** — tenant isolation for realtime and REST reads

---

## 9. Multi-channel architecture

- **Channel registry** — per-org `channels` (`email`, `web`, `whatsapp`, `messenger`)
- **Channel integrations** — `channel_integrations` (provider config, webhook secrets)
- **One channel per conversation** — `channel_type` + `channel_id` on conversations
- **List workspace channels** — `GET /api/org/:orgId/channels`

### 9.1 Web channel

- **Public incoming API** — `POST /api/org/:orgId/messages/incoming` (no JWT; org from URL)
- **Rate limiting** — middleware on incoming ingress
- **Transactional RPC** — `handle_incoming_message` (customer + conversation + message in one DB transaction)
- **Web outbound adapter** — delivers agent replies for `channel_type = web`

### 9.2 Email channel

- **Org email setup (Resend)** — Settings → Email: forward-to-platform address (receive), then sending-domain DNS (SPF/DKIM); optional advanced full-DNS mode ([org-email-channel.md](./features/org-email-channel.md))
- **Inbound email webhook** — `POST /api/webhooks/resend` (alias `/api/webhooks/email`); Svix verification when `RESEND_WEBHOOK_SECRET` set
- **Resolve org by recipient address** — match integration config / domain
- **Email threading** — thread keys, reply routing headers, `email_threads` table
- **Idempotent inbound** — dedupe by `external_message_id`
- **Outbound email** — Resend provider (or **mock** mode for local dev)
- **Reply routing** — In-Reply-To / References for threaded replies
- **Email adapter** — used by unified `channelReplyRouter`

### 9.3 Not yet implemented (schema / UI only)

- **WhatsApp** — channel type in DB; outbound returns 501
- **Messenger** — channel type in DB; outbound returns 501

---

## 10. Notifications & background automation

- **Durable job queue** — `automation_jobs` table with claim RPC, retries, idempotency keys
- **Automation worker** — separate Node process polls and processes jobs (`npm run worker:automation`)
- **Job types**
  - `notify.staff_inbound` — post-routing staff email (assignee after auto-route, fallback list/admin when unassigned; not at raw ingress)
  - `notify.assignment` — email assignee on conversation assignment
  - `notify.unassignment` — email prior assignee when conversation is reassigned or returned to queue
  - `notify.sla_warning` — dedicated SLA breach email from `sla.scan_org` (and optional workflow `notify`); assignee when assigned, else assignment fallback or org admin; first- vs next-response copy
  - `assignment.scan_unassigned_org` — daily cron backstop: enqueue `assignment.auto_route` for active unassigned conversations (batch 100/org/day)
  - `sla.scan_org` — detect first- and next-response SLA breaches per org; enqueue breach notify when `sla_notify_enabled`
  - `knowledge.ingest_source` — file upload → article → publish → chunks
- **Org automation settings** — JSON in `organizations.settings.automation` (SLA minutes, notify toggles); editable in AI settings UI
- **Internal notification email** — optional Resend via `NOTIFICATION_RESEND_API_KEY` / `NOTIFICATION_EMAIL_FROM`
- **Cron triggers** — `POST /api/internal/cron/sla-scan`, `/lifecycle-scan` (every 15 min), `/unassigned-auto-route-scan` (daily backstop for unassigned auto-route), `/workflow-schedule-scan` (header: `x-automation-cron-secret`)
- **Enqueue on key events** — inbound customer messages, conversation assignment changes

---

## 11. Analytics & reports

- **Telemetry tables**
  - `support_events` (append-only product events)
  - `ai_runs`, `ai_feedback` (schema for future AI; metrics read when populated)
  - `analytics_daily_rollups` (pre-aggregation scaffold)
- **Support event emission** — conversation lifecycle, outbound send/fail, SLA breach, etc.
- **Analytics API** (org-scoped)
  - `GET .../analytics/overview`
  - `GET .../analytics/conversations`
  - `GET .../analytics/team`
  - `GET .../analytics/ai`
  - `GET .../analytics/knowledge`
- **Reports UI** (`/org/:orgId/reports`)
  - Tabs: Overview, Conversations, Team, AI, Knowledge
  - KPI grid, line chart, breakdown bars
  - Date range selection
  - AI tab shows “not configured” when no `ai_runs` data

---

## 12. Settings & workspace navigation

- **Hover sidebar** — Inbox, Reports, Knowledge, Search, Settings; expandable labels
- **Workspace navbar** — org branding and navigation
- **Settings layout** — nested routes under `/org/:orgId/settings`
- **Settings home** — card grid; Teammates and AI & Automation cards link to live pages *(other cards UI-only)*
- **Settings nav taxonomy** — Workspace, Subscription, Channels, Inbox, AI & Automation, Integrations, Data, Help Center, Outbound, Personal *(AI & Automation routed; rest largely placeholder)*
- **Teammates settings** — fully wired (see §5)
- **Org AI & automation settings** — `/settings/ai`; `GET/PATCH /api/org/:orgId/settings/ai`; persists `organizations.settings.ai` + `.automation`

---

## 13. Search

- **Search page shell** — `/org/:orgId/search` with inbox sidebar + search input *(partial: copy says “UI coming soon”; no search API wired)*

---

## 14. Operational hardening

- **Rate limiting (Redis only)** — requires `REDIS_URL`; shared fixed-window counters via Lua; `X-RateLimit-*` headers; API exits if Redis unavailable at startup
  - Public ingress: per-org and per-customer-email (`messages/incoming`)
  - Email webhook: per recipient address
  - AI: per-org + per-user on `POST .../ai/assist`; per-user on legacy `POST /api/ai/assist`
  - Knowledge search + file upload: per-org and per-user caps
  - Agent send: per-org+user on `POST .../messages/send`
- **Outbound failure monitoring** — deduped JSON logs + always-on `message.outbound_failed` events (`error_code`, `error_message`)
- **Ops diagnostics** — `GET /api/internal/ops/rate-limits` (cron secret)
- **Docs** — [operational-hardening.md](./features/operational-hardening.md)

---

## 15. AI & knowledge (Phases 1–2 + stubs)

**Deep dives:** [ai-features/README.md](./ai-features/README.md)

### 15.1 Phase 1 foundation (shipped)

- **Org AI settings API + UI** — master AI switch, phase toggles (assist, auto-tag, auto-route, autonomous), default `conversations.ai_enabled`, model tier placeholder
- **`conversations.ai_enabled`** — set on create from org default; patchable on conversation update; blocks `assigned_to_ai` when org AI off
- **`support_events`** — lifecycle, outbound, SLA, knowledge events (`shared/src/supportEventTypes.js`)

### 15.2 Knowledge base (Phase 2 — shipped)

- **Articles** — CRUD, versions, publish, slug, visibility; soft-delete archive (`DELETE .../articles/:id`, ADMIN)
- **Full-text search** — `GET .../knowledge/search` + `search_knowledge_chunks` RPC
- **File ingest** — upload `.txt`/`.md`/`.pdf` (≤ 512 KB); worker job `knowledge.ingest_source`; source status on list page
- **Retrieval helpers** — `retrieval.service.js`, `contextAssembly.service.js` *(future RAG; not wired to inbox copilot)*
- **Client** — `/org/:orgId/knowledge`, editor, import, archive (ADMIN)
- **Migrations** — `20260517150000_knowledge_base.sql`, `20260517160000_knowledge_search_rpc.sql`

### 15.3 Conversation tags (Phase 2 — shipped)

- **Tag definitions** — org-scoped CRUD (ADMIN mutations)
- **Conversation tags** — assign on thread; inbox filter `?tagId=`
- **Client** — `ConversationTagsPanel`, sidebar tag filter; **Settings → Conversation tags** (`/settings/tags`) for ADMIN CRUD on definitions

### 15.4 LLM / copilot (Phase 3 — Sprint 0–1 shipped)

- **LLM config** — `LLM_PROVIDER` presets (`openai`, `gemini`, `groq`, `together`, `openrouter`, `custom`) + `LLM_API_KEY` / provider keys; `llm.config.js` + OpenAI-compatible adapter
- **Provider client** — `openai` npm SDK against any compatible base URL (Gemini, Groq, etc.)
- **`ai_runs` logging** — `recordAiRun()` on success/failure for every model call
- **Org AI routes** (rate limited on all `/ai/*`):
  - `POST .../ai/assist`, `suggest-reply`, `summarize`, `translate`, `rewrite`
  - `GET .../ai/health` (`llmConfigured`)
- **Guards** — org `ai_enabled` + `assist_enabled`, conversation `ai_enabled`; **503** without API key
- **RAG** — `suggest-reply` optional keyword retrieval from knowledge base
- **Sprint 1** — JSON `suggest-reply` / `summarize` responses; `tone`/`length`/`type` options; PII scrub + transcript truncation; richer context (customer, channel, tags, org style guide)
- **Inbox Copilot UI** — sidebar tab: suggest reply (inserts composer draft), summarize thread, confidence + runId; gated by org/conversation AI settings
- **Sprint 3** — Composer **AI** menu: translate (language picker) and rewrite tone; preview modal before replace; `POST .../ai/feedback` (accepted/edited/rejected); inbox send sets `is_ai_generated`, `ai_run_id`, `parent_message_id` when draft came from a copilot run
- **Sprint 4** — Async `ai.classify_inbound` worker: intent/sentiment/language in `conversations.metadata.ai`; optional tag apply when `auto_tag_enabled`; Copilot shows thread signals (read-only)
- **Sprint 5** — Per-feature AI rate limits (heavy vs composer); `GET .../analytics/ai/runs` drill-down; Reports acceptance rate + failed runs; Settings LLM health test; structured `ai.failure` JSON logs
- **Sprint 6** — `ai.guardrails.js` (refund/impersonation/legal blocks → `blocked_policy`); UNTRUSTED_CONTEXT prompt wrapping; `knowledgeContext.js` + `summary.service.js` split; streaming deferred (`docs/ai-features/ai-streaming.md`)

### 15.5 Workflow automation (Phase 4 — shipped)

- **Rules engine** — `organizations.settings.workflow`; triggers `inbound_message`, `sla_warning`, `tag_added`, `schedule`; worker jobs `ai.workflow_*`
- **Actions** — assignment, priority, tags, staff notify, `assign_to_ai` (gated); `enqueue_phase6` skipped with audit log
- **Ingress** — spam/duplicate policy on web + email; org ingress settings UI
- **Inbox** — SLA risk / spam flagged / AI intent filters; automation badges on list rows
- **Admin UI** — Settings → Workflow rules: enable/reorder, JSON edit, dry-run, test notification, metrics
- **API** — `GET/PUT .../ai/workflows/rules`, `GET .../metrics`, `POST .../dry-run`, `POST .../test-notification`
- **Reports** — Overview tab workflow KPIs (queue depth, actions applied)
- **Not shipped** — autonomous customer-visible AI replies (Phase 6)

---

## 16. Developer utilities

- **Test send message page** — `/test/send-message` for manual inbound/web testing
- **Monitoring hooks** — `server/src/utils/monitoring.js` for incoming-message telemetry
- **Vite dev proxy** — `/api` → Express when `VITE_API_URL` unset

---

## 17. Security & access control

- **Bearer JWT on protected routes**
- **Org isolation** — all workspace data scoped by `organization_id`; URL param is source of truth for org scope
- **Membership checks** — 403 when user is not an active member
- **Admin-only mutations** — invites require `team.invite` capability (ADMIN preset); org-wide analytics require `analytics.view_org`
- **Incoming ingress** — no user JWT; org ID from path + rate limit
- **Webhook/email** — channel integration resolution and optional webhook secrets
- **Service role server-only** — elevated DB access never shipped to client
- **Production error sanitization** — generic 5xx messages in production

---

## Quick reference: primary user flows

| Flow | Route / entry |
|------|----------------|
| Sign up | `/register` → `/continue` or `/invite` |
| Sign in | `/login` → `/continue` |
| Create workspace | `/onboarding` → `/org/:orgId/inbox` |
| Accept invite | `/invite?token=…` |
| Work inbox | `/org/:orgId/inbox` |
| View reports | `/org/:orgId/reports` |
| Knowledge base | `/org/:orgId/knowledge` |
| Manage teammates | `/org/:orgId/settings/teammates` |
| Configure AI & automation | `/org/:orgId/settings/ai` |
| Customer email in | `POST /api/webhooks/email` |
| Customer web message in | `POST /api/org/:orgId/messages/incoming` |

---

*For per-feature architecture, see [docs/README.md](./README.md). AI roadmap: [ai-features/AI-FEATURE-DESIGN.md](./ai-features/AI-FEATURE-DESIGN.md); shipped phases: [ai-features/README.md](./ai-features/README.md).*
