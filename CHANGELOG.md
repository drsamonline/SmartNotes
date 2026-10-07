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

*© 2026 SmartNote Scheduler contributors · MIT License*

</div>
