import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BACKUP_MAX_NOTES,
  NOTE_TITLE_MAX,
  backupNoteSchema,
  parseBackupNotes,
  type BackupNote,
} from "../shared/noteBackup";

const good = {
  title: "Project launch",
  content: "Ship it with a checklist",
  category: "Tasks",
  priority: "High",
  isCompleted: 0,
  dueDate: "2026-10-10T10:00:00.000Z",
  scheduledDate: null,
};

/** The importer as it was before this change: a filter/map on the client. */
function oldImporter(payload: unknown): Record<string, unknown>[] {
  const categories = ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"];
  return Array.isArray(payload)
    ? payload
        .filter((note): note is Record<string, unknown> => {
          if (!note || typeof note !== "object") return false;
          const item = note as Record<string, unknown>;
          return (
            typeof item.title === "string" &&
            typeof item.content === "string" &&
            categories.includes(item.category as string) &&
            ["Low", "Medium", "High"].includes(String(item.priority))
          );
        })
        .map((note) => ({
          title: String(note.title),
          content: String(note.content),
          category: note.category,
          priority: note.priority,
          isCompleted: Number(note.isCompleted) || 0,
          dueDate: typeof note.dueDate === "string" ? note.dueDate : null,
          scheduledDate: typeof note.scheduledDate === "string" ? note.scheduledDate : null,
        }))
    : [];
}

describe("backup import", () => {
  it("keeps a well-formed note and every field the app exports", () => {
    const { notes, skipped, truncated } = parseBackupNotes([good]);
    expect(skipped).toEqual([]);
    expect(truncated).toBe(0);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({ ...good } satisfies BackupNote);
  });

  it("every note it returns is a note the server accepts", () => {
    const hostile = [
      good,
      { ...good, title: "x".repeat(900) },
      { ...good, content: "" },
      { ...good, title: "   " },
      { ...good, category: "tasks" },
      { ...good, category: "Recipes" },
      { ...good, priority: "urgent" },
      { ...good, priority: undefined },
      { ...good, dueDate: "2026-10-10" },
      { ...good, dueDate: "not-a-date" },
      { ...good, dueDate: null },
      { ...good, isCompleted: "1" },
      { ...good, isCompleted: true },
      { ...good, extra: "ignored" },
      null,
      "a string",
      [1, 2, 3],
      {},
    ];
    const { notes, skipped } = parseBackupNotes(hostile);
    expect(notes.length + skipped.length).toBe(hostile.length);
    for (const note of notes) {
      expect(backupNoteSchema.safeParse(note).success).toBe(true);
    }
    for (const entry of skipped) {
      expect(entry.index).toBeGreaterThanOrEqual(0);
      expect(entry.index).toBeLessThan(hostile.length);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("the old importer produced notes the server refused — the bug this fixes", () => {
    const brokenFile = [
      { ...good, title: "x".repeat(300) },
      { ...good, content: "" },
      { ...good, dueDate: "2026-10-10" },
    ];
    const before = oldImporter(brokenFile);
    expect(before).toHaveLength(3);
    // One bad note made the router's zod array reject the whole batch.
    for (const note of before) {
      expect(backupNoteSchema.safeParse(note).success).toBe(false);
    }
    // After the fix the two repairable notes survive and the empty one is
    // reported — before, all three were lost with no message.
    const after = parseBackupNotes(brokenFile);
    expect(after.skipped).toEqual([{ index: 1, reason: "empty or missing content" }]);
    expect(after.notes).toHaveLength(2);
    expect(after.notes[0].title).toHaveLength(NOTE_TITLE_MAX);
    expect(after.notes[1].dueDate).toBe(new Date("2026-10-10").toISOString());
  });

  it("reports what it could not repair instead of dropping it silently", () => {
    const { notes, skipped } = parseBackupNotes([
      good,
      { ...good, title: "" },
      { ...good, content: "   " },
      { ...good, category: "Recipes" },
      { ...good, priority: "urgent" },
      "not a note",
    ]);
    expect(notes).toHaveLength(1);
    expect(skipped.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(skipped.map((s) => s.reason)).toEqual([
      "empty or missing title",
      "empty or missing content",
      "unknown category",
      "unknown priority",
      "not a note object",
    ]);
  });

  it("caps the batch at the server's limit and says how many were left out", () => {
    const many = Array.from({ length: BACKUP_MAX_NOTES + 137 }, (_, i) => ({ ...good, title: `note ${i}` }));
    const { notes, truncated } = parseBackupNotes(many);
    expect(notes).toHaveLength(BACKUP_MAX_NOTES);
    expect(truncated).toBe(137);
    expect(notes.at(-1)?.title).toBe(`note ${BACKUP_MAX_NOTES - 1}`);
  });

  it("carries hostile text through byte-for-byte", () => {
    const strings = [
      "=SUM(A1:A9)",
      "@cmd|'/C calc'!A1",
      "</script><img src=x onerror=alert(1)>",
      "\u202Egnp.exe\u202C",
      "nul\u0000inside",
      "नमस्ते दुनिया",
      "👩🏽‍⚕️ four-byte",
      "line\r\nbreak",
    ];
    for (const text of strings) {
      const { notes } = parseBackupNotes([{ ...good, title: text, content: text }]);
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe(text);
      expect(notes[0].content).toBe(text);
    }
  });

  it("ignores inherited keys, so a crafted file cannot pollute a note", () => {
    const crafted = JSON.parse(
      `[{"title":"t","content":"c","category":"Tasks","priority":"Low","__proto__":{"polluted":"yes"}}]`,
    );
    const { notes } = parseBackupNotes(crafted);
    expect(notes).toHaveLength(1);
    expect(Object.getPrototypeOf(notes[0])).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(notes[0]).sort()).toEqual(
      ["category", "content", "dueDate", "isCompleted", "priority", "scheduledDate", "title"],
    );
  });

  it("treats anything that is not an array as an empty backup", () => {
    for (const payload of [null, undefined, 42, "notes", { notes: [good] }]) {
      expect(parseBackupNotes(payload)).toEqual({ notes: [], skipped: [], truncated: 0 });
    }
  });

  it("the router imports this schema instead of declaring its own", () => {
    const router = fs.readFileSync(path.resolve(import.meta.dirname, "notes.router.ts"), "utf8");
    expect(router).toContain("@shared/noteBackup");
    expect(router).toContain("backupNoteSchema");
    expect(router).toContain("BACKUP_MAX_NOTES");
    // No second definition of the import shape.
    expect(router).not.toMatch(/z\.array\(\s*z\.object\(\s*\{\s*title:/);
  });
});
