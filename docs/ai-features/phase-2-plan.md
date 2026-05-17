# Phase 2 — Knowledge & Search Infrastructure

## AI Customer Support Platform — Detailed Architecture Plan

---

# Purpose of Phase 2

Phase 2 transforms the platform from:

```txt
Multi-channel customer support system
```

into:

```txt
Organization-wide searchable knowledge infrastructure
```

This phase focuses on:

* knowledge management
* retrieval systems
* search infrastructure
* organizational memory
* AI-ready context architecture

This phase DOES NOT implement:

* autonomous AI agents
* semantic vector search
* embeddings
* AI-generated customer replies
* RAG pipelines

Those belong to later phases.

---

# Primary Goals

By the end of Phase 2, the platform should support:

* Knowledge Base system
* Internal documentation
* Public support articles
* Full-text search
* Conversation tagging
* File ingestion
* Article versioning
* Chunk generation
* Retrieval abstraction layer
* Knowledge analytics
* AI-ready retrieval architecture

---

# High-Level Architecture

```txt
Organizations
      ↓
Knowledge System
      ↓
Articles / Documents / SOPs
      ↓
Versioning Layer
      ↓
Chunking Pipeline
      ↓
Search Indexing
      ↓
Retrieval Layer
      ↓
Search APIs
```

---

# Core Principles

---

# 1. Infrastructure First, AI Later

Phase 2 builds:

```txt
The Brain
```

Future phases build:

```txt
The Intelligence
```

---

# 2. Chunk-Centric Architecture

Retrieval must operate on:

```txt
knowledge_chunks
```

NOT:

```txt
full articles
```

This enables:

* future semantic retrieval
* chunk citations
* hybrid search
* RAG
* reranking

---

# 3. Event-Driven Design

Publishing knowledge should trigger:

```txt
publish
  ↓
chunk generation
  ↓
indexing
  ↓
future embeddings
```

Even if embeddings are disabled initially.

---

# 4. Tenant Isolation

Every entity must be organization-scoped.

All queries must enforce:

```txt
organization_id
```

---

# Features Included In Phase 2

---

# 1. Knowledge Base System

---

## Types of Knowledge

### Public Articles

Visible to customers later.

Examples:

* Refund Policy
* Shipping FAQ
* Password Reset Guide

---

### Internal Knowledge

Visible only to agents/admins.

Examples:

* Escalation SOP
* Enterprise handling guide
* Refund approval workflow

---

## Article Features

Each article supports:

| Feature            | Description                                              |
| ------------------ | -------------------------------------------------------- |
| Title              | Human-readable article title                             |
| Slug               | URL-safe identifier                                      |
| Visibility         | public / internal / restricted                           |
| Status             | draft / review_pending / approved / published / archived |
| Tags               | Categorization                                           |
| Versioning         | Immutable history                                        |
| Soft delete        | Audit-safe deletion                                      |
| Searchable content | Indexed chunk retrieval                                  |
| Source metadata    | Provenance tracking                                      |

---

# 2. Knowledge Search System

---

## Supported Search

Initially:

```txt
PostgreSQL Full Text Search
```

NOT semantic/vector search yet.

---

## Search Capabilities

Agents can search:

```txt
refund issue
billing duplicate
reset password
enterprise onboarding
```

System retrieves:

* relevant chunks
* articles
* SOPs
* uploaded docs

---

## Search Ranking Strategy

Search results ranked using:

```txt
ts_rank()
+ exact title boost
+ published boost
+ freshness boost
```

---

## Search Architecture

```txt
Search Query
      ↓
Retrieval Service
      ↓
Chunk-Level FTS
      ↓
Ranking Layer
      ↓
Search Results
```

---

# 3. Chunking Infrastructure

---

# Why Chunking Exists

Future AI systems retrieve:

```txt
small relevant context
```

NOT:

```txt
entire documents
```

---

# Chunking Strategy

Each article/document is split into:

```txt
500–800 token chunks
```

with:

```txt
10–15% overlap
```

---

# Example

Article:

