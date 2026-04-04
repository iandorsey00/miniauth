"use server";

import crypto from "node:crypto";

import { Locale } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearLoginChallenge,
  createLoginChallenge,
  destroySession,
  getCurrentUser,
  getPendingLoginChallenge,
  requireAdmin,
  requireUser,
  startSession,
} from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { sendLoginCodeEmail } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createPasswordSetupToken, hashPasswordSetupToken } from "@/lib/password-setup";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/tokens";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const verifyLoginSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const setupPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
  passwordConfirm: z.string().min(8),
});

const inviteSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(2).max(60),
  locale: z.nativeEnum(Locale),
  emailMfaEnabled: z.boolean().optional(),
  appKey: z.string().trim().min(2).max(40),
});

async function getClientIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip") || "unknown";
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.login}?error=invalid`);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const clientIp = await getClientIp();

  try {
    await assertRateLimit("login", `${email}|${clientIp}`, 5);
  } catch {
    redirect(`${AUTH_ROUTES.login}?error=rate_limited`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.passwordHash || !user.isActive) {
    redirect(`${AUTH_ROUTES.login}?error=${user && !user.isActive ? "inactive" : "invalid"}`);
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    redirect(`${AUTH_ROUTES.login}?error=invalid`);
  }

  if (user.emailMfaEnabled) {
    try {
      const challenge = await createLoginChallenge(user.id);
      await sendLoginCodeEmail({
        recipient: {
          email: user.email,
          displayName: user.displayName,
          locale: user.locale,
        },
        code: challenge.code,
      });
    } catch (error) {
      console.error("Failed to send login verification code", error);
      await clearLoginChallenge();
      redirect(`${AUTH_ROUTES.login}?error=mfa_send`);
    }

    await clearRateLimit("login", `${email}|${clientIp}`);
    redirect(`${AUTH_ROUTES.verify}?sent=1`);
  }

  await startSession(user.id);
  await clearRateLimit("login", `${email}|${clientIp}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  redirect(AUTH_ROUTES.home);
}

export async function verifyLoginCodeAction(formData: FormData) {
  const parsed = verifyLoginSchema.safeParse({
    code: formData.get("code"),
  });

  const challenge = await getPendingLoginChallenge();
  if (!parsed.success || !challenge) {
    redirect(`${AUTH_ROUTES.verify}?error=expired`);
  }

  try {
    await assertRateLimit("login_mfa_verify", `${challenge.tokenHash}|${await getClientIp()}`, 5);
  } catch {
    redirect(`${AUTH_ROUTES.verify}?error=expired`);
  }

  if (challenge.codeHash !== sha256(parsed.data.code)) {
    redirect(`${AUTH_ROUTES.verify}?error=invalid`);
  }

  await prisma.loginEmailChallenge.update({
    where: { id: challenge.id },
    data: { usedAt: new Date() },
  });

  await clearRateLimit("login_mfa_verify", `${challenge.tokenHash}|${await getClientIp()}`);
  await clearLoginChallenge();
  await startSession(challenge.userId);
  await prisma.user.update({
    where: { id: challenge.userId },
    data: { lastLoginAt: new Date() },
  });

  redirect(AUTH_ROUTES.home);
}

export async function resendLoginCodeAction() {
  const challenge = await getPendingLoginChallenge();

  if (!challenge) {
    redirect(`${AUTH_ROUTES.login}?error=invalid`);
  }

  try {
    await assertRateLimit("login_mfa_send", `${challenge.userId}|${await getClientIp()}`, 3);
  } catch {
    redirect(`${AUTH_ROUTES.verify}?error=expired`);
  }

  try {
    const refreshed = await createLoginChallenge(challenge.userId);
    await sendLoginCodeEmail({
      recipient: {
        email: challenge.user.email,
        displayName: challenge.user.displayName,
        locale: challenge.user.locale,
      },
      code: refreshed.code,
    });
  } catch (error) {
    console.error("Failed to resend login verification code", error);
    await clearLoginChallenge();
    redirect(`${AUTH_ROUTES.verify}?error=invalid`);
  }

  redirect(`${AUTH_ROUTES.verify}?sent=1`);
}

export async function setupPasswordAction(formData: FormData) {
  const parsed = setupPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.setupPassword}?error=invalid`);
  }

  if (parsed.data.password !== parsed.data.passwordConfirm) {
    redirect(`${AUTH_ROUTES.setupPassword}?error=password_mismatch&token=${encodeURIComponent(parsed.data.token)}`);
  }

  const setupToken = await prisma.passwordSetupToken.findUnique({
    where: {
      tokenHash: hashPasswordSetupToken(parsed.data.token),
    },
    include: { user: true },
  });

  if (!setupToken || setupToken.usedAt || setupToken.expiresAt < new Date() || !setupToken.user.isActive) {
    redirect(`${AUTH_ROUTES.setupPassword}?error=expired`);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: setupToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordSetupToken.update({
      where: { id: setupToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect(`${AUTH_ROUTES.login}?setup=1`);
}

export async function logoutAction() {
  await destroySession();
  redirect(AUTH_ROUTES.login);
}

export async function inviteUserAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    locale: formData.get("locale"),
    emailMfaEnabled: formData.get("emailMfaEnabled") === "on",
    appKey: formData.get("appKey"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.home}?invite=invalid`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
  });

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        email: parsed.data.email.trim().toLowerCase(),
        displayName: parsed.data.displayName,
        locale: parsed.data.locale,
        emailMfaEnabled: parsed.data.emailMfaEnabled ?? false,
      },
    }));

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: parsed.data.displayName,
      locale: parsed.data.locale,
      emailMfaEnabled: parsed.data.emailMfaEnabled ?? false,
      isActive: true,
    },
  });

  await prisma.appAccess.upsert({
    where: {
      userId_appKey: {
        userId: user.id,
        appKey: parsed.data.appKey,
      },
    },
    update: {
      state: "ACTIVE",
    },
    create: {
      userId: user.id,
      appKey: parsed.data.appKey,
      role: "MEMBER",
      state: "ACTIVE",
    },
  });

  const token = await createPasswordSetupToken(user.id);

  redirect(
    `${AUTH_ROUTES.home}?invite=ok&email=${encodeURIComponent(user.email)}&setupToken=${encodeURIComponent(token.rawToken)}&by=${encodeURIComponent(currentUser.email)}`,
  );
}

export async function revokeSessionAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("sessionId") || "");

  if (!id) {
    redirect(AUTH_ROUTES.home);
  }

  await prisma.session.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  redirect(AUTH_ROUTES.home);
}

export async function seedSelfAccessAction() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(AUTH_ROUTES.login);
  }

  await prisma.appAccess.upsert({
    where: {
      userId_appKey: {
        userId: user.id,
        appKey: "miniauth",
      },
    },
    update: {
      role: "ADMIN",
      state: "ACTIVE",
    },
    create: {
      userId: user.id,
      appKey: "miniauth",
      role: "ADMIN",
      state: "ACTIVE",
    },
  });

  redirect(`${AUTH_ROUTES.home}?seed=1`);
}
