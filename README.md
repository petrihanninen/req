# req

Real-time webhook inspector. Send any HTTP request to `/hook/...` and see it appear instantly in the browser.

## Local development

```bash
pnpm install
pnpm dev
```

`wrangler dev` starts the Worker on `http://localhost:8787`. Send requests to `http://localhost:8787/hook/anything` and watch them stream in via WebSocket.

## Hosting

The app runs on Cloudflare Workers at `req.petrihanninen.com`:

- **Worker** (`src/worker.ts`) routes `/hook*`, `/api/*` and `/ws` to a single SQLite-backed Durable Object (`RequestStore`) that keeps the last 200 captured requests and pushes new ones to connected WebSocket clients (Hibernation API).
- **Static assets** (`assets/`) — the UI — are served by the platform assets layer in front of the Worker.

## Deploying

Pushes to `main` deploy automatically via GitHub Actions (`.github/workflows/deploy.yml`): typecheck, then `wrangler deploy` through `cloudflare/wrangler-action`. The workflow can also be triggered manually.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` — API token with Workers Scripts edit permission
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account id

Manual deploy:

```bash
pnpm run deploy
```
