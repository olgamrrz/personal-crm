import { describe, expect, it } from "vitest";

import { GROUP_NAME_MAX_LENGTH, parseGroupIds, parseGroupName, parseSignInEmail } from "@/lib/validation";

describe("parseGroupName", () => {
  it("limits the name to 50 characters", () => {
    expect(GROUP_NAME_MAX_LENGTH).toBe(50);
  });

  it("accepts a name and returns it as typed", () => {
    expect(parseGroupName("Теннис")).toEqual({ success: true, data: "Теннис" });
  });

  it("keeps the case of the letters", () => {
    expect(parseGroupName("теннис")).toEqual({ success: true, data: "теннис" });
    expect(parseGroupName("ТеНниС")).toEqual({ success: true, data: "ТеНниС" });
  });

  it("removes spaces at both ends", () => {
    expect(parseGroupName("  Теннис  ")).toEqual({ success: true, data: "Теннис" });
  });

  it("keeps spaces inside the name", () => {
    expect(parseGroupName("Большой  теннис")).toEqual({ success: true, data: "Большой  теннис" });
  });

  it("asks for a name when it is empty", () => {
    expect(parseGroupName("")).toEqual({ success: false, errors: "Введите название группы" });
  });

  it("asks for a name when there are only spaces", () => {
    expect(parseGroupName("   ")).toEqual({ success: false, errors: "Введите название группы" });
    expect(parseGroupName(" \t\n ")).toEqual({ success: false, errors: "Введите название группы" });
  });

  it("asks for a name when the value is not a string", () => {
    expect(parseGroupName(undefined)).toEqual({ success: false, errors: "Введите название группы" });
    expect(parseGroupName(null)).toEqual({ success: false, errors: "Введите название группы" });
    expect(parseGroupName(42)).toEqual({ success: false, errors: "Введите название группы" });
  });

  it("accepts a name of exactly 50 characters", () => {
    const name = "а".repeat(50);
    expect(parseGroupName(name)).toEqual({ success: true, data: name });
  });

  it("rejects a name of 51 characters", () => {
    expect(parseGroupName("а".repeat(51))).toEqual({
      success: false,
      errors: "Слишком длинно: не больше 50 символов",
    });
  });

  it("counts the length without the spaces at the ends", () => {
    const name = "а".repeat(50);
    expect(parseGroupName(`  ${name}  `)).toEqual({ success: true, data: name });
  });
});

describe("parseGroupIds", () => {
  function formWith(...values: (string | File)[]) {
    const formData = new FormData();
    for (const value of values) formData.append("groupIds", value);
    return formData;
  }

  it("returns no ids when the form has none", () => {
    expect(parseGroupIds(new FormData())).toEqual([]);
  });

  it("takes all the groupIds in the order they come", () => {
    expect(parseGroupIds(formWith("3", "1", "2"))).toEqual([3, 1, 2]);
  });

  it("removes repeats", () => {
    expect(parseGroupIds(formWith("2", "2", "1", "2"))).toEqual([2, 1]);
  });

  it("drops anything that is not a positive whole number", () => {
    expect(parseGroupIds(formWith("abc", "0", "-1", "1.5", "", " 3", "3 ", "1e3", "12345678901"))).toEqual(
      [],
    );
  });

  it("keeps the good ids among the bad ones", () => {
    expect(parseGroupIds(formWith("abc", "5", "0", "6", "-1"))).toEqual([5, 6]);
  });

  it("ignores files and other fields", () => {
    const formData = formWith("4", new File(["x"], "x.txt"));
    formData.append("name", "7");
    expect(parseGroupIds(formData)).toEqual([4]);
  });
});

describe("parseSignInEmail", () => {
  const INVALID = { success: false, errors: "Проверьте адрес почты" };

  it("removes spaces at both ends and lowers the case", () => {
    expect(parseSignInEmail("  Anna@Example.COM  ")).toEqual({
      success: true,
      data: "anna@example.com",
    });
  });

  it("accepts a plain address as it is", () => {
    expect(parseSignInEmail("anna@example.com")).toEqual({ success: true, data: "anna@example.com" });
  });

  it("rejects an empty field", () => {
    expect(parseSignInEmail("")).toEqual(INVALID);
    expect(parseSignInEmail("   ")).toEqual(INVALID);
  });

  it("rejects an address that is cut off", () => {
    expect(parseSignInEmail("anna@")).toEqual(INVALID);
    expect(parseSignInEmail("anna@example")).toEqual(INVALID);
    expect(parseSignInEmail("@example.com")).toEqual(INVALID);
  });

  it("rejects text without an @", () => {
    expect(parseSignInEmail("anna")).toEqual(INVALID);
  });

  it("rejects spaces inside the address", () => {
    expect(parseSignInEmail("an na@example.com")).toEqual(INVALID);
  });

  it("rejects two @", () => {
    expect(parseSignInEmail("anna@@example.com")).toEqual(INVALID);
  });

  it("accepts an address of exactly 254 characters and rejects 255", () => {
    const domain = "@example.com";
    const longest = `${"a".repeat(254 - domain.length)}${domain}`;
    expect(parseSignInEmail(longest)).toEqual({ success: true, data: longest });
    expect(parseSignInEmail(`a${longest}`)).toEqual(INVALID);
  });

  it("rejects what Better Auth would refuse later: dots in a row, a one-letter domain end, non-Latin letters", () => {
    for (const address of [
      "a..b@example.com",
      "a.@example.com",
      "a@b.c",
      "a@b..com",
      "a@-b.com",
      "анна@example.com",
    ]) {
      expect(parseSignInEmail(address), address).toEqual(INVALID);
    }
  });

  it("rejects a value that is not a string", () => {
    expect(parseSignInEmail(undefined)).toEqual(INVALID);
    expect(parseSignInEmail(null)).toEqual(INVALID);
    expect(parseSignInEmail(42)).toEqual(INVALID);
  });
});
