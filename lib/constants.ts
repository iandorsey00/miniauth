export const AUTH_ROUTES = {
  home: "/",
  login: "/login",
  logout: "/logout",
  verify: "/verify-login",
  setupPassword: "/setup-password",
  totpRecovery: "/totp/recovery",
} as const;

export const AUTH_COOKIES = {
  totpRecoveryHandoff: "miniauth_totp_recovery_handoff",
} as const;
