# Feature documentation

Per-feature implementation guides for the AI Support System monorepo. Each doc explains **how the feature works**, **where the code lives**, and **how it connects to other features**.

| Doc | Feature |
|-----|---------|
| [platform-and-monorepo.md](./features/platform-and-monorepo.md) | Workspaces, shared package, API shell, Supabase |
| [authentication.md](./features/authentication.md) | Supabase Auth, JWT, protected routes |
| [onboarding-and-registration.md](./features/onboarding-and-registration.md) | Sign up, onboarding hub, first-run routing |
| [multi-organization.md](./features/multi-organization.md) | Tenancy, org context, URL-scoped API |
| [team-invitations.md](./features/team-invitations.md) | Invites, teammates settings, membership |
| [support-inbox.md](./features/support-inbox.md) | Conversations, filters, workspace state |
| [messages.md](./features/messages.md) | Send pipeline, mentions, internal notes |
| [realtime.md](./features/realtime.md) | Supabase Realtime, typing presence |
| [multi-channel.md](./features/multi-channel.md) | Email, web ingress/outbound, channel router |
| [notifications-and-automation.md](./features/notifications-and-automation.md) | Job queue, worker, SLA, staff email |
| [analytics-and-reports.md](./features/analytics-and-reports.md) | support_events, reports API & UI |
| [settings-and-navigation.md](./features/settings-and-navigation.md) | Sidebar, settings shell, routes |
| [org-ai-settings.md](./features/org-ai-settings.md) | Org AI & automation toggles, `ai_enabled` defaults |
| [workflow-automation.md](./features/workflow-automation.md) | Phase 4 rules engine, worker jobs, inbox segments, admin UI |
| [operational-hardening.md](./features/operational-hardening.md) | Rate limits (ingress, AI, webhook) + outbound failure monitoring |
| [search.md](./features/search.md) | Search page *(partial)* |
| [ai-capabilities.md](./features/ai-capabilities.md) | AI stubs, schema hooks, roadmap link |
| [knowledge-base.md](./features/knowledge-base.md) | Articles, search, file ingest (Phase 2) |
| [security-and-access-control.md](./features/security-and-access-control.md) | RLS, org isolation, ingress security |

**Also see**

- [IMPLEMENTED-FEATURES.md](../IMPLEMENTED-FEATURES.md) — short bullet inventory of everything shipped
- [AI-FEATURE-DESIGN.md](./ai-features/AI-FEATURE-DESIGN.md) — AI roadmap and future phases
- [ai-features/README.md](./ai-features/README.md) — per-phase implementation status; [Phase 4](./ai-features/phase-4-sprint.md) shipped, [Phase 5](./ai-features/phase-5-sprints.md) planned

## Doc template

When adding a new major feature, create `docs/features/<feature-slug>.md` with:

1. **Overview** — what problem it solves  
2. **Capabilities** — what users/agents can do today  
3. **Architecture** — flow diagram + main components  
4. **Key files** — client / server / shared / migrations  
5. **API & routes** — endpoints and auth requirements  
6. **Database** — tables, RPCs, constraints  
7. **Connections** — links to other feature docs  
8. **Status** — complete, partial, or placeholder  

Then add a row to the table above and a bullet in `IMPLEMENTED-FEATURES.md`.
