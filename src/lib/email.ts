import nodemailer from "nodemailer";

type RequiredSmtpEnvVar =
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "EMAIL_FROM"
  | "NEXT_PUBLIC_APP_URL";

function requireEnv(name: RequiredSmtpEnvVar) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to send verification email.`);
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

export function buildVerificationUrl(token: string) {
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  const verificationUrl = new URL("/api/auth/verify", appUrl);
  verificationUrl.searchParams.set("token", token);
  return verificationUrl.toString();
}

export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = buildVerificationUrl(token);
  const transporter = nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port: getSmtpPort(),
    secure: false,
    auth: {
      user: requireEnv("SMTP_USER"),
      pass: requireEnv("SMTP_PASS"),
    },
  });

  await transporter.sendMail({
    from: requireEnv("EMAIL_FROM"),
    to: email,
    subject: "Verify your Naturist Platform account",
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
                      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#345f45;">Welcome to Naturist Platform</h1>
                      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#2f4638;">
                        Thanks for creating an account. Please verify your email address to finish setting up your profile and keep the community safe.
                      </p>
                      <p style="margin:0 0 28px;">
                        <a href="${verificationUrl}" style="display:inline-block;background:#345f45;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 28px;border-radius:999px;">
                          Verify Account
                        </a>
                      </p>
                      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#516357;">
                        This verification link expires in 24 hours. If the button does not work, copy and paste this fallback link into your browser:
                      </p>
                      <p style="margin:0;font-size:14px;line-height:1.6;word-break:break-all;">
                        <a href="${verificationUrl}" style="color:#345f45;">${verificationUrl}</a>
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
