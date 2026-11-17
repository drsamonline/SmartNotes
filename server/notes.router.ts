import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createNote,
  deleteNote,
  getNoteById,
  getNotesByCategory,
  getNoteStats,
  getNotificationHistory,
  getUserNotes,
  updateNote,
  deleteRemindersForNote,
} from "./db/index";
import { syncNoteReminder } from "./reminders";
import { analyzeNoteContent, combineDateAndTime } from "./ai";
import { BACKUP_MAX_NOTES, backupNoteSchema } from "@shared/noteBackup";

export const notesRouter = router({
  /**
   * Create a new note with AI analysis
   */
  create: protectedProcedure
    .input(z.object({ content: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Analyze content with AI
        const analysis = await analyzeNoteContent(input.content);

        // Determine the appropriate date field based on category
        let dueDate: Date | undefined;
        let scheduledDate: Date | undefined;

        if (analysis.extractedDate) {
          const fullDateTime = combineDateAndTime(analysis.extractedDate, analysis.extractedTime);
          if (analysis.category === "Deadlines") {
            dueDate = fullDateTime;
          } else if (analysis.category === "Schedule") {
            scheduledDate = fullDateTime;
          }
        }

        // Create the note
        const createdNoteId = await createNote({
          userId: ctx.user.id,
          title: analysis.title,
          content: input.content,
          category: analysis.category,
          priority: analysis.priority,
          dueDate,
          scheduledDate,
          isCompleted: 0,
        });

        // Read back the exact inserted row rather than relying on ordering,
        // which is unsafe when two notes are created concurrently.
        const createdNote = await getNoteById(createdNoteId);

        // The reminder rule lives in ./reminders so create, import, edit and
        // complete cannot disagree about when a note is reminded.
        if (createdNote) {
          await syncNoteReminder(createdNote.id, dueDate || scheduledDate, {
            isCompleted: createdNote.isCompleted,
          });
        }

        return createdNote;
      } catch (error) {
        console.error("[Notes] Error creating note:", error);
        throw error;
      }
    }),

  importBackup: protectedProcedure
    // The shape lives in `shared/noteBackup.ts` so the browser importer cannot
    // disagree with this schema — a disagreement used to reject whole batches.
    .input(z.object({
      notes: z.array(backupNoteSchema).max(BACKUP_MAX_NOTES),
    }))
    .mutation(async ({ input, ctx }) => {
      for (const note of input.notes) {
        const dueDate = note.dueDate ? new Date(note.dueDate) : undefined;
        const scheduledDate = note.scheduledDate ? new Date(note.scheduledDate) : undefined;
        const createdNoteId = await createNote({
          userId: ctx.user.id,
          title: note.title,
          content: note.content,
          category: note.category,
          priority: note.priority,
          isCompleted: note.isCompleted ? 1 : 0,
          dueDate,
          scheduledDate,
        });
        await syncNoteReminder(createdNoteId, dueDate || scheduledDate, {
          isCompleted: note.isCompleted ? 1 : 0,
        });
      }
      return { imported: input.notes.length };
    }),

  /**
   * Get all notes for the current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getUserNotes(ctx.user.id);
  }),

  /**
   * Get notes by category
   */
  listByCategory: protectedProcedure
    .input(
      z.object({
        category: z.enum(["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"]),
      })
    )
    .query(async ({ input, ctx }) => {
      return getNotesByCategory(ctx.user.id, input.category);
    }),

  /**
   * Get a single note by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const note = await getNoteById(input.id);
      if (!note || note.userId !== ctx.user.id) {
        throw new Error("Note not found");
      }
      return note;
    }),

  /**
   * Update a note
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        priority: z.enum(["Low", "Medium", "High"]).optional(),
        isCompleted: z.number().optional(),
        dueDate: z.date().optional().nullable(),
        scheduledDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const note = await getNoteById(input.id);
      if (!note || note.userId !== ctx.user.id) {
        throw new Error("Note not found");
      }

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.priority !== undefined) updateData.priority = input.priority;
      if (input.isCompleted !== undefined) updateData.isCompleted = input.isCompleted;
      if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
      if (input.scheduledDate !== undefined) updateData.scheduledDate = input.scheduledDate;

      const dateChanged =
        input.dueDate !== undefined || input.scheduledDate !== undefined;
      const completionChanged =
        input.isCompleted !== undefined && input.isCompleted !== note.isCompleted;

      await updateNote(input.id, updateData);
      const updated = await getNoteById(input.id);

      // Moving a deadline moves its reminder; completing one silences it and
      // un-completing one re-arms it. Before this, `update` touched the note
      // and left the reminder at the old time.
      if (updated && (dateChanged || completionChanged)) {
        await syncNoteReminder(updated.id, updated.dueDate || updated.scheduledDate, {
          isCompleted: updated.isCompleted,
        });
      }
      return updated;
    }),

  /**
   * Delete a note
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const note = await getNoteById(input.id);
      if (!note || note.userId !== ctx.user.id) {
        throw new Error("Note not found");
      }

      // Delete associated reminders
      await deleteRemindersForNote(input.id);

      // Delete the note
      await deleteNote(input.id);
      return { success: true };
    }),

  /**
   * Get note statistics
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getNoteStats(ctx.user.id);
  }),

  notificationHistory: protectedProcedure.query(async ({ ctx }) => {
    return getNotificationHistory(ctx.user.id);
  }),

  /**
   * Search notes by title or content
   */
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const allNotes = await getUserNotes(ctx.user.id);
      const searchTerm = input.query.toLowerCase();
      return allNotes.filter(
        (note) =>
          note.title.toLowerCase().includes(searchTerm) ||
          note.content.toLowerCase().includes(searchTerm)
      );
    }),

  /**
   * Mark note as complete/incomplete
   */
  toggleComplete: protectedProcedure
    .input(z.object({ id: z.number(), isCompleted: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const note = await getNoteById(input.id);
      if (!note || note.userId !== ctx.user.id) {
        throw new Error("Note not found");
      }

      await updateNote(input.id, { isCompleted: input.isCompleted });
      const updated = await getNoteById(input.id);
      if (updated) {
        await syncNoteReminder(updated.id, updated.dueDate || updated.scheduledDate, {
          isCompleted: updated.isCompleted,
        });
      }
      return updated;
    }),

  /**
   * Update note title, content, and priority
   */
  updateNote: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1),
        content: z.string().min(1),
        priority: z.enum(["Low", "Medium", "High"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const note = await getNoteById(input.id);
      if (!note || note.userId !== ctx.user.id) {
        throw new Error("Note not found");
      }

      await updateNote(input.id, {
        title: input.title,
        content: input.content,
        priority: input.priority,
      });
      return getNoteById(input.id);
    }),
});
