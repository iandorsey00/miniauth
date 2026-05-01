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

  let baseUrl: URL;
  try {
    baseUrl = new URL(env.baseUrl);
  } catch {
    return null;
  }

  if (decoded.startsWith("/")) {
    if (/^\/[\\/]/.test(decoded) || decoded.includes("\\")) {
      return null;
    }

    try {
      const relativeTarget = new URL(decoded, baseUrl);
      if (relativeTarget.origin !== baseUrl.origin) {
        return null;
      }
      return `${relativeTarget.pathname}${relativeTarget.search}${relativeTarget.hash}`;
    } catch {
      return null;
    }
  }

  let candidate: URL;
  try {
    candidate = new URL(decoded);
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
