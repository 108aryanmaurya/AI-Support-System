# Detailed Development Plan — Search Infrastructure

For Your AI Customer Support System

Your search system should NOT be:

> “SQL LIKE '%query%'”

It should become:

* operational inbox search
* semantic support search
* AI retrieval infrastructure
* analytics query layer
* collaboration discovery layer

The search system will become one of the core pillars of the platform.

Right now your architecture already has:

* conversations
* messages
* customers
* tags
* AI metadata
* knowledge base
* realtime
* organization isolation
* RAG groundwork



That means you already have the hard prerequisites.

---

# 1. Search System Goals

Your search infrastructure must support:

| Use Case                       | Example                                   |
| ------------------------------ | ----------------------------------------- |
| Inbox search                   | “refund issue from yesterday”             |
| Customer lookup                | “[john@gmail.com](mailto:john@gmail.com)” |
| Semantic support retrieval     | “payment failed after renewal”            |
| AI RAG retrieval               | Copilot context                           |
| Operational filtering          | SLA + tags + assignee                     |
| Analytics discovery            | “high priority unresolved billing issues” |
| Internal collaboration         | mentions/notes                            |
| Attachment/OCR search (future) | invoice screenshot                        |
| AI classification search       | intent/sentiment/language                 |

---

# 2. Production Search Architecture

You should NOT build:

* one giant SQL query

You SHOULD build:

```text
Search Infrastructure
│
├── Structured Search Layer
│   ├── PostgreSQL Full Text
│   ├── Filters
│   ├── Facets
│   └── Sorting
│
├── Semantic Search Layer
│   ├── Embeddings
│   ├── Vector Search
│   ├── Hybrid Ranking
│   └── Reranking
│
├── AI Retrieval Layer
│   ├── Context Assembly
│   ├── Knowledge Retrieval
│   ├── Conversation Retrieval
│   └── Memory Retrieval
│
├── Indexing Pipeline
│   ├── Async Jobs
│   ├── Chunking
│   ├── Deduplication
│   └── Reindexing
│
└── Search API Layer
    ├── Query Parsing
    ├── Permission Enforcement
    ├── Ranking
    └── Result Hydration
```

---

# 3. Core Search Types

You need FOUR independent search systems.

---

# Type 1 — Structured Inbox Search

For operational support workflows.

Example:

* status:open tag:billing assignee:me

This is:

* deterministic
* filter-heavy
* SQL-first

---

# Type 2 — Full Text Search

Example:

> “refund failed after payment”

Searches:

* messages
* subject
* customer metadata
* notes

---

# Type 3 — Semantic Search

Example:

> “customer charged twice”

Should also match:

* duplicate payment
* double billed
* charged two times

This powers:

* AI copilot
* smart retrieval
* advanced search

---

# Type 4 — AI Retrieval Search

Specialized search for:

* RAG
* summarization
* AI assist

Different from human search.

AI search prioritizes:

* relevance
* freshness
* grounding
* compact context

NOT UX sorting.

---

# 4. Database Search Strategy

# PHASE 1 — PostgreSQL Native Search

Start here.

Use:

* `tsvector`
* `tsquery`
* GIN indexes

DO NOT immediately adopt:

* Elasticsearch
* OpenSearch

Too early.

---

# Recommended Searchable Fields

## Conversations

```sql
subject
customer_name
customer_email
status
priority
tags
ai.intent
```

---

## Messages

```sql
content
internal_notes
attachments_text
translated_content
```

---

## Customers

```sql
name
email
company
phone
external_id
```

---

# Example Search Vector

```sql
setweight(to_tsvector(subject), 'A') ||
setweight(to_tsvector(customer_name), 'B') ||
setweight(to_tsvector(message_content), 'C')
```

---

# Required Indexes

```sql
GIN(search_vector)
GIN(tags)
BTREE(status)
BTREE(assignee_id)
BTREE(created_at)
```

Without indexes:

* inbox search dies at scale.

---

# 5. Search API Design