```txt
How To Reset Password
```

Becomes:

```txt
Chunk 1:
Open account settings...

Chunk 2:
Click reset password...

Chunk 3:
Verify email...
```

---

# Chunk Metadata

Each chunk stores:

| Field        | Purpose                 |
| ------------ | ----------------------- |
| chunk_index  | Ordering                |
| content      | Searchable text         |
| token_count  | Future LLM budgeting    |
| start_offset | Precise citations       |
| end_offset   | Precise citations       |
| checksum     | Deduplication           |
| metadata     | Future extensibility    |
| content_tsv  | Full-text search vector |

---

# 4. File Ingestion System

---

# Supported Initial Formats

Phase 2 MVP:

* markdown
* txt
* optional PDF

Deferred:

* URL crawling
* recursive scraping
* DOCX pipelines

---

# Ingestion Flow

```txt
Upload File
    ↓
Extract Text
    ↓
Create Document
    ↓
Create Version
    ↓
Generate Chunks
    ↓
Index Chunks
```

---

# Source Tracking

Every ingestion source stores:

```json
{
  "fileName": "...",
  "mimeType": "...",
  "uploadedBy": "...",
  "checksum": "...",
  "sourceType": "file"
}
```

---

# Ingestion State Machine

Each source tracks:

```txt
pending
processing
processed
failed
retrying
archived
```

---

# 5. Article Versioning System

---

# Purpose

Every content change creates immutable version snapshots.

---

# Example

```txt
Refund Policy v1
Refund Policy v2
Refund Policy v3
```

---

# Benefits

* audit history
* rollback support
* AI traceability
* compliance
* debugging

---

# 6. Conversation Tagging System

---

# Important Architecture Rule

Tags belong to:

```txt
conversation
```

NOT:

```txt
customer
```

---

# Example

Conversation A:

```txt
password_reset
technical
```

Conversation B:

```txt
billing
refund
```

Same customer may have many issue types over time.

---

# Tag Types

---

## Conversation Tags

Issue-specific:

```txt
billing
technical
refund
urgent
bug
```

---

## Customer Tags

Persistent customer attributes:

```txt
VIP
enterprise
fraud_risk
premium
```

---

# Usage of Tags

Tags later power:

* AI classification
* routing
* analytics
* automations
* prioritization

---

# 7. Retrieval Abstraction Layer

---

# Purpose

Future AI systems should NOT directly depend on:

* FTS
* vector DB
* SQL search logic

---

# Service

```txt
retrieval.service.js
```

Responsibilities:

* keyword retrieval
* future semantic retrieval
* hybrid retrieval
* reranking
* permission filtering
* freshness ranking

---

# 8. Context Assembly Layer

---

# Purpose

Future AI requires:

* deduplication
* chunk merging
* token budgeting
* context compression

---

# Service

```txt
contextAssembly.service.js
```

Initially may be minimal/stubbed.

Critical for future RAG.

---

# 9. Knowledge Analytics

---

# Metrics To Track

| Metric                    | Purpose                     |
| ------------------------- | --------------------------- |
| article_views             | Usage tracking              |
| searches                  | Search volume               |
| zero_result_searches      | Missing knowledge detection |
| publish_latency           | Operational visibility      |
| stale_articles            | Maintenance                 |
| failed_ingestions         | Reliability                 |
| chunk_generation_failures | Debugging                   |

---

# 10. Security & Compliance

---

# Multi-Tenancy

Every table must include:

```txt
organization_id
```

---

# Soft Deletes

Use:

```txt
deleted_at
deleted_by
```

Never hard-delete production knowledge.

---

# RLS Policies

All access scoped via:

```txt
organization_members
```

---

# Input Protection

Validate:

* slug regex
* UUIDs
* max article size
* max chunks
* upload limits
* query length

---

# Database Design

---

# Core Tables

---

# knowledge_articles

Stores article metadata.

