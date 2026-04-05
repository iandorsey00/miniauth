"use server";

import crypto from "node:crypto";

import { Locale, WorkspaceRole } from "@prisma/client";
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
import { sendLoginCodeEmail, sendPasswordSetupEmail } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createPasswordSetupToken, hashPasswordSetupToken } from "@/lib/password-setup";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { buildRedirectTarget, getPostLoginRedirectTarget, getValidatedReturnTo } from "@/lib/return-to";
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

const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(240).optional(),
});

const workspaceMembershipSchema = z.object({
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  role: z.nativeEnum(WorkspaceRole),
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
  const returnTo = getValidatedReturnTo(formData.get("returnTo"));
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "invalid" })));
  }

  const email = parsed.data.email.trim().toLowerCase();
  const clientIp = await getClientIp();

  try {
    await assertRateLimit("login", `${email}|${clientIp}`, 5);
  } catch {
    redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "rate_limited" })));
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.passwordHash || !user.isActive) {
    redirect(
      buildRedirectTarget(
        AUTH_ROUTES.login,
        returnTo,
        new URLSearchParams({ error: user && !user.isActive ? "inactive" : "invalid" }),
      ),
    );
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "invalid" })));
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
      redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "mfa_send" })));
    }

    await clearRateLimit("login", `${email}|${clientIp}`);
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ sent: "1" })));
  }

  await startSession(user.id);
  await clearRateLimit("login", `${email}|${clientIp}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  redirect(getPostLoginRedirectTarget(returnTo));
}

export async function verifyLoginCodeAction(formData: FormData) {
  const returnTo = getValidatedReturnTo(formData.get("returnTo"));
  const parsed = verifyLoginSchema.safeParse({
    code: formData.get("code"),
  });

  const challenge = await getPendingLoginChallenge();
  if (!parsed.success || !challenge) {
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "expired" })));
  }

  try {
    await assertRateLimit("login_mfa_verify", `${challenge.tokenHash}|${await getClientIp()}`, 5);
  } catch {
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "expired" })));
  }

  if (challenge.codeHash !== sha256(parsed.data.code)) {
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "invalid" })));
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

  redirect(getPostLoginRedirectTarget(returnTo));
}

export async function resendLoginCodeAction(formData: FormData) {
  const returnTo = getValidatedReturnTo(formData.get("returnTo"));
  const challenge = await getPendingLoginChallenge();

  if (!challenge) {
    redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "invalid" })));
  }

  try {
    await assertRateLimit("login_mfa_send", `${challenge.userId}|${await getClientIp()}`, 3);
  } catch {
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "expired" })));
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
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "invalid" })));
  }

  redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ sent: "1" })));
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
  let inviteMode: "sent" | "ok" = "ok";

  try {
    const sent = await sendPasswordSetupEmail({
      recipient: {
        email: user.email,
        displayName: parsed.data.displayName,
        locale: parsed.data.locale,
      },
      setupToken: token.rawToken,
    });

    if (sent) {
      inviteMode = "sent";
    }
  } catch (error) {
    console.error("Failed to send password setup email", error);
  }

  redirect(
    `${AUTH_ROUTES.home}?invite=${inviteMode}&email=${encodeURIComponent(user.email)}&setupToken=${encodeURIComponent(token.rawToken)}&by=${encodeURIComponent(currentUser.email)}`,
  );
}

export async function resendInviteAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const userId = String(formData.get("userId") || "");

  if (!userId) {
    redirect(`${AUTH_ROUTES.home}?invite=invalid`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    redirect(`${AUTH_ROUTES.home}?invite=invalid`);
  }

  const token = await createPasswordSetupToken(user.id);
  let inviteMode: "sent" | "ok" = "ok";

  try {
    const sent = await sendPasswordSetupEmail({
      recipient: {
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
      },
      setupToken: token.rawToken,
    });

    if (sent) {
      inviteMode = "sent";
    }
  } catch (error) {
    console.error("Failed to resend password setup email", error);
  }

  redirect(
    `${AUTH_ROUTES.home}?invite=${inviteMode}&email=${encodeURIComponent(user.email)}&setupToken=${encodeURIComponent(token.rawToken)}&by=${encodeURIComponent(currentUser.email)}`,
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

export async function updateUserMfaAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const enabled = String(formData.get("enabled") || "") === "1";

  if (!userId) {
    redirect(`${AUTH_ROUTES.home}?mfa=invalid`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { emailMfaEnabled: enabled },
  });

  redirect(`${AUTH_ROUTES.home}?mfa=updated`);
}

export async function updateUserActiveAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const enabled = String(formData.get("enabled") || "") === "1";

  if (!userId) {
    redirect(`${AUTH_ROUTES.home}?account=invalid`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: enabled },
  });

  if (!enabled) {
    await prisma.$transaction([
      prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.loginEmailChallenge.deleteMany({
        where: { userId },
      }),
    ]);
  }

  redirect(`${AUTH_ROUTES.home}?account=updated`);
}

export async function createWorkspaceAction(formData: FormData) {
  await requireAdmin();
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-"),
    description: String(formData.get("description") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.home}?workspace=invalid`);
  }

  await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
    },
  });

  redirect(`${AUTH_ROUTES.home}?workspace=saved`);
}

export async function updateWorkspaceAction(formData: FormData) {
  await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parsed = workspaceSchema.safeParse({
    name: formData.get("name"),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-"),
    description: String(formData.get("description") ?? "").trim(),
  });

  if (!workspaceId || !parsed.success) {
    redirect(`${AUTH_ROUTES.home}?workspace=invalid`);
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      isArchived: formData.get("isArchived") === "on",
    },
  });

  redirect(`${AUTH_ROUTES.home}?workspace=saved`);
}

export async function assignWorkspaceMembershipAction(formData: FormData) {
  await requireAdmin();
  const parsed = workspaceMembershipSchema.safeParse({
    userId: formData.get("userId"),
    workspaceId: formData.get("workspaceId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.home}?membership=invalid`);
  }

  await prisma.workspaceMembership.upsert({
    where: {
      userId_workspaceId: {
        userId: parsed.data.userId,
        workspaceId: parsed.data.workspaceId,
      },
    },
    update: { role: parsed.data.role },
    create: {
      userId: parsed.data.userId,
      workspaceId: parsed.data.workspaceId,
      role: parsed.data.role,
    },
  });

  redirect(`${AUTH_ROUTES.home}?membership=updated`);
}

export async function removeWorkspaceMembershipAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");

  if (!userId || !workspaceId) {
    redirect(`${AUTH_ROUTES.home}?membership=invalid`);
  }

  await prisma.workspaceMembership.deleteMany({
    where: {
      userId,
      workspaceId,
    },
  });

  redirect(`${AUTH_ROUTES.home}?membership=updated`);
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
