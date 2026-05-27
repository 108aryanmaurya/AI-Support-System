# Search infrastructure — Implementation sprints

Production-grade **operational search + semantic retrieval + AI context search**, scoped per-organization and safe under real inbox traffic.

**Parent doc:** `docs/features/search-infra.md` (detailed plan and rationale)

**This doc:** a concrete “ship it” plan split into sprints with exit criteria.

**Last updated:** 2026-05-27

---

## Product stance (guardrails)

- **Start with Postgres**: PostgreSQL Full Text Search (FTS) + indexes first. No OpenSearch/Elastic until proven necessary.
- **Org isolation first**: every query is filtered by `organization_id` *before* ranking and hydration.
- **Don’t block request threads**: embeddings and indexing run asynchronously (worker + `automation_jobs`).
- **Return previews first**: search returns snippets and identifiers; hydrate full threads on-demand.
- **Fail safe**: if search tables/indexes are missing, endpoints degrade with a clear `{ error }` / `{ available: false }` shape.

---

## Sprint overview

```mermaid
flowchart LR
  S0[S0 Baseline + contracts]
  S1[S1 Structured query parser + API]
  S2[S2 Postgres FTS for conversations/messages]
  S3[S3 Advanced filters + facets + highlights]
  S4[S4 UI: quick search + advanced search]
  S5[S5 Indexing pipeline + reindex jobs]
  S6[S6 Semantic search (pgvector + embeddings)]
  S7[S7 AI retrieval endpoints (context assembly)]
  S8[S8 Hardening: perf, audit, tests, docs]

  S0 --> S1 --> S2 --> S3 --> S4
  S2 --> S5
  S5 --> S6 --> S7 --> S8
  S3 --> S8
  S4 --> S8
```

---

## S0 — Baseline, constraints, and contracts

**Goal:** lock down scope, API shapes, and correctness constraints so later sprints don’t churn.

**Deliverables**

- **Search scope inventory**
  - Entities: conversations, messages, customers *(KB search can follow existing KB infra)*.
  - Fields: subject/customer identifiers/status/priority/tags/assignee/channel, message content, internal notes.
- **Permission model**
  - Enforce `organization_id` always.
  - Respect existing RBAC/capabilities (ex: org-wide search/report visibility if required later).
- **API response contracts** (documented; implemented in S1+)
  - Stable error shape: `{ error: string, code?: string }`
  - Pagination: `page/pageSize` or cursor, consistent across endpoints.
  - Result types: `conversation`, `message`, `customer` (with `entityId`, `title`, `snippet`, `rank`, `matchedFields`).

**Exit**

- [ ] `search-infra-sprints.md` agreed by team.
- [ ] “Tenant-safe before ranking” constraint documented in `security-and-access-control.md` (or linked).

---

## S1 — Structured search: query parser + org search API (no FTS yet)

**Goal:** ship a safe, deterministic search endpoint that supports operational filters.

**Backend**

- `GET /api/org/:orgId/search`
  - Accept `q` and structured params (status, priority, assignee, tags, channel, date range).
  - Implement strict input bounds (max query length, enum validation, page size caps).
  - Always scope by `organization_id` and membership.
- Query parsing for tokens like:
  - `status:open`, `priority:high`, `tag:billing`, `assignee:me`, `channel:email`

**Client**

- Basic “Search” page uses the endpoint with filters (no global CMD+K yet).

**Exit**

- [ ] Can search by structured filters without scanning full tables (indexes in S2 help).
- [ ] 400/403 behavior consistent and documented.

---

## S2 — PostgreSQL FTS (lexical): conversations + messages

**Goal:** fast “type a phrase” search using Postgres FTS + proper indexes.

**Database**

- Add/extend FTS vectors:
  - Conversations: subject + customer identifiers + selected metadata.
  - Messages: content + internal note content (if stored in same table) + normalized variants.
- GIN indexes on vectors and key filters:
  - `(organization_id, created_at)`; `status`; `assigned_to_member_id`; `priority`; `channel_type`; tags join/index where applicable.

**Backend**

- Ranking: `ts_rank_cd` (or similar) + freshness signal.
- Snippets/highlights: `ts_headline` for preview text.
- Ensure message search results hydrate “parent conversation” identifiers (without pulling whole thread).

**Exit**

- [ ] Typical query latency is stable under load for orgs with large message volume (local benchmark).
- [ ] Results return snippets and allow deep-linking to conversation/thread.

---

## S3 — Advanced search: facets, saved filters, and ranking signals

**Goal:** make search useful in real support workflows: filters + facets + better ranking.

**Backend**

- `POST /api/org/:orgId/search/advanced`
  - JSON payload for complex filters (multi-select, date range, AI intent, SLA risk where available).
