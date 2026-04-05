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
    <main className="auth-shell">
      <div className="auth-page-shell">
        <header className="auth-topbar">
          <div className="auth-brand">
            <span className="auth-brand-wordmark">{dictionary.appName}</span>
            {locale === "ZH_CN" ? (
              <span className="auth-brand-subtitle" lang="en">
                MiniAuth
              </span>
            ) : null}
          </div>
        </header>

        <section className="auth-layout auth-layout-compact">
          <section className="auth-card auth-flow-card">
            <div className="auth-card-header">
              <h1>{dictionary.auth.loginTitle}</h1>
              <p className="lede">{dictionary.auth.loginIntro}</p>
            </div>
            {params.setup === "1" ? <div className="badge badge-success">{dictionary.auth.setupSuccess}</div> : null}
            {errorMessage ? <div className="badge badge-danger">{errorMessage}</div> : null}
            <form className="stack" action={loginAction}>
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
          </section>
        </section>
      </div>
    </main>
  );
}
