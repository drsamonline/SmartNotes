/**
 * SQLite mirror of `drizzle/schema.ts` (Stage 0 — Enhancement #47 groundwork).
 *
 * Kept column-for-column identical to the MySQL schema so the same storage
 * functions can run against either driver. Row types stay sourced from the
 * MySQL schema (single source of truth for TS consumers).
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    openId: text("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: text("email", { length: 320 }),
    loginMethod: text("loginMethod", { length: 64 }),
    role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
    createdAt: text("createdAt").defaultNow().notNull(),
    updatedAt: text("updatedAt").defaultNow().notNull(),
    lastSignedIn: text("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    openIdIdx: uniqueIndex("users_openId_unique_idx").on(table.openId),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    title: text("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    category: text("category", {
      enum: ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"],
    }).notNull(),
    priority: text("priority", { enum: ["Low", "Medium", "High"] })
      .default("Medium")
      .notNull(),
    dueDate: text("dueDate"),
    scheduledDate: text("scheduledDate"),
    isCompleted: integer("isCompleted").default(0).notNull(),
    createdAt: text("createdAt").defaultNow().notNull(),
    updatedAt: text("updatedAt").defaultNow().notNull(),
  },
  (table) => ({
    userCategoryIdx: index("notes_user_category_idx").on(table.userId, table.category),
    userDueDateIdx: index("notes_user_due_date_idx").on(table.userId, table.dueDate),
    userScheduledDateIdx: index("notes_user_scheduled_date_idx").on(
      table.userId,
      table.scheduledDate,
    ),
  }),
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: integer("noteId")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    reminderTime: text("reminderTime").notNull(),
    notificationType: text("notificationType", { enum: ["push", "email", "both"] })
      .default("both")
      .notNull(),
    isSent: integer("isSent").default(0).notNull(),
    createdAt: text("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    dueReminderIdx: index("reminders_sent_time_idx").on(table.isSent, table.reminderTime),
    noteIdx: index("reminders_note_id_idx").on(table.noteId),
  }),
);

export const notificationLogs = sqliteTable(
  "notificationLogs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    noteId: integer("noteId").references(() => notes.id, { onDelete: "set null" }),
    reminderId: integer("reminderId").references(() => reminders.id, { onDelete: "set null" }),
    channel: text("channel", { enum: ["push", "email"] }).notNull(),
    status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(),
    title: text("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    error: text("error"),
    createdAt: text("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("notification_logs_user_created_idx").on(table.userId, table.createdAt),
    noteIdx: index("notification_logs_note_id_idx").on(table.noteId),
  }),
);

// Single source of truth for row types: the MySQL schema definitions.
export type {
  User,
  InsertUser,
  Note,
  InsertNote,
  Reminder,
  InsertReminder,
  NotificationLog,
  InsertNotificationLog,
} from "../../drizzle/schema";
