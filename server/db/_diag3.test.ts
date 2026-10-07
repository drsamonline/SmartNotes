import { describe, expect, it, vi } from "vitest";

const log: string[] = [];

vi.mock("mysql2/promise", () => {
  const handler = async (sqlOrOpts: unknown, values?: unknown[]) => {
    const sql = typeof sqlOrOpts === "string" ? sqlOrOpts : (sqlOrOpts as { sql: string }).sql;
    log.push(`CALL: ${sql.slice(0, 70)} | ${JSON.stringify(values ?? [])}`);
    if (/^select/i.test(sql)) return [[], []];
    return [{ insertId: 1, affectedRows: 1 }, []];
  };
  const pool = {
    query: handler,
    execute: handler,
    getConnection: async () => pool,
    end: async () => {},
    on: () => {},
  };
  return { default: { createPool: async () => pool }, createPool: async () => pool };
});

describe("diag3", () => {
  it("no-limit select", async () => {
    vi.resetModules();
    process.env.DB_DRIVER = "mysql";
    process.env.DATABASE_URL = "mysql://mock:mock@localhost:3306/mockdb";
    const db = await import("./index");
    await db.getDb();
    await db.upsertUser({ openId: "d3", name: "A" } as never);
    log.push("---SECOND---");
    await db.upsertUser({ openId: "d3", name: "B" } as never);
    console.log(log.join("\n"));
    expect(true).toBe(true);
  });
});
