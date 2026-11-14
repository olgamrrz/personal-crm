import { describe, expect, it } from "vitest";

import {
  GROUP_NAME_MAX_LENGTH,
  parseContactForm,
  parseGroupIds,
  parseGroupName,
  parseSignInEmail,
  readContactForm,
} from "@/lib/validation";

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

describe("the birthday in the contact form", () => {
  const anna = { name: "Анна", about: "", howWeMet: "", phone: "", email: "" };
  const NO_BIRTHDAY = { birthdayDay: null, birthdayMonth: null, birthdayYear: null };

  it("reads the field, with spaces at the ends removed", () => {
    const formData = new FormData();
    formData.set("name", "Анна");
    formData.set("birthday", "  14.03.1990 ");

    expect(readContactForm(formData)).toMatchObject({ name: "Анна", birthday: "14.03.1990" });
  });

  it("reads a missing field as empty", () => {
    expect(readContactForm(new FormData())).toMatchObject({ birthday: "" });
  });

  it("gives no date for an empty field", () => {
    expect(parseContactForm({ ...anna, birthday: "" }, 2026)).toMatchObject({
      success: true,
      data: { name: "Анна", ...NO_BIRTHDAY },
    });
  });

  it("gives no date for a form without the field", () => {
    expect(parseContactForm(anna, 2026)).toMatchObject({ success: true, data: NO_BIRTHDAY });
  });

  it("puts a date with a year into the data", () => {
    expect(parseContactForm({ ...anna, birthday: "14.03.1990" }, 2026)).toMatchObject({
      success: true,
      data: { birthdayDay: 14, birthdayMonth: 3, birthdayYear: 1990 },
    });
  });

  it("puts a date without a year into the data", () => {
    expect(parseContactForm({ ...anna, birthday: "5.3" }, 2026)).toMatchObject({
      success: true,
      data: { birthdayDay: 5, birthdayMonth: 3, birthdayYear: null },
    });
  });

  it("gives an error under the field for a wrong date, and no data", () => {
    expect(parseContactForm({ ...anna, birthday: "31.04" }, 2026)).toEqual({
      success: false,
      errors: { birthday: "Такой даты нет" },
    });
    expect(parseContactForm({ ...anna, birthday: "завтра" }, 2026)).toEqual({
      success: false,
      errors: { birthday: "Введите дату так: 14.03 или 14.03.1990" },
    });
  });

  it("counts the year against the year that is given", () => {
    expect(parseContactForm({ ...anna, birthday: "14.03.2027" }, 2026)).toEqual({
      success: false,
      errors: { birthday: "Год не может быть в будущем" },
    });
    expect(parseContactForm({ ...anna, birthday: "14.03.2027" }, 2027)).toMatchObject({ success: true });
  });

  it("does not hide the errors of the other fields", () => {
    expect(parseContactForm({ ...anna, name: "", email: "не почта", birthday: "31.04" }, 2026)).toEqual({
      success: false,
      errors: {
        name: "Укажите имя",
        email: "Похоже, в адресе почты ошибка. Пример: anna@example.com",
        birthday: "Такой даты нет",
      },
    });
  });

  it("does not make a good date fail because of another field", () => {
    expect(parseContactForm({ ...anna, name: "", birthday: "14.03" }, 2026)).toEqual({
      success: false,
      errors: { name: "Укажите имя" },
    });
  });

  it("gives the format error, not a length error, for a long text", () => {
    expect(parseContactForm({ ...anna, birthday: "1".repeat(300) }, 2026)).toEqual({
      success: false,
      errors: { birthday: "Введите дату так: 14.03 или 14.03.1990" },
    });
  });
});
