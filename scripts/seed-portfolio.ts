import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const PORTFOLIO_SESSION_TOKEN = "miniauth-portfolio-session";
const databaseUrl = process.env.DATABASE_URL || "";

function assertSafePortfolioDatabase() {
  if (process.env.PORTFOLIO_CAPTURE !== "1" || !databaseUrl.startsWith("file:")) {
    throw new Error("Portfolio fixtures require PORTFOLIO_CAPTURE=1 and a temporary SQLite database.");
  }

  const databasePath = path.resolve(databaseUrl.slice("file:".length));
  const relativePath = path.relative(os.tmpdir(), databasePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || path.basename(databasePath) !== "miniauth-portfolio.db") {
    throw new Error("Portfolio fixtures may only use miniauth-portfolio.db inside the system temporary directory.");
  }
}

assertSafePortfolioDatabase();

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

const createdAt = new Date("2026-04-15T16:00:00.000Z");
const lastLoginAt = new Date("2026-05-16T18:30:00.000Z");
const expiresAt = new Date("2099-01-01T00:00:00.000Z");

async function createUser(data: {
  id: string;
  email: string;
  displayName: string;
  isActive?: boolean;
  passwordSet?: boolean;
  emailMfaEnabled?: boolean;
  totpEnabled?: boolean;
  appAccess: Array<{ appKey: string; role: "ADMIN" | "MEMBER"; state?: "ACTIVE" | "INACTIVE" }>;
}) {
  return prisma.user.create({
    data: {
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordSet === false ? null : "portfolio-password-placeholder",
      locale: "EN",
      themePreference: "LIGHT",
      accentColor: "BLUE",
      isActive: data.isActive ?? true,
      emailMfaEnabled: data.emailMfaEnabled ?? false,
      totpEnabled: data.totpEnabled ?? false,
      lastLoginAt,
      createdAt,
      appAccess: {
        create: data.appAccess.map((access) => ({
          ...access,
          state: access.state ?? "ACTIVE",
          createdAt,
        })),
      },
    },
  });
}

async function main() {
  await prisma.$transaction([
    prisma.totpRecoveryHandoff.deleteMany(),
    prisma.totpRecoveryCode.deleteMany(),
    prisma.loginTotpChallenge.deleteMany(),
    prisma.loginEmailChallenge.deleteMany(),
    prisma.passwordSetupToken.deleteMany(),
    prisma.workspaceMembership.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.session.deleteMany(),
    prisma.appAccess.deleteMany(),
    prisma.authRateLimit.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const admin = await createUser({
    id: "portfolio-admin",
    email: "avery.chen@example.test",
    displayName: "Avery Chen",
    totpEnabled: true,
    appAccess: [
      { appKey: "miniauth", role: "ADMIN" },
      { appKey: "minitickets", role: "ADMIN" },
    ],
  });
  const jordan = await createUser({
    id: "portfolio-jordan",
    email: "jordan.lee@example.test",
    displayName: "Jordan Lee",
    emailMfaEnabled: true,
    appAccess: [{ appKey: "minitickets", role: "MEMBER" }],
  });
  const morgan = await createUser({
    id: "portfolio-morgan",
    email: "morgan.reyes@example.test",
    displayName: "Morgan Reyes",
    appAccess: [
      { appKey: "geocompare", role: "MEMBER" },
      { appKey: "minitickets", role: "MEMBER", state: "INACTIVE" },
    ],
  });
  const sam = await createUser({
    id: "portfolio-sam",
    email: "sam.kim@example.test",
    displayName: "Sam Kim",
    isActive: false,
    passwordSet: false,
    appAccess: [{ appKey: "minitickets", role: "MEMBER", state: "INACTIVE" }],
  });

  await prisma.session.createMany({
    data: [
      {
        id: "portfolio-session-admin",
        userId: admin.id,
        tokenHash: crypto.createHash("sha256").update(PORTFOLIO_SESSION_TOKEN).digest("hex"),
        expiresAt,
        createdAt: lastLoginAt,
        lastSeenAt: lastLoginAt,
      },
      {
        id: "portfolio-session-jordan",
        userId: jordan.id,
        tokenHash: crypto.createHash("sha256").update("portfolio-jordan-session").digest("hex"),
        expiresAt,
        createdAt: lastLoginAt,
        lastSeenAt: lastLoginAt,
      },
    ],
  });

  const atlas = await prisma.workspace.create({
    data: {
      id: "portfolio-workspace-atlas",
      slug: "atlas-studio",
      name: "Atlas Studio",
      description: "Shared product operations",
      createdAt,
    },
  });
  const fieldNotes = await prisma.workspace.create({
    data: {
      id: "portfolio-workspace-field-notes",
      slug: "field-notes",
      name: "Field Notes",
      description: "Research and issue tracking",
      createdAt,
    },
  });

  await prisma.workspaceMembership.createMany({
    data: [
      { id: "portfolio-member-1", userId: admin.id, workspaceId: atlas.id, role: "ADMIN", createdAt },
      { id: "portfolio-member-2", userId: jordan.id, workspaceId: atlas.id, role: "MEMBER", createdAt },
      { id: "portfolio-member-3", userId: admin.id, workspaceId: fieldNotes.id, role: "ADMIN", createdAt },
      { id: "portfolio-member-4", userId: morgan.id, workspaceId: fieldNotes.id, role: "MEMBER", createdAt },
      { id: "portfolio-member-5", userId: sam.id, workspaceId: fieldNotes.id, role: "MEMBER", createdAt },
    ],
  });

  await prisma.totpRecoveryCode.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      id: `portfolio-recovery-${index + 1}`,
      userId: admin.id,
      codeHash: crypto.createHash("sha256").update(`portfolio-recovery-${index + 1}`).digest("hex"),
      createdAt,
    })),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
