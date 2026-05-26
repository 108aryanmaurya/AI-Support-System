# Multi-channel architecture

## Overview

Each **conversation** belongs to exactly one **channel** (`channel_type` + `channel_id`). Inbound customer traffic enters via **web API** or **email webhook**; agent outbound replies route through **`channelReplyRouter.service.js`** to the correct adapter.

## Capabilities

- Channel registry per org (`email`, `web`, `whatsapp`, `messenger`)
- `channel_integrations` for provider config (e.g. Resend, inbound addresses)
- List channels: `GET /api/org/:orgId/channels`
- **Web**: public incoming POST + web adapter for outbound
- **Email**: inbound webhook, threading, Resend outbound (or mock)
- **Email DNS setup (admin UI)** — subdomain verification via Resend; see [org-email-channel.md](./org-email-channel.md)
- WhatsApp / Messenger: types in DB only; outbound **501**

## Architecture

```mermaid
flowchart TB
  subgraph ingress [Inbound]
    WebPOST["POST .../messages/incoming"]
    EmailWH["POST /api/webhooks/resend"]
  end
  subgraph core [Core]
    RPC[handle_incoming_message RPC]
    Conv[conversations]
  end
  subgraph egress [Agent outbound]
    Send[inboxAgentSend]
    Router[channelReplyRouter]
    EmailA[EmailAdapter]
    WebA[WebAdapter]
  end
  WebPOST --> RPC
  EmailWH --> emailWebhook.service --> Conv
  Send --> Router
  Router --> EmailA
  Router --> WebA
```

## Key files

| Area | Path |
|------|------|
| Incoming routes | `server/src/routes/messagesIncoming.routes.js`, `emailWebhook.routes.js` |
| Email inbound | `server/src/services/emailWebhook.service.js` |
| Org email DNS setup | `server/src/services/orgEmailSettings.service.js`, `client/src/pages/OrgEmailSettingsPage.jsx` |
| Email outbound | `server/src/services/emailOutbound.service.js`, `emailReply.service.js` |
| Router | `server/src/services/channelReplyRouter.service.js` |
| Adapters | `server/src/adapters/EmailAdapter.js`, `WebAdapter.js` |
| Rate limit | `server/src/middleware/incomingRateLimit.js` |
| Migrations | `20260509153000_email_channel_support.sql`, `20260509160000_production_channel_architecture.sql`, `20260509200000_conversation_email_reply_routing.sql` |

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/org/:orgId/messages/incoming` | No |
| POST | `/api/webhooks/resend` | Resend webhook (Svix signature) |
| POST | `/api/webhooks/email` | Alias of `/resend` |
| GET | `/api/org/:orgId/channels` | Yes |
| GET/POST/PATCH/DELETE | `/api/org/:orgId/settings/email/*` | Yes (mutations ADMIN) |

## Database

- `channels`, `channel_integrations`, `email_threads`, `organization_email_domains`
- `conversations.channel_type`, `conversations.channel_id`

## Connections

| Feature | Relationship |
|---------|----------------|
| [Messages](./messages.md) | All messages inherit conversation channel |
| [Support inbox](./support-inbox.md) | UI shows channel icon from `source` / `channel_type` |
| [Notifications](./notifications-and-automation.md) | Inbound customer message triggers staff notify job |
| [Multi-organization](./multi-organization.md) | Channels scoped by `organization_id` |
| [Platform](./platform-and-monorepo.md) | `env.emailProvider`, `emailProviderMock` |
| [Org email channel](./org-email-channel.md) | DNS verification UI provisions email channel |

## Status

**Complete** for email and web. WhatsApp/Messenger are **schema-only** until adapters are implemented.
