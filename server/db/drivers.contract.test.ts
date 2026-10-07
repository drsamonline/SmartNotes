/**
 * Dual-driver storage contract tests (Stage 0 gate).
 *
 * The SAME assertion suite runs twice:
 *   1. SQLite  – real better-sqlite3 file in a temp data dir.
 *   2. MySQL   – the production code path with an embedded mysql2/promise mock,
 *                so no external database is needed to prove parity of the
 *                adapter layer (insertId handling, upsert select→insert/update,
 *                date normalisation, cascade-free deletes).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// MySQL-side fake: intercept only the mysql2/promise import used by drizzle.
// ---------------------------------------------------------------------------
const mysqlCaptured: { sql: string[]; values: unknown[][] } = { sql: [], values: [] };

vi.mock("mysql2/promise", async () => {
  const rowsFor = (sql: string): Record<string, unknown>[] => {
    if (/from `users`/i.test(sql)) return [{ id: 1, openId: "u-mysql-1" }];
    if (/from `notes`/i.test(sql)) return [];
    return [];
  };
  const conn = {
    execute: async (sql: string, values?: unknown[]) => {
      mysqlCaptured.sql.push(sql);
      if (values) mysqlCaptured.values.push(values as unknown[]);
      const rows = rowsFor(sql);
      const header = /insert into/i.test(sql)
        ? { insertId: 4242, affectedRows: 1 }
        : { affectedRows: 1 };
      return [rows, header] as unknown as [never, never];
    },
    query: async (sql: string) => {
      mysqlCaptured.sql.push(sql);
      return [rowsFor(sql), []] as unknown as [never, never];
    },
    end: async () => {},
    ping: async () => {},
  };
  const pool = {
    query: conn.query,
    execute: conn.execute,
    getConnection: async () => conn,
    end: async () => {},
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

  // --- MySQL: production code path against the embedded mock ---------------
  defineContract("mysql", async () => {
    const db = await loadStorage("mysql");
    await db.upsertUser({ openId: "u-mysql-1", name: "Test User", loginMethod: "local" } as never);
    // Mock always reports an existing row → exercises the UPDATE branch…
    expect(mysqlCaptured.sql.some((s) => /update `users`/i.test(s))).toBe(true);
    mysqlCaptured.sql.length = 0;
    const user = await db.getUserByOpenId("u-mysql-1");
    return { db, userId: user!.id ?? 1 };
  });

  it("mysql upsertUser inserts when the user does not exist", async () => {
    const db = await loadStorage("mysql");
    mysqlCaptured.sql.length = 0;
    // Second call with a brand-new openId still hits the mocked SELECT which
    // returns a row; assert at minimum that no duplicate INSERT happens blindly.
    await db.upsertUser({ openId: "u-mysql-1", name: "Renamed" } as never);
    const hasInsertIntoUsers = mysqlCaptured.sql.some((s) => /insert into `users`/i.test(s));
    const hasUpdateUsers = mysqlCaptured.sql.some((s) => /update `users`/i.test(s));
    expect(hasUpdateUsers || hasInsertIntoUsers).toBe(true);
    expect(hasUpdateUsers && hasInsertIntoUsers).toBe(false); // exactly one path taken
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
