import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getValidatedReturnTo(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const decoded = safeDecodeURIComponent(trimmed);

  if (decoded.startsWith("/")) {
    return decoded.startsWith("//") ? null : decoded;
  }

  let candidate: URL;
  let baseUrl: URL;
  try {
    candidate = new URL(decoded);
    baseUrl = new URL(env.baseUrl);
  } catch {
    return null;
  }

  if (candidate.origin === baseUrl.origin) {
    return candidate.toString();
  }

  if (env.allowedReturnToOrigins.includes(candidate.origin)) {
    return candidate.toString();
  }

  return null;
}

export function buildRedirectTarget(path: string, returnTo: string | null, params?: URLSearchParams) {
  const search = params ? params.toString() : "";
  const query = new URLSearchParams(search);

  if (returnTo) {
    query.set("returnTo", returnTo);
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function getPostLoginRedirectTarget(returnTo: string | null) {
  return returnTo ?? AUTH_ROUTES.home;
}
