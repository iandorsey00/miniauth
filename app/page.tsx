import Link from "next/link";
import type { ReactNode } from "react";
import QRCode from "qrcode";

import {
  assignWorkspaceMembershipAction,
  beginTotpSetupAction,
  confirmTotpSetupAction,
  createWorkspaceAction,
  disableTotpAction,
  inviteUserAction,
  logoutAction,
  removeWorkspaceMembershipAction,
  resendInviteAction,
  revokeSessionAction,
  seedSelfAccessAction,
  updateSelfPreferencesAction,
  updateUserActiveAction,
  updateUserMfaAction,
  updateWorkspaceAction,
  upsertUserAppAccessAction,
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
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

type SearchParams = {
  invite?: string;
  seed?: string;
  mfa?: string;
  account?: string;
  access?: string;
  preferences?: string;
  totp?: string;
  workspace?: string;
  membership?: string;
};

type Dictionary = ReturnType<typeof getDictionary>;

type TotpSetupDetails = {
  secret: string;
  provisioningUri: string;
  qrCodeDataUrl: string;
} | null;

type Notice = {
  key: string;
  tone: "success" | "error";
  text: string;
};

function formatDate(value: Date | null, locale: "en-US" | "zh-CN") {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatRole(value: "ADMIN" | "MEMBER", dictionary: Dictionary) {
  return value === "ADMIN" ? dictionary.common.admin : dictionary.common.member;
}

function formatState(value: "ACTIVE" | "INACTIVE", dictionary: Dictionary) {
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

function StatusNotice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  return <section className={`panel message-panel ${tone === "success" ? "success-panel" : "error-note"}`}>{children}</section>;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function PreferencesPanel({
  user,
  dictionary,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  dictionary: Dictionary;
}) {
  return (
    <section className="panel panel-strong">
      <SectionHeader
        eyebrow={dictionary.dashboard.preferencesTitle}
        title={dictionary.dashboard.preferencesTitle}
        description={dictionary.dashboard.preferencesSubtitle}
      />
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
    </section>
  );
}

function TotpPanel({
  dictionary,
  params,
  user,
  totpRecoveryRemaining,
  totpSetupDetails,
}: {
  dictionary: Dictionary;
  params: SearchParams;
  user: Awaited<ReturnType<typeof requireUser>>;
  totpRecoveryRemaining: number;
  totpSetupDetails: TotpSetupDetails;
}) {
  return (
    <section className="panel panel-wide">
      <SectionHeader
        eyebrow={dictionary.dashboard.preferencesTitle}
        title={dictionary.auth.totpTitle}
        description={dictionary.auth.totpIntro}
      />
      <div className="stack">
        <div className="status-stack">
          {params.totp === "ready" ? <StatusNotice tone="success">{dictionary.auth.totpReady}</StatusNotice> : null}
          {params.totp === "disabled" ? <StatusNotice tone="success">{dictionary.auth.totpDisabled}</StatusNotice> : null}
          {params.totp === "invalid" ? <StatusNotice tone="error">{dictionary.auth.totpInvalid}</StatusNotice> : null}
        </div>

        {totpSetupDetails ? (
          <div className="stack">
            <p>{dictionary.auth.totpSetupHint}</p>
            <div className="totp-qr-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={dictionary.auth.totpQrAlt}
                className="totp-qr-image"
                height={224}
                src={totpSetupDetails.qrCodeDataUrl}
                width={224}
              />
            </div>
            <div className="code-block">{totpSetupDetails.secret}</div>
            <div className="code-block">{totpSetupDetails.provisioningUri}</div>
            <form className="inline-form" action={confirmTotpSetupAction}>
              <input
                aria-label={dictionary.auth.password}
                autoComplete="current-password"
                name="currentPassword"
                type="password"
                minLength={8}
                placeholder={dictionary.auth.password}
                required
              />
              <input
                aria-label={dictionary.auth.totpCode}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                name="code"
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
            <form className="stack" action={disableTotpAction}>
              <div className="field">
                <label htmlFor="totp-disable-password">{dictionary.auth.password}</label>
                <input
                  autoComplete="current-password"
                  id="totp-disable-password"
                  name="currentPassword"
                  type="password"
                  minLength={8}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="totp-disable-code">{dictionary.auth.totpOrRecoveryCode}</label>
                <input
                  autoComplete="one-time-code"
                  id="totp-disable-code"
                  inputMode="numeric"
                  name="code"
                  type="text"
                  required
                />
              </div>
              <button className="ghost-button" type="submit">
                {dictionary.auth.disableTotp}
              </button>
            </form>
          </div>
        ) : (
          <form className="stack" action={beginTotpSetupAction}>
            <div className="field">
              <label htmlFor="totp-begin-current-password">{dictionary.auth.password}</label>
              <input
                autoComplete="current-password"
                id="totp-begin-current-password"
                name="currentPassword"
                type="password"
                minLength={8}
                required
              />
            </div>
            <button type="submit">{dictionary.auth.startTotpSetup}</button>
          </form>
        )}
      </div>
    </section>
  );
}

async function getTotpSetupDetails({
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

  const provisioningUri = buildTotpProvisioningUri({
    issuer: appName,
    accountName: email,
    secret: pendingSecret,
  });

  return {
    secret: pendingSecret,
    provisioningUri,
    qrCodeDataUrl: await QRCode.toDataURL(provisioningUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224,
      color: {
        dark: "#0b1220",
        light: "#ffffff",
      },
    }),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const dictionary = getDictionary(user.locale);
  const localeCode = user.locale === "ZH_CN" ? "zh-CN" : "en-US";
  const params = await searchParams;
  const pendingTotpSecret = user.totpPendingSecretEncrypted ? decryptTotpSecret(user.totpPendingSecretEncrypted) : null;
  const totpRecoveryRemaining = user.totpEnabled
    ? await prisma.totpRecoveryCode.count({
        where: {
          userId: user.id,
          usedAt: null,
        },
      })
    : 0;
  const totpSetupDetails = await getTotpSetupDetails({
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
  const selfHasMiniauthAccess = user.appAccess.some((item) => item.appKey === "miniauth");
  const accountNotices: Notice[] = [];
  if (params.preferences === "saved") {
    accountNotices.push({
      key: "preferences-saved",
      tone: "success",
      text: dictionary.dashboard.preferencesSaved,
    });
  }

  if (!selfHasMiniauthAccess) {
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
          <div className="page-stack">
            <section className="hero-slab">
              <div className="hero-copy">
                <h1>{dictionary.dashboard.preferencesTitle}</h1>
                <p>{dictionary.dashboard.preferencesSubtitle}</p>
              </div>
            </section>

            {accountNotices.length ? (
              <div className="status-stack">
                {accountNotices.map((notice) => (
                  <StatusNotice key={notice.key} tone={notice.tone}>
                    {notice.text}
                  </StatusNotice>
                ))}
              </div>
            ) : null}

            <section className="account-grid">
              <PreferencesPanel dictionary={dictionary} user={user} />
              <TotpPanel
                dictionary={dictionary}
                params={params}
                user={user}
                totpRecoveryRemaining={totpRecoveryRemaining}
                totpSetupDetails={totpSetupDetails}
              />
            </section>
          </div>
        </main>
      );
    }

    return (
      <main className="shell">
        <BrandHeader appName={dictionary.appName} locale={user.locale} />
        <div className="page-stack">
          <section className="hero-slab">
            <div className="hero-copy">
              <h1>{dictionary.dashboard.bootstrapAccessTitle}</h1>
              <p>{dictionary.dashboard.bootstrapAccessBody}</p>
            </div>
          </section>
          <section className="panel preference-shell">
            <form action={seedSelfAccessAction}>
              <button type="submit">{dictionary.dashboard.bootstrapAccessAction}</button>
            </form>
          </section>
        </div>
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

  const adminNotices: Notice[] = [...accountNotices];
  if (params.invite === "sent") {
    adminNotices.push({ key: "invite-sent", tone: "success", text: dictionary.auth.inviteSent });
  }
  if (params.invite === "send_failed") {
    adminNotices.push({ key: "invite-failed", tone: "error", text: dictionary.auth.inviteSendFailed });
  }
  if (params.seed === "1") {
    adminNotices.push({
      key: "seeded",
      tone: "success",
      text: dictionary.dashboard.bootstrapAccessSuccess,
    });
  }
  if (params.mfa === "updated") {
    adminNotices.push({ key: "mfa-updated", tone: "success", text: dictionary.auth.mfaUpdated });
  }
  if (params.account === "updated") {
    adminNotices.push({
      key: "account-updated",
      tone: "success",
      text: dictionary.dashboard.accountUpdated,
    });
  }
  if (params.access === "updated") {
    adminNotices.push({ key: "access-updated", tone: "success", text: dictionary.auth.appAccessUpdated });
  }
  if (params.workspace === "saved") {
    adminNotices.push({
      key: "workspace-saved",
      tone: "success",
      text: dictionary.dashboard.workspaceSaved,
    });
  }
  if (params.membership === "updated") {
    adminNotices.push({
      key: "membership-updated",
      tone: "success",
      text: dictionary.common.membershipManagedInMiniAuth,
    });
  }

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

      <div className="page-stack">
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

        {adminNotices.length ? (
          <div className="status-stack">
            {adminNotices.map((notice) => (
              <StatusNotice key={notice.key} tone={notice.tone}>
                {notice.text}
              </StatusNotice>
            ))}
          </div>
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

        <section className="account-grid">
          <PreferencesPanel dictionary={dictionary} user={user} />
          <TotpPanel
            dictionary={dictionary}
            params={params}
            user={user}
            totpRecoveryRemaining={totpRecoveryRemaining}
            totpSetupDetails={totpSetupDetails}
          />
        </section>

        <section className="admin-grid">
          <div className="panel panel-strong">
            <SectionHeader
              eyebrow={dictionary.dashboard.createInvite}
              title={dictionary.auth.inviteTitle}
            />
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
                <label htmlFor="invite-locale">{dictionary.common.locale}</label>
                <select id="invite-locale" name="locale" defaultValue={user.locale}>
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
            <SectionHeader
              eyebrow={dictionary.dashboard.activeSessions}
              title={dictionary.dashboard.activeSessions}
              description={dictionary.dashboard.activeSessionsSubtitle}
            />
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
          <SectionHeader
            eyebrow={dictionary.dashboard.title}
            title={dictionary.dashboard.peopleAccessTitle}
            description={dictionary.dashboard.peopleAccessSubtitle}
            action={
              <Link className="text-link" href={AUTH_ROUTES.login}>
                {dictionary.auth.loginTitle}
              </Link>
            }
          />
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

        <section className="admin-grid">
          <div className="panel panel-strong">
            <SectionHeader
              eyebrow={dictionary.dashboard.workspaces}
              title={dictionary.dashboard.workspaces}
              description={dictionary.dashboard.workspaceSubtitle}
            />
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
            <SectionHeader
              eyebrow={dictionary.dashboard.workspaces}
              title={dictionary.dashboard.workspaces}
            />
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
      </div>
    </main>
  );
}
