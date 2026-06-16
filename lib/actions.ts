"use server";

import crypto from "node:crypto";

import { AccentColor, AppAccessRole, AppAccessState, Locale, ThemePreference, WorkspaceRole } from "@prisma/client";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearLoginChallenge,
  createLoginChallenge,
  createTotpLoginChallenge,
  destroySession,
  getCurrentUser,
  getPendingLoginChallenge,
  refreshSharedPreferenceCookies,
  requireAdmin,
  requireUser,
  startSession,
} from "@/lib/auth";
import { AUTH_COOKIES, AUTH_ROUTES } from "@/lib/constants";
import { sendLoginCodeEmail, sendPasswordSetupEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createPasswordSetupToken, hashPasswordSetupToken } from "@/lib/password-setup";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, clearRateLimit } from "@/lib/rate-limit";
import { buildRedirectTarget, getPostLoginRedirectTarget, getValidatedReturnTo } from "@/lib/return-to";
import { generateToken, sha256 } from "@/lib/tokens";
import {
  buildTotpProvisioningUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "@/lib/totp";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const verifyLoginSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

const setupPasswordSchema = z.object({
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

const appAccessSchema = z.object({
  userId: z.string().min(1),
  appKey: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  role: z.nativeEnum(AppAccessRole),
  state: z.nativeEnum(AppAccessState),
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

const selfPreferencesSchema = z.object({
  locale: z.nativeEnum(Locale),
  themePreference: z.nativeEnum(ThemePreference),
  accentColor: z.nativeEnum(AccentColor),
});

const totpCodeSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

const beginTotpSchema = z.object({
  password: z.string().min(8),
});

const confirmTotpSchema = z.object({
  password: z.string().min(8),
  code: z.string().trim().min(6).max(12),
});

const disableTotpSchema = z.object({
  password: z.string().min(8),
  code: z.string().trim().min(6).max(12),
});

async function getClientIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip") || "unknown";
}

async function assertSameOriginAction() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  const fetchSite = headerStore.get("sec-fetch-site");
  const allowedOrigin = new URL(env.baseUrl).origin;

  if (origin && origin !== allowedOrigin) {
    throw new Error("INVALID_ACTION_ORIGIN");
  }

  if (!origin && fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new Error("INVALID_ACTION_ORIGIN");
  }
}

async function consumeRecoveryCode(userId: string, code: string) {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 8) {
    return false;
  }

  const codeHash = sha256(normalized);
  const result = await prisma.totpRecoveryCode.updateMany({
    where: {
      userId,
      codeHash,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  return result.count > 0;
}

async function hasActiveMiniauthAdminAccess(userId: string) {
  const access = await prisma.appAccess.findUnique({
    where: {
      userId_appKey: {
        userId,
        appKey: "miniauth",
      },
    },
    select: {
      role: true,
      state: true,
    },
  });

  return access?.role === "ADMIN" && access.state === "ACTIVE";
}

async function hasAnotherActiveMiniauthAdmin(userId: string) {
  const count = await prisma.appAccess.count({
    where: {
      appKey: "miniauth",
      role: "ADMIN",
      state: "ACTIVE",
      userId: {
        not: userId,
      },
      user: {
        isActive: true,
      },
    },
  });

  return count > 0;
}

export async function loginAction(formData: FormData) {
  await assertSameOriginAction();
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

  if (user.totpEnabled) {
    await createTotpLoginChallenge(user.id);
    await clearRateLimit("login", `${email}|${clientIp}`);
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo));
  }

  if (user.emailMfaEnabled) {
    try {
      await assertRateLimit("login_mfa_send", `${user.id}|${clientIp}`, 3);
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
  await assertSameOriginAction();
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

  if (challenge.kind === "email") {
    if (challenge.codeHash !== sha256(parsed.data.code.trim())) {
      redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "invalid" })));
    }

    await prisma.loginEmailChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });
  } else {
    const secretEncrypted = challenge.user.totpSecretEncrypted;
    const submittedCode = parsed.data.code.trim();
    const verifiedWithTotp =
      secretEncrypted ? verifyTotpCode(decryptTotpSecret(secretEncrypted), submittedCode) : false;
    const verifiedWithRecovery = verifiedWithTotp ? false : await consumeRecoveryCode(challenge.userId, submittedCode);

    if (!verifiedWithTotp && !verifiedWithRecovery) {
      redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "invalid" })));
    }

    await prisma.loginTotpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });
  }

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
  await assertSameOriginAction();
  const returnTo = getValidatedReturnTo(formData.get("returnTo"));
  const challenge = await getPendingLoginChallenge();

  if (!challenge || challenge.kind !== "email") {
    redirect(buildRedirectTarget(AUTH_ROUTES.login, returnTo, new URLSearchParams({ error: "invalid" })));
  }

  const resendAllowedAt = challenge.createdAt.getTime() + env.loginResendCooldownSeconds * 1000;
  if (Date.now() < resendAllowedAt) {
    redirect(buildRedirectTarget(AUTH_ROUTES.verify, returnTo, new URLSearchParams({ error: "resend_cooldown" })));
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
  await assertSameOriginAction();
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(env.passwordSetupCookieName)?.value ?? "";
  const parsed = setupPasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success || rawToken.length < 20) {
    redirect(`${AUTH_ROUTES.setupPassword}?error=invalid`);
  }

  if (parsed.data.password !== parsed.data.passwordConfirm) {
    redirect(`${AUTH_ROUTES.setupPassword}?error=password_mismatch`);
  }

  const setupToken = await prisma.passwordSetupToken.findUnique({
    where: {
      tokenHash: hashPasswordSetupToken(rawToken),
    },
    include: { user: true },
  });

  if (
    !setupToken ||
    setupToken.usedAt ||
    setupToken.expiresAt < new Date() ||
    !setupToken.user.isActive ||
    setupToken.user.passwordHash
  ) {
    cookieStore.set(env.passwordSetupCookieName, "", {
      expires: new Date(0),
      path: AUTH_ROUTES.setupPassword,
    });
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

  cookieStore.set(env.passwordSetupCookieName, "", {
    expires: new Date(0),
    path: AUTH_ROUTES.setupPassword,
  });

  redirect(`${AUTH_ROUTES.login}?setup=1`);
}

