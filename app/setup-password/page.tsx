import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { setupPasswordAction } from "@/lib/actions";
import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const locale = (cookieStore.get(env.sharedLocaleCookieName)?.value || env.defaultLocale).toUpperCase();
  const dictionary = getDictionary(locale === "ZH_CN" ? "ZH_CN" : "EN");
  if (params.token) {
    redirect(`${AUTH_ROUTES.setupPassword}/claim?token=${encodeURIComponent(params.token)}`);
  }
  const errorMessage =
    params.error === "password_mismatch"
      ? dictionary.auth.passwordMismatch
      : params.error
        ? dictionary.auth.setupExpired
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
              <h1>{dictionary.auth.setupTitle}</h1>
              <p className="lede">{dictionary.auth.setupIntro}</p>
            </div>
            {errorMessage ? <div className="error-note">{errorMessage}</div> : null}
            <form className="stack" action={setupPasswordAction}>
              <div className="field">
                <label htmlFor="password">{dictionary.auth.password}</label>
                <input id="password" name="password" type="password" minLength={8} required />
              </div>
              <div className="field">
                <label htmlFor="passwordConfirm">{dictionary.auth.passwordConfirm}</label>
                <input id="passwordConfirm" name="passwordConfirm" type="password" minLength={8} required />
              </div>
              <button type="submit">{dictionary.auth.setupSubmit}</button>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
