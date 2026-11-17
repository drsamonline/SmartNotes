/**
 * The reminder rule, in one place.
 *
 * Every write that can change *when* a note happens goes through
 * `syncNoteReminder()`: create, import, edit and complete.
 *
 * Before this module the rule ("one hour before") was written out twice, in
 * `create` and `importBackup`, and missing from `update` — so editing a note's
 * date left the reminder pointing at the old time (the note stopped being
 * reminded about its real deadline and was reminded about the one it used to
 * have), and a note whose event was less than an hour away was given no
 * reminder at all, because the computed time was already in the past.
 */
import {
  createReminder,
  deleteRemindersForNote,
  getRemindersForNote,
} from "./db/index";

/** How long before the event the reminder fires. */
export const REMINDER_LEAD_MS = 60 * 60 * 1000;

export type ReminderPlan =
  | { action: "schedule"; reminderTime: Date; immediate: boolean }
  | { action: "none"; reason: "no-date" | "completed" | "event-past" };

export type ReminderSync = { changed: boolean; plan: ReminderPlan };

function timeOf(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Decide what a note's reminder should be — pure, so the rule can be tested
 * without a database.
 *
 * - no date, or a date that does not parse → no reminder
 * - a completed note → no reminder (completing a deadline must silence it)
 * - an event already in the past → no reminder
 * - an event inside the lead window (say, in 30 minutes) → remind **now**.
 *   It used to be dropped, which is the one case where a reminder matters most.
 */
export function planReminder(
  eventDate: Date | null | undefined,
  opts: { now?: Date; isCompleted?: boolean | number | null } = {}
): ReminderPlan {
  const now = opts.now ?? new Date();
  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    return { action: "none", reason: "no-date" };
  }
  if (opts.isCompleted === true || opts.isCompleted === 1) {
    return { action: "none", reason: "completed" };
  }
  if (eventDate.getTime() <= now.getTime()) {
    return { action: "none", reason: "event-past" };
  }
  const lead = eventDate.getTime() - REMINDER_LEAD_MS;
  const immediate = lead <= now.getTime();
  return {
    action: "schedule",
    reminderTime: new Date(immediate ? now.getTime() : lead),
    immediate,
  };
}

/**
 * Make the stored reminders for one note match `planReminder()`.
 *
 * Idempotent: a second call with the same event writes nothing, so it is safe
 * to call from every mutation (and safe to call again after a partial failure).
 */
export async function syncNoteReminder(
  noteId: number,
  eventDate: Date | null | undefined,
  opts: { now?: Date; isCompleted?: boolean | number | null } = {}
): Promise<ReminderSync> {
  const plan = planReminder(eventDate, opts);
  const existing = await getRemindersForNote(noteId);

  if (plan.action === "none") {
    if (existing.length === 0) return { changed: false, plan };
    await deleteRemindersForNote(noteId);
    return { changed: true, plan };
  }

  // Already right? One reminder, at exactly this time — or, when the reminder
  // is due now, one reminder that is already due. Re-saving a note must not
  // re-arm a reminder that has already fired.
  const keep =
    existing.length === 1 &&
    (timeOf(existing[0].reminderTime) === plan.reminderTime.getTime() ||
      (plan.immediate && timeOf(existing[0].reminderTime) <= plan.reminderTime.getTime()));
  if (keep) return { changed: false, plan };

  if (existing.length > 0) await deleteRemindersForNote(noteId);
  await createReminder({
    noteId,
    reminderTime: plan.reminderTime,
    notificationType: "both",
    isSent: 0,
  });
  return { changed: true, plan };
}
