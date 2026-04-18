import { destroySession } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { getPostLoginRedirectTarget, getValidatedReturnTo } from "@/lib/return-to";

function toRedirectUrl(target: string) {
  return target.startsWith("/") ? new URL(target, env.baseUrl) : target;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = getValidatedReturnTo(requestUrl.searchParams.get("returnTo"));
  const fetchSite = request.headers.get("sec-fetch-site");
  const canAutoSubmit = fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MiniAuth</title>
  </head>
  <body>
    <form id="logout-form" method="post" action="${AUTH_ROUTES.logout}">
      ${returnTo ? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />` : ""}
      <noscript>
        <button type="submit">Continue logout</button>
      </noscript>
    </form>
    ${
      canAutoSubmit
        ? `<script>
      document.getElementById('logout-form')?.submit();
    </script>`
        : `<p>Continue logout</p>`
    }
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

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowedOrigin = new URL(env.baseUrl).origin;
    if (origin !== allowedOrigin) {
      return new Response("Invalid logout origin", { status: 400 });
    }
  }

  const formData = await request.formData();
  const returnTo = getValidatedReturnTo(formData.get("returnTo"));

  await destroySession();

  return Response.redirect(toRedirectUrl(getPostLoginRedirectTarget(returnTo) ?? AUTH_ROUTES.login), 307);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
