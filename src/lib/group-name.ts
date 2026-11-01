// Not "server-only": the group field in the browser uses it to decide whether to offer "Создать группу".

// Names that give the same key are one group: case does not matter, Ё equals Е, spaces at the ends are cut.
// This is a hint for the interface. The last word belongs to the unique index in the database
// (groupNameKeySql in src/db/schema.ts), so a rare letter on which the two disagree never makes a duplicate.
export function groupNameKey(name: string) {
  return name.trim().replace(/Ё/g, "Е").replace(/ё/g, "е").toLocaleLowerCase("ru");
}
