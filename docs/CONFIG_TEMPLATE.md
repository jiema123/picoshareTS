# Configuration Template

Use this template to configure local and production environments safely.

## 1. Local development

Create `.dev.vars` from `.dev.vars.example` and set a real value:

```bash
cp .dev.vars.example .dev.vars
```

Required keys:

- `PS_SHARED_SECRET`: shared passphrase used by the web UI and API auth.

## 2. Wrangler configuration

Create local `wrangler.toml` from template:

```bash
cp wrangler.toml.example wrangler.toml
```

Main runtime config keys:

- `name`: worker name.
- `main`: entry file (`src/index.ts`).
- `d1_databases`: D1 binding (`DB`).
- `r2_buckets`: R2 binding (`BUCKET`).
- `assets`: static folder (`public`).

`wrangler.toml` is local-only and ignored by git. Do not commit real production values.

## 3. Production secrets

Set secrets via Wrangler:

```bash
npx wrangler secret put PS_SHARED_SECRET
```

## 4. Security checklist

- Never commit `.dev.vars`, `.env*`, private keys, or cert files.
- Rotate `PS_SHARED_SECRET` if leaked.
- Use different secrets for local/staging/production.

## 5. Docker local runtime

Container startup script `scripts/docker-entrypoint.sh` will:

- create `wrangler.toml` from `wrangler.toml.example` when missing
- initialize local D1 schema from `schema.sql`
- run `wrangler dev --local --persist-to /data`

Use a volume mount for persistence, for example: `-v $(pwd)/.docker-data:/data`.
