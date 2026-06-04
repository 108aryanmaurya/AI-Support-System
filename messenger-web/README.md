# Messenger web (embeddable widget)

Separate package for the customer-facing embed: **loader**, **iframe app**, and **test site**.

## Structure

| Folder | Port (dev) | Purpose |
|--------|----------------|---------|
| `loader/` | 5174 | `widget.js` — built to `dist/` and served via `vite preview` in dev |
| `messenger/` | 5175 | React iframe UI |
| `test-site/` | 5180 | Demo website with widget embedded |

API: `http://localhost:3001` (`/api/widget/v1/*`).

## Quick start

1. Apply migration `20260603120000_widget_tables.sql`.
2. Start Redis + API: `npm run dev:server` from repo root.
3. Create installation:
   ```bash
   node server/scripts/seed-widget-installation.js <your-org-uuid>
   ```
4. Build widget assets (or use dev servers):
   ```bash
   cd messenger-web && npm install
   npm run dev
   ```
5. Open **http://localhost:5180**, paste `widget_key`, use the chat bubble.

**Simulate host login on test site:** run `node --env-file=server/.env server/scripts/sign-widget-user-jwt.js <widget_key> <userId> [email] [name]`, paste the JWT into the test page, click **Boot as logged-in user** (`SupportWidget.boot({ userJwt })`).

## Production build

```bash
npm run build:widget
```

Serves from API at `/v1/widget.js` and `/v1/messenger/` when `messenger-web/*/dist` exists.

## Environment (test-site)

| Variable | Default |
|----------|---------|
| `VITE_WIDGET_LOADER_SRC` | `http://localhost:5174/v1/widget.js` |
| `VITE_WIDGET_IFRAME_ORIGIN` | `http://localhost:5175/v1/messenger` |

After `build:widget`, use `http://localhost:3001` for both loader and iframe.

## Logged-in users (user JWT, Intercom-style)

Your **customer backend** signs a JWT with the installation **secret** (never expose the secret in the browser).

**Claims (HS256):**

| Field | Required | Notes |
|-------|----------|--------|
| `typ` | yes | `widget_user` |
| `sub` / `user_id` | yes | Host app user id |
| `email`, `name` | no | Recommended |
| `attributes` | no | JSON object, stored on customer metadata |
| `exp`, `iat` | yes | Max lifetime capped by `WIDGET_USER_JWT_MAX_TTL_SEC` (default 7 days) |

**Sign (Node example — same as `server/src/utils/widgetUserJwt.js`):**

```js
import { createHmac } from 'node:crypto';

function signUserJwt(secret, { userId, email, name }, ttlSec = 604800) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      typ: 'widget_user',
      sub: userId,
      user_id: userId,
      email: email?.trim().toLowerCase(),
      name,
      iat: now,
      exp: now + ttlSec,
      iss: 'ai-support-widget',
    }),
  ).toString('base64url');
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
```

**Embed:**

```html
<script async src="https://your-api.example/v1/widget.js" data-widget-key="wk_live_…"></script>
<script>
  // After your user logs in — fetch userJwt from YOUR backend
  window.SupportWidget.boot({
    widgetKey: 'wk_live_…',
    iframeOrigin: 'https://your-api.example/v1/messenger',
    userJwt: '…',
  });
  // Or later: SupportWidget.identify({ userJwt: '…' });
</script>
```

API validates the JWT on `GET /bootstrap?user_jwt=…` and `POST /identify` with `{ userJwt }`.

**Dev:** `POST /api/widget/v1/dev/sign-user-jwt` (non-production only) or  
`node server/scripts/sign-widget-user-jwt.js <widget_key> <userId> [email] [name]`

Legacy `identify({ userId, email, name, hash })` (HMAC) remains supported.

## Lead continuity (same browser)

Like Intercom’s cookie behavior:

1. First visit: pre-chat email (if `requireEmail`) → chat starts.
2. `visitor_token` is stored in **`localStorage`** (`sw:<widgetKey>:visitor`) on the **host site origin only** (the page that embeds `widget.js`). The loader passes it into the iframe URL; the iframe does not keep its own copy.
3. **Reload / return** on the same browser: same token → same visitor/customer → **previous conversation and messages** resume; **no pre-chat again**.
4. **New browser, cleared host-site storage, or private window**: new `visitor_token` → pre-chat again; no prior thread in the widget.

**Dev note:** In local dev the host is e.g. `localhost:5180` and the iframe is `localhost:5175` — clear storage for the **test site origin**, not only the messenger port.

Host-identified users (`userJwt` / `identify` with `user_id`) can use conversation history across devices tied to `customers.user_id`.

**Lead → user merge (same browser):** If the visitor chatted as a lead (same `visitor_token` on the host site) then logs in via `boot({ userJwt })` / `identify`, prior web conversations on that device are moved onto the `USER` customer (`customers.user_id`). New browser or cleared host storage → new visitor; no automatic merge.
