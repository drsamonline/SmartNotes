import { describe, expect, it, vi } from "vitest";

const log: string[] = [];

vi.mock("mysql2/promise", () => {
  const handler = async (sqlOrOpts: unknown, values?: unknown[]) => {
    const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : (sqlOrOpts as { sql: string }).sql;
    if (/^select/i.test(sql)) return [[{ id: 7 }], []];
    return [{ insertId: 1, affectedRows: 1 }, []];
  };
  const pool = {
    query: async (a: unknown, v?: unknown[]) => { log.push(`pool.query ${typeof a === "string" ? "STR" : "OBJ"}`); return handler(a, v); },
    execute: async (a: unknown, v?: unknown[]) => { log.push("pool.execute"); return handler(a, v); },
    getConnection: async () => { log.push("getConnection"); return pool; },
    end: async () => {},
    on: () => {},
  };
  return { default: { createPool: async () => pool }, createPool: async () => pool };
});

describe("diag4", () => {
  it("shape probe", async () => {
    vi.resetModules();
    process.env.DB_DRIVER = "mysql";
    process.env.DATABASE_URL = "mysql://mock:mock@localhost:3306/mockdb";
    const db = await import("./index");
    const conn = await db.getDb();
    // replicate existsUserByOpenId inline via exported upsert side effects is messy;
    // instead call the internal path through upsertUser twice and see which branch runs
    await db.upsertUser({ openId: "d4", name: "A" } as never);
    log.length = 0;
    await db.upsertUser({ openId: "d4", name: "B" } as never);
    console.log("LOG:", JSON.stringify(log));
    const u = await db.getUserByOpenId("d4");
    console.log("USER:", JSON.stringify(u));
    expect(true).toBe(true);
  });
});
