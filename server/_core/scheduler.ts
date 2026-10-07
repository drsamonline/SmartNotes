/**
 * In-process reminder scheduler (Stage 1 — RFC §Scheduling).
 *
 * Replaces the platform Heartbeat job when running in portable/offline mode:
 * a single unref'd interval that calls `processPendingReminders()` — the exact
 * same code path the hosted deployment triggers via POST /api/scheduled/process-reminders.
 *
 * Design notes (non-bloat):
 *   - One timer only; `unref()` keeps it from holding the event loop open, so
 *     graceful shutdown and tests are unaffected.
 *   - Overlapping runs are prevented with an in-flight guard.
 *   - Errors never crash the interval; they are logged and retried next tick
 *     (pending reminders stay unsent until delivered — existing semantics).
 */
import { createLogger } from "./logging";

const log = createLogger("scheduler");

export const DEFAULT_TICK_MS = 60_000;

let _timer: NodeJS.Timeout | null = null;
let _inFlight = false;

export interface SchedulerOptions {
  /** Tick interval in milliseconds (default 60s, override via SMARTNOTE_TICK_MS). */
  intervalMs?: number;
}

/**
 * Start the local reminder-processing loop. Idempotent: calling it while
 * already running is a no-op. Returns the effective interval in ms, or null
 * when the scheduler was disabled (SMARTNOTE_SCHEDULER=0).
 */
export function startLocalScheduler(opts: SchedulerOptions = {}): number | null {
  if (_timer) return _timer.intervalMs ?? null;
  if ((process.env.SMARTNOTE_SCHEDULER ?? "1") === "0") {
    log.info("Local scheduler disabled via SMARTNOTE_SCHEDULER=0");
    return null;
  }

  const intervalMs =
    opts.intervalMs ?? Number.parseInt(process.env.SMARTNOTE_TICK_MS ?? "", 10);
  const tick = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_TICK_MS;

  // Lazy import avoids a module cycle at load time (notifications → db → …).
  const run = async () => {
    if (_inFlight) return;
    _inFlight = true;
    try {
      const { processPendingReminders } = await import("../notifications");
      await processPendingReminders();
    } catch (error) {
      log.error("Scheduled reminder run failed", error);
    } finally {
      _inFlight = false;
    }
  };

  _timer = setInterval(() => void run(), tick);
  _timer.unref();
  log.info(`Local reminder scheduler started (every ${Math.round(tick / 1000)}s)`);
  // Process anything that came due while the app was closed, shortly after boot.
  setTimeout(() => void run(), 2_000).unref();
  return tick;
}

/** Stop the scheduler (used by tests / shutdown). */
export function stopLocalScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    log.info("Local reminder scheduler stopped");
  }
}

/** Test/inspection helper. */
export function isLocalSchedulerRunning(): boolean {
  return _timer !== null;
}
