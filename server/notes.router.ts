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
  createReminder,
  getRemindersForNote,
  deleteRemindersForNote,
} from "./db";
import { analyzeNoteContent, combineDateAndTime } from "./ai";
import { notifyOwner } from "./_core/notification";

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

        // Create reminder if date is set
        if ((dueDate || scheduledDate) && createdNote) {
          const reminderDate = dueDate || scheduledDate;
          if (reminderDate) {
            // Schedule reminder 1 hour before the event
            const reminderTime = new Date(reminderDate.getTime() - 60 * 60 * 1000);
            if (reminderTime > new Date()) {
              await createReminder({
                noteId: createdNote.id,
                reminderTime,
                notificationType: "both",
                isSent: 0,
              });
            }
          }
        }

        return createdNote;
      } catch (error) {
        console.error("[Notes] Error creating note:", error);
        throw error;
      }
    }),

  importBackup: protectedProcedure
    .input(z.object({
      notes: z.array(z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        category: z.enum(["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"]),
        priority: z.enum(["Low", "Medium", "High"]),
        isCompleted: z.number().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        scheduledDate: z.string().datetime().nullable().optional(),
      })).max(500),
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
        const eventDate = dueDate || scheduledDate;
        if (eventDate) {
          const reminderTime = new Date(eventDate.getTime() - 60 * 60 * 1000);
          if (reminderTime > new Date()) {
            await createReminder({ noteId: createdNoteId, reminderTime, notificationType: "both", isSent: 0 });
          }
        }
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

      await updateNote(input.id, updateData);
      return getNoteById(input.id);
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
      return getNoteById(input.id);
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
