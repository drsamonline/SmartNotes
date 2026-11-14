import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const mocks = vi.hoisted(() => ({
  getPendingReminders: vi.fn(),
  claimReminder: vi.fn(),
  releaseReminderClaim: vi.fn(),
  getNoteById: vi.fn(),
  getUserById: vi.fn(),
  createNotificationLog: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./db/index", () => ({
  getPendingReminders: mocks.getPendingReminders,
  claimReminder: mocks.claimReminder,
  releaseReminderClaim: mocks.releaseReminderClaim,
  getNoteById: mocks.getNoteById,
  getUserById: mocks.getUserById,
  createNotificationLog: mocks.createNotificationLog,
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: mocks.notifyOwner,
}));

import { processPendingReminders } from "./notifications";

const reminder = {
  id: 7,
  noteId: 12,
  reminderTime: new Date("2020-01-01T10:00:00.000Z"),
  notificationType: "both" as const,
  isSent: 0,
  createdAt: new Date("2020-01-01T09:00:00.000Z"),
};

const note = {
  id: 12,
  title: "Submit report",
  category: "Deadlines" as const,
  dueDate: new Date("2020-01-01T11:00:00.000Z"),
  scheduledDate: null,
};

describe("processPendingReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPendingReminders.mockResolvedValue([reminder]);
    mocks.getNoteById.mockResolvedValue(note);
    mocks.getUserById.mockResolvedValue({ email: null });
    mocks.createNotificationLog.mockResolvedValue(undefined);
    mocks.notifyOwner.mockResolvedValue(true);
    mocks.claimReminder.mockResolvedValue(true);
    mocks.releaseReminderClaim.mockResolvedValue(undefined);
  });

  it("sends due reminders and claims them before delivery", async () => {
    await processPendingReminders();

    expect(mocks.getPendingReminders).toHaveBeenCalledWith(expect.any(Date));
    expect(mocks.notifyOwner).toHaveBeenCalledWith({
      title: "Reminder: Submit report",
      content: expect.stringContaining("Deadlines due at"),
    });
    // The claim IS the mark-as-sent: one conditional UPDATE, so a second run
    // that read the same pending row cannot deliver it again.
    expect(mocks.claimReminder).toHaveBeenCalledWith(reminder.id);
    expect(mocks.releaseReminderClaim).not.toHaveBeenCalled();
    expect(mocks.createNotificationLog).toHaveBeenCalled();
  });

  it("leaves a reminder pending when notification delivery fails", async () => {
    mocks.notifyOwner.mockRejectedValueOnce(new Error("temporary outage"));

    await processPendingReminders();

    // Nothing was delivered, so the claim is released and the next heartbeat
    // retries it — a failed reminder must never be silently consumed.
    expect(mocks.releaseReminderClaim).toHaveBeenCalledWith(reminder.id);
  });

  it("delivers a reminder exactly once when two heartbeat runs overlap", async () => {
    // Both runs read the same pending row — which is what the real query does,
    // because neither has written anything yet when the second one selects.
    mocks.getPendingReminders.mockResolvedValue([reminder]);
    let claimed = false;
    mocks.claimReminder.mockImplementation(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });

    await Promise.all([processPendingReminders(), processPendingReminders()]);

    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
  });

  it("skips a reminder another run has already claimed", async () => {
    mocks.claimReminder.mockResolvedValue(false);

    await processPendingReminders();

    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    expect(mocks.createNotificationLog).not.toHaveBeenCalled();
  });

  it("releases the claim when the note no longer exists", async () => {
    mocks.getNoteById.mockResolvedValue(null);

    await processPendingReminders();

    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    expect(mocks.releaseReminderClaim).toHaveBeenCalledWith(reminder.id);
  });

  it("delivers an email reminder when an email webhook is configured", async () => {
    const emailReminder = { ...reminder, notificationType: "email" as const };
    mocks.getPendingReminders.mockResolvedValue([emailReminder]);
    mocks.getUserById.mockResolvedValue({ email: "user@example.com" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    ENV.emailWebhookUrl = "https://email.example.test/send";

    await processPendingReminders();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://email.example.test/send",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"to":"user@example.com"'),
      }),
    );
    expect(mocks.claimReminder).toHaveBeenCalledWith(emailReminder.id);
  });
});

afterEach(() => {
  ENV.emailWebhookUrl = "";
  vi.unstubAllGlobals();
});
