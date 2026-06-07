import nodemailer from "nodemailer";

const SMTP_CONNECTION_TIMEOUT_MS = 10000;
const SMTP_GREETING_TIMEOUT_MS = 10000;
const SMTP_SOCKET_TIMEOUT_MS = 10000;
const DEFAULT_EMAIL_LOGO_URL =
  "https://iexsylcxecshgnqhkdhq.supabase.co/storage/v1/object/sign/email-assets/logo.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iOTA3MjAxZC0yMDM1LTQ1MTktODliOC04N2ZiOTBiNjVlYzciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJlbWFpbC1hc3NldHMvbG9nby5wbmciLCJpYXQiOjE3ODA3NzgxMDgsImV4cCI6NDkzNDM3ODEwOH0.bjinQ-Ow_27Y9EsI88piQRK-3R1r2rw1HpE76xxskz4";

type RequiredSmtpEnvVar =
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "EMAIL_FROM";

type EmailFeature = {
  emoji: string;
  title: string;
  body: string;
};

type EmailTemplateArgs = {
  preview: string;
  badge: string;
  title: string;
  heroBody: string;
  heading: string;
  paragraphs: string[];
  cta?: {
    label: string;
    href: string;
  };
  fallbackLinkLabel?: string;
  features?: EmailFeature[];
  quote?: string;
  footerNote: string;
};

export type VerificationDecision = "approved" | "rejected";

function requireEnv(name: RequiredSmtpEnvVar) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to send email.`);
  }

  return value;
}

function getSmtpPort() {
  const port = Number(requireEnv("SMTP_PORT"));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a valid positive integer.");
  }

  return port;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDisplayName(displayName?: string | null) {
  return displayName?.trim() || "there";
}

function getEmailLogoUrl() {
  return process.env.EMAIL_LOGO_URL?.trim() || DEFAULT_EMAIL_LOGO_URL;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 18px 0;font-size:16px;line-height:1.9;color:#98aaba;">${escapeHtml(text)}</p>`;
}

