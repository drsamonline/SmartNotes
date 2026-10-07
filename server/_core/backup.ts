/**
 * Backup & snapshot service (Stage 1 — Enhancements #19 / #43).
 *
 * - createBackupZip(): packs the SQLite database + .env into `Data/backups/*.zip`
 *   using the system `zip` tool when present, with a dependency-free stored-ZIP
 *   writer as fallback (portable builds must not require extra tools).
 * - writeSnapshot(): plain `.db` copy for nightly rotation.
 * - rotateSnapshots(): keeps the newest N snapshots, deletes older ones.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createLogger } from "./logging";
import { getDataSubdir, getSqliteDbPath } from "./paths";

const log = createLogger("backup");

export const BACKUP_DIR = "backups";
export const SNAPSHOT_KEEP = 7;

export interface BackupResult {
  file: string;
  bytes: number;
  kind: "zip" | "sqlite-copy";
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

/** Run a command, resolving on exit code 0, rejecting otherwise. */
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (stored entries only, no dependencies)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Build a valid single-file-archive ZIP with STORED entries. */
function buildStoredZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method = stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, entry.data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6); // version needed
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10); // stored
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(entry.data.length, 20);
    cen.writeUInt32LE(entry.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42); // local header offset
    central.push(cen, nameBuf);

    offset += 30 + nameBuf.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Collect files to include in a backup (db + sidecars + config). */
function collectBackupFiles(): ZipEntry[] {
  const dbFile = getSqliteDbPath();
  const dir = path.dirname(dbFile);
  const entries: ZipEntry[] = [];
  const addIfExists = (file: string, name: string) => {
    try {
      entries.push({ name, data: fs.readFileSync(file) });
    } catch {
      /* optional file */
    }
  };
  addIfExists(dbFile, "smartnote.db");
  addIfExists(path.join(dir, "smartnote.db-wal"), "smartnote.db-wal");
  addIfExists(path.join(dir, "smartnote.db-shm"), "smartnote.db-shm");
  addIfExists(path.join(dir, ".env"), ".env");
  addIfExists(path.join(dir, ".session-secret"), ".session-secret");
  return entries;
}

/**
 * Create a portable backup ZIP inside `<dataDir>/backups/`.
 * Prefers system `zip`; falls back to the built-in stored-ZIP writer.
 */
export async function createBackupZip(label = "manual"): Promise<BackupResult> {
  const backupDir = getDataSubdir(BACKUP_DIR);
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `smartnote-backup-${label}-${stamp()}.zip`);

  const dbFile = getSqliteDbPath();
  if (!fs.existsSync(dbFile)) {
    throw new Error(`No database file to back up at ${dbFile}`);
  }

  // Flush WAL into the main db file so the copy is self-consistent.
  await checkpointWal();

  // Prefer system `zip` when available (smaller, standard archives); only pass
  // files that actually exist.
  const dir = path.dirname(getSqliteDbPath());
  const candidates = ["smartnote.db", "smartnote.db-wal", "smartnote.db-shm", ".env", ".session-secret"]
    .map((f) => path.join(dir, f))
    .filter((f) => fs.existsSync(f));
  try {
    await run("zip", ["-q", "-j", target, ...candidates]);
  } catch {
    /* zip missing or failed — fall through to the built-in writer */
  }
  if (!fs.existsSync(target)) {
    const entries = collectBackupFiles();
    if (entries.length === 0) throw new Error("Backup produced no files");
    fs.writeFileSync(target, buildStoredZip(entries));
  }

  const bytes = fs.statSync(target).size;
  log.info(`Backup written: ${target} (${bytes} bytes)`);
  return { file: target, bytes, kind: "zip" };
}

/** Best-effort WAL checkpoint via the storage layer (no-op for MySQL). */
async function checkpointWal(): Promise<void> {
  try {
    const { getDriver } = await import("../db/index");
    if (getDriver() !== "sqlite") return;
    const mod = await import("better-sqlite3");
    const Database = (mod.default ?? mod) as typeof import("better-sqlite3");
    const client = new Database(getSqliteDbPath());
    client.pragma("wal_checkpoint(TRUNCATE)");
    client.close();
  } catch (error) {
    log.warn("WAL checkpoint skipped", error);
  }
}

/** Write a plain .db snapshot and rotate old ones (nightly task, #43). */
export async function writeSnapshot(keep = SNAPSHOT_KEEP): Promise<BackupResult | null> {
  const dbFile = getSqliteDbPath();
  if (!fs.existsSync(dbFile)) return null;
  await checkpointWal();
  const snapDir = getDataSubdir(path.join(BACKUP_DIR, "snapshots"));
  fs.mkdirSync(snapDir, { recursive: true });
  const target = path.join(snapDir, `smartnote-${stamp()}.db`);
  fs.copyFileSync(dbFile, target);
  rotateSnapshots(snapDir, keep);
  const bytes = fs.statSync(target).size;
  log.info(`Snapshot written: ${target} (${bytes} bytes)`);
  return { file: target, bytes, kind: "sqlite-copy" };
}

/** Keep only the newest `keep` *.db snapshots in the directory. */
export function rotateSnapshots(snapDir: string, keep = SNAPSHOT_KEEP): number {
  let removed = 0;
  try {
    const files = fs
      .readdirSync(snapDir)
      .filter((f) => f.endsWith(".db"))
      .sort(); // timestamped names sort chronologically
    while (files.length > keep) {
      const oldest = files.shift();
      if (!oldest) break;
      fs.rmSync(path.join(snapDir, oldest));
      removed++;
    }
  } catch (error) {
    log.warn("Snapshot rotation failed", error);
  }
  return removed;
}
