/**
 * db:seed — populate a SQLite data dir with demo data (Stage 0, Enhancement #49).
 *
 * Usage:
 *   pnpm db:seed                          → seeds $SMARTNOTE_DATA_DIR (or default OS dir)
 *   pnpm db:seed --data-dir ./tmp-demo    → seeds a specific folder
 *   pnpm db:seed --force                  → insert another demo copy even if seeded before
 */
import "dotenv/config";
import path from "node:path";

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const dirIdx = argv.findIndex((a) => a === "--data-dir");
  if (dirIdx !== -1 && argv[dirIdx + 1]) {
    process.env.SMARTNOTE_DATA_DIR = path.resolve(argv[dirIdx + 1]);
  }
  process.env.DB_DRIVER = "sqlite"; // seed only targets the portable driver

  const { getDataDir, getSqliteDbPath, openSqliteBootstrap } = await import("../server/_core/paths");
  const { SQLITE_DDL } = await import("../server/db/index");

  getDataDir();
  const dbFile = getSqliteDbPath();
  console.log(`Seeding SQLite database at ${dbFile}`);

  const { client } = await openSqliteBootstrap(dbFile);
  client.exec(SQLITE_DDL);

  const existing = client
    .prepare("SELECT COUNT(*) AS c FROM users WHERE openId = ?")
    .get("seed-demo-user") as { c: number };
  if (existing.c > 0 && !force) {
    console.log("Demo user already present. Use --force to insert another copy.");
    client.close();
    return;
  }

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const daysFromNow = (n: number, h?: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    if (h !== undefined) d.setHours(h, 0, 0, 0);
    return d;
  };

  const insUser = client.prepare(
    "INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const info = insUser.run(
    "seed-demo-user",
    "Demo User",
    "demo@local.app",
    "local",
    "admin",
    iso(now),
    iso(now),
    iso(now),
  );
  const userId = Number(info.lastInsertRowid);

  const insNote = client.prepare(
    `INSERT INTO notes (userId, title, content, category, priority, dueDate, scheduledDate, isCompleted, createdAt, updatedAt)
     VALUES (@userId, @title, @content, @category, @priority, @dueDate, @scheduledDate, @isCompleted, @createdAt, @updatedAt)`,
  );

  const demoNotes: Array<Record<string, unknown>> = [
    { userId, title: "Prepare quarterly report", content: "Gather metrics from Oct and draft summary slides.", category: "Tasks", priority: "High", dueDate: iso(daysFromNow(3)), scheduledDate: null, isCompleted: 0, createdAt: iso(now), updatedAt: iso(now) },
    { userId, title: "Renew domain registration", content: "smartnote.app expires soon — renew before lapse.", category: "Deadlines", priority: "High", dueDate: iso(daysFromNow(7)), scheduledDate: null, isCompleted: 0, createdAt: iso(now), updatedAt: iso(now) },
    { userId, title: "Team standup", content: "Daily sync with engineering on the portable-app track.", category: "Schedule", priority: "Medium", dueDate: null, scheduledDate: iso(daysFromNow(1, 10)), isCompleted: 0, createdAt: iso(now), updatedAt: iso(now) },
    { userId, title: "Idea: offline-first mode", content: "SQLite adapter makes full offline operation realistic. Explore conflict-free sync later.", category: "Thoughts", priority: "Low", dueDate: null, scheduledDate: null, isCompleted: 0, createdAt: iso(now), updatedAt: iso(now) },
    { userId, title: "Read: DDIA chapter 5", content: "Focus on replication lag trade-offs for reminder delivery.", category: "Learning", priority: "Medium", dueDate: iso(daysFromNow(14)), scheduledDate: null, isCompleted: 0, createdAt: iso(now), updatedAt: iso(now) },
    { userId, title: "Water the plants", content: "Already done last weekend.", category: "Tasks", priority: "Low", dueDate: iso(daysFromNow(-2)), scheduledDate: null, isCompleted: 1, createdAt: iso(daysFromNow(-4)), updatedAt: iso(now) },
  ];

  const noteIds: number[] = [];
  const tx = client.transaction(() => {
    for (const n of demoNotes) {
      const r = insNote.run(n as never);
      noteIds.push(Number(r.lastInsertRowid));
    }
    const insReminder = client.prepare(
      "INSERT INTO reminders (noteId, reminderTime, notificationType, isSent, createdAt) VALUES (?, ?, ?, 0, ?)",
    );
    insReminder.run(noteIds[0], iso(daysFromNow(2, 8)), "both", iso(now));
    insReminder.run(noteIds[1], iso(daysFromNow(6, 9)), "push", iso(now));
    insReminder.run(noteIds[2], iso(daysFromNow(1, 9)), "push", iso(now));
  });
  tx();

  const stats = client
    .prepare(
      "SELECT (SELECT COUNT(*) FROM notes WHERE userId = ?) AS notes, (SELECT COUNT(*) FROM reminders) AS reminders",
    )
    .get(userId);
  console.log(`Seed complete: ${JSON.stringify(stats)}. Start with: pnpm dev`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
