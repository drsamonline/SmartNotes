import {
  createNotificationLog,
  getNoteById,
  getPendingReminders,
  getUserById,
  markReminderAsSent,
} from "./db/index";
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";
import type { Note, Reminder } from "../drizzle/schema";

type DeliveryStatus = "sent" | "failed" | "skipped";
type DeliveryResult = {
  delivered: boolean;
  status: DeliveryStatus;
  error?: string;
};

/**
 * Process due reminders. This function is called by the durable platform
 * heartbeat endpoint, not by an in-process timer.
 */
export async function processPendingReminders() {
  try {
    const now = new Date();
    const reminders = await getPendingReminders(now);

    for (const reminder of reminders) {
      const note = await getNoteById(reminder.noteId);
      if (!note) continue;

      const delivered = await sendReminder(note, reminder);
      // Keep failed/skipped-only reminders pending so configuration problems are
      // visible and can be retried after an email provider is configured.
      if (delivered) {
        await markReminderAsSent(reminder.id);
      }
    }
  } catch (error) {
    console.error("[Notifications] Error processing reminders:", error);
  }
}

async function recordDelivery(
  note: Note,
  reminder: Reminder,
  channel: "push" | "email",
  status: DeliveryStatus,
  title: string,
  content: string,
  error?: string,
) {
  try {
    await createNotificationLog({
      userId: note.userId,
      noteId: note.id,
      reminderId: reminder.id,
      channel,
      status,
      title,
      content,
      error: error ?? null,
    });
  } catch (logError) {
    // Logging must never prevent a successful notification from being marked sent.
    console.error("[Notifications] Failed to write delivery log:", logError);
  }
}

async function deliverPush(
  note: Note,
  reminder: Reminder,
  title: string,
  content: string,
): Promise<DeliveryResult> {
  try {
    const delivered = await notifyOwner({ title, content });
    const status: DeliveryStatus = delivered ? "sent" : "failed";
    const error = delivered ? undefined : "Notification service rejected the request";
    await recordDelivery(note, reminder, "push", status, title, content, error);
    return { delivered, status, error };
  } catch (error) {
    const message = String(error);
    await recordDelivery(note, reminder, "push", "failed", title, content, message);
    return { delivered: false, status: "failed", error: message };
  }
}

async function deliverEmail(
  note: Note,
  reminder: Reminder,
  title: string,
  content: string,
): Promise<DeliveryResult> {
  const user = await getUserById(note.userId);
  if (!ENV.emailWebhookUrl) {
    const error = "EMAIL_WEBHOOK_URL is not configured";
    await recordDelivery(note, reminder, "email", "skipped", title, content, error);
    return { delivered: false, status: "skipped", error };
  }
  if (!user?.email) {
    const error = "No email address is available for this user";
    await recordDelivery(note, reminder, "email", "skipped", title, content, error);
    return { delivered: false, status: "skipped", error };
  }

  try {
    const response = await fetch(ENV.emailWebhookUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(ENV.emailWebhookApiKey
          ? { authorization: `Bearer ${ENV.emailWebhookApiKey}` }
          : {}),
      },
      body: JSON.stringify({
        to: user.email,
        subject: title,
        text: content,
        noteId: note.id,
        reminderId: reminder.id,
      }),
    });

    if (!response.ok) {
      const error = `Email provider rejected the request (${response.status})`;
      await recordDelivery(note, reminder, "email", "failed", title, content, error);
      return { delivered: false, status: "failed", error };
    }

    await recordDelivery(note, reminder, "email", "sent", title, content);
    return { delivered: true, status: "sent" };
  } catch (error) {
    const message = String(error);
    await recordDelivery(note, reminder, "email", "failed", title, content, message);
    return { delivered: false, status: "failed", error: message };
  }
}

async function sendReminder(note: Note, reminder: Reminder): Promise<boolean> {
  const title = `Reminder: ${note.title}`;
  const content = `${note.category} due at ${new Date(note.dueDate || note.scheduledDate || reminder.reminderTime).toLocaleString()}`;
  const shouldPush = reminder.notificationType === "push" || reminder.notificationType === "both";
  const shouldEmail = reminder.notificationType === "email" || reminder.notificationType === "both";

  const results = await Promise.all([
    shouldPush ? deliverPush(note, reminder, title, content) : null,
    shouldEmail ? deliverEmail(note, reminder, title, content) : null,
  ]);

  const delivered = results.some((result) => result?.delivered === true);
  if (delivered) {
    console.log(`[Notifications] Sent reminder for note ${note.id}`);
  } else {
    console.error(`[Notifications] No reminder channel delivered for note ${note.id}`);
  }
  return delivered;
}
