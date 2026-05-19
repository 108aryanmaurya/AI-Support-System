# Phase 2 — Conversation tags (shipped)

## Overview

Org-scoped **tag definitions** and **conversation tagging** for inbox organization and filtering. Supports future AI auto-tagging (Phase 3+) without schema changes.

## Capabilities

- CRUD tag definitions (ADMIN for create/update/delete)
- List tags; get/set tags on a conversation
- Inbox **tag filter** via `?tagId=` on conversation list API
- UI: `ConversationTagsPanel` on active thread; tag filter in inbox sidebar
- **Settings** — `OrgTagsSettingsPage` at `/org/:orgId/settings/tags` (create, edit, delete definitions; ADMIN mutations)
- Patch conversation accepts `tagIds` array

## Architecture

```mermaid
flowchart LR
  Inbox[InboxPage / Sidebar]
  TagsAPI[tagsApi.js]
  Routes[orgTags.routes]
  Svc[tags.service]
  DB[(tag_definitions / conversation_tags)]
  Inbox --> TagsAPI --> Routes --> Svc --> DB
```

## Key files

| Layer | Path |
|-------|------|
| Routes | `server/src/routes/orgTags.routes.js` |
| Controller | `server/src/controllers/tags.controller.js` |
| Service | `server/src/services/tags.service.js` |
| Inbox filter | `server/src/services/conversationInboxFilters.service.js` |
| Client | `client/src/services/tagsApi.js`, `client/src/components/inbox/ConversationTagsPanel.jsx`, `client/src/pages/OrgTagsSettingsPage.jsx` |
| Migration | `20260517150000_knowledge_base.sql` (tag tables in same migration) |

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/org/:orgId/tags` | Member |
| POST | `/api/org/:orgId/tags` | ADMIN |
| PATCH/DELETE | `/api/org/:orgId/tags/:tagId` | ADMIN |
| GET/PUT | `/api/org/:orgId/tags/conversations/:conversationId` | Member |

Conversations list: `GET .../conversations?tagId=<uuid>` (with existing filter params).

## Database

- `tag_definitions` — `organization_id`, name, color, optional rules JSON
- `conversation_tags` — many-to-many `conversation_id` + `tag_id`

## Connections

| Feature | Relationship |
|---------|----------------|
| [Support inbox](../features/support-inbox.md) | Filters and thread panel |
| [Phase 2 knowledge](./phase-2-knowledge-base.md) | Same Phase 2 delivery; separate concern |
| [Org AI settings](../features/org-ai-settings.md) | `auto_tag_enabled` applies LLM labels only when names match definitions here |
| [Phase 3 classification](./phase-3-sprints.md) | `ai.classify_inbound` may write `conversation_tags` when enabled |

## Status

**Shipped.** Tag definition management UI in workspace settings. AI auto-tagging applies matching definitions when `auto_tag_enabled` is on (see Phase 3).
