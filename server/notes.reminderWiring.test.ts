import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wiring, not the rule: `update` and `toggleComplete` must reach the
 * reminder at all. This is the half that was missing — the rule existed in
 * `create`, so a new note was reminded correctly, and editing that note left
 * the reminder behind at the old time.
 */
const store = vi.hoisted(() => ({
  notes: [] as Array<Record<string, any>>,
  reminders: [] as Array<Record<string, any>>,
  nextNoteId: 1,
  nextReminderId: 1,
}));

vi.mock("./db/index", () => ({
  createNote: vi.fn(async (data: Record<string, any>) => {
    const id = store.nextNoteId++;
    store.notes.push({ id, createdAt: new Date(), updatedAt: new Date(), ...data });
    return id;
  }),
  getNoteById: vi.fn(async (id: number) =>
    store.notes.find((n) => n.id === id) ?? null
  ),
  updateNote: vi.fn(async (id: number, data: Record<string, any>) => {
    const note = store.notes.find((n) => n.id === id);
    if (note) Object.assign(note, data);
  }),
  deleteNote: vi.fn(async () => {}),
  getUserNotes: vi.fn(async () => store.notes),
  getNotesByCategory: vi.fn(async () => []),
  getNoteStats: vi.fn(async () => ({})),
  getNotificationHistory: vi.fn(async () => []),
  createReminder: vi.fn(async (data: Record<string, any>) => {
    store.reminders.push({ id: store.nextReminderId++, isSent: 0, ...data });
  }),
  getRemindersForNote: vi.fn(async (noteId: number) =>
    store.reminders.filter((r) => r.noteId === noteId)
  ),
  deleteRemindersForNote: vi.fn(async (noteId: number) => {
    store.reminders = store.reminders.filter((r) => r.noteId !== noteId);
  }),
}));

vi.mock("./ai", () => ({
  analyzeNoteContent: vi.fn(async (content: string) => ({
    title: content.slice(0, 40),
    category: "Deadlines",
    priority: "Medium",
    extractedDate: new Date(Date.now() + 5 * 60 * 60 * 1000),
  })),
  combineDateAndTime: (date?: Date) => date,
}));

import { notesRouter } from "./notes.router";

const user = { id: 1, openId: "u1", name: "Test", role: "user" } as any;
const caller = () => notesRouter.createCaller({ req: {} as any, res: {} as any, user });
const hours = (n: number) => n * 60 * 60 * 1000;

describe("notes router — reminders follow the note", () => {
  beforeEach(() => {
    store.notes = [];
    store.reminders = [];
    store.nextNoteId = 1;
    store.nextReminderId = 1;
  });

  it("creates a reminder when the note is created with a date", async () => {
    await caller().create({ content: "submit the report" });
    expect(store.reminders).toHaveLength(1);
    expect(store.reminders[0].noteId).toBe(1);
  });

  it("MOVES the reminder when the deadline is edited", async () => {
    await caller().create({ content: "submit the report" });
    const before = new Date(store.reminders[0].reminderTime).getTime();

    const movedTo = new Date(Date.now() + hours(2));
    await caller().update({ id: 1, dueDate: movedTo });

    expect(store.reminders).toHaveLength(1);
    const after = new Date(store.reminders[0].reminderTime).getTime();
    expect(after).not.toBe(before);
    expect(after).toBe(movedTo.getTime() - 60 * 60 * 1000);
  });

  it("gives an edited-into-the-window note a reminder instead of none", async () => {
    await caller().create({ content: "submit the report" });
    const soon = new Date(Date.now() + 20 * 60 * 1000);
    await caller().update({ id: 1, dueDate: soon });
    expect(store.reminders).toHaveLength(1);
    expect(new Date(store.reminders[0].reminderTime).getTime()).toBeLessThanOrEqual(
      Date.now()
    );
  });

  it("cancels the reminder when the note is completed, and re-arms it when reopened", async () => {
    await caller().create({ content: "submit the report" });
    expect(store.reminders).toHaveLength(1);

    await caller().toggleComplete({ id: 1, isCompleted: 1 });
    expect(store.reminders).toHaveLength(0);

    await caller().toggleComplete({ id: 1, isCompleted: 0 });
    expect(store.reminders).toHaveLength(1);
  });

  it("clears the reminder when the date is removed", async () => {
    await caller().create({ content: "submit the report" });
    await caller().update({ id: 1, dueDate: null });
    expect(store.reminders).toHaveLength(0);
  });

  it("leaves the reminder alone when only the title changes", async () => {
    await caller().create({ content: "submit the report" });
    const before = new Date(store.reminders[0].reminderTime).getTime();
    await caller().update({ id: 1, title: "submit the report, revised" });
    expect(store.reminders).toHaveLength(1);
    expect(new Date(store.reminders[0].reminderTime).getTime()).toBe(before);
  });
});
