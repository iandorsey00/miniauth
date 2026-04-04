import { redirect } from "next/navigation";

import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; setup?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(AUTH_ROUTES.home);
  }

  const params = await searchParams;
  const dictionary = getDictionary("EN");
  const errorMessage =
    params.error === "inactive"
      ? dictionary.auth.inactive
      : params.error === "rate_limited"
        ? dictionary.auth.rateLimited
        : params.error === "invalid"
          ? dictionary.auth.invalid
          : null;

  return (
    <main className="auth-shell">
      <section className="auth-layout">
        <div className="auth-aside">
          <p className="eyebrow">{dictionary.appName}</p>
          <h1>Shared login for the small apps that belong together.</h1>
          <p className="lede">
            MiniAuth keeps identity, sessions, and password setup in one restrained place so each app can stay simpler.
          </p>
          <div className="auth-note-list">
            <div className="auth-note-card">
              <strong>One account</strong>
              <p>Use the same sign-in across MiniTickets and future related tools.</p>
            </div>
            <div className="auth-note-card">
              <strong>Calm boundary</strong>
              <p>MiniAuth answers who you are. Each app still answers what you can do there.</p>
            </div>
          </div>
        </div>

        <section className="auth-card">
          <div className="auth-card-header">
            <p className="eyebrow">{dictionary.appName}</p>
            <h2>{dictionary.auth.loginTitle}</h2>
            <p className="lede">{dictionary.auth.loginIntro}</p>
          </div>
          {params.setup === "1" ? <div className="success-note">Password set. You can sign in now.</div> : null}
          {errorMessage ? <div className="error-note">{errorMessage}</div> : null}
          <form className="stack" action={loginAction}>
            <div className="field">
              <label htmlFor="email">{dictionary.auth.email}</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">{dictionary.auth.password}</label>
              <input id="password" name="password" type="password" minLength={8} required />
            </div>
            <button type="submit">{dictionary.auth.submit}</button>
          </form>
        </section>
      </section>
    </main>
  );
}