| Field                |
| -------------------- |
| id                   |
| organization_id      |
| title                |
| slug                 |
| visibility           |
| status               |
| published_version_id |
| source_metadata      |
| content_hash         |
| created_by           |
| deleted_at           |
| deleted_by           |
| created_at           |
| updated_at           |

---

# article_versions

Immutable content snapshots.

| Field        |
| ------------ |
| id           |
| article_id   |
| content      |
| content_hash |
| created_by   |
| created_at   |

---

# knowledge_chunks

Chunk-level retrieval unit.

| Field              |
| ------------------ |
| id                 |
| organization_id    |
| article_version_id |
| chunk_index        |
| content            |
| token_count        |
| start_offset       |
| end_offset         |
| checksum           |
| metadata           |
| content_tsv        |
| created_at         |

---

# knowledge_sources

Tracks ingestion origins.

| Field           |
| --------------- |
| id              |
| organization_id |
| type            |
| status          |
| source_metadata |
| last_synced_at  |
| created_at      |

---

# tag_definitions

Tag metadata.

| Field           |
| --------------- |
| id              |
| organization_id |
| name            |
| color           |
| created_at      |

---

# conversation_tags

Conversation-to-tag mapping.

| Field           |
| --------------- |
| conversation_id |
| tag_id          |
| created_at      |

---

# customer_tags

Customer-to-tag mapping.

| Field       |
| ----------- |
| customer_id |
| tag_id      |
| created_at  |

---

# Recommended API Structure

---

# Knowledge APIs

```txt
GET    /knowledge/articles
POST   /knowledge/articles
PATCH  /knowledge/articles/:id
GET    /knowledge/articles/:id
POST   /knowledge/articles/:id/versions
GET    /knowledge/search
POST   /knowledge/sources
POST   /knowledge/sources/:id/sync
```

---

# Tag APIs

```txt
GET    /tags
POST   /tags
PATCH  /tags/:id
DELETE /tags/:id
```

---

# Event-Driven Publish Flow

```txt
Article Published
       ↓
Create New Version
       ↓
Generate Chunks
       ↓
Create Search Index
       ↓
Emit Event
       ↓
Future Embedding Pipeline
```

---

# Background Jobs

Use worker-based async jobs for:

* ingestion
* chunk generation
* future embeddings
* indexing
* cleanup

---

# Recommended Services

| Service                    | Responsibility        |
| -------------------------- | --------------------- |
| knowledge.service.js       | CRUD                  |
| knowledgeSearch.service.js | FTS                   |
| knowledgeChunk.service.js  | Chunking              |
| knowledgeIngest.service.js | File processing       |
| retrieval.service.js       | Retrieval abstraction |
| contextAssembly.service.js | Future AI context     |
| tags.service.js            | Tag management        |

---

# UI Components

---

# New Sidebar Section

```txt
Knowledge
```

---

# Pages

| Page                | Purpose                |
| ------------------- | ---------------------- |
| Knowledge List      | Browse/search articles |
| Editor Page         | Create/edit content    |
| Drafts Page         | Unpublished work       |
| Search Page         | Knowledge retrieval    |
| Knowledge Analytics | Metrics                |

---

# What Is NOT Included In Phase 2

---

# Deferred To Phase 3+

| Feature               | Phase |
| --------------------- | ----- |
| AI reply suggestions  | 3     |
| AI classification     | 3     |
| AI copilot            | 5     |
| Embeddings            | 5     |
| Vector DB             | 5     |
| Semantic search       | 5     |
| RAG                   | 5     |
| Autonomous AI replies | 6     |

---

# Recommended Implementation Order

---

# Sprint 1

* database schema
* RLS
* article CRUD
* versioning
* chunk generation

---

# Sprint 2

* FTS search
* retrieval service
* sidebar + UI
* conversation tags

---

# Sprint 3

* file ingestion
* background jobs
* analytics
* operational hardening

---

# Final Outcome Of Phase 2

At completion, the platform becomes:

```txt
A multi-tenant searchable organizational knowledge system with AI-ready retrieval infrastructure.
```

Future AI systems will later retrieve grounded knowledge from this architecture instead of hallucinating answers.
