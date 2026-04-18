import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth";
import { AUTH_COOKIES, AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.redirect(new URL(AUTH_ROUTES.login, env.baseUrl), 307);
  }

  const cookieStore = await cookies();
  const fetchSite = request.headers.get("sec-fetch-site");
  const handoff = cookieStore.get(AUTH_COOKIES.totpRecoveryHandoff)?.value;
  const localeValue = (cookieStore.get(env.sharedLocaleCookieName)?.value || env.defaultLocale).toUpperCase();
  const locale = localeValue === "ZH_CN" ? "ZH_CN" : "EN";
  const dictionary = getDictionary(locale);
  const recoveryCodes = cookieStore.get(env.totpRecoveryCookieName)?.value?.split(",").filter(Boolean) ?? [];

  const isFirstPartyNavigation = fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";

  if (!recoveryCodes.length || handoff !== "1" || !isFirstPartyNavigation) {
    return Response.redirect(new URL(`${AUTH_ROUTES.home}?totp=ready`, env.baseUrl), 307);
  }

  cookieStore.set(env.totpRecoveryCookieName, "", {
    expires: new Date(0),
    path: AUTH_ROUTES.totpRecovery,
  });
  cookieStore.set(AUTH_COOKIES.totpRecoveryHandoff, "", {
    expires: new Date(0),
    path: AUTH_ROUTES.totpRecovery,
  });

  const html = `<!doctype html>
<html lang="${locale === "ZH_CN" ? "zh-CN" : "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(dictionary.auth.recoveryCodesTitle)}</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, "Noto Sans SC Variable", system-ui, sans-serif;
        background: #0b1220;
        color: #f7f9fc;
      }
      main {
        max-width: 40rem;
        margin: 0 auto;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }
      .panel {
        width: 100%;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 1.5rem;
        padding: 1.5rem;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
      }
      h1 {
        margin-top: 0;
        margin-bottom: 0.75rem;
        font-size: 1.75rem;
      }
      p {
        line-height: 1.6;
      }
      pre {
        background: rgba(0, 0, 0, 0.32);
        border-radius: 1rem;
        padding: 1rem;
        overflow: auto;
        white-space: pre-wrap;
        font: 600 1rem/1.8 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      a {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.85rem 1.1rem;
        border-radius: 999px;
        background: #3b82f6;
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>${escapeHtml(dictionary.auth.recoveryCodesTitle)}</h1>
        <p>${escapeHtml(dictionary.auth.totpEnabled)}</p>
        <pre>${escapeHtml(recoveryCodes.join("\n"))}</pre>
        <a href="${AUTH_ROUTES.home}?totp=ready">${escapeHtml(dictionary.auth.recoveryCodesSaved)}</a>
      </section>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
