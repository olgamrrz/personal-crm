// Not "server-only": the search box in the browser and the group filter on the server build the same addresses.

// The address of the home page. The search and the group filter live in it side by side: choosing a group
// must keep the search text, and typing in the search must keep the group.
export function homeUrl({ query, group }: { query?: string; group?: number }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (group !== undefined) params.set("group", String(group));

  const search = params.toString();
  return search ? `/?${search}` : "/";
}
