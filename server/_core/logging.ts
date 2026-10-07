/**
 * Structured logging with correlation IDs (Stage 0 — Enhancement #39).
 *
 * - JSON lines in production, human-readable in development.
 * - AsyncLocalStorage-based request context so every log line inside a request
 *   carries the same `correlationId` without threading it through call sites.
 * - Child loggers: `const log = createLogger("Notifications")`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

interface RequestContext {
  correlationId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase() as LogLevel;
  if (configured && configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

export function newCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Run `fn` with a correlation ID attached to all logs emitted inside it. */
export function withRequestContext<T>(correlationId: string, fn: () => T): T {
  return als.run({ correlationId }, fn);
}

export function currentCorrelationId(): string | undefined {
  return als.getStore()?.correlationId;
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, stack: err.stack };
  }
  return { errMessage: String(err) };
}

function emit(level: LogLevel, scope: string, msg: string, fields?: LogFields, err?: unknown) {
  if (LEVELS[level] < minLevel()) return;

  const time = new Date().toISOString();
  const cid = currentCorrelationId();
  const json = process.env.NODE_ENV === "production" || process.env.SMARTNOTE_LOG_JSON === "1";

  if (json) {
    const payload: LogFields = { time, level, scope, msg };
    if (cid) payload.correlationId = cid;
    if (fields) Object.assign(payload, fields);
    if (err) Object.assign(payload, serializeError(err));
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      JSON.stringify(payload),
    );
    return;
  }

  const parts = [`${time.slice(11, 23)}`, `[${level.toUpperCase()}]`, `[${scope}]`, msg];
  if (cid) parts.push(`(cid=${cid})`);
  if (fields && Object.keys(fields).length > 0) parts.push(JSON.stringify(fields));
  const line = parts.join(" ");
  if (err) {
    (level === "error" ? console.error : console.warn)(line, err);
  } else {
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
  }
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields, err?: unknown): void;
  error(msg: string, err?: unknown, fields?: LogFields): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, fields) => emit("debug", scope, msg, fields),
    info: (msg, fields) => emit("info", scope, msg, fields),
    warn: (msg, fields, err) => emit("warn", scope, msg, fields, err),
    error: (msg, err, fields) => emit("error", scope, msg, fields, err),
  };
}

/** Express middleware: assigns/propagates a correlation ID and logs request completion. */
export function requestLoggingMiddleware(
  req: { headers: Record<string, unknown>; method: string; url: string },
  _res: { on: (ev: string, cb: () => void) => void; statusCode?: number },
  next: () => void,
) {
  const incoming = req.headers["x-correlation-id"] ?? req.headers["request-uid"];
  const cid = typeof incoming === "string" && incoming.length <= 64 ? incoming : newCorrelationId();
  (_res as { setHeader?: (k: string, v: string) => void }).setHeader?.("X-Correlation-Id", cid);
  const start = Date.now();
  _res.on("finish", () => {
    const status = (_res.statusCode ?? 0) || 0;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    emit(level, "http", `${req.method} ${req.url.split("?")[0]} ${status}`, {
      ms: Date.now() - start,
      correlationId: cid,
    });
  });
  withRequestContext(cid, next);
}
