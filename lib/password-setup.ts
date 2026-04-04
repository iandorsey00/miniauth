import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { generateToken, sha256 } from "@/lib/tokens";

export async function createPasswordSetupToken(userId: string) {
  const rawToken = generateToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + env.passwordSetupHours * 60 * 60 * 1000);

  await prisma.passwordSetupToken.deleteMany({
    where: { userId },
  });

  await prisma.passwordSetupToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    rawToken,
    expiresAt,
  };
}

export function hashPasswordSetupToken(token: string) {
  return sha256(token);
}
