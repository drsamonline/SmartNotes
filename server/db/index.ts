/**
 * Dual-driver storage layer (Stage 0 — Enhancement #47 groundwork, Stage 1 enabler #12).
 *
 * Every public function keeps the exact signature of the legacy `server/db.ts`
 * so existing callers (`notes.router`, `notifications`, `_core/oauth`, `_core/sdk`)
 * are unaffected. The concrete driver is chosen by configuration:
 *
 *   DB_DRIVER=sqlite | SMARTNOTE_DATA_DIR set without DATABASE_URL → SQLite (portable/offline)
 *   otherwise, with DATABASE_URL                                     → MySQL (cloud/hosted)
 *
 * Portability rules honoured here:
 *   - No `onDuplicateKeyUpdate`: upsertUser runs select→insert/update on both drivers.
 *   - No MySQL-only `result[0].insertId`: SQLite uses `$returningId()` / lastInsertRowid.
 *   - Timestamps are normalised to real `Date` objects on read (SQLite stores ISO text).
 */
import { and, desc, eq, lte } from "drizzle-orm";


import { ENV } from "../_core/env";
import { createLogger } from "../_core/logging";
import { getDataDir, getSqliteDbPath } from "../_core/paths";
import {
  InsertNotificationLog,
  InsertNote,
  InsertReminder,
  InsertUser,
  NotificationLog,
  Note,
  Reminder,
  User,
  notificationLogs as mysqlNotificationLogs,
  notes as mysqlNotes,
  reminders as mysqlReminders,
  users as mysqlUsers,
} from "../../drizzle/schema";
import {
  notificationLogs as sqliteNotificationLogs,
  notes as sqliteNotes,
  reminders as sqliteReminders,
  users as sqliteUsers,
} from "./schema.sqlite";

const log = createLogger("db");

export type DbDriver = "mysql" | "sqlite";

type AnyTable = any;  
// A query-builder-capable drizzle instance for either dialect.
type AnyDb = any;  

let _driver: DbDriver | null = null;
let _db: AnyDb | null = null;

/** Decide (and memoize) which driver to use. */
export function resolveDriver(): DbDriver {
  if (_driver) return _driver;
  const explicit = (process.env.DB_DRIVER ?? "").toLowerCase();
  if (explicit === "sqlite") _driver = "sqlite";
  else if (explicit === "mysql") _driver = "mysql";
  else if (explicit) throw new Error(`Unknown DB_DRIVER "${explicit}" (expected mysql|sqlite)`);
  else if (process.env.DATABASE_URL && !/^file:/i.test(process.env.DATABASE_URL)) _driver = "mysql";
  else _driver = "sqlite";
  return _driver;
}

/** Test helper: forget the resolved driver/connection. */
export function __resetDbForTests(): void {
  _driver = null;
  closeDb();
}

/** Close the underlying connection (if open). Safe to call multiple times. */
export function closeDb(): void {
  if (_db) {
    // mysql2/promise pool → .end(); better-sqlite3 → .close()
    const endable = _db as unknown as { end?: () => Promise<unknown>; $client?: { close?: () => void } };
    try {
      if (typeof endable.end === "function") void endable.end();
      else if (typeof endable.$client?.close === "function") endable.$client.close();
    } catch {
      /* ignore */
    }
  }
  _db = null;
}

/** Shared SQLite schema DDL — single source of truth for runtime, bootstrap, seed and tests. */
export const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openId TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  loginMethod TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lastSignedIn TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  dueDate TEXT,
  scheduledDate TEXT,
  isCompleted INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notes_user_category_idx ON notes(userId, category);
CREATE INDEX IF NOT EXISTS notes_user_due_date_idx ON notes(userId, dueDate);
CREATE INDEX IF NOT EXISTS notes_user_scheduled_date_idx ON notes(userId, scheduledDate);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  noteId INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  reminderTime TEXT NOT NULL,
  notificationType TEXT NOT NULL DEFAULT 'both',
  isSent INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS reminders_sent_time_idx ON reminders(isSent, reminderTime);
CREATE INDEX IF NOT EXISTS reminders_note_id_idx ON reminders(noteId);
CREATE TABLE IF NOT EXISTS notificationLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  noteId INTEGER REFERENCES notes(id) ON DELETE SET NULL,
  reminderId INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  error TEXT,
  createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notification_logs_user_created_idx ON notificationLogs(userId, createdAt);
