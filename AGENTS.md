# Repository Guidelines

## Project Structure & Module Organization
This project is a Cloudflare Worker written in TypeScript.

- `src/index.ts`: main Worker entrypoint (HTTP routes, auth, upload/download logic, embedded UI).
- `schema.sql`: D1 schema for `entries` and `guest_links`.
- `wrangler.toml`: Worker config, bindings (`DB`, `BUCKET`), and environment vars.
- `tsconfig.json`: strict TypeScript compiler settings.

Keep new runtime logic under `src/` and split large features into focused modules (for example, `src/routes/entries.ts`, `src/lib/storage.ts`).

## Build, Test, and Development Commands
- `npx wrangler dev`: run the Worker locally.
- `npx wrangler deploy`: deploy to Cloudflare.
- `npx wrangler d1 execute picoshare_db --local --file=schema.sql`: apply schema locally.
- `npx tsc --noEmit`: type-check without generating build output.
- `npm test`: currently a placeholder and exits with failure by design.

Example local workflow:
```bash
npx wrangler d1 execute picoshare_db --local --file=schema.sql
npx tsc --noEmit
npx wrangler dev
```

## Coding Style & Naming Conventions
- Language: TypeScript with `strict: true`.
- Indentation: 2 spaces; keep semicolon usage consistent with existing files.
- Naming: `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants, `PascalCase` for types/interfaces.
- Keep handlers small and route-specific; move reusable logic into helper modules.

## Testing Guidelines
No test framework is configured yet. For now:
- Always run `npx tsc --noEmit` before submitting changes.
- Manually verify key flows in `wrangler dev`: login, upload, list, copy link, delete, and `/-<id>` retrieval.
- When adding tests, prefer `*.test.ts` naming and keep tests near the related module.

## Commit & Pull Request Guidelines
Local `.git` history is not available in this workspace snapshot, so no project-specific commit pattern could be inferred. Use Conventional Commits:
- `feat: add guest link expiration validation`
- `fix: reject upload when auth header is missing`

For PRs, include:
- clear summary and rationale,
- linked issue (if applicable),
- setup/migration notes (for `schema.sql` or bindings),
- manual verification steps and expected results.

## Security & Configuration Tips
- Never commit real secrets in `wrangler.toml`; use `wrangler secret put`.
- Treat `PS_SHARED_SECRET` as required in every protected `/api/*` route.
- Validate file metadata and size limits before persisting to R2/D1.
