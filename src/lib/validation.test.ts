import { describe, expect, it } from "vitest";

import { GROUP_NAME_MAX_LENGTH, parseGroupIds, parseGroupName } from "@/lib/validation";

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
    expect(
      parseGroupIds(formWith("abc", "0", "-1", "1.5", "", " 3", "3 ", "1e3", "12345678901")),
    ).toEqual([]);
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
