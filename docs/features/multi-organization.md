# Multi-organization (SaaS tenancy)

## Overview

Account holders own a **super_organization** (one per user who creates workspaces). Each **organization** is a workspace under that super org. Users belong to workspaces via **organization_members** with role, status, and optional granular `permissions`. Invite acceptance adds membership only — no new organization or super organization for the invitee.

Signup creates `public.users` only. Workspaces are created through onboarding **Create organization** (`POST /api/org/create`). All agent product data is scoped by `organization_id`; the API enforces membership from the URL segment `:orgId` only.

## Capabilities

- Create organization under caller’s super organization; list “my orgs” (membership-based)
- Workspace creator: `organizations.created_by`, full `permissions` on initial `organization_members` row
- ACTIVE membership required for workspace APIs
- Dynamic role labels on `organization_members.role` (templates from Teammates → Roles)
- Client: org list context, selector, switcher, last-org `localStorage`
- URL pattern: `/org/:orgId/inbox`, `/reports`, `/settings`, etc.

## Architecture

```mermaid
flowchart TB
  Request["/api/org/:orgId/..."]
  Request --> requireAuth[requireAuth]
  requireAuth --> requireOrg[requireOrgAccess]
  requireOrg --> Handler[Controller / Service]
  Handler --> DB[(organization_id filter)]
```

## Key files

| Layer | Path |
|-------|------|
| Middleware | `server/src/middleware/orgAccess.js` (`requireOrgAccess`, `requireRole`) |
| Service | `server/src/services/org.service.js`, `server/src/services/superOrganization.service.js` |
| Controller | `server/src/controllers/org.controller.js` |
| Routes | `server/src/routes/org.routes.js`, `server/src/routes/orgWorkspace.routes.js` |
| Client context | `client/src/context/OrganizationContext.jsx` |
| Layout | `client/src/layouts/OrgWorkspaceLayout.jsx` |
| Storage | `client/src/utils/lastOrgStorage.js` |
| Schema | `supabase/migrations/20260512100000_multi_organization_saas.sql`, `20260601150000_super_organizations.sql` |

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/org/create` | Yes |
| GET | `/api/org/my` | Yes |
| * | `/api/org/:orgId/*` | Yes + membership |

`orgWorkspace.routes.js` mounts conversations, messages, customers, analytics, members, invites under `:orgId`.

## Database

- `super_organizations`, `organizations` (`super_organization_id`, `created_by`), `organization_members` (`permissions`), `invites`
- RLS: members see only their org’s data (see [security](./security-and-access-control.md))

## Connections

| Feature | Relationship |
|---------|----------------|
| [Authentication](./authentication.md) | `user_id` on memberships = `auth.users.id` |
| [Team invitations](./team-invitations.md) | Invites reference `organization_id` |
| [Support inbox](./support-inbox.md) | `conversations.organization_id` |
| [Multi-channel](./multi-channel.md) | `channels.organization_id` |
| [Analytics](./analytics-and-reports.md) | All metrics keyed by org |
| [Notifications](./notifications-and-automation.md) | Jobs and settings per org |

## Status

**Complete** for core tenancy and access control.
