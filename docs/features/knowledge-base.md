# Knowledge base

## Overview

Org-scoped help-center content for agents and future AI retrieval: articles, versions, full-text search, and background file ingestion. Part of **AI Phase 2** ([phase-2-knowledge-base.md](../ai-features/phase-2-knowledge-base.md)).

## Capabilities

- Article list, editor, publish, archive (ADMIN delete)
- Knowledge search (FTS on chunks)
- File import (.txt, .md, .pdf ≤ 512 KB) via automation worker
- Reports **Knowledge** tab metrics

## Architecture

See [phase-2-knowledge-base.md](../ai-features/phase-2-knowledge-base.md) for the full diagram and API table.

## Key files

| Layer | Path |
|-------|------|
| Client | `client/src/pages/OrgKnowledgeListPage.jsx`, `OrgKnowledgeEditorPage.jsx`, `knowledgeApi.js` |
| Server | `server/src/routes/orgKnowledge.routes.js`, `server/src/services/knowledge/*` |
| Worker | `knowledgeIngestSource` job handler |
| Shared | `shared/src/knowledgeArticle.js`, `knowledgeIngest.js` |

## Connections

| Feature | Relationship |
|---------|----------------|
| [Notifications](./notifications-and-automation.md) | `knowledge.ingest_source` jobs |
| [Analytics](./analytics-and-reports.md) | `GET .../analytics/knowledge` |
| [AI capabilities](./ai-capabilities.md) | Future RAG uses `retrieval.service.js` |
| [Conversation tags](./ai-features/phase-2-conversation-tags.md) | Same Phase 2 release wave |

## Status

**Complete** for manual articles, search, and file ingest (no embeddings). Inbox “related articles” not wired.
