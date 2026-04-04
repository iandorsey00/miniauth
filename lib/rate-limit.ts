import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

const WINDOW_MS = env.rateLimitWindowMinutes * 60 * 1000;

export async function assertRateLimit(scope: string, key: string, maxAttempts = env.rateLimitMaxAttempts) {
  const now = new Date();
  const existing = await prisma.authRateLimit.findUnique({
    where: {
      scope_key: {
        scope,
        key,
      },
    },
  });

  if (!existing) {
    await prisma.authRateLimit.create({
      data: {
        scope,
        key,
        attemptCount: 1,
        windowStart: now,
      },
    });
    return;
  }

  if (existing.blockedUntil && existing.blockedUntil > now) {
    throw new Error("RATE_LIMITED");
  }

  const windowExpired = now.getTime() - existing.windowStart.getTime() > WINDOW_MS;
  const nextAttemptCount = windowExpired ? 1 : existing.attemptCount + 1;
  const blockedUntil =
    nextAttemptCount > maxAttempts ? new Date(now.getTime() + WINDOW_MS) : null;

  await prisma.authRateLimit.update({
    where: { scope_key: { scope, key } },
    data: {
      attemptCount: nextAttemptCount,
      windowStart: windowExpired ? now : existing.windowStart,
      blockedUntil,
    },
  });

  if (blockedUntil) {
    throw new Error("RATE_LIMITED");
  }
}

export async function clearRateLimit(scope: string, key: string) {
  await prisma.authRateLimit.deleteMany({
    where: { scope, key },
  });
}
