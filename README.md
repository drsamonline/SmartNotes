# SmartNote Scheduler

An AI-powered note capture, categorization, and reminder scheduling app with a
brutalist UI. Write notes in plain natural language — SmartNote uses an LLM to
automatically classify them, detect priority, generate a title, and extract
dates/times ("tomorrow at 3pm") so nothing slips through the cracks.

- **License:** MIT — see [LICENSE](./LICENSE)
- **Version:** 1.0.0

## Features

- 🤖 **AI note analysis** — automatic categorization into *Tasks, Deadlines,
  Schedule, Thoughts, Learning*, priority detection (Low/Medium/High), title
  generation, and natural-language date/time extraction.
- ⏰ **Reminder scheduling** — reminders fire 1 hour before a deadline or
  scheduled time via a durable heartbeat endpoint (`POST
  /api/scheduled/process-reminders`).
- 🔔 **Multi-channel notifications** — push notifications (Manus owner
  notification API) and optional email delivery through a provider-neutral
  webhook. Every delivery attempt is logged as `sent`, `failed`, or `skipped`.
- 🔍 **Search & filtering** — full-text search over titles/content, category
  tabs, "hide completed" toggle, and sorting by date, priority, or category.
- 📊 **Dashboard stats** — totals, completed, pending, and overdue counts with
  per-category summaries and overdue highlighting.
- 💾 **Backup & export** — JSON backup export/import, CSV and Markdown exports,
  and reusable filter presets.
- 🎨 **Brutalist design system** — black background, oversized condensed white
  typography, red divider accents; fully responsive with mobile navigation.

## Tech Stack

| Layer     | Technology                                             |
|-----------|--------------------------------------------------------|
| Frontend  | React 19, Vite 7, Wouter, TanStack Query, tRPC client   |
| UI        | Tailwind CSS 4, Radix UI (shadcn/ui), Framer Motion, Lucide icons |
| Backend   | Node.js, Express, tRPC 11                                |
| Database  | MySQL via Drizzle ORM + drizzle-kit migrations           |
| Auth      | Manus OAuth (session cookie `app_session_id`, JWT via `jose`) |
| AI        | LLM invoked through the platform forge API               |
| Testing   | Vitest                                                 |
| Packages  | pnpm (workspace uses patched `wouter` via `patches/`)    |

## Project Structure

```
├── client/              # React SPA (pages, components, hooks, contexts)
│   └── src/
│       ├── pages/       # Home, CategoryView, SearchPage, NotificationHistory, Settings
│       ├── components/  # DashboardLayout, NoteFilters, ui/ (shadcn primitives)
│       └── contexts/    # ThemeContext
├── server/              # Express + tRPC backend
│   ├── _core/           # Framework: trpc, oauth, llm, notification, heartbeat, env
│   ├── notes.router.ts  # Notes CRUD, search, stats, backup, notification history
│   ├── ai.ts            # LLM categorization / priority / date-time extraction
│   ├── notifications.ts # Reminder processing and delivery logging
│   ├── db.ts            # Drizzle data access layer
│   └── *.test.ts        # Vitest suites
├── shared/              # Code shared between client and server
├── drizzle/             # Schema and SQL migrations
├── patches/             # pnpm dependency patches
├── vite.config.ts       # Client build config
└── vitest.config.ts     # Test runner config
```

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm (`packageManager: pnpm@10.4.1`)
- A MySQL-compatible database (e.g. TiDB/MySQL 8)

### Installation

```bash
pnpm install
```

### Environment Variables

Copy your values into a `.env` file in the project root:

| Variable                | Required | Description                                        |
|-------------------------|----------|----------------------------------------------------|
| `DATABASE_URL`          | ✅       | MySQL connection string                            |
| `JWT_SECRET`            | ✅       | Secret used to sign session cookies                |
| `OAUTH_SERVER_URL`      | ✅       | Manus OAuth server base URL                        |
| `VITE_APP_ID`           | ✅       | Application identifier                             |
| `OWNER_OPEN_ID`         |          | Open ID of the app owner (target of push notices)  |
| `BUILT_IN_FORGE_API_URL`|          | Platform LLM/forge API endpoint                    |
| `BUILT_IN_FORGE_API_KEY`|          | Forge API key                                      |
| `EMAIL_WEBHOOK_URL`     |          | Webhook endpoint for outbound email delivery       |
| `EMAIL_WEBHOOK_API_KEY` |          | Optional bearer key for the email webhook          |

Email delivery is optional: if `EMAIL_WEBHOOK_URL` is not configured, email
deliveries are recorded as **skipped** in the notification history rather than
failing silently.

### Run

```bash
# Development (tsx watch on server + Vite HMR on client)
pnpm dev

# Type check
pnpm check

# Tests
pnpm test

# Production build & start
pnpm build
pnpm start
```

### Database Migrations

```bash
pnpm db:push   # drizzle-kit generate && drizzle-kit migrate
```

## API Overview

All APIs are served under `/api/trpc` (tRPC) plus a few REST endpoints.

### tRPC routers

- **`system`** — health/system info.
- **`auth.me`**, **`auth.logout`** — session user and cookie logout.
- **`notes.*`** (protected unless noted):
  - `create` — create a note (AI analysis runs automatically)
  - `list`, `get`, `listByCategory`, `search`
  - `update`, `updateNote`, `toggleComplete`, `delete`
  - `stats` — dashboard metrics
  - `notificationHistory` — recent delivery log
  - `importBackup` — bulk restore from exported JSON

### REST endpoints

- `POST /api/oauth/callback` — OAuth code exchange, sets session cookie.
- `POST /api/scheduled/process-reminders` — processes due reminders. Wire this
  to a durable scheduler (see below).

## Data Model

- **users** — Manus OAuth identity (`openId` unique), role, profile.
- **notes** — `userId`, `title`, `content`, `category` (enum of the 5
  categories), `priority` (Low/Medium/High), `dueDate`, `scheduledDate`,
  `isCompleted`. Indexed on `(userId, category)`, `(userId, dueDate)`,
  `(userId, scheduledDate)`.
- **reminders** — `noteId` (cascade delete), `reminderTime`,
  `notificationType` (push/email/both), `isSent`.
- **notificationLogs** — per-channel delivery record: `channel` (push/email),
  `status` (sent/failed/skipped), title, content, error.

See `drizzle/schema.ts` for the authoritative definition.

## Production Reminder Setup

Reminders are processed by an external durable scheduler calling:

```
POST /api/scheduled/process-reminders
```

After deployment, create a **one-minute Heartbeat job** targeting that endpoint.
Failed/skipped-only reminders stay pending and will be retried once the email
provider is configured.

## Testing

```bash
pnpm test
```

Vitest suites cover AI parsing fallbacks, auth/logout cookie handling, note
export/import round-trips, templates, preferences, and reminder delivery
(sent/failed/skipped states).

## Known QA Notes

- Chromium smoke checks passed at 1280px and 375px (dashboard, category,
  search, alert history views).
- Firefox/Safari checks are recommended post-deployment (not available in the
  development sandbox).

## Documentation Set

- [README.md](./README.md) — this file (overview, setup, usage)
- [LICENSE](./LICENSE) — MIT license
- [CHANGELOG.md](./CHANGELOG.md) — release history
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development workflow & guidelines
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design deep dive
- [docs/API.md](./docs/API.md) — API reference
- [docs/DATABASE.md](./docs/DATABASE.md) — schema & migrations
- [todo.md](./todo.md) — project task tracker

## License

Distributed under the **MIT License**. See [LICENSE](./LICENSE) for details.
