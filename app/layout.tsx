import "@fontsource/inter";
import "@fontsource-variable/noto-sans-sc";

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: env.appName,
  description: "Shared login for MiniTickets and related small apps.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png" }],
  },
};

const themeTokens = new Set(["system", "light", "dark"]);
const accentTokens = new Set(["blue", "cyan", "teal", "green", "lime", "yellow", "orange", "red", "pink", "purple"]);
const localeTokens = new Set(["en", "zh_cn"]);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = (cookieStore.get(env.sharedThemeCookieName)?.value || "system").toLowerCase();
  const accent = (cookieStore.get(env.sharedAccentCookieName)?.value || "blue").toLowerCase();
  const locale = (cookieStore.get(env.sharedLocaleCookieName)?.value || env.defaultLocale).toLowerCase();

  return (
    <html
      lang={localeTokens.has(locale) && locale === "zh_cn" ? "zh-CN" : "en"}
      data-theme={themeTokens.has(theme) ? theme : "system"}
      data-accent={accentTokens.has(accent) ? accent : "blue"}
    >
      <body>{children}</body>
    </html>
  );
}
