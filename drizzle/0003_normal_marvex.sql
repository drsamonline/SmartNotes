CREATE TABLE `notificationLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`noteId` int,
	`reminderId` int,
	`channel` enum('push','email') NOT NULL,
	`status` enum('sent','failed','skipped') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificationLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notificationLogs` ADD CONSTRAINT `notificationLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationLogs` ADD CONSTRAINT `notificationLogs_noteId_notes_id_fk` FOREIGN KEY (`noteId`) REFERENCES `notes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationLogs` ADD CONSTRAINT `notificationLogs_reminderId_reminders_id_fk` FOREIGN KEY (`reminderId`) REFERENCES `reminders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_logs_user_created_idx` ON `notificationLogs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notification_logs_note_id_idx` ON `notificationLogs` (`noteId`);