function renderFeatures(features: EmailFeature[]) {
  if (!features.length) return "";

  return `
    <tr>
      <td style="padding:0 35px 40px 35px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${features
              .map(
                (feature, index) => `
                  ${index > 0 ? '<td width="4%"></td>' : ""}
                  <td width="32%" valign="top" style="background:#263443;border:1px solid #364655;border-radius:18px;padding:24px;">
                    <div style="font-size:30px;margin-bottom:12px;">${escapeHtml(feature.emoji)}</div>
                    <div style="font-size:17px;font-weight:700;color:#f3f8fc;margin-bottom:10px;">${escapeHtml(feature.title)}</div>
                    <div style="font-size:14px;line-height:1.7;color:#98aaba;">${escapeHtml(feature.body)}</div>
                  </td>
                `,
              )
              .join("")}
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderBareUnityEmail(args: EmailTemplateArgs) {
  const cta = args.cta
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <a href="${escapeHtml(args.cta.href)}" style="display:inline-block;padding:18px 42px;background:#5ba4a2;background-image:linear-gradient(135deg,#5ba4a2,#83ccbf);border-radius:16px;color:#0a1018;text-decoration:none;font-size:16px;font-weight:800;box-shadow:0 12px 30px rgba(91,164,162,0.28);">
              ${escapeHtml(args.cta.label)}
            </a>
          </td>
        </tr>
      </table>
      ${args.fallbackLinkLabel ? `<p style="margin:24px 0 0 0;font-size:13px;line-height:1.8;color:#98aaba;">${escapeHtml(args.fallbackLinkLabel)}<br><span style="word-break:break-all;color:#83ccbf;">${escapeHtml(args.cta.href)}</span></p>` : ""}`
    : "";
  const quote = args.quote
    ? `
    <tr>
      <td style="padding:0 50px 45px 50px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#141c24;border-left:4px solid #5ba4a2;border-radius:18px;">
          <tr>
            <td style="padding:28px;">
              <p style="margin:0;font-size:18px;line-height:1.9;font-style:italic;color:#e4ebf1;text-align:center;">“${escapeHtml(args.quote)}”</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0c1218;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0c1218;">${escapeHtml(args.preview)}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0c1218;">
<tr>
<td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#18222d;border:1px solid #364655;border-radius:28px;overflow:hidden;box-shadow:0 18px 45px rgba(0,0,0,0.28);">
<tr>
<td align="center" style="padding:70px 40px;background:linear-gradient(135deg,#08121a 0%,#14222c 50%,#263443 100%);">
<img src="${escapeHtml(getEmailLogoUrl())}" width="140" alt="BareUnity" style="display:block;margin:0 auto 32px auto;">
<div style="display:inline-block;padding:8px 16px;border-radius:999px;background:#23303d;border:1px solid #5ba4a2;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#83ccbf;margin-bottom:24px;">${escapeHtml(args.badge)}</div>
<h1 style="margin:0;font-size:46px;line-height:1.1;font-weight:800;color:#f3f8fc;">${escapeHtml(args.title).replace(/\n/g, "<br>")}</h1>
<p style="margin:24px auto 0 auto;font-size:18px;line-height:1.8;color:#e4ebf1;max-width:470px;">${escapeHtml(args.heroBody)}</p>
</td>
</tr>
<tr>
<td style="padding:55px 50px 35px 50px;">
<h2 style="margin:0 0 20px 0;font-size:30px;font-weight:800;color:#f3f8fc;">${escapeHtml(args.heading)}</h2>
${args.paragraphs.map(paragraph).join("")}
${cta}
</td>
</tr>
${renderFeatures(args.features ?? [])}
${quote}
<tr>
<td align="center" style="padding:45px 35px;background:#101820;border-top:1px solid #364655;">
<p style="margin:0;font-size:14px;font-weight:700;color:#e4ebf1;">Built for those who feel most at home in nature.</p>
<p style="margin:14px 0 0 0;font-size:13px;color:#5ba4a2;">Respect • Consent • Community • Nature</p>
<p style="margin:18px 0 0 0;font-size:12px;line-height:1.7;color:#98aaba;">${escapeHtml(args.footerNote)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function renderTextEmail(args: {
  title: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footerNote: string;
}) {
  return [
    args.title,
    "",
    ...args.paragraphs,
    ...(args.cta ? ["", `${args.cta.label}: ${args.cta.href}`] : []),
    "",
    args.footerNote,
  ].join("\n");
}

async function sendSmtpMail(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const port = getSmtpPort();
  const transport = nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    auth: {
      user: requireEnv("SMTP_USER"),
      pass: requireEnv("SMTP_PASS"),
    },
  });

  const result = await transport.sendMail(args);

  console.log("Nodemailer sendMail result:", result);
  console.log("Nodemailer messageId:", result.messageId);
}

async function sendBareUnityEmail(args: EmailTemplateArgs & { to: string; subject: string }) {
  await sendSmtpMail({
    from: requireEnv("EMAIL_FROM"),
    to: args.to,
    subject: args.subject,
    html: renderBareUnityEmail(args),
    text: renderTextEmail({
      title: args.title,
      paragraphs: args.paragraphs,
      cta: args.cta,
      footerNote: args.footerNote,
    }),
  });
}

export async function sendWelcomeConfirmationEmail(args: {
  email: string;
  displayName: string;
  confirmationUrl: string;
}) {
  const displayName = getDisplayName(args.displayName);

  await sendBareUnityEmail({
    to: args.email,
    subject: "Welcome to BareUnity — confirm your email",
    preview: "Welcome to BareUnity. Confirm your email to activate your account.",
    badge: "Welcome",
    title: "Welcome to\nBareUnity",
    heroBody: "Confirm your email to begin exploring nature, freedom and community.",
    heading: "🌿 You're almost ready",
    paragraphs: [
      `Hi ${displayName}, thank you for joining BareUnity.`,
      "Your account has been created and your journey into nature, freedom and authentic connection is about to begin.",
      "Activate your account to access the community and start exploring.",
    ],
    cta: { label: "Activate My Account", href: args.confirmationUrl },
    fallbackLinkLabel: "If the button does not work, copy and paste this link into your browser:",
    features: [
      { emoji: "🌲", title: "Discover", body: "Explore naturist beaches, forests, hiking routes and hidden gems." },
      { emoji: "🌱", title: "Connect", body: "Join a respectful community built on trust, freedom and shared values." },
      { emoji: "☀️", title: "Experience", body: "Share adventures, create memories and enjoy nature with confidence." },
    ],
    quote: "The best moments are often the simplest: nature around you, the warmth of the sun, and the freedom to be yourself.",
    footerNote: "If you didn't create this account, you can safely ignore this email.",
  });
}

export async function sendPasswordResetEmail(args: {
  email: string;
  displayName?: string | null;
  resetUrl: string;
}) {
  const displayName = getDisplayName(args.displayName);

  await sendBareUnityEmail({
    to: args.email,
    subject: "Reset your BareUnity password",
    preview: "Reset your BareUnity password and keep your account secure.",
    badge: "Security",
    title: "Reset your\npassword",
    heroBody: "Use this secure link to choose a new password for your BareUnity account.",
    heading: "🔐 Password reset requested",
    paragraphs: [
      `Hi ${displayName}, we received a request to reset your BareUnity password.`,
      "Open the secure link below and choose a new password that is unique to BareUnity.",
      "If you did not request this, you can ignore this email and your password will stay unchanged.",
    ],
    cta: { label: "Reset Password", href: args.resetUrl },
    fallbackLinkLabel: "If the button does not work, copy and paste this link into your browser:",
    footerNote: "If you did not request a password reset, you can safely ignore this email.",
  });
}

export async function sendAccountDeletedEmail(args: {
  email: string;
  displayName?: string | null;
}) {
  const displayName = getDisplayName(args.displayName);

  await sendBareUnityEmail({
    to: args.email,
    subject: "Your BareUnity account has been deleted",
    preview: "Your BareUnity account deletion is complete.",
    badge: "Goodbye",
    title: "See you\ngo",
    heroBody: "Your account has been removed. Thank you for the time you spent with BareUnity.",
    heading: "🌙 Your account is now closed",
    paragraphs: [
      `Hi ${displayName}, your BareUnity account deletion is complete.`,
      "We have removed your account, profile, community content and uploads according to the deletion flow you confirmed.",
      "If you ever feel called back to nature and community, you are welcome to create a new account again.",
    ],
    quote: "Some paths cross for a season, and every respectful step still matters.",
    footerNote: "This email confirms a deletion request completed from your signed-in account.",
  });
}

export async function sendVerificationDecisionEmail(args: {
  email: string;
  decision: VerificationDecision;
}) {
  const approved = args.decision === "approved";

  await sendBareUnityEmail({
    to: args.email,
    subject: approved ? "BareUnity application approved" : "BareUnity application update",
    preview: approved
      ? "Your BareUnity application has been approved."
      : "Your BareUnity application has been reviewed.",
    badge: approved ? "Approved" : "Update",
    title: approved ? "Application\napproved" : "Application\nupdate",
    heroBody: approved
      ? "Your BareUnity access is ready. Welcome into the community."
      : "We reviewed your application and cannot approve access at this time.",
    heading: approved ? "✅ You're approved" : "🌿 Your application was reviewed",
    paragraphs: approved
      ? [
          "Thank you for taking the time to complete your BareUnity application.",
          "Your application has been approved, and your account is ready for you to sign in.",
          "Step in with respect, consent and curiosity as you explore the community.",
        ]
      : [
          "Thank you for taking the time to apply to BareUnity.",
          "After review, we cannot approve this application and the account has been removed.",
          "We keep the community careful, respectful and aligned with BareUnity's safety expectations.",
        ],
    cta: approved
      ? { label: "Sign In to BareUnity", href: `${getAppUrl()}/login` }
      : undefined,
    footerNote: approved
      ? "If you did not expect this approval email, contact BareUnity support."
      : "If you believe this was a mistake, contact BareUnity support with the email address you used to apply.",
  });
}

export async function sendWelcomeEmail(email: string, displayName: string) {
  await sendWelcomeConfirmationEmail({
    email,
    displayName,
    confirmationUrl: `${getAppUrl()}/login`,
  });
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
