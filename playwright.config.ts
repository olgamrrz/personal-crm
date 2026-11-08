import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_SUFFIX, getTestDatabase } from "./test/database.mts";

// Browser tests of the whole app (e2e/): a real browser, the real server and a real database in Docker, no mocks.
// The app is built and run here the way the Docker image runs it on the server, on a port and with a database
// of its own: a `pnpm dev` on port 3000 and the working data are not touched.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // All tests share one database and clear it before each test, so they run one at a time
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // The report is kept in playwright-report/ (`pnpm exec playwright show-report` opens it), not opened by itself
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // What the page looked like and did, step by step, for a failed test: see the report
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Like the Docker image: the standalone server with the static files next to it.
    // A fresh build every run, so the tests always see the current code.
    command: "pnpm build && cp -R .next/static .next/standalone/.next/ && node .next/standalone/server.js",
    // Ready once it accepts connections. It connects to the database only when a page is opened,
    // and globalSetup prepares the database right after this, before the first test.
    port: PORT,
    env: {
      DATABASE_URL: getTestDatabase(E2E_DATABASE_SUFFIX).url,
      // Sign-in links point at this server. The secret is new on every run and is not kept anywhere.
      BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      // The letters go to Mailpit (docker compose up -d); tests read them from there. Whatever the working
      // .env says about mail is overridden here, so a test never writes to a real address.
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_SECURE: "false",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "noreply@mail.crm.example.com",
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    // Something already on the port would be tested instead of the current code, so it is an error
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
