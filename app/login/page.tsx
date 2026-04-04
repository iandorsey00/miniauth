import { redirect } from "next/navigation";

import { loginAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

export default async function LoginPage(_: {
  searchParams: Promise<{ error?: string; setup?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(AUTH_ROUTES.home);
  }

  const dictionary = getDictionary("EN");

  return (
    <main className="auth-shell">
      <section className="auth-layout auth-layout-compact">
        <section className="auth-card auth-card-minimal">
          <div className="auth-card-header">
            <h1>{dictionary.auth.loginTitle}</h1>
          </div>
          <form className="stack" action={loginAction}>
            <div className="field">
              <label htmlFor="email">{dictionary.auth.email}</label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue=""
                autoComplete="email"
                required
              />
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
    </main>
  );
}
