import { int, index, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Notes table for storing user notes with AI-categorized metadata
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: mysqlEnum("category", ["Tasks", "Deadlines", "Schedule", "Thoughts", "Learning"]).notNull(),
  priority: mysqlEnum("priority", ["Low", "Medium", "High"]).default("Medium").notNull(),
  dueDate: timestamp("dueDate"),
  scheduledDate: timestamp("scheduledDate"),
  isCompleted: int("isCompleted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userCategoryIdx: index("notes_user_category_idx").on(table.userId, table.category),
  userDueDateIdx: index("notes_user_due_date_idx").on(table.userId, table.dueDate),
  userScheduledDateIdx: index("notes_user_scheduled_date_idx").on(table.userId, table.scheduledDate),
}));

export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;

/**
 * Reminders table for tracking scheduled notifications
 */
export const reminders = mysqlTable("reminders", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull().references(() => notes.id, { onDelete: "cascade" }),
  reminderTime: timestamp("reminderTime").notNull(),
  notificationType: mysqlEnum("notificationType", ["push", "email", "both"]).default("both").notNull(),
  isSent: int("isSent").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  dueReminderIdx: index("reminders_sent_time_idx").on(table.isSent, table.reminderTime),
  noteIdx: index("reminders_note_id_idx").on(table.noteId),
}));

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

/**
 * Delivery history for reminder notifications. A skipped row is recorded when
 * an optional channel is not configured, so users can distinguish it from a
 * successful or failed delivery.
 */
export const notificationLogs = mysqlTable("notificationLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  noteId: int("noteId").references(() => notes.id, { onDelete: "set null" }),
  reminderId: int("reminderId").references(() => reminders.id, { onDelete: "set null" }),
  channel: mysqlEnum("channel", ["push", "email"]).notNull(),
  status: mysqlEnum("status", ["sent", "failed", "skipped"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("notification_logs_user_created_idx").on(table.userId, table.createdAt),
  noteIdx: index("notification_logs_note_id_idx").on(table.noteId),
}));

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;