Your API should NOT expose raw DB queries.

Create dedicated search APIs.

---

# Recommended APIs

## Global Search

```http
GET /api/org/:orgId/search?q=refund
```

---

## Advanced Search

```http
POST /api/org/:orgId/search/advanced
```

Payload:

```json
{
  "query": "billing issue",
  "status": ["open"],
  "priority": ["high"],
  "assignee": "me",
  "tags": ["refund"],
  "dateRange": {},
  "channel": ["email"]
}
```

---

## Semantic Search

```http
POST /api/org/:orgId/search/semantic
```

---

## AI Retrieval API

Internal-only:

```http
POST /internal/retrieval/context
```

---

# 6. Permission Enforcement (Critical)

Search systems often leak data.

Your search MUST enforce:

```text
organization_id
team visibility
private conversations
sensitive threads
role permissions
```

before ranking.

NOT after retrieval.

Very important.

---

# 7. Search Ranking System

Production search is mostly:

* ranking quality

not retrieval.

---

# Ranking Signals

## Strong Signals

| Signal                   | Weight    |
| ------------------------ | --------- |
| Exact phrase             | Very High |
| Customer email match     | Very High |
| Recent activity          | High      |
| Assigned to current user | High      |
| Subject match            | High      |
| Semantic similarity      | High      |

---

## Medium Signals

| Signal          | Weight |
| --------------- | ------ |
| Tag match       | Medium |
| AI intent match | Medium |
| Mention match   | Medium |

---

## Weak Signals

| Signal                 | Weight |
| ---------------------- | ------ |
| Old messages           | Low    |
| Archived conversations | Low    |

---

# Hybrid Ranking Formula

Eventually:

```text
final_score =
 lexical_score
 + semantic_score
 + freshness_score
 + ownership_score
 + engagement_score
```

---

# 8. Semantic Search Architecture

This is where your AI platform differentiates.

---

# Embedding Pipeline

Generate embeddings for:

* conversations
* messages
* KB articles
* summaries
* internal notes

---

# Recommended Storage

Use:

* pgvector

inside PostgreSQL initially.

Perfect for your scale.

---

# Recommended Embedding Flow

```text
Message Created
    ↓
Queue Job
    ↓
Chunk Text
    ↓
Generate Embedding
    ↓
Store Vector
    ↓
Update Search Metadata
```

NEVER generate embeddings synchronously.

---

# 9. Conversation Chunking Strategy

Very important.

Do NOT embed:

* full conversations

Instead:

```text
Conversation
 ├── Summary
 ├── Last 10 messages
 ├── Resolution outcome
 ├── Important events
 └── Internal notes
```

---

# Knowledge Base Chunking

You already have KB ingest. 

Extend it.

Chunk by:

* headings
* semantic sections
* paragraph groups

NOT fixed token sizes only.

---

# 10. Search UI Architecture

You need TWO search experiences.

---

# A. Quick Search

Like:

* Intercom CMD+K
* Spotlight

Fast:

* customer lookup
* thread lookup
* recent results

---

# B. Advanced Search

With:

* filters
* saved searches
* SLA filters
* AI filters
* assignment filters

---

# Recommended Filters

| Filter     | Required |
| ---------- | -------- |
| Status     | Yes      |
| Priority   | Yes      |
| Assignee   | Yes      |
| Tags       | Yes      |
| Channel    | Yes      |
| SLA risk   | Yes      |
| AI intent  | Yes      |
| Sentiment  | Later    |
| Date range | Yes      |

---

# 11. AI Retrieval Infrastructure

Your AI system will eventually depend heavily on search.

---

# AI Context Retrieval Sources

| Source                | Purpose             |
| --------------------- | ------------------- |
| Current conversation  | Immediate context   |
| Past customer threads | Historical memory   |
| Knowledge base        | Grounding           |
| Similar conversations | Resolution examples |
| Internal notes        | Escalation context  |

---

# Retrieval Pipeline

