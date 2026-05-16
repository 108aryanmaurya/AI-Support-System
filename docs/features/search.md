# Search

## Overview

A dedicated **Search** route exists under the org workspace with the same inbox sidebar chrome, but **no backend search API** is implemented yet.

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

## Status

**Partial** — UI shell only. Implement server search + wire input before marking complete in `IMPLEMENTED-FEATURES.md`.
