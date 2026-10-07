import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type HeartbeatJob = {
  name: string;
  cron: string;
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

const SERVICE = "webdevtoken.v1.WebDevService";

function buildEndpoint(rpc: string): string {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service is not configured.",
    });
  }
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  return new URL(`${SERVICE}/${rpc}`, baseUrl).toString();
}

async function callForge<T>(rpc: string, body: Record<string, unknown>, userSession: string): Promise<T> {
  const response = await fetch(buildEndpoint(rpc), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
      ...(userSession ? { "x-manus-user-session": userSession } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const code = response.status === 401 ? "UNAUTHORIZED"
      : response.status === 403 ? "FORBIDDEN"
      : response.status === 404 ? "NOT_FOUND"
      : response.status === 429 ? "TOO_MANY_REQUESTS"
      : response.status === 400 || response.status === 422 ? "BAD_REQUEST"
      : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: `Heartbeat ${rpc} failed (${response.status})${detail ? `: ${detail}` : ""}` });
  }

  return (await response.json()) as T;
}

export function validateHeartbeatPath(path: string): void {
  if (!path.startsWith("/api/scheduled/")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Heartbeat path must start with /api/scheduled/." });
  }
}

export async function createHeartbeatJob(job: HeartbeatJob, userSession = "") {
  validateHeartbeatPath(job.path);
  return callForge<{ taskUid: string; nextExecutionAt?: string | null }>("CreateHeartbeatJob", {
    name: job.name,
    cronExpression: job.cron,
    callbackPath: job.path,
    callbackMethod: job.method ?? "POST",
    callbackPayload: JSON.stringify(job.payload ?? {}),
    description: job.description ?? "",
  }, userSession);
}
