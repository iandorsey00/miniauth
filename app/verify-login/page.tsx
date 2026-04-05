import { redirect } from "next/navigation";

import { resendLoginCodeAction, verifyLoginCodeAction } from "@/lib/actions";
import { getCurrentUser, getPendingLoginChallenge, getPendingLoginPreviewCode } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return email;
  }

  const first = local.slice(0, 2);
  return `${first}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

export default async function VerifyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; returnTo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(AUTH_ROUTES.home);
  }

  const challenge = await getPendingLoginChallenge();
  if (!challenge) {
    redirect(AUTH_ROUTES.login);
  }

  const params = await searchParams;
  const returnTo = typeof params.returnTo === "string" ? params.returnTo : "";
  const dictionary = getDictionary(challenge.user.locale);
  const previewCode = await getPendingLoginPreviewCode();
  const errorMessage =
    params.error === "invalid"
      ? dictionary.auth.verifyInvalid
      : params.error === "expired"
        ? dictionary.auth.verifyExpired
        : null;

  return (
    <main className="auth-shell">
      <section className="auth-layout auth-layout-compact">
        <section className="auth-card">
          <div className="auth-card-header">
            <p className="eyebrow">{dictionary.appName}</p>
            <h1>{dictionary.auth.verifyTitle}</h1>
            <p className="lede">
              {dictionary.auth.verifyIntro} {maskEmail(challenge.user.email)}
            </p>
          </div>
          {params.sent === "1" ? (
            <div className="success-note">
              {dictionary.auth.verifySent}
              {previewCode ? (
                <>
                  {" "}Dev preview code: <code>{previewCode}</code>
                </>
              ) : null}
            </div>
          ) : null}
          {errorMessage ? <div className="error-note">{errorMessage}</div> : null}
          <form className="stack" action={verifyLoginCodeAction}>
            {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
            <div className="field">
              <label htmlFor="code">{dictionary.auth.verificationCode}</label>
              <input id="code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <button type="submit">{dictionary.auth.verifySubmit}</button>
          </form>
          <form action={resendLoginCodeAction}>
            {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
            <button className="ghost-button full-width" type="submit">
              {dictionary.auth.resendCode}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
