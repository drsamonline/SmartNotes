/**
 * CLI entry point helpers (Stage 0 — Enhancements #18/#20).
 * Parses `--help`, `--version`, `--data-dir` and exposes app metadata.
 */
import { createRequire } from "node:module";

export const APP_NAME = "SmartNote Scheduler";

export function getAppVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json");
    return String(pkg.version ?? "0.0.0");
  } catch {
    // Bundled builds may not ship package.json next to the entry; fall back.
    return process.env.SMARTNOTE_VERSION ?? "1.0.0";
  }
}

export const HELP_TEXT = `${APP_NAME} v${getAppVersion()}

AI-powered note capture with automatic categorization and reminder scheduling.

Usage
  smartnote [options]

Options
  --port <number>        Port to listen on (default: 3000, or PORT env).
                         Falls back to the next free port if busy.
  --data-dir <path>      Directory for the local database, backups and config
                         (default: OS user-data dir; "Data" next to the binary
                         in packaged/portable mode).
  --backup               Create a backup ZIP in <data-dir>/backups and exit.
  --setup                Run the interactive first-run configuration wizard
                         (writes .env into the data dir) and exit.
  --open                 Open the app in the default browser once it is up.
  --help, -h             Show this help and exit.
  --version, -v          Show the version and exit.

Environment
  DATABASE_URL           MySQL connection string. When set (and DB_DRIVER is
                         not "sqlite") the app uses MySQL; otherwise it runs
                         on a portable SQLite file inside the data dir.
  DB_DRIVER              "mysql" | "sqlite" — force a driver explicitly.
  SMARTNOTE_DATA_DIR     Same as --data-dir.
  SMARTNOTE_PACKAGED     Set to 1 by portable launchers/binaries.
  SMARTNOTE_SCHEDULER    Set to 0 to disable the in-process reminder timer.
  SMARTNOTE_TICK_MS      Reminder tick interval in ms (default 60000).
  LOG_LEVEL              debug | info | warn | error (default: info).
  PORT                   Default listening port.

Examples
  smartnote --port 8080
  smartnote --data-dir "D:\\SmartNotePortable\\Data"
  smartnote --backup
`;

export interface CliArgs {
  help: boolean;
  version: boolean;
  port?: number;
  dataDir?: string;
  backup: boolean;
  setup: boolean;
  open: boolean;
}

/** Minimal argv parser — no dependency, works under tsx/node/bundled exe. */
export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { help: false, version: false, backup: false, setup: false, open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a === "--port" && argv[i + 1]) out.port = parseInt(argv[++i], 10) || undefined;
    else if (a.startsWith("--port=")) out.port = parseInt(a.slice(7), 10) || undefined;
    else if (a === "--data-dir" && argv[i + 1]) out.dataDir = argv[++i];
    else if (a.startsWith("--data-dir=")) out.dataDir = a.slice(11);
    else if (a === "--backup") out.backup = true;
    else if (a === "--setup") out.setup = true;
    else if (a === "--open") out.open = true;
  }
  return out;
}
