import nodemailer from "nodemailer";

const SMTP_CONNECTION_TIMEOUT_MS = 10000;
const SMTP_GREETING_TIMEOUT_MS = 10000;
const SMTP_SOCKET_TIMEOUT_MS = 10000;

type RequiredSmtpEnvVar =
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "EMAIL_FROM";

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

async function sendSmtpMail(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
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

export async function sendWelcomeEmail(email: string, displayName: string) {
  const safeDisplayName = escapeHtml(displayName.trim() || "there");

  await sendSmtpMail({
    from: requireEnv("EMAIL_FROM"),
    to: email,
    subject: "Welcome to BareUnity",
    html: `
      <!doctype html>
      <html lang="en">
        <body style="margin:0;background:#f6f7f4;font-family:Arial,sans-serif;color:#1f3326;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f4;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #dfe7d8;">
                  <tr>
                    <td>
                      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#345f45;">Welcome to BareUnity</h1>
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2f4638;">
                        Hi ${safeDisplayName}, thanks for creating your account.
                      </p>
                      <p style="margin:0;font-size:16px;line-height:1.6;color:#2f4638;">
                        If email confirmation is enabled, Supabase Auth will send the verification email separately through the SMTP provider configured in your Supabase project.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
}
