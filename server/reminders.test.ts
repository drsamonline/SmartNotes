import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reminder rule, tested without a database.
 *
 * The store below stands in for `server/db/index.ts` and keeps the same
 * contract: rows carry `reminderTime`, `notificationType` and `isSent`.
 */
const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  nextId: 1,
}));

vi.mock("./db/index", () => ({
  createReminder: vi.fn(async (data: Record<string, any>) => {
    store.rows.push({ id: store.nextId++, isSent: 0, ...data });
  }),
  getRemindersForNote: vi.fn(async (noteId: number) =>
    store.rows.filter((r) => r.noteId === noteId)
  ),
  deleteRemindersForNote: vi.fn(async (noteId: number) => {
    store.rows = store.rows.filter((r) => r.noteId !== noteId);
  }),
}));

import { planReminder, syncNoteReminder, REMINDER_LEAD_MS } from "./reminders";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const hours = (n: number) => n * 60 * 60 * 1000;

describe("planReminder", () => {
  it("reminds one hour before an event that is further out", () => {
    const event = new Date(NOW.getTime() + hours(5));
    const plan = planReminder(event, { now: NOW });
    expect(plan).toEqual({
      action: "schedule",
      reminderTime: new Date(event.getTime() - REMINDER_LEAD_MS),
      immediate: false,
    });
  });

  it("reminds now, not never, for an event inside the lead window", () => {
    // A note written 30 minutes before its deadline: the old code computed a
    // reminder time in the past and silently created no reminder at all.
    const event = new Date(NOW.getTime() + 30 * 60 * 1000);
    const plan = planReminder(event, { now: NOW });
    expect(plan.action).toBe("schedule");
    if (plan.action !== "schedule") throw new Error("unreachable");
    expect(plan.immediate).toBe(true);
    expect(plan.reminderTime.getTime()).toBe(NOW.getTime());
  });

  it("plans nothing for an event already past", () => {
    expect(planReminder(new Date(NOW.getTime() - 1000), { now: NOW })).toEqual({
      action: "none",
      reason: "event-past",
    });
  });

  it("plans nothing for a note with no date", () => {
    expect(planReminder(null, { now: NOW })).toEqual({ action: "none", reason: "no-date" });
    expect(planReminder(undefined, { now: NOW })).toEqual({ action: "none", reason: "no-date" });
    expect(planReminder(new Date("not a date"), { now: NOW })).toEqual({
      action: "none",
      reason: "no-date",
    });
  });

  it("plans nothing for a completed note", () => {
    const event = new Date(NOW.getTime() + hours(5));
    expect(planReminder(event, { now: NOW, isCompleted: 1 })).toEqual({
      action: "none",
      reason: "completed",
    });
    expect(planReminder(event, { now: NOW, isCompleted: true }).action).toBe("none");
  });
});

describe("syncNoteReminder", () => {
  beforeEach(() => {
    store.rows = [];
    store.nextId = 1;
  });

  it("creates the one reminder a new dated note needs", async () => {
    const event = new Date(NOW.getTime() + hours(5));
    const result = await syncNoteReminder(1, event, { now: NOW });
    expect(result.changed).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].noteId).toBe(1);
    expect(new Date(store.rows[0].reminderTime).getTime()).toBe(
      event.getTime() - REMINDER_LEAD_MS
    );
  });

  it("is idempotent: a second identical sync writes nothing", async () => {
    const event = new Date(NOW.getTime() + hours(5));
    await syncNoteReminder(1, event, { now: NOW });
    const again = await syncNoteReminder(1, event, { now: NOW });
    expect(again.changed).toBe(false);
    expect(store.rows).toHaveLength(1);
  });

  it("MOVES the reminder when the event is edited", async () => {
    const first = new Date(NOW.getTime() + hours(5));
    await syncNoteReminder(1, first, { now: NOW });

    const second = new Date(NOW.getTime() + hours(2));
    const moved = await syncNoteReminder(1, second, { now: NOW });

    expect(moved.changed).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(new Date(store.rows[0].reminderTime).getTime()).toBe(
      second.getTime() - REMINDER_LEAD_MS
    );
  });

  it("does not re-arm a reminder that has already fired for the same time", async () => {
    const event = new Date(NOW.getTime() + hours(5));
    await syncNoteReminder(1, event, { now: NOW });
    store.rows[0].isSent = 1;

    const again = await syncNoteReminder(1, event, { now: NOW });
    expect(again.changed).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].isSent).toBe(1);
  });

  it("clears the reminder when the note is completed, and re-arms it when it is not", async () => {
    const event = new Date(NOW.getTime() + hours(5));
    await syncNoteReminder(1, event, { now: NOW });

    const done = await syncNoteReminder(1, event, { now: NOW, isCompleted: 1 });
    expect(done.changed).toBe(true);
    expect(store.rows).toHaveLength(0);

    const reopened = await syncNoteReminder(1, event, { now: NOW, isCompleted: 0 });
    expect(reopened.changed).toBe(true);
    expect(store.rows).toHaveLength(1);
  });

  it("clears the reminder when the date is removed or moved into the past", async () => {
    const event = new Date(NOW.getTime() + hours(5));
    await syncNoteReminder(1, event, { now: NOW });
    await syncNoteReminder(1, null, { now: NOW });
    expect(store.rows).toHaveLength(0);

    await syncNoteReminder(1, event, { now: NOW });
    await syncNoteReminder(1, new Date(NOW.getTime() - hours(1)), { now: NOW });
    expect(store.rows).toHaveLength(0);
  });
});
