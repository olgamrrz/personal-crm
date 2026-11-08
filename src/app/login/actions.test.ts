import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { requestLink } from "@/app/login/actions";

function formWith(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The page shows this state: «Не удалось отправить письмо» needs a broken mail service, which the browser tests
// cannot make without stopping the Mailpit they share with the unit tests.
describe("requestLink", () => {
  it("tells the person when the letter could not be sent, and keeps what was typed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Nobody listens on port 1: a real refused connection
    vi.stubEnv("SMTP_PORT", "1");
    const typed = `  Anna-${randomUUID()}@Example.com `;

    const state = await requestLink({}, formWith(typed));

    expect(state).toEqual({
      error: "Не удалось отправить письмо. Попробуйте ещё раз через минуту",
      value: typed,
    });
  });

  it("answers with the saved form of the address when the letter is sent", async () => {
    const email = `anna-${randomUUID()}@example.com`;

    const state = await requestLink({}, formWith(`  ${email.toUpperCase()} `));

    expect(state).toEqual({ sentTo: email, value: `  ${email.toUpperCase()} ` });
  });

  it("treats a missing field as an empty address", async () => {
    expect(await requestLink({}, new FormData())).toEqual({ error: "Проверьте адрес почты", value: "" });
  });
});
