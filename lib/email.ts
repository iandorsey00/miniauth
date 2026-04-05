import type { Locale } from "@prisma/client";

type MailRecipient = {
  email: string;
  displayName: string;
  locale: Locale;
};

type LoginCodeEmailInput = {
  recipient: MailRecipient;
  code: string;
};

type PasswordSetupEmailInput = {
  recipient: MailRecipient;
  setupToken: string;
};

type BuiltEmail = {
  subject: string;
  text: string;
  html?: string;
};

function getBaseUrl() {
  return (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function getMailFrom() {
  return process.env.MAIL_FROM ?? "MiniAuth <noreply@miniauth.iandorsey.com>";
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function renderEmailLayout({
  locale,
  title,
  intro,
  body,
  footnote,
}: {
  locale: Locale;
  title: string;
  intro: string;
  body?: string;
  footnote?: string;
}) {
  const brand = locale === "EN" ? "MiniAuth" : "轻量认证";
  const bodyHtml = body
    ? `<div style="margin-top: 18px; padding: 14px 16px; border-radius: 16px; background: #f8fafc; color: #334155; font-size: 14px; line-height: 1.65; white-space: normal;">${body}</div>`
    : "";
  const footnoteHtml = footnote
    ? `<p style="margin: 22px 0 0; color: #697586; font-size: 12px; line-height: 1.6;">${nl2br(footnote)}</p>`
    : "";

  return `<!doctype html>
<html lang="${locale === "EN" ? "en" : "zh-CN"}">
  <body style="margin: 0; padding: 0; background: transparent; color: #101828;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 620px; border-collapse: collapse;">
            <tr>
              <td style="padding: 0 0 14px; color: #2563eb; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.02em;">
                ${escapeHtml(brand)}
              </td>
            </tr>
            <tr>
              <td style="background: #ffffff; border-radius: 28px; padding: 28px 28px 24px;">
                <h1 style="margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 28px; line-height: 1.1; letter-spacing: -0.04em; color: #101828;">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin: 16px 0 0; color: #475467; font-size: 15px; line-height: 1.7;">
                  ${nl2br(intro)}
                </p>
                ${bodyHtml}
                ${footnoteHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildLoginCodeEmail({ recipient, code }: LoginCodeEmailInput): BuiltEmail {
  const loginUrl = `${getBaseUrl()}/login`;

  if (recipient.locale === "EN") {
    return {
      subject: "Your MiniAuth verification code",
      text: [
        `Hi ${recipient.displayName},`,
        "",
        "Use this verification code to finish signing in to MiniAuth:",
        "",
        code,
        "",
        `Sign-in page: ${loginUrl}`,
        "This code expires in 10 minutes.",
      ].join("\n"),
      html: renderEmailLayout({
        locale: recipient.locale,
        title: "Your verification code",
        intro: `Hi ${recipient.displayName},\n\nUse this verification code to finish signing in to MiniAuth.`,
        body: `<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: 0.18em; color: #101828;">${escapeHtml(code)}</div>`,
        footnote: `Sign-in page: ${loginUrl}\n\nThis code expires in 10 minutes.`,
      }),
    };
  }

  return {
    subject: "你的轻量认证验证码",
    text: [
      `${recipient.displayName}，你好：`,
      "",
      "请使用以下验证码完成轻量认证登录：",
      "",
      code,
      "",
      `登录页面：${loginUrl}`,
      "此验证码将在 10 分钟后失效。",
    ].join("\n"),
    html: renderEmailLayout({
      locale: recipient.locale,
      title: "你的验证码",
      intro: `${recipient.displayName}，你好：\n\n请使用以下验证码完成轻量认证登录。`,
      body: `<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: 0.18em; color: #101828;">${escapeHtml(code)}</div>`,
      footnote: `登录页面：${loginUrl}\n\n此验证码将在 10 分钟后失效。`,
    }),
  };
}

function buildPasswordSetupEmail({ recipient, setupToken }: PasswordSetupEmailInput): BuiltEmail {
  const setupUrl = `${getBaseUrl()}/setup-password?token=${encodeURIComponent(setupToken)}`;

  if (recipient.locale === "EN") {
    return {
      subject: "Set your MiniAuth password",
      text: [
        `Hi ${recipient.displayName},`,
        "",
        "Your MiniAuth account is ready.",
        "Use the link below to set your password and finish account setup:",
        "",
        setupUrl,
        "",
        "This link expires in 72 hours.",
      ].join("\n"),
      html: renderEmailLayout({
        locale: recipient.locale,
        title: "Set your password",
        intro: `Hi ${recipient.displayName},\n\nYour MiniAuth account is ready. Use the link below to set your password and finish account setup.`,
        body: `<a href="${escapeHtml(setupUrl)}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Set password</a><div style="margin-top:14px;font-size:13px;color:#475467;word-break:break-all;">${escapeHtml(setupUrl)}</div>`,
        footnote: "This link expires in 72 hours.",
      }),
    };
  }

  return {
    subject: "设置你的轻量认证密码",
    text: [
      `${recipient.displayName}，你好：`,
      "",
      "你的轻量认证账户已创建。",
      "请使用下面的链接设置密码并完成账户启用：",
      "",
      setupUrl,
      "",
      "此链接将在 72 小时后失效。",
    ].join("\n"),
    html: renderEmailLayout({
      locale: recipient.locale,
      title: "设置密码",
      intro: `${recipient.displayName}，你好：\n\n你的轻量认证账户已创建。请使用下面的链接设置密码并完成账户启用。`,
      body: `<a href="${escapeHtml(setupUrl)}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">设置密码</a><div style="margin-top:14px;font-size:13px;color:#475467;word-break:break-all;">${escapeHtml(setupUrl)}</div>`,
      footnote: "此链接将在 72 小时后失效。",
    }),
  };
}

async function sendViaResend(to: string, subject: string, text: string, html?: string) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getMailFrom(),
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  return true;
}

export async function sendLoginCodeEmail(input: LoginCodeEmailInput) {
  const message = buildLoginCodeEmail(input);
  return sendViaResend(input.recipient.email, message.subject, message.text, message.html);
}

export async function sendPasswordSetupEmail(input: PasswordSetupEmailInput) {
  const message = buildPasswordSetupEmail(input);
  return sendViaResend(input.recipient.email, message.subject, message.text, message.html);
}
