# PicoShare TS

A lightweight file sharing service built on Cloudflare Workers + D1 + R2.

中文文档: [点我查看](docs/README.zh-CN.md)

## Features

- Password-protected management UI
- File upload via select, drag-and-drop, and paste text
- File list, metadata, edit, and delete
- Cloud clipboard (`/clips` + `/:name`) for quick text sync across devices
  - Per-clipboard password protection
  - Auto-save (including save on mouse leave)
  - Shareable URL editing on multiple devices
- Guest link upload flow (supports batch upload)
- Download history tracking and view
- CN/EN language switch
- Expiration cleanup for expired files

## Tech Stack

- Cloudflare Workers (`src/index.ts`)
- D1 (metadata + download events)
- R2 (file object storage)
- TypeScript + Vitest

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure local secret:

```bash
cp .dev.vars.example .dev.vars
cp wrangler.toml.example wrangler.toml
```

3. Initialize local D1 schema:

```bash
npx wrangler d1 execute picoshare_db --local --file=./schema.sql
```

4. Start local dev server:

```bash
npx wrangler dev --port 8788
```

5. Create KV namespace for clips and set `CLIPBOARD` in `wrangler.toml`:

```bash
npx wrangler kv namespace create "picoshare-clips"
```

Then copy the returned `id` into:

```toml
[[kv_namespaces]]
binding = "CLIPBOARD"
id = "your-kv-namespace-id"
```

## Docker Deployment (Local Runtime)

This mode runs Worker + local D1/R2 in container only (no Cloudflare remote dependency).
Data persists under `/data` inside the container, so mount it as a volume.

```bash
docker build -t picoshare-ts:local .
docker run --rm -it \
  -p 8787:8787 \
  -v $(pwd)/.docker-data:/data \
  picoshare-ts:local
```

Then open `http://localhost:8787`.

```bash


```

## Scripts

- `npm run typecheck`: TypeScript type check
- `npm test`: Run unit tests once
- `npm run test:watch`: Run tests in watch mode

## Configuration

- See `docs/CONFIG_TEMPLATE.md` for local/production configuration and secret management.
- Never commit real secrets in `.dev.vars`, `.env`, private keys, or cert files.
- `CLIPBOARD` KV binding is required for `/clips` and `/:name` clipboard pages.



### Login

![Login](https://img.justnow.uk/2026/02/e857390cab29d164ae7edaf5e9c9ccf3.png)

### Upload (ZH)

![Upload ZH](https://img.justnow.uk/2026/02/b3eeb4373217e13fc103c0c2f8f9d4e2.png)

### Files (ZH)

![Files ZH](https://img.justnow.uk/2026/02/82fb2b4a3384deff5f22fe0c41f99ae4.png)

### Upload (EN)

![Upload EN](https://img.justnow.uk/2026/02/f2a999679000e3a6ef1fdb55f4c539e5.png)

### File Information (EN)

![File Information EN](https://img.justnow.uk/2026/02/baa9bfe8fefeef92611b730a4d1ab37d.png)

## Notes

- Current project directory is a Worker app root; run commands in this folder.
- Static assets are served from `public/` (see `wrangler.toml` `assets` setting).
