CREATE INDEX `notes_user_category_idx` ON `notes` (`userId`,`category`);--> statement-breakpoint
CREATE INDEX `notes_user_due_date_idx` ON `notes` (`userId`,`dueDate`);--> statement-breakpoint
CREATE INDEX `notes_user_scheduled_date_idx` ON `notes` (`userId`,`scheduledDate`);--> statement-breakpoint
CREATE INDEX `reminders_sent_time_idx` ON `reminders` (`isSent`,`reminderTime`);--> statement-breakpoint
CREATE INDEX `reminders_note_id_idx` ON `reminders` (`noteId`);