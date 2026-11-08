// Reads the emails the app sent from Mailpit (the mail stub in Docker), so tests check real letters.
// Tests find their letters by the address of the recipient, and every test uses its own address:
// unit tests and browser tests can run at the same time on one Mailpit.

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

export type MailpitEmail = {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  text: string;
  html: string;
};

type MailpitSearchResult = { messages?: { ID: string }[] };
type MailpitMessage = {
  ID: string;
  From: { Name: string; Address: string };
  Subject: string;
  Text: string;
  HTML: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${MAILPIT_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status} on ${path}. Is it running? (docker compose up -d)`);
  }
  return response;
}

function searchQuery(recipient: string) {
  return new URLSearchParams({ query: `to:"${recipient}"` }).toString();
}

// Emails sent to `recipient`, the oldest first
export async function listEmails(recipient: string): Promise<MailpitEmail[]> {
  const found = (await (
    await request(`/api/v1/search?${searchQuery(recipient)}`)
  ).json()) as MailpitSearchResult;
  const messages = await Promise.all(
    (found.messages ?? []).map(
      async ({ ID }) => (await (await request(`/api/v1/message/${ID}`)).json()) as MailpitMessage,
    ),
  );
  return messages
    .map((message) => ({
      id: message.ID,
      fromName: message.From.Name,
      fromAddress: message.From.Address,
      subject: message.Subject,
      text: message.Text,
      html: message.HTML,
    }))
    .reverse();
}

// Waits until `count` emails to `recipient` have arrived. Mailpit stores a letter a moment after the
// sender gets "sent", so a test that reads at once may be early.
export async function waitForEmails(recipient: string, count = 1, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const emails = await listEmails(recipient);
    if (emails.length >= count) return emails;
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} email(s) to ${recipient}, got ${emails.length} after ${timeoutMs} ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function deleteEmails(recipient: string) {
  await request(`/api/v1/search?${searchQuery(recipient)}`, { method: "DELETE" });
}

// The sign-in link from the plain text of an email
export function extractSignInLink(email: Pick<MailpitEmail, "text">) {
  const match = /https?:\/\/\S+\/api\/auth\/magic-link\/verify\?\S+/.exec(email.text);
  if (!match) {
    throw new Error(`No sign-in link in the email:\n${email.text}`);
  }
  return match[0];
}
