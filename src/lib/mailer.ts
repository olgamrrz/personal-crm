import "server-only";

import nodemailer from "nodemailer";

const FROM_NAME = "Личная CRM";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}

// Sends one email over SMTP. Where it goes is decided only by the settings: Mailpit locally and in tests,
// Resend on the server. The settings are read on every call, so the same build works everywhere.
// A failed send throws; the error text can quote the recipient, so callers must not log it as it is.
export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const user = process.env.SMTP_USER;
  const transport = nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port: Number(requireEnv("SMTP_PORT")),
    secure: process.env.SMTP_SECURE === "true",
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
    // A server that does not answer must not hold the sign-in page for long
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });

  try {
    await transport.sendMail({
      from: { name: FROM_NAME, address: requireEnv("MAIL_FROM") },
      to,
      subject,
      html,
      text,
    });
  } finally {
    transport.close();
  }
}
