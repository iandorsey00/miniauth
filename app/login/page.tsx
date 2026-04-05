import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string; returnTo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(AUTH_ROUTES.home);
  }

  const cookieStore = await cookies();
  const locale = (cookieStore.get(env.sharedLocaleCookieName)?.value || env.defaultLocale).toUpperCase();
  const dictionary = getDictionary(locale === "ZH_CN" ? "ZH_CN" : "EN");
  const params = await searchParams;
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : "";
  const errorMessage =
    params.error === "inactive"
      ? dictionary.auth.inactive
      : params.error === "mfa_send"
        ? dictionary.auth.mfaSendFailed
      : params.error === "rate_limited"
        ? dictionary.auth.rateLimited
        : params.error === "invalid"
          ? dictionary.auth.invalid
          : null;

  return (
    <div className="auth-page">
      <div className="auth-card minitickets-auth-card">
        <section className="hero-card">
          <span className="login-brand">
            <span className="subtitle-only">{dictionary.appName}</span>
            {locale === "ZH_CN" ? (
              <span className="login-brand-subtitle" lang="en">
                MiniAuth
              </span>
            ) : null}
          </span>
        </section>

        <section className="login-card">
          <div className="stack">
            <h2>{dictionary.auth.loginTitle}</h2>
            <p className="lede login-intro">{dictionary.auth.loginIntro}</p>
            {params.setup === "1" ? <div className="badge badge-success">{dictionary.auth.setupSuccess}</div> : null}
            {errorMessage ? <div className="badge badge-danger">{errorMessage}</div> : null}
            <form action={loginAction}>
              {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
              <div className="field">
                <label htmlFor="email">{dictionary.auth.email}</label>
                <input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">{dictionary.auth.password}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button type="submit">{dictionary.auth.submit}</button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
