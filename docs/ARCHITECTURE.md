# SmartNote Scheduler — Architecture

A high-level tour of how the system fits together. For endpoint details see
[API.md](./API.md); for tables and migrations see [DATABASE.md](./DATABASE.md).

## System Overview

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Client SPA (client/)       │        │  Server (server/)            │
│  React 19 + Vite + Wouter   │ tRPC   │  Express + tRPC 11           │
│  TanStack Query + superjson │◄──────►│  ├─ routers.ts (appRouter)   │
│  Tailwind 4 + shadcn/ui     │ HTTPS  │  │   ├─ system  ├─ auth      │
│                             │        │  │   └─ notes.router         │
│  Pages (lazy-loaded):       │        │  ├─ ai.ts   (LLM analysis)   │
│   /            Dashboard    │        │  ├─ db.ts   (Drizzle DAO)    │
│   /category/:c CategoryView │        │  ├─ notifications.ts         │
│   /search      SearchPage   │        │  └─ _core/ (framework)       │
│   /notifications History    │        └───────┬──────────┬───────────┘
│   /settings    Backup/Export│                │          │
└─────────────────────────────┘                ▼          ▼
                                      ┌────────────┐  ┌─────────────────┐
   Platform services:                 │ MySQL DB   │  │ Manus platform  │
   OAuth · LLM forge · Push · Email   │ (Drizzle)  │  │ APIs + Heartbeat│
   webhook                            └────────────┘  └─────────────────┘
```

## Request Lifecycle

1. **Auth** — Browser holds a signed session cookie (`app_session_id`) issued
   by `POST /api/oauth/callback` (Manus OAuth, JWT verified with `JWT_SECRET`
   via `jose`). `server/_core/context.ts` resolves the user for every request;
   `protectedProcedure` in `server/_core/trpc.ts` rejects anonymous calls.
2. **Validation** — tRPC procedures declare Zod input schemas; superjson
   preserves `Date` types across the wire.
3. **Business logic** — `server/notes.router.ts` orchestrates: persist note →
   invoke AI analysis → schedule reminder → return result.
4. **Data access** — `server/db.ts` centralizes all Drizzle queries against
   `drizzle/schema.ts` tables. Queries are always user-scoped and use the
   composite indexes (e.g. due-time SQL filtering instead of in-memory scans).

## AI Pipeline (`server/ai.ts`)

`analyzeNoteContent(content)` sends a structured system prompt to the platform
LLM (`_core/llm.ts` → forge API) asking for JSON:
`{ category, priority, title, extractedDate, extractedTime }`.

Robustness strategy:
- Response text is regex-scraped for a JSON object (models sometimes add prose
  or markdown fences).
- Every field has a fallback (`Thoughts` / `Medium` / `Untitled Note`).
- Parsing never throws into the mutation path — worst case, the note is saved
  uncategorized rather than lost.
- Unit tests in `server/ai.test.ts` cover malformed outputs and edge cases.

## Reminder & Notification Flow

Design constraint: **no in-process timers**. Long-lived scheduling must survive
restarts, so reminder processing is pull-based:

```
Heartbeat (every 1 min) ──POST──► /api/scheduled/process-reminders
                                        │
                          getPendingReminders(now)  (isSent=0 AND due)
                                        │
                     sendReminder(note, reminder) per channel:
                       ├─ push  → Manus owner notification API (_core/notification.ts)
                       └─ email → EMAIL_WEBHOOK_URL (provider-neutral adapter)
                                        │
                        notificationLogs row: sent | failed | skipped
                                        │
                  markReminderAsSent ONLY if ≥1 channel delivered
```

- Reminders are created 1 hour before `dueDate`/`scheduledDate` at note
  creation/update time.
- An unconfigured email channel produces `skipped` (not `failed`) rows so the
  history UI can distinguish "provider missing" from "delivery error".
- Failed/skipped-only reminders remain pending → fixing configuration causes an
  automatic retry on the next heartbeat tick.

## Frontend Architecture

- **Routing** — Wouter with `React.lazy` route splitting (largest chunk kept
  below the build warning threshold, ~416 kB).
- **Data** — TanStack Query through the generated tRPC client; mutations
  invalidate list/stats queries. Optimistic complete-toggle where practical.
- **Layout** — `DashboardLayout` provides the persistent sidebar (categories +
  counts) and mobile navigation; skeleton component for initial load.
- **Theme** — Brutalist design tokens in `client/src/index.css`; dark/light
  handled by `ThemeContext` + `next-themes`. Preferences persist via
  `client/src/lib/preferences` and server-side preference storage.
- **UI primitives** — shadcn/ui components (Radix-based) in
  `client/src/components/ui/`; composed into feature components (NoteFilters,
  NotePreview, AIChatBox, etc.).

## Server Framework Layer (`server/_core/`)

Platform-provided building blocks, generally not edited by feature work:
`trpc.ts` (procedure factories), `context.ts` (request context/auth),
`oauth.ts`, `cookies.ts`, `llm.ts`, `notification.ts`, `heartbeat.ts`,
`imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `dataApi.ts`,
`storage.ts` (S3-compatible uploads via `@aws-sdk`), `vite.ts` (dev/preview
integration).

## Configuration

All environment reads funnel through `server/_core/env.ts` (`ENV` object) so
missing values fail predictably; see the env table in
[README.md](../README.md#getting-started).

## Testing Strategy

Vitest suites colocated in `server/*.test.ts` target the seams that matter:
AI output parsing fallbacks, logout cookie clearing, export/import round-trips,
templates, preferences, and reminder delivery states. External services (LLM,
push, email webhook, DB) are mocked at module boundaries so tests run hermetically.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Pull-based reminders via heartbeat endpoint | Survives restarts/serverless deploys; no drift from in-process `setInterval` |
| Delivery log with `skipped` state | Configuration gaps become visible product data, not silent failures |
| Graceful AI degradation | Note capture must never block on LLM availability |
| User-scoped composite indexes | Multi-tenant query performance without partitioning |
| Provider-neutral email webhook | Swappable email vendor; app owns no SMTP credentials |
| pnpm-patched wouter | Upstream bug workaround pinned reproducibly in `patches/` |
