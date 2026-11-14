import { describe, expect, it } from "vitest";

import { formatBirthday, formatBirthdayDate, formatDaysUntil, parseBirthday } from "@/lib/birthday";

const FORMAT_ERROR = "Введите дату так: 14.03 или 14.03.1990";
const NO_SUCH_DATE = "Такой даты нет";

function fail(errors: string) {
  return { success: false, errors };
}

function ok(day: number, month: number, year: number | null) {
  return { success: true, data: { day, month, year } };
}

describe("parseBirthday", () => {
  it("reads a day and a month without a year", () => {
    expect(parseBirthday("14.03", 2026)).toEqual(ok(14, 3, null));
  });

  it("reads a day, a month and a year", () => {
    expect(parseBirthday("14.03.1990", 2026)).toEqual(ok(14, 3, 1990));
  });

  it("accepts a date without leading zeros and removes spaces at the ends", () => {
    expect(parseBirthday("  5.3 ", 2026)).toEqual(ok(5, 3, null));
    expect(parseBirthday("\t05.03.1990\n", 2026)).toEqual(ok(5, 3, 1990));
  });

  it("treats an empty text as no date", () => {
    expect(parseBirthday("", 2026)).toEqual({ success: true, data: null });
    expect(parseBirthday("   ", 2026)).toEqual({ success: true, data: null });
  });

  it("asks for the format when the text is not a date", () => {
    expect(parseBirthday("завтра", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14/03", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14,03", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14.03.", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14.03.1990.5", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14 03", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("-1.03", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("014.03", 2026)).toEqual(fail(FORMAT_ERROR));
  });

  it("asks for the format when the year has not four digits", () => {
    expect(parseBirthday("14.03.9", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14.03.90", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14.03.199", 2026)).toEqual(fail(FORMAT_ERROR));
    expect(parseBirthday("14.03.19900", 2026)).toEqual(fail(FORMAT_ERROR));
  });

  it("says there is no such date for a day or a month that does not exist", () => {
    expect(parseBirthday("31.04", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("31.04.1990", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("30.02", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("0.05", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("32.01", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("14.00", 2026)).toEqual(fail(NO_SUCH_DATE));
    expect(parseBirthday("14.13", 2026)).toEqual(fail(NO_SUCH_DATE));
  });

  it("accepts the last day of every month", () => {
    const lastDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lastDays.forEach((day, index) => {
      expect(parseBirthday(`${day}.${index + 1}`, 2026)).toEqual(ok(day, index + 1, null));
    });
  });

  describe("29 February", () => {
    it("is accepted without a year", () => {
      expect(parseBirthday("29.02", 2026)).toEqual(ok(29, 2, null));
    });

    it("is accepted with a leap year", () => {
      expect(parseBirthday("29.02.2024", 2026)).toEqual(ok(29, 2, 2024));
      expect(parseBirthday("29.02.2000", 2026)).toEqual(ok(29, 2, 2000));
    });

    it("is refused with a year that is not a leap year", () => {
      expect(parseBirthday("29.02.2023", 2026)).toEqual(fail(NO_SUCH_DATE));
      expect(parseBirthday("29.02.1900", 2026)).toEqual(fail(NO_SUCH_DATE));
    });
  });

  describe("the year", () => {
    it("may be the current one", () => {
      expect(parseBirthday("14.03.2026", 2026)).toEqual(ok(14, 3, 2026));
    });

    it("may not be in the future", () => {
      expect(parseBirthday("14.03.2027", 2026)).toEqual(fail("Год не может быть в будущем"));
    });

    it("may be 1900 but not earlier", () => {
      expect(parseBirthday("14.03.1900", 2026)).toEqual(ok(14, 3, 1900));
      expect(parseBirthday("14.03.1899", 2026)).toEqual(fail("Год не раньше 1900"));
    });

    it("is compared with the current year that is given", () => {
      expect(parseBirthday("14.03.2027", 2027)).toEqual(ok(14, 3, 2027));
    });
  });
});

describe("formatBirthday", () => {
  it("writes a date with leading zeros", () => {
    expect(formatBirthday({ day: 5, month: 3, year: null })).toBe("05.03");
  });

  it("adds the year when it is known", () => {
    expect(formatBirthday({ day: 5, month: 3, year: 1990 })).toBe("05.03.1990");
    expect(formatBirthday({ day: 14, month: 11, year: 2026 })).toBe("14.11.2026");
  });

  it("gives a text that reads back as the same date", () => {
    const birthdays = [
      { day: 5, month: 3, year: null },
      { day: 29, month: 2, year: null },
      { day: 29, month: 2, year: 2024 },
      { day: 31, month: 12, year: 1900 },
    ];
    for (const birthday of birthdays) {
      expect(parseBirthday(formatBirthday(birthday), 2026)).toEqual({ success: true, data: birthday });
    }
  });
});

describe("formatBirthdayDate", () => {
  it("writes the day and the month in words", () => {
    expect(formatBirthdayDate(18, 11)).toBe("18 ноября");
    expect(formatBirthdayDate(1, 3)).toBe("1 марта");
    expect(formatBirthdayDate(31, 12)).toBe("31 декабря");
  });

  it("knows 29 February", () => {
    expect(formatBirthdayDate(29, 2)).toBe("29 февраля");
  });
});

describe("formatDaysUntil", () => {
  it("says «сегодня» and «завтра» for the first two days", () => {
    expect(formatDaysUntil(0)).toBe("сегодня");
    expect(formatDaysUntil(1)).toBe("завтра");
  });

  it("counts the days after that, in the right form of the word", () => {
    expect(formatDaysUntil(2)).toBe("через 2 дня");
    expect(formatDaysUntil(3)).toBe("через 3 дня");
    expect(formatDaysUntil(4)).toBe("через 4 дня");
    expect(formatDaysUntil(5)).toBe("через 5 дней");
    expect(formatDaysUntil(6)).toBe("через 6 дней");
  });
});
