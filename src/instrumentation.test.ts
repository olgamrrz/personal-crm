import { inspect } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { groups } from "@/db/schema";
import { register } from "@/instrumentation";

import { makeUser } from "../test/factories";

const consoleMethods = ["error", "warn", "log", "info", "debug"] as const;
const originalConsole = Object.fromEntries(consoleMethods.map((method) => [method, console[method]]));

afterEach(() => {
  // register() wraps the global console; the other tests get it back as it was
  Object.assign(console, originalConsole);
  vi.unstubAllEnvs();
});

describe("register", () => {
  it("makes the Node.js server print database errors without the values", async () => {
    const owner = await makeUser();
    await db.insert(groups).values({ ownerId: owner.id, name: "Друзья" });
    const error = await db
      .insert(groups)
      .values({ ownerId: owner.id, name: "друзья" })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(inspect(error, { depth: Infinity })).toContain("друзья");

    const printed: unknown[][] = [];
    console.error = (...args: unknown[]) => void printed.push(args);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await register();
    console.error(error);

    expect(printed).toHaveLength(1);
    const text = inspect(printed[0][0], { depth: Infinity });
    expect(text).not.toContain("друзья");
    expect(text).toContain('insert into "groups"');
  });
});
