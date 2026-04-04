import "dotenv/config";

import { Locale } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = (readArg("--email") || process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const displayName = (readArg("--name") || process.env.BOOTSTRAP_ADMIN_NAME || "").trim();
  const password = readArg("--password") || process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const localeValue = (readArg("--locale") || process.env.BOOTSTRAP_ADMIN_LOCALE || "EN").trim();
  const locale = localeValue === "ZH_CN" ? Locale.ZH_CN : Locale.EN;

  if (!email || !displayName || !password) {
    console.error(
      "Usage: npm run bootstrap:admin -- --email you@example.com --name 'Your Name' --password 'StrongPassword123!' [--locale ZH_CN|EN]",
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      displayName,
      passwordHash,
      locale,
      isActive: true,
    },
    create: {
      email,
      displayName,
      passwordHash,
      locale,
      isActive: true,
    },
  });

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

  console.log(`Bootstrapped MiniAuth admin for ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
