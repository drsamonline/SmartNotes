/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export type NoteCategory = "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning";
export type NotePriority = "Low" | "Medium" | "High";

export interface NoteStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
}
