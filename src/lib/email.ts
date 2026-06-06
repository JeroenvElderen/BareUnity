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

export async function sendSignupConfirmationEmail(args: {
  email: string;
  displayName: string;
  confirmationUrl: string;
}) {
  const safeDisplayName = escapeHtml(args.displayName.trim() || "there");
  const safeConfirmationUrl = escapeHtml(args.confirmationUrl);

  await sendSmtpMail({
    from: requireEnv("EMAIL_FROM"),
    to: args.email,
    subject: "Welcome to BareUnity — confirm your email",
    text: `Hi ${args.displayName.trim() || "there"}, thanks for creating your account.\n\nPlease confirm your email address to finish setting up your BareUnity account:\n${args.confirmationUrl}\n\nIf you did not create a BareUnity account, you can ignore this email.`,
    html: `
      <!doctype html>
      <html lang="en">
        <body style="margin:0;background:#f6f7f4;font-family:Arial,Helvetica,sans-serif;color:#1f3326;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f4;padding:32px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;border:1px solid #dfe7d8;overflow:hidden;">
                  <tr>
                    <td style="padding:32px 32px 12px;">
                      <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6a8f5e;">BareUnity</p>
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#345f45;">Welcome to BareUnity</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 28px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2f4638;">
                        Hi ${safeDisplayName}, thanks for creating your account.
                      </p>
                      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#2f4638;">
                        Please confirm your email address to finish setting up your BareUnity account.
                      </p>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:999px;background:#345f45;">
                            <a href="${safeConfirmationUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">
                              Confirm email address
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5c6f62;">
                        If the button does not work, copy and paste this link into your browser:
                      </p>
                      <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;color:#345f45;">
                        ${safeConfirmationUrl}
                      </p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#5c6f62;">
                        If you did not create a BareUnity account, you can ignore this email.
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
