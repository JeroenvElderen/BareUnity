import net from "node:net";
import tls from "node:tls";

const SMTP_GREETING_TIMEOUT_MS = 10000;
const SMTP_COMMAND_TIMEOUT_MS = 10000;

type RequiredSmtpEnvVar =
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "EMAIL_FROM";

type SmtpSocket = net.Socket | tls.TLSSocket;

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

function encodeBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAddress(address: string) {
  return `<${address.trim()}>`;
}

function normalizeMessageLines(message: string) {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function createSocket(host: string, port: number) {
  if (port === 465) {
    return tls.connect({ host, port, servername: host });
  }

  return net.connect({ host, port });
}

function waitForConnect(socket: SmtpSocket) {
  if (socket.connecting) {
    return new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
  }

  return Promise.resolve();
}

class SmtpConnection {
  private buffer = "";
  private lineQueue: string[] = [];
  private lineResolvers: Array<(line: string) => void> = [];

  constructor(private socket: SmtpSocket) {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk;
      let lineEnd = this.buffer.indexOf("\n");

      while (lineEnd !== -1) {
        const rawLine = this.buffer.slice(0, lineEnd + 1);
        this.buffer = this.buffer.slice(lineEnd + 1);
        this.pushLine(rawLine.replace(/\r?\n$/, ""));
        lineEnd = this.buffer.indexOf("\n");
      }
    });
  }

  private pushLine(line: string) {
    const resolver = this.lineResolvers.shift();

    if (resolver) {
      resolver(line);
      return;
    }

    this.lineQueue.push(line);
  }

  private readLine(timeoutMs = SMTP_COMMAND_TIMEOUT_MS) {
    const queuedLine = this.lineQueue.shift();
    if (queuedLine) return Promise.resolve(queuedLine);

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const resolverIndex = this.lineResolvers.indexOf(resolve);
        if (resolverIndex >= 0) this.lineResolvers.splice(resolverIndex, 1);
        reject(new Error("Timed out waiting for SMTP response."));
      }, timeoutMs);

      this.lineResolvers.push((line) => {
        clearTimeout(timeout);
        resolve(line);
      });
    });
  }

  async readResponse(timeoutMs = SMTP_COMMAND_TIMEOUT_MS) {
    const lines: string[] = [];
    let code = "";

    do {
      const line = await this.readLine(timeoutMs);
      lines.push(line);
      code = line.slice(0, 3);
    } while (lines.at(-1)?.startsWith(`${code}-`));

    return { code: Number(code), message: lines.join("\n") };
  }

  async expect(codes: number[], command?: string) {
    if (command) this.socket.write(`${command}\r\n`);

    const response = await this.readResponse();
    if (!codes.includes(response.code)) {
      throw new Error(`SMTP command failed: ${response.message}`);
    }

    return response;
  }

  async upgradeToTls(host: string) {
    await this.expect([220], "STARTTLS");
    this.socket = tls.connect({ socket: this.socket, servername: host });
    await waitForConnect(this.socket);
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => {
      this.buffer += chunk;
      let lineEnd = this.buffer.indexOf("\n");

      while (lineEnd !== -1) {
        const rawLine = this.buffer.slice(0, lineEnd + 1);
        this.buffer = this.buffer.slice(lineEnd + 1);
        this.pushLine(rawLine.replace(/\r?\n$/, ""));
        lineEnd = this.buffer.indexOf("\n");
      }
    });
  }

  end() {
    this.socket.end();
  }
}

async function sendSmtpMail(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const host = requireEnv("SMTP_HOST");
  const port = getSmtpPort();
  const socket = createSocket(host, port);
  const connection = new SmtpConnection(socket);

  try {
    await waitForConnect(socket);
    await connection.readResponse(SMTP_GREETING_TIMEOUT_MS);
    await connection.expect([250], `EHLO ${host}`);

    if (port !== 465) {
      await connection.upgradeToTls(host);
      await connection.expect([250], `EHLO ${host}`);
    }

    await connection.expect([334], "AUTH LOGIN");
    await connection.expect([334], encodeBase64(requireEnv("SMTP_USER")));
    await connection.expect([235], encodeBase64(requireEnv("SMTP_PASS")));
    await connection.expect([250], `MAIL FROM:${formatAddress(args.from)}`);
    await connection.expect([250, 251], `RCPT TO:${formatAddress(args.to)}`);
    await connection.expect([354], "DATA");

    const message = normalizeMessageLines(
      [
        `From: ${args.from}`,
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "",
        args.html,
      ].join("\r\n"),
    );

    await connection.expect([250], `${message}\r\n.`);
    await connection.expect([221], "QUIT").catch(() => undefined);
  } finally {
    connection.end();
  }
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
