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
