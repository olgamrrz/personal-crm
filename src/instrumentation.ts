// Next.js calls register() once when the server starts, before it handles any request

export async function register() {
  // All server code of this app runs on Node.js; there is no Edge runtime code
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLogRedaction } = await import("@/lib/log-redaction");
    installLogRedaction();
  }
}
