# Search infrastructure — Sprint 0 baseline

Parent: [search-infra-sprints.md](./sprints/search-infra-sprints.md) | [search-infra.md](./search-infra.md)

**Status:** Sprint 0 complete (2026-06-07). Next: [S1 structured search API](./sprints/search-infra-sprints.md#s1--structured-search-query-parser--org-search-api-no-fts-yet).

---

## Sprint 0 checklist

| Item | Status | Evidence |
|------|--------|----------|
| Search scope inventory | Done | Tables below (entities + DB columns) |
| Permission model documented | Done | [Permission model](#permission-model) + [security-and-access-control.md](./security-and-access-control.md#search-tenant-safe-before-ranking) |
| API response contracts | Done | `@ai-support/shared` → `searchContracts.js`; shapes in [API contracts](#api-response-contracts) |
| Fail-safe degradation shape | Done | `searchUnavailableShape()` when FTS/index tables missing |
| Sprint plan exit criteria | Done | This doc + security cross-link |

---

## Search scope inventory

Operational inbox search covers **three entity types**. Knowledge base search stays on the existing `GET .../knowledge/search` path ([knowledge-base.md](./knowledge-base.md)).

### Conversations

| Field / source | Search use | DB location |
|----------------|------------|-------------|
| Subject | Lexical (high weight) | `conversations.subject` |
| Customer name / email | Lexical + exact match boost | join `customers` |
| Status, priority | Structured filters | `conversations.status`, `conversations.priority` |
| Assignee | Structured filter (`assignee:me`) | `conversations.assigned_to_member_id` |
| Assignment queue | Structured filter | `conversations.assignment_type` |
| Tags | Structured filter | `conversation_tags` → `tag_definitions` |
| Channel | Structured filter | `conversations.channel_type` |
| Inbox | Visibility gate (not public filter in S0) | `conversations.inbox_id` |
| AI intent / sentiment | Advanced filter (S3+) | `conversations.metadata.ai` via `parseConversationMetadataAi` |
| Activity / freshness | Ranking signal (S2+) | `conversations.last_message_at`, `created_at` |

### Messages

| Field / source | Search use | DB location |
|----------------|------------|-------------|
| Body content | Lexical | `messages.content` |
| Internal notes | Lexical (permission-gated snippets) | `messages` where `sender_type = 'internal_note'` |
| Sender type | Exclusion / badge | `messages.sender_type` |
| Parent thread | Hydration id only | `messages.conversation_id` |

Attachment OCR / translated content are **out of scope** until a later sprint.

### Customers

| Field / source | Search use | DB location |
|----------------|------------|-------------|
| Name, email, phone | Lexical + exact email boost | `customers.name`, `email`, `phone` |
| External id | Structured lookup | `customers.external_id` |
| Type | Filter (optional) | `customers.customer_type` (`USER` \| `LEAD`) |

---

## Permission model

All search HTTP routes mount under **`/api/org/:orgId/search*`** with:

1. **`requireAuth`** — valid Supabase JWT.
2. **`requireOrgAccess`** — `organization_id` from **URL param only** (never body/query override). Sets `req.orgId`, `req.orgMembership`, `req.orgPermissions`.

### Tenant-safe before ranking

Every search query MUST apply these filters **in SQL/RPC before** `ts_rank`, vector distance, facets, or snippet generation:

| Layer | Rule | Implementation reference |
|-------|------|---------------------------|
| Org tenancy | `organization_id = :orgId` | All search services |
| Inbox visibility | Member may only see conversations in accessible inboxes | `listAccessibleInboxIds`, `canAccessInboxId` in `inboxAccess.service.js` |
| Conversation list (future S7) | Honor `conversations.view_all` when restricting assignee-scoped lists | `orgPermissions.js` — agents default `view_all: true` until team ACLs |
| Internal notes | Omit or redact `internal_note` snippets unless `messages.internal_note` | Same as inbox message list policy |
| KB (separate API) | Org-scoped RPC `search_knowledge_chunks` | `knowledgeSearch.service.js` |

Internal retrieval (`POST /internal/retrieval/context`, S7) uses service role + explicit `organizationId` in body; still org-scoped.

### Capabilities (S0 — no new permission keys)

Search reuses existing org capabilities:

| Capability | Effect on search (when enforced) |
|------------|----------------------------------|
| `conversations.view_all_inboxes` | See results across all active inboxes vs member inboxes only |
| `messages.internal_note` | Include internal-note snippets in message hits |
| `analytics.view_org` | Reserved for org-wide search analytics export (S8+) |

Dedicated `search.*` permission keys are deferred until team/VIP visibility (RBAC Sprint 7).

---

## API response contracts

Implemented in server handlers starting **S1**; constants and validators live in shared code now.

### Error shape

```json
{ "error": "Human-readable message", "code": "invalid_input" }
```

Codes: `invalid_input`, `forbidden`, `unavailable`, `rate_limited` — see `SEARCH_ERROR_CODES`.

### Unavailable (missing migrations / FTS)

```json
{
  "available": false,
  "error": "Search is not available. Apply database migrations.",
  "code": "unavailable"
}
```

HTTP **503** when index/RPC missing; generic **500** in production for unexpected failures.

### List success shape (`GET .../search`, S1+)

```json
{
  "available": true,
  "query": "refund",
  "results": [
    {
      "entityType": "conversation",
      "entityId": "uuid",
      "conversationId": "uuid",
      "title": "Billing question",
      "snippet": "...refund...",
      "rank": 0.82,
      "matchedFields": ["subject", "customer_email"],
      "metadata": {
        "status": "open",
        "priority": "high",
        "channelType": "email",
        "assignedToMemberId": "uuid"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "hasMore": true
  }
}
```

### Pagination

- Query params: `page` (1-based, max 100), `pageSize` (default 20, max 50).
- Helpers: `normalizeSearchPagination`, `SEARCH_LIMITS` in `@ai-support/shared`.
- Cursor pagination may be added in S3 for deep result sets; page-based is the S1 default.

### Input bounds

| Input | Limit |
|-------|-------|
| Free-text `q` | 200 chars (`normalizeSearchQuery`) |
| Structured enums | Must match shared constants (`CONVERSATION_STATUSES`, `SEARCH_CHANNEL_TYPES`, etc.) |
| Request body | Existing Express 1mb cap |

---

## Key files (S0)

| Layer | Path |
|-------|------|
| Contracts | `shared/src/searchContracts.js` |
| Tests | `shared/src/searchContracts.test.js` |
| Inbox access (visibility) | `server/src/services/inboxAccess.service.js` |
| Org middleware | `server/src/middleware/orgAccess.js` |
| KB search (reference) | `server/src/services/knowledge/knowledgeSearch.service.js` |
| Sprint plan | `docs/features/sprints/search-infra-sprints.md` |

---

## Connections

| Feature | Relationship |
|---------|----------------|
| [security-and-access-control.md](./security-and-access-control.md) | Tenant-safe before ranking constraint |
| [support-inbox.md](./support-inbox.md) | Same conversation/message tables and inbox filters |
| [search.md](./search.md) | UI shell; wires to S1 API |
| [knowledge-base.md](./knowledge-base.md) | Separate FTS for articles/chunks |

---

## Gate sign-off (before S1)

- [ ] Team reviewed scope inventory and API contracts in this doc
- [ ] Shared package exports search contracts (`npm test` in `shared/`)
- [ ] No search route mounted yet (S1 adds `GET .../search`)
