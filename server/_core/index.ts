import "dotenv/config";
import express from "express";
import { spawn } from "node:child_process";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./vite";
import { processPendingReminders } from "../notifications";
import { sdk } from "./sdk";
import { getDb, resolveDriver } from "../db";
import { APP_NAME, HELP_TEXT, getAppVersion, parseArgs } from "./cli";
import { getDataDir, isPortableMode } from "./paths";
import { createLogger, requestLoggingMiddleware } from "./logging";
import { startLocalScheduler } from "./scheduler";
import { createBackupZip, writeSnapshot } from "./backup";

const log = createLogger("server");
const cliArgs = parseArgs(process.argv.slice(2));

if (cliArgs.help) {
  console.log(HELP_TEXT);
  process.exit(0);
}
if (cliArgs.version) {
  console.log(`${APP_NAME} ${getAppVersion()}`);
  process.exit(0);
}
if (cliArgs.dataDir) {
  // Let the paths resolver see it via env as well.
  process.env.SMARTNOTE_DATA_DIR = cliArgs.dataDir;
}

/** One-shot CLI commands that run before the HTTP server starts. */
async function runOneShotCommands(): Promise<boolean> {
  if (cliArgs.backup) {
    const result = await createBackupZip();
    console.log(`Backup created: ${result.file} (${Math.round(result.bytes / 1024)} KB)`);
    return true;
  }
  if (cliArgs.setup) {
    const { runSetupWizard } = await import("./setup");
    await runSetupWizard();
    return true;
  }
  return false;
}

/** Open the app in the user's default browser (portable convenience, --open). */
function openInBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  try {
    // Detached helper process; failures are non-fatal (we always print the URL).
    const child = spawn(cmd.file, cmd.args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* ignore — printed URL is the fallback */
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // One-shot commands (--backup / --setup) run and exit without serving HTTP.
  if (await runOneShotCommands()) {
    process.exit(0);
  }

  const app = express();
  const server = createServer(app);
  // Correlation IDs + structured request logs (must run before route handlers).
  app.use(requestLoggingMiddleware as unknown as express.RequestHandler);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Liveness/readiness probe — cheap, no auth, safe for monitors & launchers.
  app.get("/healthz", async (_req, res) => {
    try {
      let dbOk = false;
      try {
        const db = await getDb();
        dbOk = db != null;
      } catch {
        dbOk = false;
      }
      res.status(dbOk ? 200 : 503).json({
        ok: dbOk,
        version: getAppVersion(),
        driver: resolveDriver(),
        dataDir: getDataDir(),
        uptimeSec: Math.round(process.uptime()),
      });
    } catch (error) {
      log.error("healthz failed", error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Durable reminder callback invoked by a Manus Heartbeat job.
  app.post("/api/scheduled/process-reminders", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      await processPendingReminders();
      return res.json({ ok: true });
    } catch (error) {
      log.error("Scheduled reminder callback failed", error);
      return res.status(500).json({
        error: String(error),
        timestamp: new Date().toISOString(),
      });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Dev-only: lazy-load the Vite middleware so production bundles don't need
    // (or load) the `vite` package at all.
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = cliArgs.port ?? parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.warn(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    const url = `http://localhost:${port}/`;
    log.info(`${APP_NAME} v${getAppVersion()} listening`, {
      url,
      driver: resolveDriver(),
      dataDir: getDataDir(),
    });
    if (cliArgs.open) openInBrowser(url);

    // Portable/offline mode (Stage 1): no platform Heartbeat available →
    // run reminders + nightly snapshots in-process. Both timers are unref'd.
    if (isPortableMode()) {
      startLocalScheduler();
      const NIGHTLY_MS = 24 * 60 * 60 * 1000;
      setInterval(
        () =>
          writeSnapshot().catch((e) => log.warn("Nightly snapshot failed", e)),
        NIGHTLY_MS,
      ).unref();
    }
  });

  // ---------------------------------------------------------------------
  // Graceful shutdown (Stage 0 — #20): stop accepting connections, drain,
  // then exit. SIGINT covers Ctrl+C in a portable terminal window.
  // ---------------------------------------------------------------------
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal}, shutting down gracefully…`);
    const force = setTimeout(() => {
      log.warn("Forcing exit after 10s drain timeout");
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close((err) => {
      if (err) log.error("Error while closing HTTP server", err);
      clearTimeout(force);
      process.exit(err ? 1 : 0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((error) => {
  log.error("Failed to start server", error);
  process.exit(1);
});
