// Fails on purpose: checks that the protection of main does not let a PR with a red CI in.
// This PR is closed without merging.

import { describe, expect, it } from "vitest";

describe("protection of main", () => {
  it("fails on purpose", () => {
    expect(1 + 1).toBe(3);
  });
});
