/**
 * Data-directory resolver (Stage 0 — Enhancement #14).
 *
 * Resolution order (first match wins):
 *   1. `--data-dir <path>` CLI flag
 *   2. `SMARTNOTE_DATA_DIR` environment variable
 *   3. `<appRoot>/Data` when running next to a bundled binary (portable mode)
 *   4. OS user-data dir: ~/.smartnote (Linux) / %APPDATA%\SmartNote (Win) / ~/Library/Application Support/SmartNote (macOS)
 *
 * The resolved directory is created lazily on first access and holds:
 *   smartnote.db        – SQLite database (portable/offline mode)
 *   .env                – first-run bootstrap config (Stage 1)
 *   backups/            – export ZIPs & nightly snapshots (Stage 1)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let _dataDir: string | null = null;

function parseDataDirFlag(argv: string[]): string | null {
  const i = argv.findIndex((a) => a === "--data-dir" || a.startsWith("--data-dir="));
  if (i === -1) return null;
  const arg = argv[i];
  if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1) || null;
  return argv[i + 1] ?? null;
}

function defaultDataDir(): string {
  switch (process.platform) {
    case "win32":
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "SmartNote");
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "SmartNote");
    default:
      return path.join(os.homedir(), ".smartnote");
  }
}

/** True when the app looks like it was launched from a packaged bundle (single-file exe/ELF or portable zip). */
export function isPackaged(): boolean {
  // Bundled builds set SMARTNOTE_PACKAGED=1 in their launcher / embedder.
  return process.env.SMARTNOTE_PACKAGED === "1";
}

/** Resolve (but do not create) the data directory. */
function resolveDataDir(): string {
  if (!_dataDir) {
    const fromFlag = parseDataDirFlag(process.argv);
    const candidate =
      fromFlag ??
      process.env.SMARTNOTE_DATA_DIR ??
      (isPackaged() ? path.join(path.dirname(process.execPath), "Data") : defaultDataDir());
    _dataDir = path.resolve(candidate);
  }
  return _dataDir;
}

/**
 * Returns the absolute, existing data directory. Creates it (plus `backups/`) on demand.
 */
export function getDataDir(): string {
  const dir = resolveDataDir();
  for (const sub of ["", "backups"]) {
    try {
      fs.mkdirSync(sub ? path.join(dir, sub) : dir, { recursive: true });
    } catch {
      /* best-effort; later file ops will surface real errors */
    }
  }
  return dir;
}

/** A subdirectory path inside the data dir (does not create anything). Pass "" for the root. */
export function getDataSubdir(sub: string): string {
  return path.join(resolveDataDir(), sub);
}

/** Path to the portable SQLite database file (does not create anything). */
export function getSqliteDbPath(): string {
  return path.join(resolveDataDir(), "smartnote.db");
}

/** Test helper: reset the memoized resolution. */
export function __resetDataDirForTests(): void {
  _dataDir = null;
}