export async function logoutAction() {
  await assertSameOriginAction();
  await destroySession();
  redirect(AUTH_ROUTES.login);
}

export async function updateSelfPreferencesAction(formData: FormData) {
  await assertSameOriginAction();
  const user = await requireUser();
  const parsed = selfPreferencesSchema.safeParse({
    locale: formData.get("locale"),
    themePreference: formData.get("themePreference"),
    accentColor: formData.get("accentColor"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.home}?preferences=invalid`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      locale: parsed.data.locale,
      themePreference: parsed.data.themePreference,
      accentColor: parsed.data.accentColor,
    },
  });

  await refreshSharedPreferenceCookies({
    locale: parsed.data.locale,
    themePreference: parsed.data.themePreference,
    accentColor: parsed.data.accentColor,
  });

  redirect(`${AUTH_ROUTES.home}?preferences=saved`);
}

export async function beginTotpSetupAction(formData: FormData) {
  await assertSameOriginAction();
  const user = await requireUser();
  const parsed = beginTotpSchema.safeParse({
    password: formData.get("currentPassword") ?? formData.get("password"),
  });

  if (!parsed.success || !user.passwordHash) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  try {
    await assertRateLimit("totp_setup", user.id, 5);
  } catch {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpPendingSecretEncrypted: encryptTotpSecret(secret),
    },
  });

  await clearRateLimit("totp_setup", user.id);
  redirect(`${AUTH_ROUTES.home}?totp=setup`);
}

export async function confirmTotpSetupAction(formData: FormData) {
  await assertSameOriginAction();
  const user = await requireUser();
  const parsed = confirmTotpSchema.safeParse({
    password: formData.get("currentPassword") ?? formData.get("password"),
    code: formData.get("code"),
  });

  if (!parsed.success || !user.totpPendingSecretEncrypted || !user.passwordHash) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  try {
    await assertRateLimit("totp_confirm", user.id, 5);
  } catch {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  const secret = decryptTotpSecret(user.totpPendingSecretEncrypted);
  if (!passwordValid || !verifyTotpCode(secret, parsed.data.code)) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryHandoffToken = generateToken();
  const cookieStore = await cookies();
  const recoveryCookieExpires = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecretEncrypted: user.totpPendingSecretEncrypted,
        totpPendingSecretEncrypted: null,
        emailMfaEnabled: false,
      },
    }),
    prisma.totpRecoveryCode.deleteMany({
      where: { userId: user.id },
    }),
    prisma.totpRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: user.id,
        codeHash: sha256(normalizeRecoveryCode(code)),
      })),
    }),
    prisma.totpRecoveryHandoff.deleteMany({
      where: { userId: user.id },
    }),
    prisma.totpRecoveryHandoff.create({
      data: {
        userId: user.id,
        tokenHash: sha256(recoveryHandoffToken),
        expiresAt: recoveryCookieExpires,
      },
    }),
  ]);

  cookieStore.set(env.totpRecoveryCookieName, recoveryCodes.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: recoveryCookieExpires,
    path: AUTH_ROUTES.totpRecovery,
  });
  cookieStore.set(AUTH_COOKIES.totpRecoveryHandoff, recoveryHandoffToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: recoveryCookieExpires,
    path: AUTH_ROUTES.totpRecovery,
  });

  await clearRateLimit("totp_confirm", user.id);
  redirect(AUTH_ROUTES.totpRecovery);
}

export async function disableTotpAction(formData: FormData) {
  await assertSameOriginAction();
  const user = await requireUser();
  const parsed = disableTotpSchema.safeParse({
    password: formData.get("currentPassword") ?? formData.get("password"),
    code: formData.get("code"),
  });

  if (!parsed.success || !user.passwordHash || !user.totpEnabled || !user.totpSecretEncrypted) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  try {
    await assertRateLimit("totp_disable", user.id, 5);
  } catch {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const passwordValid = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!passwordValid) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  const totpValid = verifyTotpCode(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code);
  const recoveryValid = totpValid ? false : await consumeRecoveryCode(user.id, parsed.data.code);

  if (!totpValid && !recoveryValid) {
    redirect(`${AUTH_ROUTES.home}?totp=invalid`);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecretEncrypted: null,
        totpPendingSecretEncrypted: null,
      },
    }),
    prisma.totpRecoveryCode.deleteMany({
      where: { userId: user.id },
    }),
    prisma.loginTotpChallenge.deleteMany({
      where: { userId: user.id },
    }),
    prisma.totpRecoveryHandoff.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  await clearRateLimit("totp_disable", user.id);
  redirect(`${AUTH_ROUTES.home}?totp=disabled`);
}

export async function inviteUserAction(formData: FormData) {
  await assertSameOriginAction();
  const currentUser = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    locale: formData.get("locale"),
    emailMfaEnabled: formData.get("emailMfaEnabled") === "on",
    appKey: String(formData.get("appKey") ?? "").trim().toLowerCase(),
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

  if (user.passwordHash) {
    redirect(`${AUTH_ROUTES.home}?access=updated`);
  }

  const token = await createPasswordSetupToken(user.id);
  let inviteMode: "sent" | "send_failed" = "send_failed";

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

  redirect(`${AUTH_ROUTES.home}?invite=${inviteMode}&email=${encodeURIComponent(user.email)}&by=${encodeURIComponent(currentUser.email)}`);
}

export async function upsertUserAppAccessAction(formData: FormData) {
  await assertSameOriginAction();
  await requireAdmin();
  const parsed = appAccessSchema.safeParse({
    userId: formData.get("userId"),
    appKey: String(formData.get("appKey") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
    state: formData.get("state"),
  });

  if (!parsed.success) {
    redirect(`${AUTH_ROUTES.home}?access=invalid`);
  }

  const removesLastMiniauthAdmin =
    parsed.data.appKey === "miniauth" &&
    (parsed.data.role !== "ADMIN" || parsed.data.state !== "ACTIVE") &&
    (await hasActiveMiniauthAdminAccess(parsed.data.userId)) &&
    !(await hasAnotherActiveMiniauthAdmin(parsed.data.userId));

  if (removesLastMiniauthAdmin) {
    redirect(`${AUTH_ROUTES.home}?access=invalid`);
  }

  await prisma.appAccess.upsert({
    where: {
      userId_appKey: {
        userId: parsed.data.userId,
        appKey: parsed.data.appKey,
      },
    },
    update: {
      role: parsed.data.role,
      state: parsed.data.state,
    },
    create: {
      userId: parsed.data.userId,
      appKey: parsed.data.appKey,
      role: parsed.data.role,
      state: parsed.data.state,
    },
  });

  redirect(`${AUTH_ROUTES.home}?access=updated`);
}

export async function resendInviteAction(formData: FormData) {
  await assertSameOriginAction();
  const currentUser = await requireAdmin();
  const userId = String(formData.get("userId") || "");

  if (!userId) {
    redirect(`${AUTH_ROUTES.home}?invite=invalid`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive || user.passwordHash) {
    redirect(`${AUTH_ROUTES.home}?invite=invalid`);
  }

  const token = await createPasswordSetupToken(user.id);
  let inviteMode: "sent" | "send_failed" = "send_failed";

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

  redirect(`${AUTH_ROUTES.home}?invite=${inviteMode}&email=${encodeURIComponent(user.email)}&by=${encodeURIComponent(currentUser.email)}`);
}

export async function revokeSessionAction(formData: FormData) {
  await assertSameOriginAction();
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
  await assertSameOriginAction();
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
  await assertSameOriginAction();
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const enabled = String(formData.get("enabled") || "") === "1";

  if (!userId) {
    redirect(`${AUTH_ROUTES.home}?account=invalid`);
  }

  if (!enabled && (await hasActiveMiniauthAdminAccess(userId)) && !(await hasAnotherActiveMiniauthAdmin(userId))) {
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
      prisma.loginTotpChallenge.deleteMany({
        where: { userId },
      }),
    ]);
  }

  redirect(`${AUTH_ROUTES.home}?account=updated`);
}

export async function createWorkspaceAction(formData: FormData) {
  await assertSameOriginAction();
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
  await assertSameOriginAction();
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
  await assertSameOriginAction();
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
  await assertSameOriginAction();
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
  await assertSameOriginAction();
  const user = await getCurrentUser();
  if (!user) {
    redirect(AUTH_ROUTES.login);
  }

  const existingAdminCount = await prisma.appAccess.count({
    where: {
      appKey: "miniauth",
      state: "ACTIVE",
      role: "ADMIN",
    },
  });

  if (existingAdminCount > 0) {
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