- Facets (optional first pass):
  - counts by status, priority, channel, assignee, tags (within current query scope).
- Ranking improvements:
  - boost customer email exact match, subject match, recent activity, “assigned to me”.

**Client**

- Advanced search form UI with chips/multi-select; “Save search” stub (localStorage first, server later).

**Exit**

- [ ] Advanced search supports: status, priority, assignee, tags, channel, date range.
- [ ] Facet counts match results scope (no leakage across org or filters).

---

## S4 — UX: quick search (CMD+K) + search results experience

**Goal:** two experiences: **Quick search** (Spotlight-like) + **Advanced search** (filters).

**Client**

- Quick search modal:
  - Debounced (250–400ms) requests.
  - Recent searches + recent results.
  - Keyboard navigation + enter-to-open conversation.
- Results UX:
  - Show entity type badge (Conversation/Message/Customer)
  - Snippet highlighting
  - “Open in inbox” deep link

**Exit**

- [ ] CMD+K (or `/search`) is usable for daily operations.
- [ ] Search results do not fetch full thread bodies by default.

---

## S5 — Indexing pipeline (async), reindex jobs, and consistency

**Goal:** make search stay correct as data changes.

**Backend**

- Index update triggers:
  - message created → update message search vector row / index.
  - conversation updated (tags/assignee/status/AI metadata) → update conversation search row / index.
- Reindex:
  - `/internal/search/reindex` (admin/internal-only) to backfill or rebuild per org.
  - Use `automation_jobs` with idempotency keys and progress tracking.
- Latency target:
  - new messages searchable within ~5 seconds in normal conditions.

**Exit**

- [ ] Reindex can run without blocking API, and is resumable after failures.
- [ ] Search reflects tag/assignee changes reliably.

---

## S6 — Semantic search (pgvector): hybrid retrieval

**Goal:** semantic matching (“charged twice” ≈ “double billed”) with safe metadata filtering.

**Database**

- pgvector setup + embedding tables for:
  - knowledge chunks (if not already present),
  - conversation summaries / key message chunks,
  - message chunks (optional; start with recent/top messages).

**Backend**

- `POST /api/org/:orgId/search/semantic`
  - embed query (async caching optional) → vector search → apply metadata filters (`organization_id`, status, channel, etc.)
  - hybrid ranking: lexical + semantic + freshness signals
- Embedding pipeline:
  - background job per new message/conversation summary update.

**Exit**

- [ ] Semantic search never returns cross-org results (enforced pre-ranking).
- [ ] Embeddings are never generated synchronously in request handlers.

---

## S7 — AI retrieval layer: context assembly APIs

**Goal:** AI-oriented retrieval that returns compact, grounded context (not UX-ranked lists).

**Backend (internal)**

- `POST /internal/retrieval/context`
  - Inputs: `organizationId`, `conversationId`, `question`, token budget.
  - Retrieve sources:
    - current conversation (recent messages + summary),
    - past customer threads (top K),
    - knowledge chunks (top K),
    - similar resolved conversations (top K)
  - Rerank + dedupe + budget trimming.

**Exit**

- [ ] Context output is deterministic and bounded (hard token/character limits).
- [ ] Logged/observable retrieval decisions (counts, latency), without leaking PII in logs.

---

## S8 — Hardening: performance, safety, auditability, tests, docs

**Goal:** production-readiness.

**Backend**

- Rate limits for costly endpoints (semantic / retrieval).
- Caching (Redis) for hot queries and facet counts (bounded TTL).
- Observability:
  - structured logs with `organization_id`, query latency, result counts.
  - optional `support_events` for search usage (aggregate-safe).

**Client**

- Loading/empty/error states polished for quick + advanced search.
- Permissions-aware UI if/when search visibility is restricted by role/capability.

**Tests**

- Unit tests for query parsing and input bounds.
- Integration tests:
  - org isolation (no cross-org leakage),
  - pagination correctness,
  - highlight/snippet shape.

**Docs**

- Update `docs/features/search-infra.md` with “Status” per sprint and key file pointers.
- Update `docs/IMPLEMENTED-FEATURES.md` inventory when search ships.

**Exit**

- [ ] Load tested for large orgs (at least locally with synthetic data).
- [ ] Search does not leak restricted data via snippets/highlights.

---

## Status

| Sprint | Status |
|--------|--------|
| S0 — Baseline + contracts | Not started |
| S1 — Structured search API | Not started |
| S2 — Postgres FTS | Not started |
| S3 — Advanced filters/facets | Not started |
| S4 — UX quick + advanced search | Not started |
| S5 — Indexing + reindex jobs | Not started |
| S6 — Semantic search (pgvector) | Not started |
| S7 — AI retrieval context APIs | Not started |
| S8 — Hardening | Not started |

