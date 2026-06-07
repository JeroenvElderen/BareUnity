declare module "nodemailer" {
  export interface TransportOptions {
    host: string;
    port: number;
    secure?: boolean;
    requireTLS?: boolean;
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    auth?: {
      user: string;
      pass: string;
    };
  }

  export interface SendMailOptions {
    from: string;
    to: string;
    subject: string;
    html: string;
    text?: string;
  }

  export interface SentMessageInfo {
    messageId: string;
    [key: string]: unknown;
  }

  export interface Transporter {
    sendMail(mailOptions: SendMailOptions): Promise<SentMessageInfo>;
  }

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };

  export default nodemailer;
}
