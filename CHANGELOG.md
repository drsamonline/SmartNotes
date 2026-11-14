## Unreleased

- **A reminder is delivered exactly once, even when two heartbeat runs overlap.**
  `processPendingReminders()` read the pending rows and only wrote `isSent` *after* a
  successful send, so the durable callback had a read-then-write window: two overlapping
  runs both selected the same reminder and both pushed it. Delivery is now gated by
  `claimReminder()` — a single conditional `UPDATE … WHERE id = ? AND isSent = 0` that
  reports whether this caller won — so the loser skips the row instead of sending it.
  A claim that fails to deliver is handed back with `releaseReminderClaim()`, so a
  missing email provider or a transient outage still leaves the reminder pending for the
  next heartbeat, as before. `server/notifications.test.ts` (6 tests) proves the
  duplicate — it fails on the old code with two deliveries — and the storage claim is
  asserted on both drivers in `server/db/drivers.contract.test.ts`. This is item 31 of
  [docs/ENHANCEMENTS.md](./docs/ENHANCEMENTS.md) — idempotent reminder processing — solved
  at the row (one conditional claim) rather than with a unique key on the delivery log,
  because the log must still be free to record a failed attempt and its retry.

- **A damaged backup file imports the notes it can, and says what it could not.**
  The browser importer validated the file with a hand-written filter that was weaker than the
  server's zod schema, so one note with a title over 255 characters, an empty body, or a
  date-only `dueDate` made the server reject the **whole batch** — and the page showed nothing.
  The shape now lives once, in `shared/noteBackup.ts`, and both the router and the importer use
  it: long titles are cut to the column width, `2026-10-10` is rewritten as the ISO datetime the
  server demands, unreadable dates become `null`, and anything genuinely unimportable is counted
  and named in the message instead of disappearing. A file over the 500-note limit now imports
  500 and says how many were left out, rather than being refused outright. `server/noteBackup.test.ts`
  (9 tests) asserts that every note the importer returns is a note the router accepts, and fails
  if the schema is ever declared twice again.

## 1.0.1 — 2026-10-25

- **Licence: PolyForm Noncommercial 1.0.0.** Every repository now carries the canonical text
  from polyformproject.org with the Required Notice line, and the four places a repo states
  its licence agree: LICENSE, the SPDX headers, the README and package.json.
- **The public demo is the app.** A build now fails if `docs/play/index.html` is not the app,
  because a demo running older code is two code paths for one program.

<div align="center">

# 🔄 Changelog

**SmartNote Scheduler** — release history

*Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/)*

</div>

---

## 📖 Versions

| Version | Date | Highlights |
|---|---|---|
| [1.1.0-unreleased](#-unreleased--planned) | — | Portable apps & enhancement roadmap (see [docs](./docs/IMPLEMENTATION_PLAN.md)) |
| [1.0.0](#-100--2026-10-07) | 2026-10-07 | First stable release |

---

## 💡 Unreleased / Planned

### Added *(planned — approved scope pending)*

- **Portable app deliverables**: Windows `.exe` and Linux portable/AppImage builds
  ([design RFC](./docs/PORTABLE_APPS.md), [staged plan](./docs/IMPLEMENTATION_PLAN.md)).
- Embedded SQLite driver for offline single-file deployments (dual-driver with MySQL).
- Recurring reminders, snooze presets, quiet hours and idempotent notification delivery.
- Tags, pinning, quick-capture palette mode, dark/light theme toggle.
- Full 50-item non-bloat enhancement backlog published in
  [docs/ENHANCEMENTS.md](./docs/ENHANCEMENTS.md).

---

## 🚀 [1.0.0] — 2026-10-07

First stable release of SmartNote Scheduler: an AI-powered note categorization
and reminder scheduling app with a brutalist design system.

### Added

#### Database & Schema
- `notes` table: id, userId, title, content, category, priority, dueDate,
  scheduledDate, isCompleted, createdAt, updatedAt.
- `reminders` table: id, noteId (cascade delete), reminderTime,
  notificationType, isSent, createdAt.
- `notificationLogs` table for delivery history with `sent` / `failed` /
  `skipped` statuses per channel (push/email).
- User-scoped indexes on `(userId, category)`, `(userId, dueDate)`,
  `(userId, scheduledDate)` plus reminder delivery indexes for query
  performance.
- Drizzle migrations (`drizzle/0000`–`0003`) and snapshot journal.

#### Backend — AI & Categorization
- LLM-based note categorization into Tasks, Deadlines, Schedule, Thoughts,
  Learning.
- LLM-based priority detection (Low / Medium / High) and concise title
  generation.
- Natural-language date/time extraction ("tomorrow at 3pm", "Friday at 10am").
- tRPC `notes` router: create, list, get, listByCategory, update, updateNote,
  delete, toggleComplete, search, stats, notificationHistory, importBackup.
- Reminder scheduling that triggers 1 hour before deadline/scheduled time.
- Reminder processing endpoint `POST /api/scheduled/process-reminders` driven
  by a durable platform heartbeat instead of an in-process timer.

#### Notifications
- Push notification delivery through the Manus owner notification API.
- Optional email delivery via provider-neutral webhook
  (`EMAIL_WEBHOOK_URL` / `EMAIL_WEBHOOK_API_KEY`).
- Notification history/log view with sent, failed, and skipped states;
  unconfigured channels are recorded as *skipped* rather than failing silently.
- Failed/skipped-only reminders remain pending so configuration issues are
  visible and retryable.

#### Frontend
- Brutalist design system: black background, oversized condensed white
  typography, red divider lines.
- Dashboard layout with sidebar showing all 5 categories with item counts.
- Category-specific views, quick-note input with auto-categorization feedback,
  color-coded category badges/tabs.
- Note cards with edit modal, delete confirmation, complete toggle, priority
  editing, and overdue indicator styling.
- Search page with title/content filtering, category tabs, hide-completed
  toggle, and sort options (date, priority, category).
- Stats widgets: total, completed, pending, overdue.
- Settings page: JSON backup export/import, CSV and Markdown exports with
  preview, and saved filter presets.
- Responsive mobile navigation (verified at 375px).

#### Testing & Quality
- Vitest suites for AI parsing/fallbacks, auth logout cookie handling, note
  export round-trips, templates, preferences, and notification delivery.
- Route-level client code splitting (largest JS chunk reduced to ~416 kB).

### Known Limitations
- Firefox and Safari cross-browser QA could not run in the development sandbox;
  perform those checks after deployment.
- The sandbox preview URL is not a durable production callback target; create a
  one-minute Heartbeat job against the deployed
  `POST /api/scheduled/process-reminders` endpoint.

[1.0.0]: https://github.com/your-org/smartnote-scheduler/releases/tag/v1.0.0

---

<div align="center">

*© 2026 SmartNote Scheduler contributors · PolyForm Noncommercial License 1.0.0*

</div>
