# req

Real-time webhook inspector. Send any HTTP request to `/hook/...` and see it appear instantly in the browser.

## Local development

```bash
pnpm install
pnpm dev
```

The server starts on `http://localhost:3000`. Send requests to `http://localhost:3000/hook/anything` and watch them stream in via WebSocket.

## Docker

```bash
docker compose up
```

Runs on `http://localhost:8080`.

## Hosting

The app deploys to GHCR via GitHub Actions on push to `main`. The workflow builds a Docker image tagged as `ghcr.io/petrihanninen/req:latest` plus a timestamped tag.

To add it to the homelab K3s cluster, create manifests in `homelab/apps/req/` (namespace, deployment, service, ingress) and add an ImageRepository + ImagePolicy in `homelab/infra/image-automation/`. See `abrahangs/` or `travel/` as templates.
