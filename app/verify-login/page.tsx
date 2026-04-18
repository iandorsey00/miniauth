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
        : params.error === "resend_cooldown"
          ? dictionary.auth.verifyResendCooldown
        : null;
  const isTotp = challenge.kind === "totp";

  return (
    <div className="auth-page">
      <div className="auth-card minitickets-auth-card">
        <section className="hero-card">
          <span className="login-brand login-brand-compact">
            <span className="auth-brand-wordmark">{dictionary.appName}</span>
            {challenge.user.locale === "ZH_CN" ? (
              <span className="auth-brand-subtitle" lang="en">
                MiniAuth
              </span>
            ) : null}
          </span>
        </section>

        <section className="login-card verify-card">
          <div className="stack">
            <h2>{dictionary.auth.verifyTitle}</h2>
            <p className="lede login-intro">
              {isTotp ? dictionary.auth.totpVerifyIntro : `${dictionary.auth.verifyIntro} ${maskEmail(challenge.user.email)}`}
            </p>
            {!isTotp && params.sent === "1" ? (
              <div className="success-note">
                {dictionary.auth.verifySent}
                {previewCode ? (
                  <>
                    {" "}{dictionary.auth.verifyPreviewCode} <code>{previewCode}</code>
                  </>
                ) : null}
              </div>
            ) : null}
            {errorMessage ? <div className="error-note">{errorMessage}</div> : null}
            <form action={verifyLoginCodeAction}>
              {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
              <div className="field">
                <label htmlFor="code">{isTotp ? dictionary.auth.totpOrRecoveryCode : dictionary.auth.verificationCode}</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode={isTotp ? "text" : "numeric"}
                  pattern={isTotp ? undefined : "[0-9]{6}"}
                  maxLength={isTotp ? 12 : 6}
                  required
                />
              </div>
              <button type="submit">{dictionary.auth.verifySubmit}</button>
            </form>
            {!isTotp ? (
              <form action={resendLoginCodeAction}>
                {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
                <button className="ghost-button full-width" type="submit">
                  {dictionary.auth.resendCode}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
