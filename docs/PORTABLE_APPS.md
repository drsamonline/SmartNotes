<div align="center">

# 📦 Portable App Design — Windows `.exe` & Linux Portable

**SmartNote Scheduler · Packaging RFC · October 2026**

_How to ship this app as a double-clickable, self-contained program on
Windows and Linux — without Electron bloat._

</div>

---

## 📖 Table of Contents

1. [What "portable" means here](#-what-portable-means-here)
2. [Reality check: current architecture constraints](#-reality-check-current-architecture-constraints)
3. [Option analysis (4 strategies compared)](#-option-analysis)
4. [Recommended strategy — Tiered approach](#-recommended-strategy)
5. [Technical design](#-technical-design)
6. [Build pipeline](#-build-pipeline)
7. [Target artifact layouts](#-target-artifact-layouts)
8. [Risks & mitigations](#-risks--mitigations)
9. [Decision points for you](#-decision-points-for-you)

---

## 🎯 What "Portable" Means Here

| Property | Requirement |
|---|---|
| **No installer required** | Unzip → double-click `SmartNote.exe` / run `./smartnote.AppImage` |
| **No system Node.js** | Runtime embedded in the artifact |
| **No external database server** | Data must live in a local file (SQLite) or optional remote MySQL |
| **Self-contained state** | All user data under one folder (portable mode) or OS app-data dir |
| **Offline-first core** | Notes CRUD works with zero network; AI/notifications degrade gracefully |

---

## 🔍 Reality Check: Current Architecture Constraints

Verified against the codebase (v1.0.0):

| Constraint | Location | Implication |
|---|---|---|
| DB is **MySQL-only** (`drizzle-orm/mysql2`) | `server/db.ts` | Must add a SQLite adapter for offline portable use |
| Auth depends on **external OAuth server** | `server/_core/oauth.ts`, `OAUTH_SERVER_URL` | Portable builds need a local/dev identity fallback (single-user mode) |
| AI + notifications call **platform APIs** | `server/_core/llm.ts`, `notification.ts`, `env.ts` | Already fail-soft; keep as optional online features |
| Heartbeat cron hits `POST /api/scheduled/process-reminders` | `server/_core/heartbeat.ts` | Portable build needs an **in-process interval timer** instead |
| Server already bundles cleanly via esbuild ESM | `package.json → build` | Great starting point for single-file compilation |
| Static client served by same Express process | `server/_core/vite.ts` | One binary can serve UI + API — ideal for portability |

✅ Conclusion: the **web-server-in-a-box** model is perfect for portable apps.
We only need: embedded runtime + embedded DB + local scheduling + data-dir logic.

---

## ⚖️ Option Analysis

| Option | Artifact size | RAM | Startup | Effort | Verdict |
|---|---|---|---|---|---|
| **A. Electron** (Chromium + Node) | ~180–260 MB | 300 MB+ | Slow | M | ❌ Bloat; violates your non-bloat rule. The UI is already a web app served locally — Chromium would be re-added just to render it. |
| **B. Tauri** (Rust shell + WebView2/WebKitGTK) | ~10–25 MB | Low | Fast | L (rewrite of deploy model + Rust toolchain) | ⚠️ Great long-term native-desktop option, but heavy migration now; WebView still required per-OS. |
| **C. Single-file Node executable** (Node 20 SEA / `bun --compile` / Deno compile) serving the built SPA + embedded SQLite | ~60–90 MB (Node SEA) or ~95 MB (Bun) | ~50–80 MB | < 1 s | M | ✅ **Recommended.** Zero UI rewrite, true portable, browser-based rendering. |
| **D. pkg-style wrapper around existing dist + portable zip with bundled Node** | ~70 MB | Same as C | Fast | S | ✅ **Fastest interim win** — ship this first while C is hardened. |

### Why C (+D as stepping stone) fits "non-bloat, no performance loss"

- No second rendering engine added — users' own browser renders the React app.
- Same code paths as today's production server (`dist/index.js`).
- SQLite via `better-sqlite3` has prebuilt binaries for `win32-x64` and `linux-x64` — no compiler needed at install time.
- Memory footprint ≈ current Node server (no regression).

---

## 🏆 Recommended Strategy

```
Phase 1 (quick win)   → Option D: "portable zip" = bundled node.exe + dist + launcher scripts
Phase 2 (headline)    → Option C: single-file binaries  SmartNote.exe / smartnote (ELF) / .AppImage
Phase 3 (optional)    → Option B: Tauri tray wrapper if you later want a native window + global hotkeys
```

Each phase keeps the previous artifacts working — nothing is thrown away.

---

## 🛠️ Technical Design

### 1. Database abstraction layer

```
shared/                 # schema stays shared (Drizzle)
server/db.ts            # factory: picks driver from config
  ├── mysql2 adapter    # existing (SaaS/cloud deployments)
  └── sqlite adapter    # new (portable builds) — better-sqlite3 + drizzle-orm/sqlite-core
```

- Keep **one schema definition**; generate two migration sets (`drizzle/mysql/*`, `drizzle/sqlite/*`).
- Portable default: `<dataDir>/smartnote.db`. `DATABASE_URL=mysql://…` env still overrides → hybrid cloud mode.

### 2. Identity in portable mode

- Add **local single-user mode**: on first run, create a local owner session (cookie signed with a generated secret stored in the data dir). OAuth remains the path when `OAUTH_SERVER_URL` is set.
- No passwords needed initially (personal device); optional PIN gate later (enhancement backlog #41 area).

### 3. Scheduling without Heartbeat

```ts
// server/_core/scheduler.ts (new, ~40 lines)
if (isPortable) setInterval(() => processDueReminders(), 60_000);
// cloud deployments keep the existing POST /api/scheduled/process-reminders route
```

### 4. Data directory resolution (`--data-dir` aware)

| OS | Default location | Portable override |
|---|---|---|
| Windows | `%LOCALAPPDATA%\SmartNote\` | `.\Data\` next to exe if present (classic portable-apps convention) |
| Linux | `~/.local/share/smartnote/` | `./Data/` next to binary |

Contents: `smartnote.db`, `config.env`, `logs/`, `backups/`, `secret.key`.

### 5. CLI surface of the compiled binary

```text
SmartNote.exe                # start server + open http://localhost:PORT in default browser
SmartNote.exe --port 8080    # fixed port (else auto-fallback, already implemented)
SmartNote.exe --no-open      # headless
SmartNote.exe --data-dir DIR # relocate all state
SmartNote.exe --backup       # write ZIP into backups/ and exit
SmartNote.exe --restore f.zip
SmartNote.exe --version / --help
```

### 6. Compilation mechanics (two viable toolchains)

| Toolchain | How | Notes |
|---|---|---|
| **Node 20+ SEA** | `esbuild bundle → all-in-one.js` → `postject` injects into `node` binary + `sea-config.json` assets (client `dist/public`, migrations) | Official-ish; assets read via `SEA.getBlock`/embedded fs |
| **Bun** | `bun build server/_core/index.ts --compile --target=bun-windows-x64 / bun-linux-x64` ; static files embedded via `import.meta.withConfig` or shipped beside binary | Simplest cross-compile matrix; adds Bun runtime (~95 MB) |

Recommendation: prototype with **Bun** (fastest path), fall back to **Node SEA** if you must stay strictly on Node. Both produce the same UX contract above.

---

## 🏗️ Build Pipeline

```
pnpm build                    # vite client build + esbuild server bundle (exists)
pnpm package:win              # → release/SmartNote-win-x64-portable.zip   (.exe + README.txt + Start.bat)
pnpm package:linux            # → release/SmartNote-linux-x64-portable.tar.gz (ELF + .desktop + AppRun)
pnpm package:appimage         # (stretch) → SmartNote-x86_64.AppImage
```

CI sketch (GitHub Actions):

```yaml
jobs:
  portable:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile && pnpm build
      - run: pnpm package:${{ matrix.os == 'windows-latest' && 'win' || 'linux' }}
      - uses: actions/upload-artifact@v4
        with: { name: smartnote-${{ matrix.os }}, path: release/ }
```

---

## 📁 Target Artifact Layouts

**Windows portable (Phase 2 single-file):**

```
SmartNote-win-x64-portable.zip
├── SmartNote.exe          # everything embedded (server + client + migrations)
├── README.txt             # 10-line quickstart
└── Data/                  # created on first run (portable mode)
    ├── smartnote.db
    ├── backups/
    └── logs/
```

**Linux portable:**

```
SmartNote-linux-x64-portable.tar.gz
├── smartnote              # ELF binary, chmod +x
├── smartnote.desktop      # optional menu entry (Installs once via --install-desktop)
├── icon.png
└── Data/                  # same layout as Windows
```

---

## ⚠️ Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `better-sqlite3` native module inside SEA | Med | Use prebuilt `.node` shipped beside binary (Phase 1) or Bun's built-in `bun:sqlite` (zero native deps) ← strong reason to prototype Bun |
| Antivirus false positives on unsigned `.exe` | Med | Code-sign with an OV certificate (~$70–400/yr) before public release; document for internal use |
| Users expect "app window", get browser tab | Low–Med | Phase 3 Tauri/webview flag; or ship `--app` Chrome/Edge mode shortcut (`msedge --app=URL`) at zero cost |
| MySQL↔SQLite dialect drift in queries | Med | Contract tests (#47) run against **both** drivers in CI |
| Ports firewalls on corporate machines | Low | Already auto-selects free port; add `--host` bind option |

---

## 🧭 Decision Points For You

Before implementation starts, we need these four calls:

1. **Toolchain:** Bun-compiled (smaller effort, adds Bun runtime) vs Node SEA (pure Node, more plumbing)? → _Suggested: prototype Bun, keep Node SEA as fallback._
2. **Desktop window?** Browser-tab UX (free) vs add Tauri shell later (+1 phase)? → _Suggested: browser now, Tauri optional Phase 3._
3. **Code signing?** Buy Windows cert before public distribution? → _Suggested: yes if distributing outside your machine; skip for personal/internal._
4. **Cloud parity:** keep MySQL mode fully supported alongside SQLite? → _Suggested: yes — dual-driver, same schema._

---

<div align="center">

*Effort estimates for all of the above are staged in
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) (Stages 0–5).*

**© 2026 SmartNote Scheduler contributors · MIT License**

</div>
