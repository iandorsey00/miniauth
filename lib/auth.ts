import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { generateSixDigitCode, generateToken, sha256 } from "@/lib/tokens";

function getCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
    ...(env.authSharedCookieDomain ? { domain: env.authSharedCookieDomain } : {}),
  };
}

export async function startSession(userId: string) {
  const rawToken = generateToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, rawToken, getCookieOptions(expiresAt));
}

export async function destroySession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(env.authCookieName)?.value;

  if (rawToken) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.delete(env.authCookieName);
}

export async function createLoginChallenge(userId: string) {
  const rawToken = generateToken();
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + env.loginCodeMinutes * 60 * 1000);

  await prisma.loginEmailChallenge.deleteMany({
    where: { userId },
  });

  await prisma.loginEmailChallenge.create({
    data: {
      userId,
      tokenHash: sha256(rawToken),
      codeHash: sha256(code),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(env.loginChallengeCookieName, rawToken, getCookieOptions(expiresAt));
  if (process.env.NODE_ENV !== "production") {
    cookieStore.set(env.loginPreviewCookieName, code, getCookieOptions(expiresAt));
  }

  return { code, expiresAt };
}

export async function clearLoginChallenge() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(env.loginChallengeCookieName)?.value;

  if (rawToken) {
    await prisma.loginEmailChallenge.deleteMany({
      where: { tokenHash: sha256(rawToken) },
    });
  }

  cookieStore.delete(env.loginChallengeCookieName);
  cookieStore.delete(env.loginPreviewCookieName);
}

export const getPendingLoginChallenge = cache(async () => {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(env.loginChallengeCookieName)?.value;

  if (!rawToken) {
    return null;
  }

  const challenge = await prisma.loginEmailChallenge.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: true },
  });

  if (!challenge || challenge.usedAt || challenge.expiresAt < new Date() || !challenge.user.isActive) {
    return null;
  }

  return challenge;
});

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(env.authCookieName)?.value;

  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: {
      user: {
        include: {
          appAccess: {
            orderBy: [{ appKey: "asc" }],
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
});

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(AUTH_ROUTES.login);
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const access = user.appAccess.find((item) => item.appKey === "miniauth" && item.state === "ACTIVE");

  if (!access || access.role !== "ADMIN") {
    redirect(AUTH_ROUTES.login);
  }

  return user;
}

export async function getPendingLoginPreviewCode() {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(env.loginPreviewCookieName)?.value ?? null;
}
