/**
 * Backup import contract (shared by the server router and the client importer).
 *
 * The client used to validate a backup file with a hand-written `filter()/map()`
 * that was weaker than the server's zod schema: a title over 255 characters, an
 * empty note body, or a date the server's `.datetime()` refused made the server
 * reject the WHOLE batch, and the browser reported nothing at all. This module is
 * the single definition both sides use, so a note that survives `parseBackupNotes`
 * is a note `importBackup` accepts — the test asserts exactly that.
 */
import { z } from "zod";

export const NOTE_CATEGORIES = ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"] as const;
export const NOTE_PRIORITIES = ["Low", "Medium", "High"] as const;

export const NOTE_TITLE_MAX = 255;
export const BACKUP_MAX_NOTES = 500;

/** The server-side shape of one imported note. One definition, two consumers. */
export const backupNoteSchema = z.object({
  title: z.string().min(1).max(NOTE_TITLE_MAX),
  content: z.string().min(1),
  category: z.enum(NOTE_CATEGORIES),
  priority: z.enum(NOTE_PRIORITIES),
  isCompleted: z.number().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  scheduledDate: z.string().datetime().nullable().optional(),
});

export type BackupNote = z.infer<typeof backupNoteSchema>;

export interface SkippedNote {
  index: number;
  reason: string;
}

export interface ParsedBackup {
  /** Notes that passed `backupNoteSchema`, capped at BACKUP_MAX_NOTES. */
  notes: BackupNote[];
  /** Entries that could not be repaired, with the index they had in the file. */
  skipped: SkippedNote[];
  /** Valid notes left out because the file carried more than BACKUP_MAX_NOTES. */
  truncated: number;
}

function canonical<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return allowed.find((option) => option.toLowerCase() === trimmed);
}

/**
 * A date the schema will accept, or null. Accepts anything `new Date()` can read
 * (`2026-10-10`, `2026-10-10T10:00:00+05:30`, …) and rewrites it as the ISO
 * datetime the server demands, because the schema wants a full instant and a
 * backup written by another tool rarely carries one.
 */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function completed(value: unknown): number {
  if (value === true || value === 1) return 1;
  if (typeof value === "string" && ["1", "true"].includes(value.trim().toLowerCase())) return 1;
  return 0;
}

/** Build the candidate from known keys only — never spread the input. */
function candidate(raw: Record<string, unknown>): { note: unknown; reason?: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { note: null, reason: "empty or missing title" };
  const content = typeof raw.content === "string" ? raw.content : "";
  if (!content.trim()) return { note: null, reason: "empty or missing content" };

  const category = canonical(raw.category, NOTE_CATEGORIES);
  if (!category) return { note: null, reason: "unknown category" };

  const priority = canonical(raw.priority, NOTE_PRIORITIES);
  if (!priority && raw.priority !== undefined && raw.priority !== null && String(raw.priority).trim() !== "") {
    return { note: null, reason: "unknown priority" };
  }

  return {
    note: {
      // A long title is still a note: cut it to the column's width instead of
      // losing the note. The count is reported, so the cut is never silent.
      title: title.slice(0, NOTE_TITLE_MAX),
      content,
      category,
      priority: priority ?? "Medium",
      isCompleted: completed(raw.isCompleted),
      dueDate: isoDate(raw.dueDate),
      scheduledDate: isoDate(raw.scheduledDate),
    },
  };
}

/**
 * Turn whatever a user picked in the file dialog into importable notes.
 *
 * Never throws: a damaged file imports every note it can and reports the rest.
 */
export function parseBackupNotes(payload: unknown): ParsedBackup {
  const result: ParsedBackup = { notes: [], skipped: [], truncated: 0 };
  if (!Array.isArray(payload)) return result;

  payload.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      result.skipped.push({ index, reason: "not a note object" });
      return;
    }
    const { note, reason } = candidate(raw as Record<string, unknown>);
    if (!note) {
      result.skipped.push({ index, reason: reason ?? "not a valid note" });
      return;
    }
    const checked = backupNoteSchema.safeParse(note);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      result.skipped.push({
        index,
        reason: issue ? `${issue.path.join(".") || "note"}: ${issue.message}` : "not a valid note",
      });
      return;
    }
    result.notes.push(checked.data);
  });

  if (result.notes.length > BACKUP_MAX_NOTES) {
    result.truncated = result.notes.length - BACKUP_MAX_NOTES;
    result.notes = result.notes.slice(0, BACKUP_MAX_NOTES);
  }
  return result;
}
