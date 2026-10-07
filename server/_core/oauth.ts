import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db/index";
import { getSessionCookieOptions } from "./cookies";
import { isLocalMode, LOCAL_OPEN_ID, LOCAL_USER_NAME, sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Portable / offline mode (Stage 1): no upstream OAuth server → provide a
  // local sign-in endpoint so the client's normal "login redirect" flow works
  // unchanged against localhost.
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    if (!isLocalMode()) {
      res.status(404).json({ error: "Local login is only available in offline mode" });
      return;
    }
    try {
      await db.upsertUser({
        openId: LOCAL_OPEN_ID,
        name: LOCAL_USER_NAME,
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(LOCAL_OPEN_ID, {
        name: LOCAL_USER_NAME,
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      const secure = cookieOptions.secure;
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        // SameSite=None without Secure is dropped by browsers; localhost is http.
        sameSite: secure ? cookieOptions.sameSite : "lax",
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Local login failed", error);
      res.status(500).json({ error: "Local login failed" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
