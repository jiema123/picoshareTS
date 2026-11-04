# PicoShare TS

A lightweight file sharing service built on Cloudflare Workers + D1 + R2.

中文文档: [点我查看](docs/README.zh-CN.md)

## Features

- Password-protected management UI
- File upload via select, drag-and-drop, and paste text
- File list, metadata, edit, and delete
- Same-name file replacement with unchanged share path, MD5 tracking, and version history
- Cloud clipboard (`/clips` + `/:name`) for quick text sync across devices
  - Per-clipboard password protection
  - Auto-save (including save on mouse leave)
  - Shareable URL editing on multiple devices
- Guest link upload flow (supports batch upload)
- Download history tracking and view
- CN/EN language switch
- Expiration cleanup for expired files

## Tech Stack

- Cloudflare Workers (`src/worker.ts` entry point; request handlers in `src/index.ts`)
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

## API key integration

For self-hosted mode, set an optional `PS_API_KEY` secret for Skill, browser extension, or other API clients. In SaaS mode, users create and revoke personal API keys from `/account`; each key is limited to that user's data and plan.

Send the key in either `X-API-Key` or `Authorization: Bearer <key>` when calling protected `/api/*` routes. For example:

```bash
curl -H "X-API-Key: $PS_API_KEY" "$PICOSHARE_URL/api/entries"
curl -X POST -H "X-API-Key: $PS_API_KEY" \
  -F "file=@./example.png" "$PICOSHARE_URL/api/entry"
```

The upload response includes an `id`; its share URL is `$PICOSHARE_URL/-<id>`. In self-hosted mode, the service API key has the same access to `/api/*` as the web UI, including file management, so store it as a secret.

## SaaS mode

SaaS is opt-in and uses Google OAuth and email/password authentication through Better Auth. Users can register with an email address and password (minimum 8 characters), then manage files, guest links, private clips, personal API keys, and Pro billing at `/account`. Email verification and password reset emails are not configured yet; connect a mail provider before relying on email account recovery in production. Waffo Pancake hosts checkout and the customer portal. Set `ENABLE_SAAS=true` after configuring the required values.

1. Register the Google OAuth client and add this authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google`.
2. Create monthly and yearly Pro subscription products in Waffo Pancake, then configure their product IDs.
3. Add a Waffo webhook using the raw payload format at `https://YOUR-DOMAIN/api/webhooks/waffo`. Subscribe to `subscription.activated`, `subscription.payment_succeeded`, `subscription.renewed`, `subscription.recovered`, `subscription.plan_changed`, `subscription.canceling`, `subscription.uncanceled`, `subscription.canceled`, `subscription.past_due`, and `refund.succeeded`. The payment event is also used as a first-checkout activation fallback when the separate activation event is not delivered.
4. Set the required Worker variables/secrets and deploy. Start with `WAFFO_ENV=test`, complete a sandbox checkout, and switch to `prod` only after verifying the webhook flow.

Required SaaS settings:

- Variables: `ENABLE_SAAS=true`, `BETTER_AUTH_URL`, optional `SAAS_SUPERADMIN_EMAILS` (comma-separated verified emails), `WAFFO_ENV`, `WAFFO_CURRENCY`, `WAFFO_PRODUCT_PRO_MONTHLY`, and `WAFFO_PRODUCT_PRO_YEARLY`. `WAFFO_STORE_ID` is needed for the billing portal.
- Secrets: `BETTER_AUTH_SECRET` (at least 32 characters), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WAFFO_MERCHANT_ID`, and `WAFFO_PRIVATE_KEY`.
- Waffo webhook verification keys are built in; optional `WAFFO_WEBHOOK_*_PUBLIC_KEY` values can override them.
- Set `SAAS_BOOTSTRAP_EMAIL` temporarily if the first matching Google account should take ownership of existing files and guest links. Remove it after that account has signed in.

Hosted plan limits are configured in `src/lib/saas.ts`. Free includes 1 GiB storage, 100 MiB per file, up to 30-day file retention, 5 clips (32 KiB each), 500 API-key requests per account/month (10/minute), one API key, and 3 active guest links. Pro is $5/month or $50/year and includes 5 GiB storage, 1 GiB per file, up to 365-day retention, 20 clips (128 KiB each), 5,000 API-key requests per account/month (60/minute), 3 API keys, and 20 active guest links. Configure the Waffo Pro products to these USD amounts; checkout uses the configured product IDs and `WAFFO_CURRENCY`. Request limits are shared across a user's keys; signed-in website activity is not counted. Clips are intended for small text snippets; upload larger content as a file. For higher capacity, API volume, or private network access, offer a private deployment on the customer's Cloudflare account or scope a separate infrastructure adaptation.

Allowlisted superadmins can manage registered users and their files from `/account`, including deleting individual files or accounts. Account deletion clears the user's R2 files, private KV clips, API keys, sessions, and SaaS account data, and records an admin audit entry. Cancel an active Waffo subscription before deleting its account. Superadmin accounts are excluded from the management list and cannot be deleted. Superadmins can also grant or revoke manual Pro access; this bypasses Waffo checkout and is recorded in an audit table.



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


### Clips
![clips](https://img.justnow.uk/2026/02/ad69a9240443e23109197cad0976726c.png)
![clips1](https://img.justnow.uk/2026/02/4baa1ebde0cc84210b1021e7b820588b.png)

## Notes

- Current project directory is a Worker app root; run commands in this folder.
- Static assets are served from `public/` (see `wrangler.toml` `assets` setting).
