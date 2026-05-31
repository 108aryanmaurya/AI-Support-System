# Multiple Inboxes - Product & Implementation Plan

**Implementation sprints:** [multiple-inbox-sprints.md](./sprints/multiple-inbox-sprints.md)

## Overview

Multiple Inboxes allow an organization to separate customer-facing conversations into different operational queues.

An inbox is a customer communication queue owned by a specific group of agents.

Examples:

* Support Inbox
* Sales Inbox
* Customer Success Inbox
* Enterprise Inbox

The purpose of inboxes is not to separate work by technical expertise, but to separate customer-facing ownership and communication responsibilities.

An inbox determines:

* Which agents can access a conversation
* Which team owns customer communication
* Where conversations are routed
* How conversations are organized and reported

An inbox is not a ticket board and should not be used for internal work management.

---

# Product Philosophy

## What an Inbox Represents

An inbox represents a customer-facing team.

Examples:

### Support Inbox

Handles:

* Product issues
* Login problems
* General support requests
* Bug reports

### Sales Inbox

Handles:

* Pricing questions
* Demo requests
* Enterprise inquiries
* Lead qualification

### Customer Success Inbox

Handles:

* Onboarding
* Adoption assistance
* Renewals
* Account reviews

---

# Core Principles

## Principle 1: Every Conversation Belongs to One Inbox

A conversation always has a single active inbox.

Examples:

Conversation #101

Inbox:
Sales

Conversation #102

Inbox:
Support

This keeps ownership clear.

---

## Principle 2: Inbox Owns Customer Communication

The inbox that owns the conversation is responsible for communicating with the customer.

Example:

Customer asks a technical question inside a Sales conversation.

Sales remains the owner of the customer relationship.

Sales may create an Engineering ticket, but the conversation stays in Sales.

Engineering performs internal work.

Sales communicates results back to the customer.

---

## Principle 3: Internal Teams Are Not Required To Have Inboxes

Engineering, Billing, Legal, Compliance, and Operations typically work through internal ticket boards rather than inboxes.

Example structure:

Customer-Facing Teams

* Support Inbox
* Sales Inbox
* Customer Success Inbox

Internal Teams

* Engineering Board
* Billing Board
* Legal Board

This keeps customer communication separate from internal execution.

---

## Principle 4: Conversations Can Move Between Inboxes

Ownership may change during the customer lifecycle.

Example:

Customer starts with:

"How much does Enterprise cost?"

Conversation enters:

Sales Inbox

After purchase:

"I cannot log in."

Conversation moves to:

Support Inbox

The conversation history remains intact.

Only ownership changes.

---

# Inbox Membership

Each inbox contains a list of members.

Examples:

Sales Inbox

Members:

* John
* Sarah
* Mike

Support Inbox

Members:

* David
* Emma
* Alex


---

# Conversation Routing

## Automatic Routing

Conversations can be routed based on predefined rules.

Examples:

Pricing Question

→ Sales Inbox

Demo Request

→ Sales Inbox

Technical Issue

→ Support Inbox

Existing Customer

→ Customer Success Inbox

VIP Customer

→ Enterprise Inbox

Routing may be based on:

* Conversation source
* Customer type
* AI intent classification
* Channel
* Customer attributes

---

## Manual Routing

Agents can move conversations between inboxes.

Example:

Conversation mistakenly routed to Sales.

Agent moves conversation to Support.

All history remains unchanged.

---

# Inbox Views

Each inbox should have its own queue views.

Examples:

All Conversations

Unassigned

Assigned To Me

Waiting Customer

Resolved

Closed

SLA Risk

Spam

These views are filtered versions of conversations within the inbox.

---


Moving inbox ownership should be visible in conversation activity history.

Example:

Conversation moved from Sales Inbox to Support Inbox.

---

# Permissions

Organization administrators can:

* Create inboxes
* Rename inboxes
* Archive inboxes
* Manage inbox membership

Agents can:

* Access inboxes they belong to
* Work conversations
* Move conversations when permitted

Non-members should not automatically access inbox conversations.

---

## Status

**Shipped (v1)** — DB-backed inboxes, membership ACL, inbox switcher, scoped queues, manual transfer, routing hooks, workflow `set_inbox`, and assignment eligibility aligned to `inbox_members`. See [multiple-inbox-sprints.md](./sprints/multiple-inbox-sprints.md).

| Capability | Notes |
|------------|--------|
| Schema | `inboxes`, `inbox_members` (+ `permissions` JSONB), `conversations.inbox_id`, `invites.inbox_id` / `invites.permissions` |
| Invite flow | Settings → invite emails + optional **multi-inbox** select (required only when org has inboxes) → **Permissions** → batch invite |
| Admin | Settings → Inboxes (`/org/:orgId/settings/inboxes`) — assignment method per inbox (`settings.assignmentMethod`: manual / round_robin / balanced); updates `manageRoundRobinAssignment` / `manageBalancedAssignmentWorkload` on members |
| Auto-assign | `assignment.auto_route` when queue inbox (`team_inbox_id` or `inbox_id`) is round robin or balanced and org AI is on; org `auto_route_enabled` removed |
| Agent UI | Inbox switcher (`?inbox=`), filters scoped per inbox |
| Transfer | `POST .../conversations/:id/transfer-inbox` + activity event |
| Routing | `resolveInboxForConversation` on create when rules match; `conversations.inbox_id` may stay null |
| Org bootstrap | No auto-created inbox on signup — admins create team inboxes in Settings |
| Migration | `server/scripts/migrateAssignmentInboxesToDb.js` (historical `is_default` backfill only) |

