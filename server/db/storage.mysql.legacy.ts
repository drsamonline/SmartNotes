import { and, desc, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  notes,
  reminders,
  notificationLogs,
  InsertNote,
  InsertReminder,
  InsertNotificationLog,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

/**
 * Get all notes for a user
 */
export async function getUserNotes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.createdAt));
}

/**
 * Get notes by category for a user
 */
export async function getNotesByCategory(userId: number, category: "Tasks" | "Deadlines" | "Schedule" | "Thoughts" | "Learning") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.category, category)))
    .orderBy(desc(notes.createdAt));
}

/**
 * Create a new note
 */
export async function createNote(data: InsertNote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notes).values(data);
  return Number(result[0].insertId);
}

/**
 * Update a note
 */
export async function updateNote(noteId: number, data: Partial<InsertNote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notes).set(data).where(eq(notes.id, noteId));
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(notes).where(eq(notes.id, noteId));
}

/**
 * Get a single note by ID
 */
export async function getNoteById(noteId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Create a reminder
 */
export async function createReminder(data: InsertReminder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(reminders).values(data);
}

/**
 * Get pending reminders (not yet sent)
 */
export async function getPendingReminders(now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.isSent, 0), lte(reminders.reminderTime, now)))
    .orderBy(reminders.reminderTime);
}

/**
 * Mark reminder as sent
 */
export async function markReminderAsSent(reminderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reminders).set({ isSent: 1 }).where(eq(reminders.id, reminderId));
}

/**
 * Get reminders for a note
 */
export async function getRemindersForNote(noteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reminders).where(eq(reminders.noteId, noteId));
}

/**
 * Delete reminders for a note
 */
export async function deleteRemindersForNote(noteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reminders).where(eq(reminders.noteId, noteId));
}

export async function createNotificationLog(data: InsertNotificationLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(notificationLogs).values(data);
}

export async function getNotificationHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notificationLogs)
    .where(eq(notificationLogs.userId, userId))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(100);
}

/**
 * Get notes stats for a user
 */
export async function getNoteStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, pending: 0, overdue: 0 };
  
  const allNotes = await db.select().from(notes).where(eq(notes.userId, userId));
  const completed = allNotes.filter(n => n.isCompleted).length;
  const pending = allNotes.length - completed;
  const now = new Date();
  const overdue = allNotes.filter(n => !n.isCompleted && n.dueDate && n.dueDate < now).length;
  
  return {
    total: allNotes.length,
    completed,
    pending,
    overdue,
  };
}
