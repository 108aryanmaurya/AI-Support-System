# Phase 3 — AI Agent Assistance (Detailed Production Plan)

This phase converts your inbox from a standard support system into an AI-assisted agent workspace without allowing autonomous AI-to-customer communication.

Core principle:

> AI assists agents. AI does not act as an agent.

No direct AI customer sends in this phase.

---

# 1. Phase 3 Objectives

Phase 3 should deliver:

* AI-generated reply suggestions
* Thread summarization
* Translation
* Tone rewriting
* Intent detection
* Sentiment analysis
* Auto-tagging
* AI observability + audit trails
* AI-safe architecture for future autonomous phases

---

# 2. High-Level Architecture

```text
Frontend (Inbox + Copilot)
        |
        v
Express AI Routes
        |
        v
AI Orchestration Layer
(assist.service.js)
        |
        +------> Context Builder
        |
        +------> Prompt Templates
        |
        +------> RAG Retrieval (optional)
        |
        +------> LLM Provider Client
        |
        +------> AI Run Logger
        |
        v
OpenAI / Compatible LLM
```

---

# 3. Recommended Phase 3 Folder Structure

## Server

```text
server/src/services/ai/
│
├── llm.client.js
├── ai.constants.js
├── ai.errors.js
├── ai.guardrails.js
│
├── prompts/
│   ├── suggestReply.js
│   ├── summarize.js
│   ├── translate.js
│   ├── rewrite.js
│   ├── classify.js
│
├── context/
│   ├── conversationContext.js
│   ├── customerContext.js
│   ├── organizationContext.js
│   ├── knowledgeContext.js
│
├── parsers/
│   ├── suggestion.parser.js
│   ├── classification.parser.js
│
├── services/
│   ├── assist.service.js
│   ├── summary.service.js
│   ├── translation.service.js
│   ├── rewrite.service.js
│   ├── classification.service.js
│
├── jobs/
│   ├── classifyInbound.job.js
│
└── utils/
    ├── tokenBudget.js
    ├── sanitizeMessages.js
    ├── truncateConversation.js
    ├── markdownCleaner.js
    └── piiFilter.js
```

---

# 4. Frontend Architecture

## Inbox AI Integration Zones

```text
Inbox Layout
├── Conversation Thread
├── Composer
│   ├── Suggest Reply Button
│   ├── Translate
│   ├── Rewrite Tone
│   └── AI Actions
│
└── Copilot Sidebar
    ├── Thread Summary
    ├── Suggested Replies
    ├── Intent
    ├── Sentiment
    ├── Suggested Tags
    └── AI Run Metadata
```

---

# 5. Database Changes

---

## A. ai_runs Table

You already planned this.

Recommended schema:

```sql
create table ai_runs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  conversation_id uuid,
  message_id uuid,

  feature text not null,
  model text not null,

  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,

  latency_ms integer,

  status text not null,
  error text,

  request jsonb,
  response jsonb,

  correlation_id text,

  created_by uuid,
  created_at timestamptz default now()
);
```

---

## B. conversations.metadata

Store lightweight AI classification data.

Example:

```json
{
  "intent": "billing_issue",
  "sentiment": "negative",
  "priority_score": 0.88,
  "language": "en",
  "auto_tags": ["refund", "urgent"]
}
```

Do NOT create separate tables for simple classification metadata initially.

JSONB is enough.

---

## C. messages additions

```sql
alter table messages
add column is_ai_generated boolean default false;

alter table messages
add column ai_run_id uuid;
```

Optional:

```sql
add column ai_confidence numeric;
```

---

# 6. AI Feature Breakdown

---

# 6.1 Suggest Reply

This is the most important feature.

---

## Endpoint

```http
POST /api/org/:orgId/ai/suggest-reply
```

---

## Request

```json
{
  "conversationId": "uuid",
  "tone": "professional",
  "length": "medium"
}
```

---

## Backend Flow

```text
1. Validate org access
2. Load conversation
3. Load latest messages
4. Load customer info
5. Load org AI settings
6. Optional RAG retrieval
7. Build prompt
8. Call LLM
9. Parse result
10. Log ai_runs
11. Return structured response
```

---

## Context Assembly Rules

### Include

