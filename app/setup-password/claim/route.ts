import { cookies } from "next/headers";

import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";

function getCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: AUTH_ROUTES.setupPassword,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token")?.trim() ?? "";

  if (token.length < 20) {
    return Response.redirect(new URL(`${AUTH_ROUTES.setupPassword}?error=expired`, env.baseUrl), 307);
  }

  const cookieStore = await cookies();
  const expiresAt = new Date(Date.now() + env.passwordSetupHours * 60 * 60 * 1000);
  cookieStore.set(env.passwordSetupCookieName, token, getCookieOptions(expiresAt));

  return Response.redirect(new URL(AUTH_ROUTES.setupPassword, env.baseUrl), 307);
}
