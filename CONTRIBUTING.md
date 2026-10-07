<div align="center">

# 🤝 Contributing to SmartNote Scheduler

*Set up, build, break, fix — we welcome careful pull requests.*

[Setup](#getting-set-up) · [Workflow](#workflow) · [Conventions](#conventions) · [Roadmap](./docs/IMPLEMENTATION_PLAN.md)

</div>

Thanks for your interest in improving SmartNote Scheduler! This guide covers
setting up a development environment, the workflow we use, and the conventions
the codebase follows.

## Code of Conduct

Be respectful, inclusive, and constructive. Assume good intent, critique code
(not people), and keep discussions focused on making the product better.

## Getting Set Up

1. Install **Node.js ≥ 20** and **pnpm** (`packageManager: pnpm@10.4.1` is
   pinned in `package.json`; corepack is recommended).
2. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url> && cd smartnote-scheduler
   pnpm install
   ```
   > Note: this project uses a patched dependency (`wouter@3.7.1`, see
   > `patches/`). Always install with pnpm — npm/yarn will skip the patch.
3. Configure environment variables (see the table in [README.md](./README.md)).
   You need a MySQL-compatible database and the OAuth/LLM platform endpoints.
4. Apply migrations:
   ```bash
   pnpm db:push
   ```
5. Start development servers:
   ```bash
   pnpm dev
   ```

## Development Workflow

1. Create a branch from the latest main: `git checkout -b feat/short-description`
   (prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`).
2. Make focused commits. Conventional Commit style messages are preferred:
   `feat: add overdue badge to note cards`, `fix: guard null extractedDate`.
3. Before pushing, run the full quality gate:
   ```bash
   pnpm check   # TypeScript type-check (tsc --noEmit)
   pnpm test    # Vitest suites
   pnpm format  # Prettier formatting
   ```
4. Open a pull request. Include:
   - What changed and why (link issues where applicable).
   - Screenshots/screen recordings for UI changes (desktop + 375px mobile).
   - Notes about migration or env-var changes.

## Project Conventions

### Architecture
- **API layer:** All data operations go through tRPC routers registered in
  `server/routers.ts`. Add procedures to `server/notes.router.ts` (or a new
  router) rather than creating ad-hoc REST endpoints. Reserve REST for
  platform callbacks under `/api/` (e.g. OAuth, scheduled jobs).
- **Database:** Schema lives in `drizzle/schema.ts`; data access helpers live
  in `server/db.ts`. Never write raw SQL outside these layers. After schema
  changes run `pnpm db:push` and commit the generated migration files.
- **AI logic:** Prompt construction and parsing stay in `server/ai.ts` with
  safe fallbacks — analysis failures must degrade to defaults
  (`Thoughts` / `Medium` / `Untitled Note`), never throw to the caller.
- **Shared code:** Anything used by both client and server goes in `shared/`.
- **Client state:** Server data is fetched with TanStack Query via the tRPC
  client (`trpc.*.useQuery/useMutation`). Keep route components lazy-loaded
  (`React.lazy`) as in `client/src/App.tsx` to preserve code splitting.

### UI / Design System
- Follow the brutalist aesthetic: black backgrounds, oversized condensed white
  typography, red (#dc2626-family) divider lines and accents.
- Use the shadcn/ui primitives in `client/src/components/ui/` before adding new
  components; Radix behaviors should not be reimplemented.
- Every new screen must work at 375px width and integrate with the dashboard
  sidebar/mobile nav.

### Testing
- New backend behavior requires a Vitest test colocated in `server/*.test.ts`.
- Tests must not require live external services — mock the LLM, notification,
  and email-webhook boundaries.
- Cover edge cases: malformed AI JSON, missing email configuration (expect
  `skipped` logs), timezone/date-parsing corner cases.

### TypeScript & Style
- Strict mode is enabled; avoid `any` and non-null assertions where possible.
- Prettier is the source of truth for formatting (`pnpm format`).
- Use camelCase fields in schema definitions to match DB columns and types.

## Pull Request Checklist

- [ ] `pnpm check`, `pnpm test`, and `pnpm build` pass locally
- [ ] Migrations included and reversible where practical
- [ ] Env var additions documented in README
- [ ] UI changes verified responsive (Chromium desktop + mobile at minimum)
- [ ] CHANGELOG.md updated for user-facing changes
- [ ] No secrets, tokens, or real `DATABASE_URL` values committed

## Reporting Issues

Use the issue tracker and include: reproduction steps, expected vs. actual
behavior, environment (OS, browser, Node version), and relevant logs (redact
secrets). For notification problems, include the affected note ID and the
`notificationLogs` entries.

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](./LICENSE).

---

<div align="center">

**Related:** [Architecture](./docs/ARCHITECTURE.md) · [Enhancement Backlog](./docs/ENHANCEMENTS.md) · [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)

*© 2026 SmartNote Scheduler contributors · MIT License*

</div>