* Last 10–20 messages
* Sender labels
* Channel type
* Customer name
* Existing tags
* Organization tone rules
* Knowledge snippets (optional)

### Exclude

* Internal notes
* Hidden system events
* Raw HTML emails
* Attachments initially

---

## Prompt Design

Prompt quality will determine product quality.

---

## Recommended Structure

```text
SYSTEM:
You are an AI support assistant helping a human support agent.
You never claim to be the customer support representative.
You produce concise and accurate drafts.

RULES:
- Never fabricate policies
- Never promise refunds
- Never mention AI
- Maintain professional tone
- If uncertain, ask for clarification

CONTEXT:
Organization style guide...
Customer issue...
Conversation history...

TASK:
Generate a reply draft for the human support agent.
```

---

## Response Format

Always force structured JSON.

```json
{
  "reply": "...",
  "confidence": 0.91,
  "detected_language": "en"
}
```

Never trust raw LLM text blindly.

---

# 6.2 Summarization

---

## Endpoint

```http
POST /api/org/:orgId/ai/summarize
```

---

## Summary Types

You should support:

| Type     | Purpose             |
| -------- | ------------------- |
| Short    | Inbox preview       |
| Detailed | Agent handoff       |
| Timeline | Escalation analysis |

---

## Output Example

```json
{
  "summary": {
    "issue": "Customer unable to reset password",
    "actions_taken": [
      "Password reset link resent",
      "Customer cleared cache"
    ],
    "current_status": "Awaiting customer response"
  }
}
```

Structured summaries are far superior to plain text.

---

# 6.3 Translation

---

## Endpoint

```http
POST /api/org/:orgId/ai/translate
```

---

## Request

```json
{
  "text": "...",
  "targetLanguage": "English"
}
```

---

## Important

Do NOT auto-send translated text.

Agent must approve.

---

# 6.4 Tone Rewrite

---

## Endpoint

```http
POST /api/org/:orgId/ai/rewrite
```

---

## Supported Tones

```text
- Professional
- Friendly
- Empathetic
- Concise
- Formal
- Escalation-safe
```

---

## Important

Preserve factual meaning.

Never allow the model to invent details.

---

# 6.5 Intent Classification

This should run automatically on inbound customer messages.

---

## Trigger Points

```text
- emailWebhook.service.js
- chat webhook
- messages.controller.js
```

---

## Recommended Architecture

Do NOT block inbound processing on AI.

Use async jobs.

---

## Flow

```text
Inbound message
    |
    v
Store message
    |
    v
Queue classification job
    |
    v
LLM classification
    |
    v
Update conversation metadata
```

---

# 6.6 Sentiment Analysis

Store:

```json
{
  "sentiment": "negative",
  "score": 0.82
}
```

---

## Recommended Labels

```text
positive
neutral
negative
frustrated
angry
urgent
```

---

# 6.7 Auto-Tagging

Example:

```json
[
  "refund",
  "billing",
  "password-reset",
  "shipping-delay"
]
```

These become inbox filters later.

---

# 7. AI Safety & Guardrails

This is mandatory.

---

# 7.1 Prompt Injection Protection

Never pass raw customer text directly into instructions.

Separate:

```text
SYSTEM
USER CONTEXT
CUSTOMER MESSAGE
```

Never merge them.

---

# 7.2 Hallucination Prevention

The model must:

* Avoid policy claims
* Avoid refund promises
* Avoid legal commitments
* Ask for clarification if unsure

---

# 7.3 Data Privacy

Before sending to LLM:

Remove:

* passwords
* auth tokens
* credit cards
* API keys

Implement:

```text
piiFilter.js
```

---

# 7.4 Token Budgeting

Large conversations will explode costs.

Implement:

```text
truncateConversation.js
```

Strategy:

```text
- Keep recent messages
- Keep summarized older context
- Drop noise/system events
```

---

# 8. LLM Client Design

---

# llm.client.js

Responsibilities:

* retries
* timeout
* provider abstraction
* streaming support
* telemetry
* model fallback
* JSON-mode enforcement

---

## Recommended Shape

```js
generateCompletion({
  model,
  systemPrompt,
  userPrompt,
  temperature,
  maxTokens,
  responseFormat
})
```

---

# 9. AI Provider Strategy

Do NOT tightly couple to OpenAI.

Abstract provider layer now.

