# Configuration Template

Use this template to configure local and production environments safely.

## 1. Local development

Create `.dev.vars` from `.dev.vars.example` and set a real value:

```bash
cp .dev.vars.example .dev.vars
```

Required keys:

- `PS_SHARED_SECRET`: shared passphrase used by the web UI and API auth.
- `PS_API_KEY` (optional): separate API credential for Skills, browser extensions, and other API clients. Add it to `.dev.vars` to enable it locally.

## 2. Wrangler configuration

Create local `wrangler.toml` from template:

```bash
cp wrangler.toml.example wrangler.toml
```

Main runtime config keys:

- `name`: worker name.
- `main`: entry file (`src/worker.ts`); request handlers and testable helpers live in `src/index.ts`.
- `compatibility_flags`: keep `nodejs_compat` enabled for Better Auth's `node:crypto` dependency.
- `d1_databases`: D1 binding (`DB`).
- `r2_buckets`: R2 binding (`BUCKET`).
- `assets`: static folder (`public`).

`wrangler.toml` is local-only and ignored by git. Do not commit real production values.

## 3. Production secrets

Set secrets via Wrangler:

```bash
npx wrangler secret put PS_SHARED_SECRET
# Optional, for Skill/browser-extension API clients:
npx wrangler secret put PS_API_KEY
```

`PS_API_KEY` is optional in self-hosted mode. API clients can send either `PS_API_KEY` or `PS_SHARED_SECRET` as `X-API-Key` or `Authorization: Bearer <key>`. Keep a separate `PS_API_KEY` if you do not want to give clients the web UI password. SaaS users create individual keys at `/account` instead.

## 4. SaaS mode (optional)

SaaS mode requires Google OAuth and Better Auth. Configure these Wrangler variables:

- `ENABLE_SAAS = "true"`
- `BETTER_AUTH_URL`: canonical HTTPS origin for the deployed site
- `SAAS_SUPERADMIN_EMAILS`: comma-separated allowlist of verified Google account emails that may manage registered users and their files, delete accounts, and grant or revoke Pro
- `WAFFO_ENV`: `test` during sandbox setup, then `prod`
- `WAFFO_CURRENCY`: for example `USD`
- `WAFFO_PRODUCT_PRO_MONTHLY` and `WAFFO_PRODUCT_PRO_YEARLY`: Waffo subscription product IDs
- `WAFFO_STORE_ID`: required for the hosted billing portal

Store the following using Wrangler secrets:

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put WAFFO_MERCHANT_ID
npx wrangler secret put WAFFO_PRIVATE_KEY
```

`BETTER_AUTH_SECRET` must be at least 32 characters. Register the Google callback URI `https://YOUR-DOMAIN/api/auth/callback/google`. In Waffo, configure a Raw webhook for `https://YOUR-DOMAIN/api/webhooks/waffo`; webhook verification keys for test and production are built in. For initial migration, optionally set `SAAS_BOOTSTRAP_EMAIL` to the first Google account that should claim existing files and guest links, then remove it after sign-in.

The first Free/Pro limits are defined in `src/lib/saas.ts` and should be reviewed before launch.
Allowlisted superadmins can manage users from `/account`: search registered accounts, inspect their files, delete individual files, or delete an account after typing its email. Deletion cleans up R2 objects, private KV clips, API keys, sessions, and SaaS account rows; it is audited and can be retried if external storage cleanup is interrupted. Accounts with an active Waffo subscription must be canceled in Waffo before deletion. Superadmin accounts are excluded from the user list and cannot be deleted. Manual Pro grants are stored separately from Waffo subscriptions, support permanent or 30/90/365-day access, and are audited. They do not create Waffo orders or enable the Waffo billing portal.

## 5. Security checklist

- Never commit `.dev.vars`, `.env*`, private keys, or cert files.
- Rotate `PS_SHARED_SECRET` if leaked.
- Rotate `PS_API_KEY` if an API client key is leaked.
- Use different secrets for local/staging/production.

## 6. Docker local runtime

Container startup script `scripts/docker-entrypoint.sh` will:

- create `wrangler.toml` from `wrangler.toml.example` when missing
- initialize local D1 schema from `schema.sql`
- run `wrangler dev --local --persist-to /data`

Use a volume mount for persistence, for example: `-v $(pwd)/.docker-data:/data`.