```text
User asks question
      ↓
Classify query
      ↓
Search KB
      ↓
Search Similar Threads
      ↓
Rerank
      ↓
Assemble Context
      ↓
Token Budget Optimization
      ↓
LLM
```

---

# 12. Similar Conversation Search

This is HIGH VALUE.

Example:

> “show similar refund escalations”

This becomes:

* agent copilot
* AI resolution guidance
* analytics intelligence

Store:

* resolution summaries
* outcomes
* escalation patterns

---

# 13. Search Performance Architecture

# Required

---

## Debounced Queries

Frontend:

* 250–400ms debounce

---

## Incremental Loading

Never return:

* entire thread bodies immediately

Return:

* previews/snippets first

---

## Cached Filters

Cache:

* counts
* facets
* common queries

---

## Async Reindexing

When:

* tags change
* assignments change
* AI metadata changes

---

# 14. Production Search Challenges

---

# Challenge 1 — Permission Leaks

Most dangerous.

Search results must NEVER expose:

* hidden conversations
* restricted notes
* private teams

---

# Challenge 2 — Ranking Quality

Poor ranking makes search useless.

---

# Challenge 3 — Semantic Noise

Embeddings can retrieve:

* irrelevant conversations

Need:

* reranking
* metadata filtering

---

# Challenge 4 — Large Threads

Support conversations become huge.

Need:

* summaries
* chunking
* archival indexing

---

# Challenge 5 — Realtime Consistency

Messages should appear searchable quickly.

Target:

* under 5 seconds indexing latency

---

# 15. Recommended Technical Stack

# NOW

Use:

| Component         | Tech                     |
| ----------------- | ------------------------ |
| Structured search | PostgreSQL FTS           |
| Vector search     | pgvector                 |
| Queue             | Existing automation jobs |
| Cache             | Redis                    |
| Embeddings        | OpenAI/Gemini            |
| Ranking           | App-layer scoring        |

---

# LATER

Move to:

| Component           | Tech            |
| ------------------- | --------------- |
| Search engine       | OpenSearch      |
| Vector DB           | Qdrant/Pinecone |
| Reranking           | Cross-encoder   |
| Query understanding | LLM             |

ONLY after scale requires it.

---

# 16. Recommended Development Phases

# Phase 1 — Basic Search

Build:

* conversation search
* customer search
* filters
* PostgreSQL FTS

Goal:
usable inbox search.

---

# Phase 2 — Advanced Inbox Search

Add:

* tags
* SLA filters
* AI intent filters
* saved searches
* snippets/highlighting

---

# Phase 3 — Semantic Search

Add:

* pgvector
* embeddings
* hybrid retrieval
* semantic ranking

---

# Phase 4 — AI Retrieval Layer

Add:

* context assembly
* reranking
* similar conversations
* AI memory retrieval

---

# Phase 5 — Enterprise Search

Add:

* OCR
* attachments
* multilingual search
* federated search
* analytics discovery

---

# 17. What NOT To Do

Avoid:

* Elasticsearch too early
* synchronous embeddings
* storing full threads as one vector
* unrestricted semantic search
* AI-only retrieval
* giant SQL joins for everything

---

# Final Recommendation

Your search infrastructure should become:

```text
Operational Inbox Engine
+
Semantic Retrieval Engine
+
AI Context Infrastructure
```

---

# Implementation status

Sprint breakdown and exit criteria: [search-infra-sprints.md](./sprints/search-infra-sprints.md).

| Sprint | Status | Doc |
|--------|--------|-----|
| S0 — Baseline + contracts | **Complete** (2026-06-07) | [search-infra-baseline.md](./search-infra-baseline.md) |
| S1 — Structured search API | **Complete** (2026-06-07) | [search.md](./search.md) |
| S2 — Postgres FTS | **Complete** (2026-06-08) | `20260608120000_inbox_search_fts.sql` |
| S3+ | Not started | — |

Shared contracts: `shared/src/searchContracts.js`. FTS service: `server/src/services/search/inboxFtsSearch.service.js`.