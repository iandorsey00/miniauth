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
      <section className="auth-card">
        <p className="eyebrow">{dictionary.appName}</p>
        <h1>{dictionary.auth.loginTitle}</h1>
        <p className="lede">{dictionary.auth.loginIntro}</p>
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
    </main>
  );
}
