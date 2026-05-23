# Auto Assignment System Plan

**Implementation sprints:** [auto-assignment-sprint.md](./auto-assignment-sprint.md) · **Sprint 0 gate:** [auto-assignment-prerequisites.md](./auto-assignment-prerequisites.md)

````md
# Auto Assignment System Architecture Plan

## Objective

Automatically assign incoming customer conversations to the most appropriate available agent using a scalable, enterprise-grade routing system.

The system should support:

- Skill-based routing
- AI-assisted intent routing
- Load balancing
- SLA prioritization
- Presence awareness
- Sticky assignment
- Fallback queues
- Reassignment logic

---

# 1. Core Assignment Philosophy

The system should use:

> AI-assisted Skill-Based Weighted Round Robin

This combines:

- AI classification
- deterministic routing
- fairness
- workload balancing
- operational predictability

AI assists decision making but does NOT fully control assignment.

---

# 2. Assignment Lifecycle

```text
Conversation Created
        ↓
AI Classification
        ↓
Automation Rule Evaluation
        ↓
Inbox Selection
        ↓
Candidate Agent Filtering
        ↓
Weighted Scoring
        ↓
Best Agent Selection
        ↓
Conversation Assignment
        ↓
SLA Monitoring
        ↓
Reassignment / Escalation
````

---

# 3. Conversation Creation Flow

## Trigger Sources

Conversation may originate from:

* Website widget
* Email
* WhatsApp
* Instagram
* Facebook
* Telegram
* API
* Internal note conversion

---

# 4. AI Classification Layer

## Purpose

Generate metadata used for routing.

## AI Outputs

```json
{
  "intent": "billing_refund",
  "sentiment": "negative",
  "priority": "high",
  "language": "en",
  "tags": ["refund", "vip"]
}
```

---

# 5. Automation Rule Engine

## Purpose

Apply organization-defined routing logic.

## Example Rules

### Example 1

```text
IF language = "fr"
THEN route to French inbox
```

### Example 2

```text
IF tag contains "enterprise"
THEN priority = urgent
```

### Example 3

```text
IF sentiment = negative
THEN escalate queue
```

---

# 6. Inbox Selection

## Purpose

Determine which inbox/team owns the conversation.

## Examples

| Condition            | Inbox              |
| -------------------- | ------------------ |
| Billing issues       | Billing Team       |
| Technical issues     | Technical Support  |
| Enterprise customers | Enterprise Support |
| WhatsApp channel     | WhatsApp Inbox     |

---

# 7. Candidate Agent Filtering

## Purpose

Filter eligible agents before scoring.

---

## Eligibility Conditions

Agent must satisfy ALL:

### 1. Agent Active

```text
agent.status = active
```

---

### 2. Presence Available

```text
presence IN (
  online,
  available
)
```

Do NOT assign to:

* offline
* away
* busy
* invisible

---

### 3. Working Hours

Current time must fall inside:

```text
agent.shift_start
agent.shift_end
```

---

### 4. Inbox Access

Agent must belong to target inbox/team.

---

### 5. Skill Match

Agent skills should match:

* intent
* tags
* language

Example:

```text
conversation.intent = billing
agent.skills contains billing
```

---

### 6. Concurrency Limit

```text
active_conversations < max_concurrency
```

Example:

| Role          | Max Concurrent Chats |
| ------------- | -------------------- |
| Junior Agent  | 3                    |
| Support Agent | 5                    |
| Senior Agent  | 8                    |

---

### 7. Permission Validation

Agent role must allow:

* assigned conversations
* target inbox access

---

# 8. Weighted Scoring Engine

## Purpose

Score all eligible agents and pick best candidate.

---

# 9. Recommended Scoring Formula

```text
FINAL_SCORE =
(skill_match * 40)
+ (low_workload * 20)
+ (sla_performance * 15)
+ (recent_activity * 10)
+ (customer_history * 10)
+ (priority_bonus * 5)
```

---

# 10. Scoring Factors

## A. Skill Match

Highest weight.

### Example

| Match Type         | Score |
| ------------------ | ----- |
| Exact intent match | 40    |
| Related skill      | 25    |
| Generic support    | 10    |

---

## B. Low Workload

Prefer agents with fewer active chats.

### Formula

```text
low_workload =
1 - (
active_chats / max_concurrency
)
```

---

## C. SLA Performance

Prefer agents with:

* lower breach rate
* faster response times
* better resolution metrics

---

## D. Recent Activity

Avoid assigning to inactive agents.

---

## E. Sticky Assignment

If customer previously interacted with same agent:

```text
+10 bonus
```

Improves customer experience significantly.

---

## F. Priority Bonus

Urgent tickets may bypass fairness.

---

# 11. Final Agent Selection

Select:

```text
highest FINAL_SCORE
```

If multiple agents tie:

Use:

```text
weighted round robin
```

---

# 12. Sticky Assignment

## Purpose

Maintain customer continuity.

---

## Logic

If:

```text
customer.previous_agent_id exists
AND agent available
```

Prefer same agent.

---

## Benefits

* Faster resolution
* Better context retention
* Improved customer satisfaction

---

# 13. SLA-Aware Routing

## Purpose

Prevent SLA breaches.

---

## Example

If:

```text
remaining_sla_time < 5 minutes
```

Then:

* skip normal fairness
* prioritize fastest available agent

---

# 14. VIP Routing

## Purpose

Handle enterprise/VIP customers differently.

---

## Examples

| Customer Type | Routing        |
| ------------- | -------------- |
| Enterprise    | Senior agents  |
| VIP           | Priority queue |
| Free plan     | Standard queue |

---

# 15. Fallback Queue

## Purpose

Prevent assignment failure.

---

## Logic

If no eligible agents:

```text
conversation.status = unassigned
```

Move to:

```text
Unassigned Queue
```

---

# 16. Reassignment System

## Triggers

### Agent Offline

```text
agent disconnected > threshold
```

---

### SLA Risk

```text
response SLA nearing breach
```

---

### Manual Transfer

Agent manually transfers conversation.

---

### Auto Escalation

High sentiment deterioration.

---

# 17. Assignment Strategies Supported

System should support configurable strategies.

---

## Strategy 1 — Least Loaded

Assign to agent with fewest chats.

### Pros

* Simple
* Fair

### Cons

* Ignores expertise

---

## Strategy 2 — Round Robin

Rotate assignments equally.

### Pros

* Predictable

### Cons

* Ignores workload

---

## Strategy 3 — Skill-Based

Assign based on expertise.

### Pros

* Better resolution quality

### Cons

* Uneven load

---

## Strategy 4 — Weighted Hybrid (Recommended)

Combines:

* skills
* workload
* SLA
* availability

### Recommended Default

YES.

---

# 18. Database Design

# conversations

```sql
id
organization_id
customer_id
assigned_agent_id
status
priority
intent
sentiment
language
created_at
updated_at
```

---

# agents

```sql
id
organization_id
name
status
max_concurrency
current_conversations
last_active_at
```

---

# agent_skills

```sql
id
agent_id
skill
proficiency
```

---

# agent_presence

```sql
id
agent_id
presence
last_seen
```

---

# assignment_logs

```sql
id
conversation_id
assigned_from
assigned_to
reason
strategy
created_at
```

---

# 19. Recommended Redis Usage

Use Redis for:

* online presence
* active conversation counts
* assignment locks
* queue states
* SLA timers

---

# 20. Assignment Locking

## Problem

Prevent duplicate assignments.

---

## Solution

Use distributed lock.

Example:

```text
lock:conversation:{id}
```

---

# 21. Real-Time Presence Architecture

## Presence States

```text
online
available
away
busy
offline
```

Update through:

* WebSocket
* Supabase Realtime
* heartbeat system

---

# 22. AI Role in Assignment

AI SHOULD:

* classify intent
* detect language
* detect sentiment
* suggest tags

AI SHOULD NOT:

* directly pick arbitrary agents

Routing decisions must remain explainable.

---

# 23. Observability

Track metrics:

* assignment latency
* SLA breaches
* assignment fairness
* average workload
* reassignment frequency
* agent utilization
* queue backlog

---

# 24. Admin Configuration

Admins should configure:

* assignment strategy
* concurrency limits
* business hours
* VIP routing
* fallback queues
* automation rules

---


# 28. Final Recommended Strategy

## Production Recommendation

```text
AI-assisted
skill-based
weighted round robin
with SLA and workload awareness
```

This provides:

* scalability
* fairness
* expertise routing
* operational transparency
* enterprise-grade behavior

```
```
