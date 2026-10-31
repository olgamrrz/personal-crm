import { describe, expect, it } from "vitest";

import { homeUrl } from "@/lib/home-url";

// What the home page would read back from the address
function readBack(url: string) {
  const { pathname, searchParams } = new URL(url, "http://localhost");
  return { pathname, q: searchParams.get("q"), group: searchParams.get("group") };
}

describe("homeUrl", () => {
  it("is the plain home page without a query and a group", () => {
    expect(homeUrl({})).toBe("/");
    expect(homeUrl({ query: "", group: undefined })).toBe("/");
  });

  it("keeps the query", () => {
    expect(readBack(homeUrl({ query: "Иван" }))).toEqual({ pathname: "/", q: "Иван", group: null });
  });

  it("keeps the group", () => {
    expect(homeUrl({ group: 5 })).toBe("/?group=5");
  });

  it("keeps both, so choosing a group does not erase the search and typing does not drop the group", () => {
    expect(readBack(homeUrl({ query: "Иван", group: 5 }))).toEqual({
      pathname: "/",
      q: "Иван",
      group: "5",
    });
  });

  it("leaves out an empty query and a missing group", () => {
    expect(homeUrl({ query: "", group: 7 })).toBe("/?group=7");
    expect(homeUrl({ query: "Анна", group: undefined })).not.toContain("group");
  });

  it("survives characters that mean something in an address", () => {
    const query = "Иван & Анна #1 100%+ a=b";
    expect(readBack(homeUrl({ query, group: 3 })).q).toBe(query);
  });
});
