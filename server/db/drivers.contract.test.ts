/**
 * Dual-driver storage contract tests (Stage 0 gate).
 *
 * The SAME assertion suite runs twice:
 *   1. SQLite  – real better-sqlite3 file in a temp data dir.
 *   2. MySQL   – the production code path against a small dialect-aware
 *                in-memory SQL fake for `mysql2/promise`, so no external
 *                database is needed to prove parity of the adapter layer
 *                (insertId handling, upsert select→insert/update, date
 *                normalisation, reminder cascade deletes).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// MySQL-side fake: intercept only the mysql2/promise import used by drizzle.
// Drizzle (promise mode) calls `pool.query({ sql, rowsAsArray }, params)` and
// reads `result[0]` — either the header packet (no field list) or an array of
// positional row arrays (field list present). The tiny interpreter below
// implements just enough SQL for the statements this storage layer emits.
// ---------------------------------------------------------------------------
const mysqlCaptured: { sql: string[]; values: unknown[][] } = { sql: [], values: [] };

type Row = Record<string, unknown>;
interface FakeTable {
  rows: Row[];
  nextId: number;
}

/** In-memory tables keyed by lower-cased name. */
const fakeDb: Record<string, FakeTable> = {};

function table(name: string): FakeTable {
  const key = name.toLowerCase();
  return (fakeDb[key] ??= { rows: [], nextId: 1 });
}

/** Extract backticked column names from a SELECT list. */
function parseSelectColumns(selectList: string): string[] {
  return [...selectList.matchAll(/`(\w+)`/g)].map((x) => x[1]);
}

/**
 * Emulate MySQL column DEFAULTs for rows inserted with `DEFAULT` slots, so
 * reads return realistic values (mirrors drizzle/schema.ts):
 *   - timestamp columns → Date objects (mysql2 DATETIME mapping)
 *   - enum/text defaults → their literal default
 *   - nullable columns without defaults → NULL
 */
function fakeColumnDefault(tableName: string, col: string): unknown {
  if (/^(createdAt|updatedAt|lastSignedIn)$/i.test(col)) return new Date();
  if (/^(dueDate|scheduledDate|sentAt|completedAt)$/i.test(col)) return null;
  if (col === "role") return "user";
  if (col === "priority") return "Medium";
  if (col === "notificationType") return "both";
  if (/^(isCompleted|isSent)$/i.test(col)) return 0;
  return null;
}

/** Evaluate `col = ? [AND col <= ? ...]` against a row, consuming params left-to-right. */
function matchesWhere(whereRaw: string, row: Row, params: unknown[], pi: { i: number }): boolean {
  const conds = whereRaw.split(/\s+and\s+/i);
  for (const c of conds) {
    const cm = /`(\w+)`\s*(<=|>=|=|<|>)\s*\?/i.exec(c);
    if (!cm) continue; // non-comparable condition (e.g. IS NULL) → treat as pass
    const [, col, op] = cm;
    const val = params[pi.i++];
    const rv = row[col];
    if (op === "=") {
      if (String(rv) !== String(val)) return false;
    } else {
      const a = rv instanceof Date ? rv.getTime() : Number(Date.parse(String(rv)));
      const b = val instanceof Date ? val.getTime() : typeof val === "string" ? Date.parse(val) : Number(val);
      if (op === "<=" && !(a <= b)) return false;
      if (op === "<" && !(a < b)) return false;
      if (op === ">=" && !(a >= b)) return false;
      if (op === ">" && !(a > b)) return false;
    }
  }
  return true;
}

