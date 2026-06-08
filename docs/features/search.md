# Search

## Overview

A dedicated **Search** route under the org workspace supports structured inbox search (filters + basic text match). Full-text search (snippets/highlights) ships in S2.

**Docs:** [S0 baseline](./search-infra-baseline.md) · [Sprint plan](./sprints/search-infra-sprints.md)

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

**Partial** — Structured search API (S1) without FTS/snippets. Mark complete after S2 (Postgres FTS) is shipped and wired.
