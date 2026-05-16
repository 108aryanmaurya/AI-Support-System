# AI Support System

An AI-powered customer support copilot delivered as an **npm workspaces monorepo**: a React (Vite) frontend, an Express API, optional shared types and constants, and [Supabase](https://supabase.com/) for PostgreSQL, authentication, and Row Level Security–ready data access.

## Features at a glance

- **Monorepo** with `client`, `server`, and `shared` packages.
- **REST API** with CORS, JSON bodies, request logging, centralized errors, and JWT verification via Supabase.
- **Supabase** on the client with the **anon** key only; on the server with the **service role** key (never bundled or exposed to the browser).
- **Auth helpers** in the frontend (`login`, `signup`, `logout`, `getCurrentUser`) and **`requireAuth`** middleware that attaches **`req.user`** for protected routes.
- **Conversations inbox**, org-scoped messaging, email/web channels, analytics reports, and automation workers.

## Documentation

- **[AI Feature Design Guide](AI-FEATURE-DESIGN.md)** — Eight-phase AI roadmap, prerequisites per phase, integration map, and technical standards for this codebase.

---

## Repository layout

```
.
├── client/          # React + Vite SPA
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       ├── services/    # supabase client, auth, API helpers
│       ├── context/
│       └── utils/
├── server/          # Express API
│   └── src/
│       ├── config/      # env, Supabase admin client
│       ├── controllers/
│       ├── routes/
│       ├── middleware/  # auth, logging, errors
│       ├── services/
│       ├── utils/
│       ├── app.js
│       └── server.js
├── shared/          # @ai-support/shared — constants + TypeScript types
└── package.json     # workspaces, dev scripts
```

---

## Tech stack

| Area        | Choice |
|------------|--------|
| Frontend   | React 19, Vite 8 |
| Backend    | Node.js, Express 5 |
| Database & auth | Supabase (PostgreSQL + Auth) |
| Monorepo   | npm workspaces |

---

## Prerequisites

- **Node.js** 18+ (20+ recommended).
- **Redis** for API rate limits (local: `docker compose -f docker-compose.redis.yml up -d`).
- A **Supabase project** ([dashboard](https://supabase.com/dashboard)): project URL, **anon** key, and **service role** key from **Settings → API**.

---

## Environment variables

### Client (`client/.env`)

Copy `client/.env.example` to `client/.env` and set:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Public** anon key (safe in the browser bundle) |
| `VITE_API_URL` | Optional. Omit in development to use the Vite dev proxy (`/api` → Express). Set in production if the API is on another origin. |

### Server (`server/.env`)

Copy `server/.env.example` to `server/.env` and set:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Same project URL as the client |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** key; bypasses RLS — never expose to the client or commit to git |
| `REDIS_URL` | **Required.** Rate limits (e.g. `redis://localhost:6379`) |
| `PORT` | Optional; default **3001** |
| `CORS_ORIGIN` | Optional; comma-separated allowed origins (default includes `http://localhost:5173`) |

---

## Install and run

From the repository root:

```bash
npm install
docker compose -f docker-compose.redis.yml up -d   # Redis for rate limits
```

**Development (frontend + API together):**

```bash
npm run dev
```

- Vite: **http://localhost:5173** (proxies `/api` to the API when `VITE_API_URL` is unset).
- API: **http://localhost:3001**

**Run packages separately:**

```bash
npm run dev:client
npm run dev:server
```

---

## Build and production

**Full monorepo build:**

```bash
npm run build
```

**Client** output: `client/dist`. Serve static files with any static host or CDN.

**Server** has no compile step. Run with production env:

```bash
npm run start:server
```

Ensure `server/.env` (or your host’s env) defines `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and appropriate `CORS_ORIGIN` / `PORT` for your deployment.

---

## HTTP API (summary)

Base path: `/api` (and `/health` for liveness).

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/health` | No | Service heartbeat |
| GET | `/api/auth` | No | Auth namespace discovery |
| GET | `/api/auth/health` | No | Auth namespace heartbeat |
| GET | `/api/auth/me` | Yes | Current user from JWT |
| GET | `/api/org/my` | Yes | Organizations for current user |
| GET/POST | `/api/org/:orgId/conversations/*` | Yes | Inbox (conversations, messages) |
| POST | `/api/org/:orgId/messages/incoming` | No | Public customer ingress (rate-limited) |
| GET | `/api/org/:orgId/analytics/*` | Yes | Reports metrics |
| GET | `/api/ai/health` | No | AI route heartbeat |
| POST | `/api/ai/assist` | Yes | AI assist stub (legacy; per-user rate limit) |
| GET | `/api/org/:orgId/ai/health` | Yes | Org-scoped AI heartbeat |
| POST | `/api/org/:orgId/ai/assist` | Yes | AI assist stub (preferred; per-org + per-user limits) |
| POST | `/api/webhooks/email` | No* | Inbound email (*provider auth in service) |

Protected routes expect:

```http
Authorization: Bearer <supabase_access_token>
```

Obtain the access token from the Supabase client session after sign-in (see `client/src/services/api.js`).

---

## Shared package (`@ai-support/shared`)

Workspace package used by client and server for shared constants (conversation statuses, sender types, inbox sort, automation job types, etc.) in `shared/src/`.

---

## Security notes

- Never put **`SUPABASE_SERVICE_ROLE_KEY`** in Vite env (`VITE_*`) or front-end code.
- Prefer **Row Level Security** in Supabase for tables; use the service role only where the server must act with elevated privileges.
- Rotate keys if they are leaked; restrict CORS in production to known front-end origins.

---

## Scripts reference (root `package.json`)

| Script | Action |
|--------|--------|
| `npm run dev` | Client + server in parallel |
| `npm run dev:client` | Vite dev server only |
| `npm run dev:server` | Express with `--watch` |
| `npm run build` | Shared (noop) + client build + server placeholder build |
| `npm run start:server` | Production API start |

---

## License

This project is private and not licensed for public distribution unless you add an explicit `LICENSE` file.
