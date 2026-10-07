import { describe, expect, it, vi } from "vitest";
const captured: string[] = [];
vi.mock("mysql2/promise", () => {
  const pool = {
    query: async (o: any, v?: unknown[]) => {
      const sql = typeof o === "string" ? o : o.sql;
      captured.push(sql + " |P| " + JSON.stringify(v ?? [], (k, x) => x instanceof Date ? "DATE:" + x.toISOString() : x));
      // emulate mysql2 rowsAsArray for select
      if (/^select/i.test(sql.trim())) return [[], []];
      return [{ insertId: 1, affectedRows: 1 }, []];
    },
    execute: async (sql: string, v?: unknown[]) => pool.query(sql, v),
    getConnection: async () => pool,
    end: async () => {}, on: () => {},
  };
  return { default: { createPool: async () => pool }, createPool: async () => pool };
});
describe("dbg", () => {
  it("log sql", async () => {
    process.env.DB_DRIVER = "mysql";
    process.env.DATABASE_URL = "mysql://mock:mock@localhost:3306/mockdb";
    process.env.SMARTNOTE_DATA_DIR = "/tmp/dbg-dir";
    const db = await import("/workspace/server/db/index");
    await db.upsertUser({ openId: "x1", name: "A" } as never);
    captured.length = 0;
    await db.upsertUser({ openId: "x1", name: "B" } as never);
    console.log(JSON.stringify(captured, null, 2));
    expect(true).toBe(true);
  });
});
