import { describe, expect, it } from "vitest";

import { groupNameKey } from "@/lib/group-name";

describe("groupNameKey", () => {
  it("gives one key for any case", () => {
    expect(groupNameKey("Теннис")).toBe(groupNameKey("теннис"));
    expect(groupNameKey("Теннис")).toBe(groupNameKey("ТЕННИС"));
  });

  it("ignores spaces at the ends", () => {
    expect(groupNameKey("  ТЕННИС ")).toBe(groupNameKey("Теннис"));
  });

  it("treats Ё and Е as one letter", () => {
    expect(groupNameKey("Ёлка")).toBe(groupNameKey("елка"));
    expect(groupNameKey("ЁЛКА")).toBe(groupNameKey("Елка"));
    expect(groupNameKey("ёлка")).toBe(groupNameKey("ЕЛКА"));
  });

  it("gives different keys to different names", () => {
    expect(groupNameKey("Теннис")).not.toBe(groupNameKey("Йога"));
    expect(groupNameKey("Большой теннис")).not.toBe(groupNameKey("Теннис"));
  });

  it("keeps the spaces inside a name", () => {
    expect(groupNameKey("Большой  теннис")).not.toBe(groupNameKey("Большой теннис"));
  });

  it("gives an empty key to an empty name", () => {
    expect(groupNameKey("")).toBe("");
    expect(groupNameKey("   ")).toBe("");
  });
});
