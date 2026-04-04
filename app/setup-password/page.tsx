import { setupPasswordAction } from "@/lib/actions";
import { getDictionary } from "@/lib/i18n";

export default async function SetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const dictionary = getDictionary("EN");
  const errorMessage =
    params.error === "password_mismatch"
      ? dictionary.auth.passwordMismatch
      : params.error
        ? dictionary.auth.setupExpired
        : null;

  return (
    <main className="auth-shell">
      <section className="auth-layout auth-layout-compact">
        <section className="auth-card">
          <div className="auth-card-header">
            <p className="eyebrow">{dictionary.appName}</p>
            <h1>{dictionary.auth.setupTitle}</h1>
            <p className="lede">{dictionary.auth.setupIntro}</p>
          </div>
          {errorMessage ? <div className="error-note">{errorMessage}</div> : null}
          <form className="stack" action={setupPasswordAction}>
            <input name="token" type="hidden" value={params.token ?? ""} />
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
    </main>
  );
}
