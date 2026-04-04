import "@fontsource/inter";
import "@fontsource-variable/noto-sans-sc";

import type { Metadata } from "next";

import { env } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: env.appName,
  description: "Shared login for MiniTickets and related small apps.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
