import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { PrismaClient, WorkspaceRole } from "@prisma/client";

type SourceWorkspace = {
  slug: string;
  name: string;
  description: string | null;
  isArchived: number;
};

type SourceMembership = {
  workspaceSlug: string;
  role: "ADMIN" | "MEMBER";
  authUserId: string | null;
  email: string;
};

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveSqlitePath(urlOrPath: string) {
  if (!urlOrPath) {
    return "";
  }

  if (urlOrPath.startsWith("file:")) {
    return urlOrPath.slice("file:".length);
  }

  return urlOrPath;
}

function getSourceDatabasePath() {
  const explicit = readArg("--source-db") || process.env.MINITICKETS_DATABASE_URL || "";
  const resolved = resolveSqlitePath(explicit);

  if (!resolved) {
    console.error(
      "Usage: npm run migrate:minitickets-workspaces -- --source-db file:/path/to/minitickets.db",
    );
    process.exit(1);
  }

  return resolved;
}

function getSourceData(sourceDbPath: string) {
  const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });

  try {
    const workspaces = db
      .prepare(
        `
          SELECT
            slug,
            name,
            description,
            isArchived
          FROM Workspace
          ORDER BY name ASC
        `,
      )
      .all() as SourceWorkspace[];

    const memberships = db
      .prepare(
        `
          SELECT
            w.slug AS workspaceSlug,
            m.role AS role,
            u.authUserId AS authUserId,
            u.email AS email
          FROM WorkspaceMembership m
          JOIN Workspace w ON w.id = m.workspaceId
          JOIN User u ON u.id = m.userId
          ORDER BY w.name ASC, u.email ASC
        `,
      )
      .all() as SourceMembership[];

    return { workspaces, memberships };
  } finally {
    db.close();
  }
}

async function resolveMembershipUsers(prisma: PrismaClient, memberships: SourceMembership[]) {
  const uniqueAuthUserIds = [...new Set(memberships.map((item) => item.authUserId).filter(Boolean))] as string[];
  const uniqueEmails = [...new Set(memberships.map((item) => item.email.trim().toLowerCase()))];

  const [usersById, usersByEmail] = await Promise.all([
    uniqueAuthUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: uniqueAuthUserIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
    uniqueEmails.length
      ? prisma.user.findMany({
          where: { email: { in: uniqueEmails } },
          select: { id: true, email: true },
        })
      : Promise.resolve([]),
  ]);

  const userIdByAuthUserId = new Map(usersById.map((user) => [user.id, user.id]));
  const userIdByEmail = new Map(usersByEmail.map((user) => [user.email.toLowerCase(), user.id]));
  const unresolved = memberships.filter((membership) => {
    if (membership.authUserId && userIdByAuthUserId.has(membership.authUserId)) {
      return false;
    }

    return !userIdByEmail.has(membership.email.trim().toLowerCase());
  });

  if (unresolved.length) {
    console.error("Unable to map all MiniTickets workspace memberships into MiniAuth users.");
    for (const membership of unresolved) {
      console.error(
        `- workspace=${membership.workspaceSlug} email=${membership.email} authUserId=${membership.authUserId ?? "none"}`,
      );
    }
    process.exit(1);
  }

  return memberships.map((membership) => ({
    workspaceSlug: membership.workspaceSlug,
    role: membership.role === "ADMIN" ? WorkspaceRole.ADMIN : WorkspaceRole.MEMBER,
    userId:
      (membership.authUserId ? userIdByAuthUserId.get(membership.authUserId) : null) ??
      userIdByEmail.get(membership.email.trim().toLowerCase())!,
  }));
}

async function main() {
  const sourceDbPath = getSourceDatabasePath();
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const { workspaces, memberships } = getSourceData(sourceDbPath);
    const resolvedMemberships = await resolveMembershipUsers(prisma, memberships);
    const workspaceIdBySlug = new Map<string, string>();

    for (const workspace of workspaces) {
      const saved = await prisma.workspace.upsert({
        where: { slug: workspace.slug },
        update: {
          name: workspace.name,
          description: workspace.description,
          isArchived: Boolean(workspace.isArchived),
        },
        create: {
          slug: workspace.slug,
          name: workspace.name,
          description: workspace.description,
          isArchived: Boolean(workspace.isArchived),
        },
        select: { id: true, slug: true },
      });

      workspaceIdBySlug.set(saved.slug, saved.id);
    }

    for (const membership of resolvedMemberships) {
      const workspaceId = workspaceIdBySlug.get(membership.workspaceSlug);
      if (!workspaceId) {
        console.error(`Workspace not found after import: ${membership.workspaceSlug}`);
        process.exit(1);
      }

      await prisma.workspaceMembership.upsert({
        where: {
          userId_workspaceId: {
            userId: membership.userId,
            workspaceId,
          },
        },
        update: {
          role: membership.role,
        },
        create: {
          userId: membership.userId,
          workspaceId,
          role: membership.role,
        },
      });
    }

    console.log(`Imported ${workspaces.length} workspaces into MiniAuth.`);
    console.log(`Imported ${resolvedMemberships.length} workspace memberships into MiniAuth.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