/** Very small SQL interpreter good enough for what Drizzle emits here. */
function runFakeSql(sql: string, params: unknown[]): [unknown, unknown] {
  const s = sql.replace(/\s+/g, " ").trim();
  mysqlCaptured.sql.push(sql);
  if (params?.length) mysqlCaptured.values.push([...params]);
  const pi = { i: 0 };

  // SELECT cols FROM `table` WHERE ... ORDER BY ... LIMIT n
  let m = /^select\s+(.*?)\s+from\s+`(\w+)`(.*?)$/i.exec(s);
  if (m) {
    const [, selectList, name, rest] = m;
    const t = table(name);
    const cols = parseSelectColumns(selectList);
    const whereRaw = /where\s+(.*?)(?:\s+order\b|\s+limit\b|$)/i.exec(rest)?.[1];
    let rows = [...t.rows];
    if (whereRaw) {
      const savedPi = pi.i;
      rows = rows.filter((r) => {
        pi.i = savedPi;
        return matchesWhere(whereRaw, r, params, pi);
      });
      // skip WHERE params once filtering is done
      const condCount = [...whereRaw.matchAll(/`(\w+)`\s*(?:<=|>=|=|<|>)\s*\?/gi)].length;
      pi.i = savedPi + condCount;
    }
    const orderRaw = /order\s+by\s+(.*?)(?:\s+limit\b|$)/i.exec(rest)?.[1];
    if (orderRaw) {
      const keys = [...orderRaw.matchAll(/`(?:\w+)`\.`?(\w+)`?\s*(desc)?/gi)].map((x) => ({
        col: x[1],
        desc: Boolean(x[2]),
      }));
      rows.sort((a, b) => {
        for (const k of keys) {
          const av = a[k.col] ?? 0;
          const bv = b[k.col] ?? 0;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          if (cmp !== 0) return k.desc ? -cmp : cmp;
        }
        return 0;
      });
    }
    const limit = /limit\s+\?/i.exec(rest);
    if (limit) rows = rows.slice(0, Number(params[pi.i++] ?? rows.length));
    else {
      const lit = /limit\s+(\d+)/i.exec(rest);
      if (lit) rows = rows.slice(0, Number(lit[1]));
    }
    return [rows.map((r) => cols.map((c) => r[c] ?? null)), []];
  }

  // INSERT INTO `table` (`a`,`b`) VALUES (?, DEFAULT, ?) [, (?, ?, ?)]...
  // Parameters are positional per VALUE tuple: a literal `DEFAULT` keyword
  // occupies its column slot but consumes NO parameter. Skipping by counting
  // placeholders alone would shift every later value into the wrong column.
  m = /^insert\s+into\s+`(\w+)`\s*\(([^)]*)\)\s*values\s+(.*)$/i.exec(s);
  if (m) {
    const [, name, colsRaw, tuplesRaw] = m;
    const t = table(name);
    const cols = colsRaw.split(",").map((c) => c.trim().replace(/`/g, ""));
    const tuples = tuplesRaw.match(/\([^)]*\)/g) ?? [];
    const firstId = t.nextId;
    for (const tpl of tuples) {
      const row: Row = {};
      // Split the tuple into value slots, respecting quoted strings that
      // contain commas (e.g. strftime defaults). `?` consumes a param;
      // anything else (literal / DEFAULT) consumes none.
      const slots: string[] = [];
      let cur = "";
      let inStr = false;
      for (let i = 1; i < tpl.length - 1; i++) {
        const ch = tpl[i];
        if (ch === "'" ) inStr = !inStr;
        if (ch === "," && !inStr) {
          slots.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      slots.push(cur.trim());
      let si = 0;
      for (const c of cols) {
        const slot = slots[si++] ?? "";
        if (slot === "?") row[c] = params[pi.i++];
        // non-`?` slot (e.g. DEFAULT) → leave column unset, consume nothing
      }
      // Emulate MySQL semantics for columns left to their DEFAULT: fill from
      // the schema so reads return realistic rows (createdAt/updatedAt are
      // DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP — mysql2 always returns a
      // Date object for them, never NULL).
      for (const c of cols) {
        if (row[c] === undefined) row[c] = fakeColumnDefault(name, c);
      }
      row.id = t.nextId++;
      t.rows.push(row);
    }

    return [{ insertId: firstId, affectedRows: tuples.length }, []];
  }

  // UPDATE `table` SET `a` = ?, `b` = ? WHERE `id` = ?
  m = /^update\s+`(\w+)`\s+set\s+(.*?)\s+where\s+(.*)$/i.exec(s);
  if (m) {
    const [, name, setRaw, whereRaw] = m;
    const t = table(name);
    const setCols = [...setRaw.matchAll(/`(\w+)`\s*=\s*\?/gi)].map((x) => x[1]);
    const setVals = setCols.map(() => params[pi.i++]);
    const savedPi = pi.i;
    let affected = 0;
    for (const r of t.rows) {
      pi.i = savedPi;
      if (matchesWhere(whereRaw, r, params, pi)) {
        setCols.forEach((c, i) => (r[c] = setVals[i]));
        affected++;
      }
    }
    return [{ affectedRows: affected }, []];
  }

  // DELETE FROM `table` WHERE ...
  m = /^delete\s+from\s+`(\w+)`\s*(?:where\s+(.*))?$/i.exec(s);
  if (m) {
    const [, name, whereRaw] = m;
    const t = table(name);
    if (!whereRaw) {
      const n = t.rows.length;
      t.rows = [];
      return [{ affectedRows: n }, []];
    }
    const keep: Row[] = [];
    for (const r of t.rows) {
      const probe = { i: 0 };
      if (!matchesWhere(whereRaw, r, params, probe)) keep.push(r);
    }
    const removed = t.rows.length - keep.length;
    t.rows = keep;
    return [{ affectedRows: removed }, []];
  }

  // SHOW / other admin statements → empty success
  return [[], []];
}

vi.mock("mysql2/promise", () => {
  const pool = {
    query: async (sqlOrOpts: unknown, values?: unknown[]) => {
      const sql =
        typeof sqlOrOpts === "string" ? sqlOrOpts : (sqlOrOpts as { sql: string }).sql;
      return runFakeSql(sql, values ?? []);
    },
    execute: async (sql: string, values?: unknown[]) => runFakeSql(sql, values ?? []),
    getConnection: async () => pool,
    end: async () => {},
    on: () => {},
  };
  return { default: { createPool: async () => pool }, createPool: async () => pool };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type Storage = typeof import("./index");

let tmpDirs: string[] = [];

function freshDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartnote-test-"));
  tmpDirs.push(dir);
  return dir;
}

async function loadStorage(driver: "sqlite" | "mysql"): Promise<Storage> {
  vi.resetModules();
  if (driver === "mysql") {
    // start each MySQL suite from a clean in-memory dataset + capture log
    for (const k of Object.keys(fakeDb)) delete fakeDb[k];
    mysqlCaptured.sql.length = 0;
    mysqlCaptured.values.length = 0;
  } else {
    // SQLite suites share the process-wide better-sqlite3 singleton connection;
    // close it so a brand-new temp data dir is used and no state leaks across suites.
    try {
      const prev = await import("./index");
      prev.closeDb();
    } catch {
      /* first load - nothing to close */
    }
  }
  const dataDir = freshDataDir();
  process.env.SMARTNOTE_DATA_DIR = dataDir;
  if (driver === "mysql") {
    process.env.DB_DRIVER = "mysql";
    process.env.DATABASE_URL = "mysql://mock:mock@localhost:3306/mockdb";
  } else {
    process.env.DB_DRIVER = "sqlite";
    delete process.env.DATABASE_URL;
  }
  // Re-import fresh so memoized driver/connection state is clean.
  const db = await import("./index");
  const paths = await import("../_core/paths");
  paths.__resetDataDirForTests();
  db.__resetDbForTests();
  // Force connection creation so getDriver() is resolved.
  await db.getDb();
  return db;
}

/** The shared contract every driver must satisfy. */
function defineContract(name: string, setup: () => Promise<{ db: Storage; userId: number }>) {
  describe(`storage contract (${name})`, () => {
    let db: Storage;
    let userId: number;

    beforeAll(async () => {
      ({ db, userId } = await setup());
    });

    it("resolves the expected driver", () => {
      expect(db.getDriver()).toBe(name);
    });

    it("creates notes and returns a numeric id", async () => {
      const id = await db.createNote({
        userId,
        title: "Buy groceries",
        content: "Milk, eggs, bread",
        category: "Tasks",
        priority: "High",
      } as never);
      expect(typeof id).toBe("number");
      expect(id).toBeGreaterThan(0);
    });

    it("reads back a note with Date-typed timestamps", async () => {
      const id = await db.createNote({
        userId,
        title: "Read paper",
        content: "Attention Is All You Need",
        category: "Learning",
      } as never);
      const note = await db.getNoteById(id);
      expect(note).not.toBeNull();
      expect(note!.title).toBe("Read paper");
      expect(note!.createdAt).toBeInstanceOf(Date);
    });

    it("filters notes by category", async () => {
      const tasks = await db.getNotesByCategory(userId, "Tasks");
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((n) => n.category === "Tasks")).toBe(true);
    });

    it("updates and completes a note", async () => {
      const id = await db.createNote({
        userId,
        title: "Old title",
        content: "x",
        category: "Thoughts",
      } as never);
      await db.updateNote(id, { isCompleted: 1, title: "New title" } as never);
      const note = await db.getNoteById(id);
      expect(note!.title).toBe("New title");
      expect(note!.isCompleted).toBeTruthy();
    });

    it("computes stats consistently", async () => {
      const stats = await db.getNoteStats(userId);
      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.completed + stats.pending).toBe(stats.total);
    });

    it("manages reminders lifecycle", async () => {
      const noteId = await db.createNote({
        userId,
        title: "Meeting",
        content: "Standup",
        category: "Schedule",
      } as never);
      await db.createReminder({
        noteId,
        reminderTime: new Date(Date.now() - 60_000), // overdue → pending
        notificationType: "push",
      } as never);
      const pending = await db.getPendingReminders();
      const mine = pending.find((r) => r.noteId === noteId);
      expect(mine).toBeDefined();
      expect(mine!.reminderTime).toBeInstanceOf(Date);

      await db.markReminderAsSent(mine!.id);
      const after = await db.getRemindersForNote(noteId);
      expect(after.find((r) => r.id === mine!.id)!.isSent).toBeTruthy();

      await db.deleteRemindersForNote(noteId);
      expect(await db.getRemindersForNote(noteId)).toHaveLength(0);
    });

    it("logs notifications and reads history", async () => {
      await db.createNotificationLog({
        userId,
        channel: "push",
        status: "sent",
        title: "Meeting",
        content: "Standup in 5 min",
      } as never);
      const history = await db.getNotificationHistory(userId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].createdAt).toBeInstanceOf(Date);
    });

    it("deletes notes", async () => {
      const id = await db.createNote({
        userId,
        title: "Temp",
        content: "temp",
        category: "Thoughts",
      } as never);
      await db.deleteNote(id);
      expect(await db.getNoteById(id)).toBeNull();
    });
  });
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------
describe("dual-driver storage (Stage 0 gate)", () => {
  afterAll(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    tmpDirs = [];
  });

  // --- SQLite: real file-backed database -----------------------------------
  defineContract("sqlite", async () => {
    const db = await loadStorage("sqlite");
    await db.upsertUser({ openId: "u-sqlite-1", name: "Test User", loginMethod: "local" } as never);
    const user = await db.getUserByOpenId("u-sqlite-1");
    expect(user).toBeDefined();
    return { db, userId: user!.id };
  });


  // --- MySQL: production code path against the embedded SQL fake -----------
  defineContract("mysql", async () => {
    const db = await loadStorage("mysql");
    // First upsert for an unknown openId must go through the INSERT branch…
    await db.upsertUser({ openId: "u-mysql-1", name: "Test User", loginMethod: "local" } as never);
    expect(mysqlCaptured.sql.some((s) => /insert into `users`/i.test(s))).toBe(true);
    // …and a second upsert for the same openId must switch to the UPDATE branch.
    mysqlCaptured.sql.length = 0;
    await db.upsertUser({ openId: "u-mysql-1", name: "Renamed" } as never);
    expect(mysqlCaptured.sql.some((s) => /update `users`/i.test(s))).toBe(true);
    mysqlCaptured.sql.length = 0;
    const user = await db.getUserByOpenId("u-mysql-1");
    expect(user).toBeDefined();
    return { db, userId: user!.id };
  });

  it("mysql upsertUser takes exactly one write path per call", async () => {
    const db = await loadStorage("mysql");
    mysqlCaptured.sql.length = 0;
    await db.upsertUser({ openId: "u-mysql-new", name: "Fresh" } as never);
    const hasInsert = mysqlCaptured.sql.some((s) => /insert into `users`/i.test(s));
    const hasUpdate = mysqlCaptured.sql.some((s) => /update `users`/i.test(s));
    expect(hasInsert).toBe(true);
    expect(hasUpdate).toBe(false);

    mysqlCaptured.sql.length = 0;
    await db.upsertUser({ openId: "u-mysql-new", name: "Again" } as never);
    const hasInsert2 = mysqlCaptured.sql.some((s) => /insert into `users`/i.test(s));
    const hasUpdate2 = mysqlCaptured.sql.some((s) => /update `users`/i.test(s));
    expect(hasUpdate2).toBe(true);
    expect(hasInsert2).toBe(false);
  });

  it("unknown DB_DRIVER is rejected", async () => {
    vi.resetModules();
    process.env.DB_DRIVER = "postgres";
    const db = await import("./index");
    db.__resetDbForTests();
    expect(() => db.resolveDriver()).toThrow(/Unknown DB_DRIVER/);
    delete process.env.DB_DRIVER;
  });
});
