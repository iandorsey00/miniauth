const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE === "ZH_CN" ? "ZH_CN" : "EN";

function intFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function listFromEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const env = {
  appName: process.env.APP_NAME || "MiniAuth",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  allowedReturnToOrigins: listFromEnv(process.env.ALLOWED_RETURN_TO_ORIGINS),
  defaultLocale: DEFAULT_LOCALE,
  sessionDays: intFromEnv(process.env.SESSION_DAYS, 14),
  loginCodeMinutes: intFromEnv(process.env.LOGIN_CODE_MINUTES, 10),
  passwordSetupHours: intFromEnv(process.env.PASSWORD_SETUP_HOURS, 72),
  rateLimitWindowMinutes: intFromEnv(process.env.RATE_LIMIT_WINDOW_MINUTES, 15),
  rateLimitMaxAttempts: intFromEnv(process.env.RATE_LIMIT_MAX_ATTEMPTS, 5),
  authCookieName: process.env.AUTH_COOKIE_NAME || "miniauth_session",
  loginChallengeCookieName: process.env.AUTH_LOGIN_CHALLENGE_COOKIE_NAME || "miniauth_login_challenge",
  passwordSetupCookieName: process.env.AUTH_PASSWORD_SETUP_COOKIE_NAME || "miniauth_password_setup",
  totpRecoveryCookieName: process.env.AUTH_TOTP_RECOVERY_COOKIE_NAME || "miniauth_totp_recovery",
  authSharedCookieDomain: process.env.AUTH_SHARED_COOKIE_DOMAIN || "",
  sharedLocaleCookieName: process.env.SHARED_LOCALE_COOKIE_NAME || "mini_locale",
  sharedThemeCookieName: process.env.SHARED_THEME_COOKIE_NAME || "mini_theme",
  sharedAccentCookieName: process.env.SHARED_ACCENT_COOKIE_NAME || "mini_accent",
  loginPreviewCookieName: "miniauth_login_preview",
} as const;
