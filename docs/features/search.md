# Search

## Overview

A dedicated **Search** route exists under the org workspace with the same inbox sidebar chrome. **Sprint 0** locked scope, permissions, and API contracts; **no backend search API** ships until S1.

**Baseline (S0):** [search-infra-baseline.md](./search-infra-baseline.md) · **Sprint plan:** [search-infra-sprints.md](./sprints/search-infra-sprints.md)

## Capabilities

- Route: `/org/:orgId/search`
- Page: search input UI, placeholder copy (“UI coming soon”)
- Reuses `useInboxSidebarActions` for filter sidebar consistency

## Key files

| Layer | Path |
|-------|------|
| Page | `client/src/pages/InboxSearchPage.jsx` |
| Routes | `client/src/App.jsx` |
| Sidebar link | `client/src/components/HoverSidebar.jsx` (`path: 'search'`) |

## Planned connections

| Feature | Relationship |
|---------|----------------|
| [Support inbox](./support-inbox.md) | Would query same `conversations` / `messages` tables with full-text or RPC |
| [Multi-organization](./multi-organization.md) | Results must be scoped by `organization_id` |
| [Search infra baseline](./search-infra-baseline.md) | Scope inventory, permissions, response contracts |
| [Security & access control](./security-and-access-control.md#search-tenant-safe-before-ranking) | Tenant-safe before ranking |

## Status

**Partial** — UI shell + S0 contracts. Implement `GET .../search` (S1) + wire input before marking complete in `IMPLEMENTED-FEATURES.md`.
