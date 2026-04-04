import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";

export function buildSetupLink(rawToken: string) {
  return `${env.baseUrl}${AUTH_ROUTES.setupPassword}?token=${encodeURIComponent(rawToken)}`;
}
