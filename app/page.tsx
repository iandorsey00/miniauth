import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import {
  acknowledgeTotpRecoveryCodesAction,
  beginTotpSetupAction,
  confirmTotpSetupAction,
  assignWorkspaceMembershipAction,
  createWorkspaceAction,
  disableTotpAction,
  inviteUserAction,
  logoutAction,
  removeWorkspaceMembershipAction,
  resendInviteAction,
  revokeSessionAction,
  seedSelfAccessAction,
  upsertUserAppAccessAction,
  updateSelfPreferencesAction,
  updateUserActiveAction,
  updateUserMfaAction,
  updateWorkspaceAction,
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { buildTotpProvisioningUri, decryptTotpSecret } from "@/lib/totp";

const localeValues = ["EN", "ZH_CN"] as const;
const themeValues = ["SYSTEM", "LIGHT", "DARK"] as const;
const accentValues = ["BLUE", "CYAN", "TEAL", "GREEN", "LIME", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"] as const;

const accentLabelMap = {
  BLUE: { EN: "Blue", ZH_CN: "蓝色" },
  CYAN: { EN: "Cyan", ZH_CN: "青色" },
  TEAL: { EN: "Teal", ZH_CN: "蓝绿" },
  GREEN: { EN: "Green", ZH_CN: "绿色" },
  LIME: { EN: "Lime", ZH_CN: "黄绿" },
  YELLOW: { EN: "Yellow", ZH_CN: "黄色" },
  ORANGE: { EN: "Orange", ZH_CN: "橙色" },
  RED: { EN: "Red", ZH_CN: "红色" },
  PINK: { EN: "Pink", ZH_CN: "粉色" },
  PURPLE: { EN: "Purple", ZH_CN: "紫色" },
} as const;

function formatDate(value: Date | null, locale: "en-US" | "zh-CN") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatRole(value: "ADMIN" | "MEMBER", dictionary: ReturnType<typeof getDictionary>) {
  return value === "ADMIN" ? dictionary.common.admin : dictionary.common.member;
}

function formatState(value: "ACTIVE" | "INACTIVE", dictionary: ReturnType<typeof getDictionary>) {
  return value === "ACTIVE" ? dictionary.common.active : dictionary.common.inactive;
}

function BrandHeader({
  appName,
  locale,
  action,
}: {
  appName: string;
  locale: "EN" | "ZH_CN";
  action?: ReactNode;
}) {
  return (
    <header className="auth-topbar dashboard-topbar">
      <div className="auth-brand">
        <span className="auth-brand-wordmark">{appName}</span>
        {locale === "ZH_CN" ? <span className="auth-brand-subtitle">MiniAuth</span> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

function getTotpSetupDetails({
  appName,
  email,
  pendingSecret,
}: {
  appName: string;
  email: string;
  pendingSecret: string | null;
}) {
  if (!pendingSecret) {
    return null;
  }

  return {
    secret: pendingSecret,
    provisioningUri: buildTotpProvisioningUri({
      issuer: appName,
      accountName: email,
      secret: pendingSecret,
    }),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    invite?: string;
    seed?: string;
    mfa?: string;
    account?: string;
    access?: string;
    preferences?: string;
    totp?: string;
    workspace?: string;
    membership?: string;
  }>;
}) {
  const user = await requireUser();
  const dictionary = getDictionary(user.locale);
  const localeCode = user.locale === "ZH_CN" ? "zh-CN" : "en-US";
  const params = await searchParams;
  const cookieStore = await cookies();
  const pendingTotpSecret = user.totpPendingSecretEncrypted ? decryptTotpSecret(user.totpPendingSecretEncrypted) : null;
  const recoveryCodes = cookieStore.get(env.totpRecoveryCookieName)?.value?.split(",").filter(Boolean) ?? [];
  const totpRecoveryRemaining = user.totpEnabled
    ? await prisma.totpRecoveryCode.count({
        where: {
          userId: user.id,
          usedAt: null,
        },
      })
    : 0;
  const totpSetupDetails = getTotpSetupDetails({
    appName: dictionary.appName,
    email: user.email,
    pendingSecret: pendingTotpSecret,
  });

  const bootstrapAdminCount = await prisma.appAccess.count({
    where: {
      appKey: "miniauth",
      state: "ACTIVE",
      role: "ADMIN",
    },
  });
  const canBootstrapSelf = bootstrapAdminCount === 0;

  if (!user.appAccess.some((item) => item.appKey === "miniauth")) {
    if (!canBootstrapSelf) {
      return (
        <main className="shell">
          <BrandHeader
            appName={dictionary.appName}
            locale={user.locale}
            action={
              <form action={logoutAction}>
                <button className="ghost-button" type="submit">
                  {dictionary.nav.logout}
                </button>
              </form>
            }
          />
          <section className="panel hero preference-shell">
            <div className="section-heading">
              <div>
                <h1>{dictionary.dashboard.preferencesTitle}</h1>
                <p>{dictionary.dashboard.preferencesSubtitle}</p>
              </div>
            </div>
      {params.preferences === "saved" ? (
        <section className="panel message-panel success-panel">{dictionary.dashboard.preferencesSaved}</section>
      ) : null}

      {params.totp === "enabled" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.totpEnabled}</section>
      ) : null}

      {params.totp === "ready" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.totpReady}</section>
      ) : null}

      {params.totp === "disabled" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.totpDisabled}</section>
      ) : null}

      {params.totp === "invalid" ? (
        <section className="panel message-panel error-note">{dictionary.auth.totpInvalid}</section>
      ) : null}
            <form className="stack" action={updateSelfPreferencesAction}>
              <div className="field">
                <label htmlFor="locale">{dictionary.common.language}</label>
                <select id="locale" name="locale" defaultValue={user.locale}>
                  {localeValues.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale === "ZH_CN" ? "简体中文" : "English"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="themePreference">{dictionary.common.theme}</label>
                <select id="themePreference" name="themePreference" defaultValue={user.themePreference}>
                  {themeValues.map((theme) => (
                    <option key={theme} value={theme}>
                      {theme === "LIGHT"
                        ? dictionary.common.light
                        : theme === "DARK"
                          ? dictionary.common.dark
                          : dictionary.common.system}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="accentColor">{dictionary.common.accentColor}</label>
                <select id="accentColor" name="accentColor" defaultValue={user.accentColor}>
                  {accentValues.map((accent) => (
                    <option key={accent} value={accent}>
                      {accentLabelMap[accent][user.locale]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit">{dictionary.common.save}</button>
            </form>
            <section className="panel note-card">
              <div className="section-heading">
                <div>
                  <h2>{dictionary.auth.totpTitle}</h2>
                  <p>{dictionary.auth.totpIntro}</p>
                </div>
              </div>
              {totpSetupDetails ? (
                <div className="stack">
                  <p className="code-block">{totpSetupDetails.secret}</p>
                  <p className="code-block">{totpSetupDetails.provisioningUri}</p>
                  <form className="inline-form" action={confirmTotpSetupAction}>
                    <input
                      aria-label={dictionary.auth.password}
                      name="password"
                      type="password"
                      minLength={8}
                      placeholder={dictionary.auth.password}
                      required
                    />
                    <input
                      aria-label={dictionary.auth.totpCode}
                      name="code"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      required
                    />
                    <button type="submit">{dictionary.auth.confirmTotp}</button>
                  </form>
                </div>
              ) : user.totpEnabled ? (
                <div className="stack">
                  <p>{dictionary.auth.totpEnabledStatus}</p>
                  <p>{dictionary.auth.recoveryCodesRemaining.replace("{count}", String(totpRecoveryRemaining))}</p>
                  {params.totp === "enabled" && recoveryCodes.length ? (
                    <div className="stack">
                      <p>{dictionary.auth.recoveryCodesTitle}</p>
                      <div className="code-block">{recoveryCodes.join(" ")}</div>
                      <form action={acknowledgeTotpRecoveryCodesAction}>
                        <button className="ghost-button" type="submit">
                          {dictionary.auth.recoveryCodesSaved}
                        </button>
                      </form>
                    </div>
                  ) : null}
                  <form className="stack" action={disableTotpAction}>
                    <div className="field">
                      <label htmlFor="disable-password">{dictionary.auth.password}</label>
                      <input id="disable-password" name="password" type="password" minLength={8} required />
                    </div>
                    <div className="field">
                      <label htmlFor="disable-code">{dictionary.auth.totpOrRecoveryCode}</label>
                      <input id="disable-code" name="code" type="text" required />
                    </div>
                    <button className="ghost-button" type="submit">
                      {dictionary.auth.disableTotp}
                    </button>
                  </form>
                </div>
              ) : (
                <form className="stack" action={beginTotpSetupAction}>
                  <div className="field">
                    <label htmlFor="begin-totp-password">{dictionary.auth.password}</label>
                    <input
                      id="begin-totp-password"
                      name="password"
                      type="password"
                      minLength={8}
                      required
                    />
                  </div>
                  <button type="submit">{dictionary.auth.startTotpSetup}</button>
                </form>
              )}
            </section>
            <form action={logoutAction}>
              <button className="ghost-button" type="submit">
                {dictionary.nav.logout}
              </button>
            </form>
          </section>
        </main>
      );
    }

    return (
      <main className="shell">
        <BrandHeader appName={dictionary.appName} locale={user.locale} />
        <section className="panel hero preference-shell">
          <h1>{dictionary.dashboard.bootstrapAccessTitle}</h1>
          <p>{dictionary.dashboard.bootstrapAccessBody}</p>
          <form action={seedSelfAccessAction}>
            <button type="submit">{dictionary.dashboard.bootstrapAccessAction}</button>
          </form>
        </section>
      </main>
    );
  }

  const [users, sessions, workspaces] = await Promise.all([
    prisma.user.findMany({
      include: {
        appAccess: {
          orderBy: [{ appKey: "asc" }],
        },
        memberships: {
          include: {
            workspace: true,
          },
          orderBy: {
            workspace: {
              name: "asc",
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.session.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.workspace.findMany({
      include: {
        memberships: {
          include: { user: true },
        },
      },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const activeUsers = users.filter((account) => account.isActive).length;
  const mfaUsers = users.filter((account) => account.emailMfaEnabled || account.totpEnabled).length;
  const grantedApps = new Set(users.flatMap((account) => account.appAccess.map((access) => access.appKey))).size;
  const pendingUsers = users.filter((account) => !account.passwordHash).length;

  return (
    <main className="shell">
      <BrandHeader
        appName={dictionary.appName}
        locale={user.locale}
        action={
          <form action={logoutAction}>
            <button className="ghost-button" type="submit">
              {dictionary.nav.logout}
            </button>
          </form>
        }
      />
      <section className="hero-slab">
        <div className="hero-row">
          <div className="hero-copy">
            <h1>{dictionary.dashboard.title}</h1>
            <p>{dictionary.dashboard.subtitle}</p>
          </div>
          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-value">{users.length}</span>
              <span className="metric-label">{dictionary.dashboard.accountsMetric}</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{sessions.length}</span>
              <span className="metric-label">{dictionary.dashboard.liveSessionsMetric}</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{grantedApps}</span>
              <span className="metric-label">{dictionary.dashboard.appsMetric}</span>
            </div>
          </div>
        </div>
      </section>

      {params.invite === "sent" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.inviteSent}</section>
      ) : null}

      {params.invite === "send_failed" ? (
        <section className="panel message-panel error-note">{dictionary.auth.inviteSendFailed}</section>
      ) : null}

      {params.seed === "1" ? (
        <section className="panel message-panel success-panel">{dictionary.dashboard.bootstrapAccessSuccess}</section>
      ) : null}

      {params.mfa === "updated" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.mfaUpdated}</section>
      ) : null}

      {params.account === "updated" ? (
        <section className="panel message-panel success-panel">{dictionary.dashboard.accountUpdated}</section>
      ) : null}

      {params.access === "updated" ? (
        <section className="panel message-panel success-panel">{dictionary.auth.appAccessUpdated}</section>
      ) : null}

      {params.workspace === "saved" ? (
        <section className="panel message-panel success-panel">{dictionary.dashboard.workspaceSaved}</section>
      ) : null}

      {params.membership === "updated" ? (
        <section className="panel message-panel success-panel">
          {dictionary.common.membershipManagedInMiniAuth}
        </section>
      ) : null}

      <section className="overview-grid">
        <div className="overview-card">
          <span className="overview-label">{dictionary.dashboard.activeAccountsMetric}</span>
          <strong>{activeUsers}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">{dictionary.dashboard.mfaEnabledMetric}</span>
          <strong>{mfaUsers}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">{dictionary.dashboard.pendingWithoutPasswordMetric}</span>
          <strong>{pendingUsers}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">{dictionary.dashboard.workspaces}</span>
          <strong>{workspaces.length}</strong>
        </div>
      </section>

      <section className="panel panel-wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.dashboard.preferencesTitle}</p>
            <h2>{dictionary.auth.totpTitle}</h2>
            <p>{dictionary.auth.totpIntro}</p>
          </div>
        </div>
        <div className="stack">
          {params.totp === "enabled" ? (
            <section className="panel message-panel success-panel">{dictionary.auth.totpEnabled}</section>
          ) : null}
          {params.totp === "ready" ? (
            <section className="panel message-panel success-panel">{dictionary.auth.totpReady}</section>
          ) : null}
          {params.totp === "disabled" ? (
            <section className="panel message-panel success-panel">{dictionary.auth.totpDisabled}</section>
          ) : null}
          {params.totp === "invalid" ? (
            <section className="panel message-panel error-note">{dictionary.auth.totpInvalid}</section>
          ) : null}
          {totpSetupDetails ? (
            <div className="stack">
              <p>{dictionary.auth.totpSetupHint}</p>
              <div className="code-block">{totpSetupDetails.secret}</div>
              <div className="code-block">{totpSetupDetails.provisioningUri}</div>
              <form className="inline-form" action={confirmTotpSetupAction}>
                <input
                  aria-label={dictionary.auth.password}
                  name="password"
                  type="password"
                  minLength={8}
                  placeholder={dictionary.auth.password}
                  required
                />
                <input
                  aria-label={dictionary.auth.totpCode}
                  name="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                />
                <button type="submit">{dictionary.auth.confirmTotp}</button>
              </form>
            </div>
          ) : user.totpEnabled ? (
            <div className="stack">
              <p>{dictionary.auth.totpEnabledStatus}</p>
              <p>{dictionary.auth.recoveryCodesRemaining.replace("{count}", String(totpRecoveryRemaining))}</p>
              {params.totp === "enabled" && recoveryCodes.length ? (
                <div className="stack">
                  <p>{dictionary.auth.recoveryCodesTitle}</p>
                  <div className="code-block">{recoveryCodes.join(" ")}</div>
                  <form action={acknowledgeTotpRecoveryCodesAction}>
                    <button className="ghost-button" type="submit">
                      {dictionary.auth.recoveryCodesSaved}
                    </button>
                  </form>
                </div>
              ) : null}
              <form className="stack" action={disableTotpAction}>
                <div className="field">
                  <label htmlFor="totp-disable-password">{dictionary.auth.password}</label>
                  <input id="totp-disable-password" name="password" type="password" minLength={8} required />
                </div>
                <div className="field">
                  <label htmlFor="totp-disable-code">{dictionary.auth.totpOrRecoveryCode}</label>
                  <input id="totp-disable-code" name="code" type="text" required />
                </div>
                <button className="ghost-button" type="submit">
                  {dictionary.auth.disableTotp}
                </button>
              </form>
            </div>
          ) : (
            <form className="stack" action={beginTotpSetupAction}>
              <div className="field">
                <label htmlFor="totp-begin-password">{dictionary.auth.password}</label>
                <input id="totp-begin-password" name="password" type="password" minLength={8} required />
              </div>
              <button type="submit">{dictionary.auth.startTotpSetup}</button>
            </form>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel panel-strong">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{dictionary.dashboard.createInvite}</p>
              <h2>{dictionary.auth.inviteTitle}</h2>
            </div>
          </div>
          <form className="stack" action={inviteUserAction}>
            <div className="field">
              <label htmlFor="email">{dictionary.common.email}</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="displayName">{dictionary.common.displayName}</label>
              <input id="displayName" name="displayName" type="text" required />
            </div>
            <div className="field">
              <label htmlFor="locale">{dictionary.common.locale}</label>
              <select id="locale" name="locale" defaultValue={user.locale}>
                <option value="EN">English</option>
                <option value="ZH_CN">简体中文</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="appKey">{dictionary.auth.initialApp}</label>
              <input id="appKey" name="appKey" type="text" defaultValue="minitickets" required />
            </div>
            <label className="toggle-row">
              <span>{dictionary.common.mfa}</span>
              <input name="emailMfaEnabled" type="checkbox" />
            </label>
            <button type="submit">{dictionary.auth.inviteSubmit}</button>
          </form>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{dictionary.dashboard.activeSessions}</p>
              <h2>{dictionary.dashboard.activeSessions}</h2>
              <p>{dictionary.dashboard.activeSessionsSubtitle}</p>
            </div>
          </div>
          <div className="stack">
            {sessions.length ? (
              sessions.map((session) => (
                <article className="list-card" key={session.id}>
                  <div className="list-row">
                    <div>
                      <strong>{session.user.email}</strong>
                      <p>{dictionary.dashboard.sessionCreated} {formatDate(session.createdAt, localeCode)}</p>
                      <p>{dictionary.dashboard.sessionExpires} {formatDate(session.expiresAt, localeCode)}</p>
                    </div>
                    <form action={revokeSessionAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <button className="ghost-button" type="submit">
                        {dictionary.common.revoke}
                      </button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">{dictionary.dashboard.noSessions}</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel panel-wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.dashboard.title}</p>
            <h2>{dictionary.dashboard.peopleAccessTitle}</h2>
            <p>{dictionary.dashboard.peopleAccessSubtitle}</p>
          </div>
          <Link className="text-link" href={AUTH_ROUTES.login}>
            {dictionary.auth.loginTitle}
          </Link>
        </div>
        <div className="stack">
          {users.length ? (
            users.map((account) => (
              <article className="account-card" key={account.id}>
                <div className="account-header">
                  <div>
                    <h3>{account.displayName}</h3>
                    <p>{account.email}</p>
                  </div>
                  <div className={`badge ${account.isActive ? "badge-active" : "badge-inactive"}`}>
                    {account.isActive ? dictionary.common.active : dictionary.common.inactive}
                  </div>
                </div>

                <div className="meta-grid">
                  <span><strong>{dictionary.common.locale}</strong><br />{account.locale}</span>
                  <span><strong>{dictionary.common.mfa}</strong><br />{account.emailMfaEnabled ? dictionary.common.yes : dictionary.common.no}</span>
                  <span><strong>{dictionary.common.totp}</strong><br />{account.totpEnabled ? dictionary.common.yes : dictionary.common.no}</span>
                  <span><strong>{dictionary.common.passwordSet}</strong><br />{account.passwordHash ? dictionary.common.yes : dictionary.common.no}</span>
                  <span><strong>{dictionary.common.createdAt}</strong><br />{formatDate(account.createdAt, localeCode)}</span>
                </div>

                <p className="subsection-label">{dictionary.common.currentGrants}</p>
                <div className="access-list">
                  {account.appAccess.length ? (
                    account.appAccess.map((access) => (
                      <form action={upsertUserAppAccessAction} className="inline-form" key={access.id}>
                        <input name="userId" type="hidden" value={account.id} />
                        <input name="appKey" type="hidden" value={access.appKey} />
                        <div className="pill">{access.appKey}</div>
                        <select aria-label={`${access.appKey} role`} name="role" defaultValue={access.role}>
                          <option value="MEMBER">{dictionary.common.member}</option>
                          <option value="ADMIN">{dictionary.common.admin}</option>
                        </select>
                        <select aria-label={`${access.appKey} state`} name="state" defaultValue={access.state}>
                          <option value="ACTIVE">{dictionary.common.active}</option>
                          <option value="INACTIVE">{dictionary.common.inactive}</option>
                        </select>
                        <div className="inline-note">
                          {formatRole(access.role, dictionary)} · {formatState(access.state, dictionary)}
                        </div>
                        <button className="ghost-button" type="submit">
                          {dictionary.common.update}
                        </button>
                      </form>
                    ))
                  ) : (
                    <p className="empty-state">{dictionary.dashboard.noAccess}</p>
                  )}
                </div>

                <form action={upsertUserAppAccessAction} className="inline-form">
                  <input name="userId" type="hidden" value={account.id} />
                  <input
                    aria-label={`${account.email} app key`}
                    name="appKey"
                    placeholder={dictionary.common.appKeyPlaceholder}
                    type="text"
                    required
                  />
                  <select aria-label={`${account.email} new role`} name="role" defaultValue="MEMBER">
                    <option value="MEMBER">{dictionary.common.member}</option>
                    <option value="ADMIN">{dictionary.common.admin}</option>
                  </select>
                  <select aria-label={`${account.email} new state`} name="state" defaultValue="ACTIVE">
                    <option value="ACTIVE">{dictionary.common.active}</option>
                    <option value="INACTIVE">{dictionary.common.inactive}</option>
                  </select>
                  <button className="ghost-button" type="submit">
                    {dictionary.common.addAccess}
                  </button>
                </form>

                <p className="subsection-label">{dictionary.common.sharedMemberships}</p>
                <div className="access-list">
                  {account.memberships.length ? (
                    account.memberships.map((membership) => (
                      <form action={removeWorkspaceMembershipAction} className="inline-form" key={membership.id}>
                        <input name="userId" type="hidden" value={account.id} />
                        <input name="workspaceId" type="hidden" value={membership.workspaceId} />
                        <div className="pill">
                          {membership.workspace.name} · {formatRole(membership.role, dictionary)}
                        </div>
                        <button className="ghost-button" type="submit">
                          {dictionary.common.remove}
                        </button>
                      </form>
                    ))
                  ) : (
                    <p className="empty-state">{dictionary.dashboard.noWorkspaces}</p>
                  )}
                </div>

                <div className="account-actions">
                  {!account.passwordHash ? (
                    <form action={resendInviteAction}>
                      <input name="userId" type="hidden" value={account.id} />
                      <button className="ghost-button" type="submit">
                        {dictionary.auth.resendInvite}
                      </button>
                    </form>
                  ) : null}
                  <form action={updateUserActiveAction}>
                    <input name="userId" type="hidden" value={account.id} />
                    <input name="enabled" type="hidden" value={account.isActive ? "0" : "1"} />
                    <button className="ghost-button" type="submit">
                      {account.isActive ? dictionary.common.disable : dictionary.common.enable}
                    </button>
                  </form>
                  <form action={updateUserMfaAction}>
                    <input name="userId" type="hidden" value={account.id} />
                    <input name="enabled" type="hidden" value={account.emailMfaEnabled ? "0" : "1"} />
                    <button className="ghost-button" type="submit">
                      {account.emailMfaEnabled ? dictionary.auth.disableMfa : dictionary.auth.enableMfa}
                    </button>
                  </form>
                  {workspaces.some(
                    (workspace) => !account.memberships.some((membership) => membership.workspaceId === workspace.id),
                  ) ? (
                    <form action={assignWorkspaceMembershipAction}>
                      <input name="userId" type="hidden" value={account.id} />
                      <select
                        name="workspaceId"
                        defaultValue={
                          workspaces.find(
                            (workspace) =>
                              !account.memberships.some((membership) => membership.workspaceId === workspace.id),
                          )?.id
                        }
                      >
                        {workspaces
                          .filter(
                            (workspace) =>
                              !account.memberships.some((membership) => membership.workspaceId === workspace.id),
                          )
                          .map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                      </select>
                      <select name="role" defaultValue="MEMBER">
                        <option value="MEMBER">{dictionary.common.member}</option>
                        <option value="ADMIN">{dictionary.common.admin}</option>
                      </select>
                      <button className="ghost-button" type="submit">
                        {dictionary.common.addWorkspace}
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">{dictionary.dashboard.noUsers}</p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel panel-strong">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{dictionary.dashboard.workspaces}</p>
              <h2>{dictionary.dashboard.workspaces}</h2>
              <p>{dictionary.dashboard.workspaceSubtitle}</p>
            </div>
          </div>
          <form className="stack" action={createWorkspaceAction}>
            <div className="field">
              <label htmlFor="workspace-name">{dictionary.common.title}</label>
              <input id="workspace-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="workspace-slug">{dictionary.common.slug}</label>
              <input id="workspace-slug" name="slug" required />
            </div>
            <div className="field">
              <label htmlFor="workspace-description">{dictionary.common.description}</label>
              <textarea id="workspace-description" name="description" />
            </div>
            <button type="submit">{dictionary.common.create}</button>
          </form>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{dictionary.dashboard.workspaces}</p>
              <h2>{dictionary.dashboard.workspaces}</h2>
            </div>
          </div>
          <div className="stack">
            {workspaces.length ? (
              workspaces.map((workspace) => (
                <article className="list-card" key={workspace.id}>
                  <form className="stack" action={updateWorkspaceAction}>
                    <input name="workspaceId" type="hidden" value={workspace.id} />
                    <div className="field">
                      <label htmlFor={`workspace-name-${workspace.id}`}>{dictionary.common.title}</label>
                      <input id={`workspace-name-${workspace.id}`} name="name" defaultValue={workspace.name} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`workspace-slug-${workspace.id}`}>{dictionary.common.slug}</label>
                      <input id={`workspace-slug-${workspace.id}`} name="slug" defaultValue={workspace.slug} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`workspace-description-${workspace.id}`}>{dictionary.common.description}</label>
                      <textarea
                        id={`workspace-description-${workspace.id}`}
                        name="description"
                        defaultValue={workspace.description ?? ""}
                      />
                    </div>
                    <label className="toggle-row">
                      <span>{dictionary.common.archived}</span>
                      <input name="isArchived" type="checkbox" defaultChecked={workspace.isArchived} />
                    </label>
                    <div className="meta-grid">
                      <span><strong>{dictionary.common.members}</strong><br />{workspace.memberships.length}</span>
                      <span><strong>{dictionary.common.createdAt}</strong><br />{formatDate(workspace.createdAt, localeCode)}</span>
                    </div>
                    <button className="ghost-button" type="submit">
                      {dictionary.common.save}
                    </button>
                  </form>
                </article>
              ))
            ) : (
              <p className="empty-state">{dictionary.dashboard.noWorkspaces}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
