import Link from "next/link";
import { redirect } from "next/navigation";

import {
  assignWorkspaceMembershipAction,
  createWorkspaceAction,
  inviteUserAction,
  logoutAction,
  removeWorkspaceMembershipAction,
  resendInviteAction,
  revokeSessionAction,
  seedSelfAccessAction,
  updateUserActiveAction,
  updateUserMfaAction,
  updateSelfPreferencesAction,
  updateWorkspaceAction,
} from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";
import { buildSetupLink } from "@/lib/links";
import { prisma } from "@/lib/prisma";

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

function formatDate(value: Date | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; setupToken?: string; seed?: string; mfa?: string; account?: string; preferences?: string; workspace?: string; membership?: string }>;
}) {
  const user = await requireUser();
  const dictionary = getDictionary(user.locale);
  const params = await searchParams;
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
          <section className="panel hero">
            <p className="eyebrow">{dictionary.appName}</p>
            <h1>{dictionary.dashboard.preferencesTitle}</h1>
            <p>{dictionary.dashboard.preferencesSubtitle}</p>
            {params.preferences === "saved" ? (
              <section className="panel message-panel success-panel">
                Preferences updated.
              </section>
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
        <section className="panel hero">
          <p className="eyebrow">{dictionary.appName}</p>
          <h1>{dictionary.dashboard.title}</h1>
          <p>{dictionary.dashboard.subtitle}</p>
          <form action={seedSelfAccessAction}>
            <button type="submit">Grant myself MiniAuth admin access</button>
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

  const inviteLink = params.invite === "ok" && params.setupToken ? buildSetupLink(params.setupToken) : null;
  const activeUsers = users.filter((account) => account.isActive).length;
  const mfaUsers = users.filter((account) => account.emailMfaEnabled).length;
  const grantedApps = new Set(users.flatMap((account) => account.appAccess.map((access) => access.appKey))).size;

  return (
    <main className="shell">
      <section className="hero-slab">
        <div className="hero-row">
          <div className="hero-copy">
            <p className="eyebrow">{dictionary.appName}</p>
            <h1>{dictionary.dashboard.title}</h1>
            <p>{dictionary.dashboard.subtitle}</p>
          </div>
          <div className="hero-metrics">
            <div className="metric-card">
              <span className="metric-value">{users.length}</span>
              <span className="metric-label">Accounts</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{sessions.length}</span>
              <span className="metric-label">Live sessions</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{grantedApps}</span>
              <span className="metric-label">Apps</span>
            </div>
          </div>
          <form action={logoutAction}>
            <button className="ghost-button" type="submit">
              {dictionary.nav.logout}
            </button>
          </form>
        </div>
      </section>

      {inviteLink ? (
        <section className="panel message-panel success-panel">
          <div className="stack">
            <strong>{dictionary.common.inviteLink}</strong>
            <code>{inviteLink}</code>
            <p>{dictionary.common.setupLinkHint}</p>
          </div>
        </section>
      ) : null}

      {params.invite === "sent" ? (
        <section className="panel message-panel success-panel">
          {dictionary.auth.inviteSent}
        </section>
      ) : null}

      {params.seed === "1" ? (
        <section className="panel message-panel success-panel">
          MiniAuth admin access has been added to your account.
        </section>
      ) : null}

      {params.mfa === "updated" ? (
        <section className="panel message-panel success-panel">
          {dictionary.auth.mfaUpdated}
        </section>
      ) : null}

      {params.account === "updated" ? (
        <section className="panel message-panel success-panel">
          Account status updated.
        </section>
      ) : null}

      {params.workspace === "saved" ? (
        <section className="panel message-panel success-panel">
          {dictionary.dashboard.workspaces} saved.
        </section>
      ) : null}

      {params.membership === "updated" ? (
        <section className="panel message-panel success-panel">
          {dictionary.common.membershipManagedInMiniAuth}
        </section>
      ) : null}

      <section className="overview-grid">
        <div className="overview-card">
          <span className="overview-label">Active accounts</span>
          <strong>{activeUsers}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">Email MFA enabled</span>
          <strong>{mfaUsers}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">Pending without password</span>
          <strong>{users.filter((account) => !account.passwordHash).length}</strong>
        </div>
        <div className="overview-card">
          <span className="overview-label">{dictionary.dashboard.workspaces}</span>
          <strong>{workspaces.length}</strong>
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
              <label htmlFor="appKey">{dictionary.common.app}</label>
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
            </div>
          </div>
          <div className="stack">
            {sessions.length ? (
              sessions.map((session) => (
                <article className="list-card" key={session.id}>
                  <div className="list-row">
                    <div>
                      <strong>{session.user.email}</strong>
                      <p>Created {formatDate(session.createdAt)}</p>
                      <p>Expires {formatDate(session.expiresAt)}</p>
                    </div>
                    <form action={revokeSessionAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <button className="ghost-button" type="submit">
                        Revoke
                      </button>
                    </form>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">No active sessions.</p>
            )}
          </div>
        </div>
      </section>

      <section className="panel panel-wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{dictionary.dashboard.title}</p>
            <h2>People and access</h2>
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
                  <span><strong>{dictionary.common.passwordSet}</strong><br />{account.passwordHash ? dictionary.common.yes : dictionary.common.no}</span>
                  <span><strong>{dictionary.common.createdAt}</strong><br />{formatDate(account.createdAt)}</span>
                </div>
                <div className="access-list">
                  {account.appAccess.length ? (
                    account.appAccess.map((access) => (
                      <div className="pill" key={access.id}>
                        {access.appKey} · {access.role} · {access.state}
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">{dictionary.dashboard.noAccess}</p>
                  )}
                </div>
                <div className="access-list">
                  {account.memberships.length ? (
                    account.memberships.map((membership) => (
                      <form action={removeWorkspaceMembershipAction} className="inline-form" key={membership.id}>
                        <input name="userId" type="hidden" value={account.id} />
                        <input name="workspaceId" type="hidden" value={membership.workspaceId} />
                        <div className="pill">
                          {membership.workspace.name} · {membership.role}
                        </div>
                        <button className="ghost-button" type="submit">
                          Remove
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
                      <select name="workspaceId" defaultValue={workspaces.find(
                        (workspace) => !account.memberships.some((membership) => membership.workspaceId === workspace.id),
                      )?.id}>
                        {workspaces
                          .filter((workspace) => !account.memberships.some((membership) => membership.workspaceId === workspace.id))
                          .map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                      </select>
                      <select name="role" defaultValue="MEMBER">
                        <option value="MEMBER">MEMBER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <button className="ghost-button" type="submit">
                        Add workspace
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
                      <textarea id={`workspace-description-${workspace.id}`} name="description" defaultValue={workspace.description ?? ""} />
                    </div>
                    <label className="toggle-row">
                      <span>{dictionary.common.archived}</span>
                      <input name="isArchived" type="checkbox" defaultChecked={workspace.isArchived} />
                    </label>
                    <div className="meta-grid">
                      <span><strong>{dictionary.common.members}</strong><br />{workspace.memberships.length}</span>
                      <span><strong>{dictionary.common.createdAt}</strong><br />{formatDate(workspace.createdAt)}</span>
                    </div>
                    <button className="ghost-button" type="submit">{dictionary.common.save}</button>
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
