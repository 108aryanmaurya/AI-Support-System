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

- **Create invite** — `POST /api/org/:orgId/invite` (ADMIN)
- **Batch invites** — `POST /api/org/:orgId/invites/batch` (ADMIN)
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
  - Closed
- **Filter counts** — `GET .../conversations/counts`
- **Conversation workspace fields**
  - Status: `open`, `pending`, `waiting_customer`, `resolved`, `closed`, `spam`
  - Priority: `low`, `medium`, `high`, `urgent`
  - Assignment type: `unassigned`, `assigned_to_agent`, `assigned_to_team`, `assigned_to_ai`
- **Inbox UI** (`InboxPage`) — conversation list, thread view, composer, status/priority/assignee controls
- **Inbox state (client)** — Zustand `inboxStore` (conversations, filters, typing, mention cues)
- **Filter caching & debounced refetch** — faster sidebar switching
- **Periodic HTTP sync** — backup when realtime is quiet
- **Auto-assign on select** — optional: assign conversation to current agent when opened from unassigned queue
- **One open conversation per customer** — DB constraint for email/web threads
- **Active thread index / RPC helpers** — migrations for performant inbox queries

---

## 7. Messages & composer

- **Message sender types** — `customer`, `agent`, `system`, `ai`, `internal_note`
- **Agent outbound send** — insert `pending` row → channel send → `sent` or `failed` on same row
- **Dedicated send endpoint** — `POST /api/org/:orgId/messages/send`
- **Generic message create** — `POST /api/org/:orgId/messages` (supports internal notes, metadata)
- **Internal notes** — distinct styling; not customer-visible
- **@Mentions**
  - Parse `@handle` in message content
  - Resolve to member user IDs
  - Store on `conversations.metadata` for “Mentions” filter
  - Highlight mentions in message bubbles
  - Realtime “mention cue” on sidebar
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

- **Inbound email webhook** — `POST /api/webhooks/email`
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
  - `notify.staff_inbound` — email staff when customer messages (with sync fallback if enqueue fails)
  - `notify.assignment` — email assignee on conversation assignment
  - `sla.scan_org` — detect first-response SLA breaches per org
- **Org automation settings** — JSON in `organizations.settings.automation` (SLA minutes, notify toggles); editable in AI settings UI
- **Internal notification email** — optional Resend via `NOTIFICATION_RESEND_API_KEY` / `NOTIFICATION_EMAIL_FROM`
- **Cron trigger** — `POST /api/internal/cron/sla-scan` (protected by `x-automation-cron-secret`)
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
- **Reports UI** (`/org/:orgId/reports`)
  - Tabs: Overview, Conversations, Team, AI
  - KPI grid, line chart, breakdown bars
  - Date range selection
  - AI tab shows “not configured” when no `ai_runs` data

---

## 12. Settings & workspace navigation

- **Hover sidebar** — Inbox, Reports, Search, Settings; expandable labels
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

## 14. AI capabilities

*(Mostly infrastructure and UI placeholders — no LLM provider integrated.)*

- **Org AI settings API + UI** — master AI switch, phase toggles (assist, auto-tag, auto-route, autonomous), default `conversations.ai_enabled`, model tier placeholder
- **`conversations.ai_enabled`** — set on create from org default; patchable on conversation update; blocks `assigned_to_ai` when org AI off
- **AI API stub** — `POST /api/ai/assist` returns placeholder JSON
- **Database hooks (unused by app logic)**
  - `conversations.ai_enabled`
  - `messages.is_ai_generated`, `messages.parent_message_id`
  - `messages.sender_type = 'ai'`
  - `conversations.assignment_type = 'assigned_to_ai'`
- **Inbox UI** — Copilot tab label; AI message bubble styling; assign-to-AI in assignment controls *(partial: no model worker)*
- **Sidebar** — “Fin AI Agent”, “Knowledge” nav items *(no routes / pages)*
- **Analytics AI tab** — reads `ai_runs` when present; otherwise shows setup message

---

## 15. Developer utilities

- **Test send message page** — `/test/send-message` for manual inbound/web testing
- **Monitoring hooks** — `server/src/utils/monitoring.js` for incoming-message telemetry
- **Vite dev proxy** — `/api` → Express when `VITE_API_URL` unset

---

## 16. Security & access control

- **Bearer JWT on protected routes**
- **Org isolation** — all workspace data scoped by `organization_id`; URL param is source of truth for org scope
- **Membership checks** — 403 when user is not an active member
- **Admin-only mutations** — invites, batch invites
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
| Manage teammates | `/org/:orgId/settings/teammates` |
| Configure AI & automation | `/org/:orgId/settings/ai` |
| Customer email in | `POST /api/webhooks/email` |
| Customer web message in | `POST /api/org/:orgId/messages/incoming` |

---

*For per-feature architecture and cross-feature connections, see [docs/](./docs/). For the AI roadmap, see [AI-FEATURE-DESIGN.md](./AI-FEATURE-DESIGN.md).*
