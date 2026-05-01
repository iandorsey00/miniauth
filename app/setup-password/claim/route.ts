import { cookies } from "next/headers";

import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { hashPasswordSetupToken } from "@/lib/password-setup";
import { prisma } from "@/lib/prisma";

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

  const setupToken = await prisma.passwordSetupToken.findUnique({
    where: {
      tokenHash: hashPasswordSetupToken(token),
    },
    select: {
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          isActive: true,
          passwordHash: true,
        },
      },
    },
  });

  if (
    !setupToken ||
    setupToken.usedAt ||
    setupToken.expiresAt < new Date() ||
    !setupToken.user.isActive ||
    setupToken.user.passwordHash
  ) {
    return Response.redirect(new URL(`${AUTH_ROUTES.setupPassword}?error=expired`, env.baseUrl), 307);
  }

  const cookieStore = await cookies();
  const expiresAt = setupToken.expiresAt;
  cookieStore.set(env.passwordSetupCookieName, token, getCookieOptions(expiresAt));

  return Response.redirect(new URL(AUTH_ROUTES.setupPassword, env.baseUrl), 307);
}
