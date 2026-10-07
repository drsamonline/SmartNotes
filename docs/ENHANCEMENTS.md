<div align="center">

# ✨ SmartNote Scheduler — 50 Non-Bloat Enhancements

**Curated backlog · v1.0.0 baseline · October 2026**

Every item below is scoped to be _small, measurable and dependency-light_.
Nothing here adds heavy libraries, background daemons or render-blocking assets.
Each enhancement lists its **cost** (effort) and **impact** so you can prune freely.

</div>

---

## 📖 Table of Contents

| Group | Items | Theme |
|---|---|---|
| [A. Performance](#-a-performance-items-1–10) | 1–10 | Faster loads, leaner bundles |
| [B. Portable Packaging](#-b-portable-packaging-items-11–20) | 11–20 | `.exe` + Linux portable deliverables |
| [C. Core UX — Notes & Capture](#-c-core-ux--notes--capture-items-21–30) | 21–30 | Capture → organize friction removal |
| [D. Reminders & Notifications](#-d-reminders--notifications-items-31–37) | 31–37 | Reliability of the promise the app makes |
| [E. Data, Security & Resilience](#-e-data-security--resilience-items-38–44) | 38–44 | Don't lose data, don't leak data |
| [F. Developer Experience](#-f-developer-experience-items-45–50) | 45–50 | Keep the codebase cheap to change |

**Legend:** `S` ≈ < ½ day · `M` ≈ ½–2 days · `L` ≈ > 2 days

---

## ⚡ A. Performance (Items 1–10)

> Goal: cut payload and re-render cost without new infrastructure.

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 1 | **Route-level code splitting** via `React.lazy` on Wouter pages | Built into React; only shrinks the initial chunk | S | 🔥🔥🔥 |
| 2 | **Audit & trim unused Radix deps** — 20+ `@radix-ui/*` packages are installed but several components are never imported | Pure bundle deletion, zero behavior change | S | 🔥🔥 |
| 3 | **Replace moment-class date handling with existing `date-fns` v4 tree-shaken imports** everywhere | Dep already present; removes duplicate logic | S | 🔥 |
| 4 | **Virtualize long note lists** (`@tanstack/react-virtual`) once list > 200 items | ~5 KB lib, only mounted on large lists | M | 🔥🔥 |
| 5 | **Debounce search input + server-side `LIKE` index prefix match** (`INDEX(content(64))` prefix) | One hook + one migration; avoids full scans | S | 🔥🔥 |
| 6 | **`content-visibility: auto` on note cards & CSS-only skeleton loaders** | Two CSS rules; skips offscreen layout | S | 🔥 |
| 7 | **Self-host subset fonts** (woff2, `font-display: swap`, preload) instead of remote CDN | Removes a network round-trip; essential for portable/offline mode | M | 🔥🔥 |
| 8 | **AVIF/WebP hero images + explicit width/height** in `client/public` | Build-time conversion, no runtime cost | S | 🔥 |
| 9 | **Persisted TanStack Query cache with tuned `staleTime`** per router (stats: 60 s, list: 10 s) | Config only; kills refetch storms after mutations | S | 🔥🔥 |
| 10 | **esbuild minify + gzip/brotli precompress at build** and serve `Content-Encoding` from static middleware | Already using esbuild; two flags | S | 🔥 |

---

## 📦 B. Portable Packaging (Items 11–20)

> Goal: double-clickable **Windows `.exe`** and **Linux portable** builds. See
> [`PORTABLE_APPS.md`](./PORTABLE_APPS.md) for the full technical design.

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 11 | **Single-file Node SEA / `esbuild --compile` server binary** (`dist/smartnote-server.exe` + ELF) | No Electron, no Chromium — same runtime you already ship | L | 🔥🔥🔥 |
| 12 | **Embedded SQLite driver (`better-sqlite3`) as offline DB adapter** behind existing Drizzle API | One native dep, prebuilt binaries for win32/linux x64 | L | 🔥🔥🔥 |
| 13 | **Launcher script generation**: PowerShell/Bash start-stop scripts alongside binaries | Text files; zero runtime weight | S | 🔥🔥 |
| 14 | **Portable data dir resolution** (`%LOCALAPPDATA%\SmartNote` / `~/.local/share/smartnote`, override via `--data-dir`) | ~30 lines; required for "carry-on-a-stick" behavior | S | 🔥🔥🔥 |
| 15 | **Auto-open-browser on startup flag (`--open`)** with port-conflict fallback (already has `findAvailablePort`) | Reuses existing logic | S | 🔥 |
| 16 | **Cross-OS release pipeline** (`electron-builder`-free: `pnpm package:win` / `package:linux` producing zip + AppImage tarball) | CI-only tooling; users get plain archives | M | 🔥🔥🔥 |
| 17 | **`.env` bootstrap wizard on first run** (interactive prompt if OAuth/DB vars missing) | Server-side readline; prevents silent misconfig | M | 🔥🔥 |
| 18 | **Built-in `/healthz` + graceful shutdown (SIGTERM/SIGINT flush)** | ~20 lines; makes the exe behave like a real service | S | 🔥🔥 |
| 19 | **One-command data backup/restore ZIP** (DB dump + uploads) exposed both in UI and CLI (`--backup`) | Reuses existing export router | M | 🔥🔥 |
| 20 | **Version banner + `--version` / `--help` CLI flags** in the compiled entry | Trivial; huge support-ticket saver | S | 🔥 |

---

## 📝 C. Core UX — Notes & Capture (Items 21–30)

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 21 | **Quick-capture hotkey modal (`Ctrl/Cmd+K` palette already via cmdk — add bare "new note" mode)** | cmdk is already installed | S | 🔥🔥🔥 |
| 22 | **Inline reminder chip when creating a note** ("due tomorrow?" one-tap suggestions from parsed dates) | Uses AI date extraction that already exists | M | 🔥🔥🔥 |
| 23 | **Pin/star favorites with a pinned section** (`isPinned` boolean column) | One column, one sort clause | S | 🔥🔥 |
| 24 | **Tags with autocomplete + tag filter rail** (normalized `note_tags` join table) | Small schema addition, big organization win | M | 🔥🔥 |
| 25 | **Markdown-lite rendering in note view** (headings, bold, lists, checkboxes) with a tiny renderer (~7 KB `marked` subset) | No editor framework | M | 🔥🔥 |
| 26 | **Recurring reminders** (`recurrence` enum: none/daily/weekly/monthly, reschedule on complete) | One column + branch in existing processor | M | 🔥🔥🔥 |
| 27 | **Swipe/keyboard archive & delete with undo toast** (5 s soft-delete window client-side) | Optimistic mutation you already have infra for | S | 🔥🔥 |
| 28 | **Group notes by category tabs with counts** (stats endpoint already returns counts) | Pure UI reuse | S | 🔥 |
| 29 | **Dark/light/system theme toggle persisted to preferences** | Tailwind `dark:` classes already available | S | 🔥🔥 |
| 30 | **"Smart paste"** — dropping text/URL creates a note and runs categorization immediately | Chains two existing features | S | 🔥 |

---

## 🔔 D. Reminders & Notifications (Items 31–37)

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 31 | **Idempotent reminder processing** (unique key on `(reminderId, dueAt)` in logs) | One index; prevents duplicate pushes on retry | S | 🔥🔥🔥 |
| 32 | **Exponential-backoff retry queue for failed sends** (in-table `attempts` column, max 5) | No Redis/cron infra; piggybacks Heartbeat | M | 🔥🔥 |
| 33 | **Quiet hours / do-not-disturb window** stored in preferences | Filter in processor + one settings row | S | 🔥 |
| 34 | **Digest mode** — batch due reminders into one notification per interval | Aggregation inside existing processor pass | M | 🔥 |
| 35 | **Notification delivery history page** (the `notification_logs` table already records everything) | Read-only page over existing data | S | 🔥🔥 |
| 36 | **Snooze presets** (10 m / 1 h / tomorrow 9 am) hitting a tiny tRPC proc | One procedure, one button group | S | 🔥🔥🔥 |
| 37 | **Client-visible "next fire time" on each reminder card** | Derived field in existing query | S | 🔥 |

---

## 🛡️ E. Data, Security & Resilience (Items 38–44)

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 38 | **Rate limiting on auth + AI endpoints** (in-memory token bucket, keyed per session) | ~60 LOC, no external store | M | 🔥🔥🔥 |
| 39 | **Structured request logging with correlation IDs** (small middleware) | Stdlib-only; transforms debugging cost | S | 🔥🔥 |
| 40 | **Column-level input hardening** — Zod max lengths + HTML-entity neutralizer at router boundary | Extends schemas that already exist | S | 🔥🔥 |
| 41 | **Session cookie hardening** (`SameSite=Lax`, `Secure` in prod, rotating `JWT_SECRET` guidance in docs) | Config + docs | S | 🔥🔥 |
| 42 | **Soft-delete notes (`deletedAt`) with 30-day trash + purge job** | One column, one scheduled sweep | M | 🔥🔥 |
| 43 | **Automated nightly DB snapshot** to the portable data dir (rotate last 7) | Shell/Node one-liner via existing backup path (#19) | S | 🔥🔥 |
| 44 | **Secret scanning + lockfile audit in CI** (`gitleaks`-style check, `pnpm audit --prod`) | CI step only | S | 🔥 |

---

## 🧰 F. Developer Experience (Items 45–50)

| # | Enhancement | Why it's non-bloat | Cost | Impact |
|---|---|---|---|---|
| 45 | **`make`/`pnpm` task aliases** for the 12 most-used commands incl. new packaging targets | Package.json scripts | S | 🔥 |
| 46 | **Seed script** (`pnpm db:seed`) with realistic demo notes/reminders | One file; powers demos + perf tests | S | 🔥🔥 |
| 47 | **Contract tests for tRPC inputs/outputs** using existing Vitest setup | Test-only; catches schema drift early | M | 🔥🔥 |
| 48 | **Bundle-budget CI check** (`vite-plugin-visualizer` report fails if main chunk > X KB) | Dev-only plugin | S | 🔥 |
| 49 | **Prettier + ESLint flat-config with import ordering**, run on pre-commit (husky-less: `simple-git-hooks` optional) | Static tooling | S | 🔥 |
| 50 | **Docs automation**: typed env-var table generated from `env.ts`, and this doc set validated for broken links in CI | Script + CI | M | 🔥 |

---

## 🎯 Top-10 Highest Value-per-Effort (if you only fund a slice)

1. **#11/#12/#14/#16** — the portable `.exe`/Linux stack (your headline ask)
2. **#26 Recurring reminders** — biggest functional gap today
3. **#22 Inline reminder-from-date chips** — turns captured intent into action
4. **#36 Snooze presets** — cheapest delight
5. **#31 Idempotent processing** — protects trust in notifications
6. **#1 Route code-splitting** — instant perceived speedup
7. **#42 Trash + soft delete** — prevents the #1 data-loss complaint
8. **#38 Rate limiting** — closes the obvious abuse vector
9. **#29 Theme toggle** — visible polish, trivial cost
10. **#43 Nightly snapshots** — insurance policy for portable users

---

<div align="center">

*Next: see [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the staged delivery plan.*

**© 2026 SmartNote Scheduler contributors · MIT License**

</div>
