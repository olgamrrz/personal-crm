import { describe, expect, it } from "vitest";

import { formatLastConversation, pluralize } from "@/lib/format";

describe("pluralize", () => {
  const contacts = (count: number) => pluralize(count, "контакт", "контакта", "контактов");

  it("uses the singular form after 1, 21, 101", () => {
    expect(contacts(1)).toBe("1 контакт");
    expect(contacts(21)).toBe("21 контакт");
    expect(contacts(101)).toBe("101 контакт");
  });

  it("uses the few form after 2-4, 22-24", () => {
    expect(contacts(2)).toBe("2 контакта");
    expect(contacts(4)).toBe("4 контакта");
    expect(contacts(22)).toBe("22 контакта");
  });

  it("uses the many form after 0, 5-20, 25", () => {
    expect(contacts(0)).toBe("0 контактов");
    expect(contacts(5)).toBe("5 контактов");
    expect(contacts(11)).toBe("11 контактов");
    expect(contacts(12)).toBe("12 контактов");
    expect(contacts(25)).toBe("25 контактов");
  });
});

describe("formatLastConversation", () => {
  it("shows the day of the last conversation as a date", () => {
    expect(formatLastConversation("2026-09-19", false)).toBe("19 сентября 2026 г.");
  });

  it("says «сегодня» when it was today", () => {
    expect(formatLastConversation("2026-09-19", true)).toBe("сегодня");
  });

  it("says there has been no conversation yet", () => {
    expect(formatLastConversation(null, false)).toBe("ещё не общались");
  });
});
