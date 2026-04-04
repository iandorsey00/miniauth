import Link from "next/link";
import { redirect } from "next/navigation";

import { inviteUserAction, logoutAction, revokeSessionAction, seedSelfAccessAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { AUTH_ROUTES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";
import { buildSetupLink } from "@/lib/links";
import { prisma } from "@/lib/prisma";

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
  searchParams: Promise<{ invite?: string; setupToken?: string; seed?: string }>;
}) {
  const user = await requireUser();
  const dictionary = getDictionary(user.locale);
  const params = await searchParams;

  if (!user.appAccess.some((item) => item.appKey === "miniauth")) {
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

  const [users, sessions] = await Promise.all([
    prisma.user.findMany({
      include: {
        appAccess: {
          orderBy: [{ appKey: "asc" }],
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

      {params.seed === "1" ? (
        <section className="panel message-panel success-panel">
          MiniAuth admin access has been added to your account.
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
              </article>
            ))
          ) : (
            <p className="empty-state">{dictionary.dashboard.noUsers}</p>
          )}
        </div>
      </section>
    </main>
  );
}
