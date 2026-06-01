# Onboarding & registration

## Overview

New users **register an account** (no workspace is created). They then either **create a workspace (organization)** under their super organization or **join via invite** (membership only). Routing after auth is centralized on `/continue`.

## Capabilities

- Public landing, login, register pages
- Register stores optional pending invite token → `/invite` after signup
- Onboarding hub: multi-step org creation or paste invite token
- Redirects: `/getting-started` → `/onboarding`, old `/dashboard` → `/continue`

## Architecture

```mermaid
flowchart TD
  Register[/register] --> Auth[Supabase signup]
  Auth --> Continue[/continue]
  Continue -->|0 orgs| Onboard[/onboarding]
  Continue -->|1 org| Inbox[/org/:id/inbox]
  Continue -->|many orgs| Select[/select-org]
  Onboard -->|create| APIcreate[POST /api/org/create]
  Onboard -->|join| Accept[POST /api/org/accept-invite]
```

## Key files

| Layer | Path |
|-------|------|
| Pages | `client/src/pages/LandingPage.jsx`, `LoginPage.jsx`, `Register.jsx`, `OnboardingPage.jsx`, `PostAuthRedirect.jsx`, `OrgSelectorPage.jsx` |
| Register step | `client/src/components/onboarding/StepAccount.jsx`, `Stepper.jsx` |
| Org create (client) | `client/src/services/orgWorkspaceApi.js`, `api.js` |
| Org create (server) | `server/src/controllers/org.controller.js` (`createOrgController`) |
| Schema | `supabase/migrations/20260507120000_onboarding_schema.sql` |

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/org/create` | Yes |
| POST | `/api/org/:orgId/invite` | Yes (ADMIN) |
| POST | `/api/org/accept-invite` | Yes |

## Connections

| Feature | Relationship |
|---------|----------------|
| [Authentication](./authentication.md) | Must be signed in before org APIs |
| [Multi-organization](./multi-organization.md) | Creating org adds `organization_members` ADMIN row |
| [Team invitations](./team-invitations.md) | Onboarding can send invites; register may defer to `/invite` |
| [Support inbox](./support-inbox.md) | Successful onboarding navigates to inbox |

## Status

**Complete** for primary flows (`OnboardingPage` + `Register`).
