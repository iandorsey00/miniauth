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

  await destroySession();

  return Response.redirect(toRedirectUrl(getPostLoginRedirectTarget(returnTo) ?? AUTH_ROUTES.login), 307);
}