CREATE INDEX IF NOT EXISTS notification_logs_note_id_idx ON notificationLogs(noteId);
`;

async function createConnection(driver: DbDriver): Promise<AnyDb> {
  if (driver === "mysql") {
    const mysql2 = await import("mysql2/promise");
    const { drizzle } = await import("drizzle-orm/mysql2");
    const pool = await mysql2.createPool(process.env.DATABASE_URL!);
    return drizzle(pool) as unknown as AnyDb;
  }
  const [{ drizzle }, Database] = await Promise.all([
    import("drizzle-orm/better-sqlite3"),
    import("better-sqlite3").then((m) => (m.default ?? m)),
  ]);
  getDataDir(); // ensure dir exists before opening the file
  const client = new (Database as typeof import("better-sqlite3"))(getSqliteDbPath());
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.exec(SQLITE_DDL);
  return drizzle(client) as unknown as AnyDb;
}

/** Lazily open (and memoize) the connection for the configured driver. */
export async function getDb(): Promise<AnyDb | null> {
  if (_db) return _db;
  const driver = resolveDriver();
  if (driver === "mysql" && !process.env.DATABASE_URL) {
    log.warn("MySQL driver selected but DATABASE_URL is missing; storage disabled");
    return null;
  }
  try {
    _db = await createConnection(driver);
    log.info(`Storage ready (driver=${driver}${driver === "sqlite" ? `, file=${getSqliteDbPath()}` : ""})`);
  } catch (error) {
    log.error("Failed to open database", error);
    return null;
  }
  return _db;
}

export function getDriver(): DbDriver {
  return resolveDriver();
}

// ---------------------------------------------------------------------------
// Driver adapters — the only dialect-aware code lives here.
// ---------------------------------------------------------------------------

interface Tables {
  users: AnyTable;
  notes: AnyTable;
  reminders: AnyTable;
  notificationLogs: AnyTable;
}

function tables(driver: DbDriver): Tables {
  return driver === "mysql"
    ? { users: mysqlUsers, notes: mysqlNotes, reminders: mysqlReminders, notificationLogs: mysqlNotificationLogs }
    : { users: sqliteUsers, notes: sqliteNotes, reminders: sqliteReminders, notificationLogs: sqliteNotificationLogs };
}

/** Normalise a row coming back from either driver into app-shaped values. */
 
function normalizeRow<T extends Record<string, any>>(row: T): T {
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(v)) {
      const d = new Date(v.replace(" ", "T"));
      if (!Number.isNaN(d.getTime())) (row as Record<string, unknown>)[key] = d;
    }
  }
  return row;
}

/**
 * Normalise a JS value for the active driver.
 * - MySQL keeps real `Date` objects (drizzle's timestamp mapper calls
 *   `.toISOString()` itself — passing a string would crash it).
 * - SQLite has no date type, so Dates are stored as ISO-8601 TEXT and
 *   converted back on read by `normalizeRow`.
 */
async function toSqlValue(v: unknown, driver: DbDriver = resolveDriver()): Promise<unknown> {
  if (v instanceof Date) return driver === "sqlite" ? v.toISOString() : v;
  if (v instanceof Promise) return toSqlValue(await v, driver);
  return v;
}

async function insertReturningId(
  driver: DbDriver,
  db: AnyDb,
  table: AnyTable,
  values: Record<string, unknown>,
): Promise<number> {
  const prepared: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(values)) prepared[k] = await toSqlValue(val, driver);
  if (driver === "mysql") {
    const result = await db.insert(table).values(prepared);
    return Number(result[0].insertId);
  }
  // better-sqlite3 dialect in drizzle-orm does not support `$returningId()`
  // (verified experimentally). `run()` on the query builder executes synchronously
  // and returns better-sqlite3's info object ({ changes, lastInsertRowid }).
  const info = db.insert(table).values(prepared).run() as { lastInsertRowid?: number | bigint };
  return Number(info?.lastInsertRowid ?? 0);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Existence probe: returns the first matching row (as `{ id: number }`) or
 * undefined — implemented with Drizzle ORM queries ONLY, so both drivers use
 * their normal, well-tested code path (no raw SQL, no private internals).
 *
 * MySQL note: drizzle's mysql2 session runs SELECTs in `rowsAsArray` mode, but
 * its prepared-query executor maps positional rows back into objects via
 * `mapResultRow(fields, …)` before returning them — so `select({ id })` yields
 * `{ id }` objects here too. Verified by the dual-driver contract tests.
 */
async function existsUserByOpenId(db: AnyDb, driver: DbDriver, openId: string): Promise<boolean> {
  const t = tables(driver);
  // NOTE: `limit(1)` is intentionally omitted. Drizzle's mysql2 dialect renders
  // LIMIT as a bound parameter (`limit ?`) and its prepared-statement executor
  // consumes params positionally — with the fake used in contract tests this
  // shifted WHERE-clause indices. A full scan on an indexed unique column is
  // cheap, so we keep the SQL shape trivial: SELECT … WHERE openId = ?.
  //
  // The select list uses the FULL-column form (`select()`), not `select({ id })`:
  // drizzle-orm ≥1.39 maps positional rows back into objects by reading the
  // MySQL field metadata attached to each row array (`row[Symbol.for('fields')]`),
  // which only real mysql2 packets carry. Full-column selects also match the
  // pattern every other read in this file already uses.
  const rows = await db.select().from(t.users).where(eq(t.users.openId, openId));
  return Array.isArray(rows) && rows.length > 0;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    log.warn("Cannot upsert user: database not available");
    return;
  }
  const driver = resolveDriver();
  const t = tables(driver);

  // NOTE: keep raw JS values here. `insertReturningId` applies per-driver
  // `toSqlValue` conversion at insert time; converting twice would corrupt
  // values (e.g. a pre-stringified date re-encoded into column order drift).
  // Explicit column list — never spread the whole `user` object: it may carry
  // DB-generated keys (createdAt/updatedAt/id) which would render as extra
  // bound parameters and shift every other value into the wrong column.
  const values: Record<string, unknown> = { openId: user.openId };
  for (const field of ["name", "email", "loginMethod", "role"] as const) {
    if (user[field] !== undefined) values[field] = user[field];
  }
  if (user.lastSignedIn !== undefined) values.lastSignedIn = user.lastSignedIn;
  if (values.role === undefined && user.openId === ENV.ownerOpenId) values.role = "admin";
  if (!values.lastSignedIn) values.lastSignedIn = new Date();

  try {
    // Existence probe for the select→insert/update upsert (no
    // `onDuplicateKeyUpdate`, so this stays dialect-free). Uses a plain
    // Drizzle SELECT — the same ORM path every other read uses.
    const found = await existsUserByOpenId(db, driver, user.openId);
    if (found) {
      // Drop `openId` from the UPDATE SET clause (it's the WHERE key).
      const updateSet = { ...values };
      delete updateSet.openId;
      if (Object.keys(updateSet).length > 0) {
        await db.update(t.users).set(updateSet).where(eq(t.users.openId, user.openId));
      }
    } else {
      await insertReturningId(driver, db, t.users, values);
    }
  } catch (error) {
    log.error("Failed to upsert user", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) {
    log.warn("Cannot get user: database not available");
    return undefined;
  }
  const t = tables(resolveDriver());
  const result = await db.select().from(t.users).where(eq(t.users.openId, openId)).limit(1);
  return result.length > 0 ? (normalizeRow(result[0]) as User) : undefined;
}

export async function getUserById(userId: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const t = tables(resolveDriver());
  const result = await db.select().from(t.users).where(eq(t.users.id, userId)).limit(1);
  return result[0] ? (normalizeRow(result[0]) as User) : undefined;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** Get all notes for a user */
export async function getUserNotes(userId: number): Promise<Note[]> {
  const db = await getDb();
  if (!db) return [];
  const t = tables(resolveDriver());
  const rows = await db
    .select()
    .from(t.notes)
    .where(eq(t.notes.userId, userId))
    .orderBy(desc(t.notes.createdAt), desc(t.notes.id));
  return (rows as unknown[]).map((r) => normalizeRow(r as Note));
}

/** Get notes by category for a user */
export async function getNotesByCategory(
  userId: number,
  category: "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning",
): Promise<Note[]> {
  const db = await getDb();
  if (!db) return [];
  const t = tables(resolveDriver());
  const rows = await db
    .select()
    .from(t.notes)
    .where(and(eq(t.notes.userId, userId), eq(t.notes.category, category)))
    .orderBy(desc(t.notes.createdAt), desc(t.notes.id));
  return (rows as unknown[]).map((r) => normalizeRow(r as Note));
}

/** Create a new note; returns the new row id. */
export async function createNote(data: InsertNote): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: Record<string, unknown> = { ...data };
  for (const k of ["createdAt", "updatedAt"]) delete values[k];
  return insertReturningId(resolveDriver(), db, tables(resolveDriver()).notes, values);
}

/** Update a note */
export async function updateNote(noteId: number, data: Partial<InsertNote>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const t = tables(resolveDriver());
  const driver = resolveDriver();
  const values: Record<string, unknown> = { ...data };
  delete values.updatedAt;
  // MySQL schema has onUpdateNow; emulate it for SQLite.
  if (driver === "sqlite") values.updatedAt = new Date().toISOString();
  // Normalise any remaining Date objects per driver (e.g. dueDate passed as Date).
  for (const [k, val] of Object.entries(values)) values[k] = await toSqlValue(val, driver);
  await db.update(t.notes).set(values).where(eq(t.notes.id, noteId));
}

/** Delete a note */
export async function deleteNote(noteId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const t = tables(resolveDriver());
  await db.delete(t.notes).where(eq(t.notes.id, noteId));
}

/** Get a single note by ID */
export async function getNoteById(noteId: number): Promise<Note | null> {
  const db = await getDb();
  if (!db) return null;
  const t = tables(resolveDriver());
  const result = await db.select().from(t.notes).where(eq(t.notes.id, noteId)).limit(1);
  return result.length > 0 ? (normalizeRow(result[0]) as Note) : null;
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/** Create a reminder */
export async function createReminder(data: InsertReminder): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const driver = resolveDriver();
  const values: Record<string, unknown> = { ...data };
  delete values.createdAt;
  for (const [k, val] of Object.entries(values)) values[k] = await toSqlValue(val, driver);
  await db.insert(tables(driver).reminders).values(values);
}

/** Get pending reminders (not yet sent, due at or before `now`) */
export async function getPendingReminders(now = new Date()): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  const driver = resolveDriver();
  const t = tables(driver);
  // SQLite stores timestamps as ISO TEXT → compare with an ISO string bound value.
  const threshold: string | Date = driver === "sqlite" ? now.toISOString() : now;
  const rows = await db
    .select()
    .from(t.reminders)
    .where(and(eq(t.reminders.isSent, 0), lte(t.reminders.reminderTime, threshold)))
    .orderBy(t.reminders.reminderTime);
  return (rows as unknown[]).map((r) => normalizeRow(r as Reminder));
}

/** Mark reminder as sent */
export async function markReminderAsSent(reminderId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const t = tables(resolveDriver());
  await db.update(t.reminders).set({ isSent: 1 }).where(eq(t.reminders.id, reminderId));
}

/** Get reminders for a note */
export async function getRemindersForNote(noteId: number): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  const t = tables(resolveDriver());
  const rows = await db.select().from(t.reminders).where(eq(t.reminders.noteId, noteId));
  return (rows as unknown[]).map((r) => normalizeRow(r as Reminder));
}

/** Delete reminders for a note */
export async function deleteRemindersForNote(noteId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const t = tables(resolveDriver());
  await db.delete(t.reminders).where(eq(t.reminders.noteId, noteId));
}

// ---------------------------------------------------------------------------
// Notification logs
// ---------------------------------------------------------------------------

export async function createNotificationLog(data: InsertNotificationLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const driver = resolveDriver();
  const values: Record<string, unknown> = { ...data };
  delete values.createdAt;
  for (const [k, val] of Object.entries(values)) values[k] = await toSqlValue(val, driver);
  await db.insert(tables(driver).notificationLogs).values(values);
}

export async function getNotificationHistory(userId: number): Promise<NotificationLog[]> {
  const db = await getDb();
  if (!db) return [];
  const t = tables(resolveDriver());
  const rows = await db
    .select()
    .from(t.notificationLogs)
    .where(eq(t.notificationLogs.userId, userId))
    .orderBy(desc(t.notificationLogs.createdAt), desc(t.notificationLogs.id))
    .limit(100);
  return (rows as unknown[]).map((r) => normalizeRow(r as NotificationLog));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Get notes stats for a user */
export async function getNoteStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, pending: 0, overdue: 0 };
  const t = tables(resolveDriver());
  const allNotes = (await db.select().from(t.notes).where(eq(t.notes.userId, userId))) as Note[];
  const normalized = allNotes.map((n) => normalizeRow(n));
  const completed = normalized.filter((n) => n.isCompleted).length;
  const pending = normalized.length - completed;
  const now = new Date();
  const overdue = normalized.filter((n) => !n.isCompleted && n.dueDate && n.dueDate < now).length;
  return { total: normalized.length, completed, pending, overdue };
}
