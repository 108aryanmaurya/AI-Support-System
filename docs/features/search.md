# Search

## Overview

A dedicated **Search** route under the org workspace supports structured inbox search (filters) and **PostgreSQL full-text search** (ranked results with highlighted snippets).

**Docs:** [S0 baseline](./search-infra-baseline.md) · [Sprint plan](./sprints/search-infra-sprints.md)

## Capabilities

- Route: `/org/:orgId/search`
- Filters: multi-select status, priority, assignee, tags, channel, date range, SLA-at-risk, entity type
- Facets: counts by status, priority, channel, assignee, tag (scoped to current query + org/inbox ACL)
- Saved searches: localStorage stub per org
- Query tokens: `status:open`, `assignee:me`, `tag:billing`, etc.
- FTS (S2): `ts_rank_cd` + freshness boost; `ts_headline` snippets with `<mark>` highlights
- Deep links: conversation/message hits open inbox thread (`?conversation=`)

## Key files

| Layer | Path |
|-------|------|
| Page | `client/src/pages/InboxSearchPage.jsx` |
| Client API | `client/src/services/searchApi.js` |
| Service | `server/src/services/search/structuredSearch.service.js` |
| FTS RPC layer | `server/src/services/search/inboxFtsSearch.service.js` |
| Advanced search | `server/src/services/search/advancedSearch.service.js` |
| Shared advanced contracts | `shared/src/advancedSearch.js` |
| Migrations | `20260608120000_inbox_search_fts.sql`, `20260609130000_inbox_search_advanced.sql` |
| Routes | `client/src/App.jsx` |
| Sidebar link | `client/src/components/HoverSidebar.jsx` (`path: 'search'`) |

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/org/:orgId/search` | Org member (`requireOrgAccess`) |
| POST | `/api/org/:orgId/search/advanced` | Org member — multi-select filters + facets |

Query params documented in [search-infra-baseline.md](./search-infra-baseline.md). Free-text `q` uses FTS when migrations are applied; structured-only queries use indexed filters.

**Advanced POST body (S3):** `query`, `status[]`, `priority[]`, `assignee[]`, `tags[]`, `channel[]`, `dateRange`, `slaAtRisk`, `aiIntent[]`, `entityType`, `includeFacets`, `page`, `pageSize`.

## Database

- `conversations.search_tsv`, `messages.search_tsv`, `customers.search_tsv` — maintained by triggers
- GIN indexes on `search_tsv`; btree filters on `organization_id` + status/priority/channel/assignee
- RPCs: `search_inbox_conversations`, `search_inbox_messages`, `search_inbox_customers`

## Planned connections

| Feature | Relationship |
|---------|----------------|
| [Support inbox](./support-inbox.md) | Queries same `conversations` / `messages` tables via FTS RPCs |
| [Multi-organization](./multi-organization.md) | Results must be scoped by `organization_id` |
| [Search infra baseline](./search-infra-baseline.md) | Scope inventory, permissions, response contracts |
| [Security & access control](./security-and-access-control.md#search-tenant-safe-before-ranking) | Tenant-safe before ranking |

## Status

**Partial** — Structured + FTS + advanced search with facets (S1–S3). CMD+K quick search and semantic retrieval ship in later sprints.