---

## Recommended Interface

```text
OpenAI
Anthropic
Gemini
OpenRouter
Azure OpenAI
Local Ollama
```

Future-proof now.

---

# 10. Streaming Suggestions

Strongly recommended.

---

## Why

Agents perceive:

```text
300ms streamed response
```

as faster than:

```text
4 second blocking response
```

---

## Suggested Stack

```text
Server:
SSE or WebSockets

Client:
Streaming markdown renderer
```

---

# 11. AI Observability

Critical for production.

---

# Track Per Feature

| Metric                | Why           |
| --------------------- | ------------- |
| Latency               | UX            |
| Tokens                | Cost          |
| Acceptance rate       | Quality       |
| Rewrite frequency     | AI usefulness |
| Failure rate          | Reliability   |
| Hallucination reports | Safety        |

---

# 12. AI Acceptance Analytics

Track whether agents:

* accepted suggestion
* edited suggestion
* rejected suggestion

This becomes your future AI training signal.

---

## Suggested Table

```sql
ai_feedback
```

```sql
create table ai_feedback (
  id uuid primary key default gen_random_uuid(),

  ai_run_id uuid not null,
  accepted boolean,
  edited boolean,

  final_message text,

  created_at timestamptz default now()
);
```

---

# 13. Recommended AI Queue Architecture

By Phase 3 scale, synchronous AI calls become dangerous.

Use queues for:

* classification
* summaries
* retries
* embeddings
* batch AI operations

---

## Recommended

```text
BullMQ + Redis
```

---

# 14. Suggested Rate Limits

Per org:

```text
suggest-reply: 30/min
rewrite: 60/min
translate: 60/min
summary: 20/min
classification: async queue
```

---

# 15. Frontend UX Recommendations

---

# AI Suggestion UX

Avoid:

```text
"Generate"
```

Prefer:

```text
"Suggest Reply"
```

---

# Loading State

```text
AI is drafting a response...
```

---

# Confidence Indicators

Optional:

```text
High confidence
Needs review
```

---

# Rewrite UX

Do NOT overwrite existing draft automatically.

Show:

```text
Original | AI Rewrite
```

comparison.

---

# 16. Phase 3 Recommended Execution Order

---

## Step 1

Infrastructure:

* llm client
* ai routes
* ai_runs
* logging
* rate limiting

---

## Step 2

Suggest Reply MVP

This provides maximum immediate value.

---

## Step 3

Summaries

---

## Step 4

Rewrite + Translate

---

## Step 5

Classification Pipeline

* intent
* sentiment
* auto-tags

---

## Step 6

Analytics + feedback tracking

---

# 17. Production Risks

---

## Biggest Risk #1 — Prompt Injection

Customers will eventually send:

```text
Ignore previous instructions...
```

Must isolate prompts carefully.

---

## Biggest Risk #2 — Token Costs

Long email threads become expensive fast.

You NEED truncation + summaries.

---

## Biggest Risk #3 — Agent Trust

If suggestions hallucinate early:

Agents stop using AI entirely.

Quality > quantity.

---

# 18. What NOT To Build Yet

Do NOT build yet:

* autonomous sending
* AI agents replying to customers
* memory systems
* multi-agent workflows
* AI escalation decisions
* AI ticket closing
* vector DB overengineering

Keep Phase 3 narrowly scoped.

---

# 19. Recommended Future Evolution

---

## Phase 4

Knowledge + RAG enhancement

---

## Phase 5

Workflow automation

---

## Phase 6

Customer-visible autonomous AI agents

---

# 20. Final Recommended Deliverables

By the end of Phase 3 you should have:

---

## Backend

* AI orchestration layer
* Provider abstraction
* Structured prompts
* AI analytics
* AI queues
* Classification pipeline
* AI-safe middleware

---

## Frontend

* Copilot sidebar
* Suggest reply UX
* Rewrite UX
* Summary UX
* Translation UX
* AI metadata display

---

## Infrastructure

* Rate limiting
* Logging
* Observability
* Streaming
* Retry handling
* Cost tracking

---

# Recommended Priority

If resources are limited:

```text
1. Suggest Reply
2. Summaries
3. Intent + sentiment
4. Rewrite
5. Translation
6. Analytics
```

That order gives maximum product value fastest.
