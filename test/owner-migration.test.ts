// The migration that gives the existing data to its owner (drizzle/0004_owners.sql), run the way a deploy runs it:
// on a database that has all the old migrations and real rows, with scripts/migrate.mts. It has a database of
// its own, <working name>_migration_test, created fresh for every test.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../scripts/migrate.mts";

import { getTestDatabase, quoteIdentifier } from "./database.mts";

const MIGRATION_DATABASE_SUFFIX = "_migration_test";
const DRIZZLE_FOLDER = path.join(process.cwd(), "drizzle");
// The last migration before the one that adds owners
const LAST_OLD_MIGRATION = "0003_auth";

const database = getTestDatabase(MIGRATION_DATABASE_SUFFIX);

let client: postgres.Sql;
let oldMigrations: string;

// A copy of the migrations folder that stops at LAST_OLD_MIGRATION: the state of a server before this release
function copyOldMigrations() {
  const folder = mkdtempSync(path.join(tmpdir(), "crm-old-migrations-"));
  cpSync(DRIZZLE_FOLDER, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const last = journal.entries.findIndex((entry) => entry.tag === LAST_OLD_MIGRATION);
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

async function recreateDatabase() {
  const admin = postgres(database.adminUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${quoteIdentifier(database.name)} with (force)`);
    await admin.unsafe(`create database ${quoteIdentifier(database.name)}`);
  } finally {
    await admin.end();
  }
}

beforeEach(async () => {
  await recreateDatabase();
  oldMigrations = copyOldMigrations();
  await applyMigrations({ databaseUrl: database.url, migrationsFolder: oldMigrations });
  client = postgres(database.url, { max: 1, onnotice: () => {} });
});

afterEach(async () => {
  await client.end();
  rmSync(oldMigrations, { recursive: true, force: true });
});

// What was on the server before the release: 3 contacts, 4 notes, 2 groups, 2 links
async function insertOldData() {
  await client`insert into contacts (name) values ('Анна Смирнова'), ('Борис Иванов'), ('Вера Ким')`;
  await client`insert into notes (contact_id, body) values (1, 'Созвонились'), (1, 'Встретились'), (2, 'Написал'), (3, 'Позвонила')`;
  await client`insert into groups (name) values ('Друзья'), ('Теннис')`;
  await client`insert into contact_groups (contact_id, group_id) values (1, 1), (2, 2)`;
}

// The message of the failure itself: Drizzle's own message quotes the whole SQL text, which holds the same words
async function migrationFailure(options: Parameters<typeof applyMigrations>[0]) {
  try {
    await applyMigrations(options);
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return cause instanceof Error ? cause.message : String(error);
  }
  return null;
}

async function counts() {
  const [row] = await client<{ contacts: number; notes: number; groups: number; links: number }[]>`
    select
      (select count(*)::int from contacts) as contacts,
      (select count(*)::int from notes) as notes,
      (select count(*)::int from groups) as groups,
      (select count(*)::int from contact_groups) as links
  `;
  return row;
}

async function hasOwnerColumn(table: "contacts" | "groups") {
  const columns = await client`
    select 1 from information_schema.columns where table_name = ${table} and column_name = 'owner_id'
  `;
  return columns.length > 0;
}

async function appliedMigrations() {
  const [row] = await client<
    { total: number }[]
  >`select count(*)::int as total from drizzle.__drizzle_migrations`;
  return row.total;
}

describe("the owner migration", () => {
  it("gives every contact, note and group to the owner, and loses nothing", async () => {
    await insertOldData();
    const before = await counts();

    // The address is typed as it may be in .env: capital letters and spaces around
    await applyMigrations({ databaseUrl: database.url, ownerEmail: "  Owner@Example.COM " });

    expect(await counts()).toEqual(before);
    const users = await client`select id, email from users`;
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("owner@example.com");
    const foreign = await client`
      select
        (select count(*)::int from contacts where owner_id is distinct from ${users[0].id}) as contacts,
        (select count(*)::int from groups where owner_id is distinct from ${users[0].id}) as groups
    `;
    expect(foreign[0]).toEqual({ contacts: 0, groups: 0 });
    // The links and notes still point at the same contacts and groups
    const links = await client`select contact_id, group_id from contact_groups order by contact_id`;
    expect(links.map((link) => [link.contact_id, link.group_id])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("uses the owner who has already signed in, instead of making a second one", async () => {
    await insertOldData();
    await client`insert into users (id, name, email, email_verified) values ('existing-owner', '', 'owner@example.com', true)`;

    await applyMigrations({ databaseUrl: database.url, ownerEmail: "owner@example.com" });

    expect(await client`select id from users`).toHaveLength(1);
    expect(await client`select 1 from contacts where owner_id = 'existing-owner'`).toHaveLength(3);
  });

  it("stops and leaves the data as it was when there is data but no owner's address", async () => {
    await insertOldData();
    const before = await counts();
    const migrationsBefore = await appliedMigrations();

    expect(await migrationFailure({ databaseUrl: database.url })).toMatch(/^OWNER_EMAIL is not set/);
    expect(await migrationFailure({ databaseUrl: database.url, ownerEmail: "   " })).toMatch(
      /^OWNER_EMAIL is not set/,
    );

    expect(await counts()).toEqual(before);
    expect(await hasOwnerColumn("contacts")).toBe(false);
    expect(await hasOwnerColumn("groups")).toBe(false);
    expect(await client`select 1 from users`).toHaveLength(0);
    expect(await appliedMigrations()).toBe(migrationsBefore);
  });

  it("does not need the owner's address when the database is empty", async () => {
    await applyMigrations({ databaseUrl: database.url });

    expect(await hasOwnerColumn("contacts")).toBe(true);
    expect(await hasOwnerColumn("groups")).toBe(true);
    expect(await client`select 1 from users`).toHaveLength(0);
  });

  it("lets two people have a group of the same name, but not one person", async () => {
    await applyMigrations({ databaseUrl: database.url });
    await client`insert into users (id, name, email) values ('a', '', 'a@example.com'), ('b', '', 'b@example.com')`;

    await client`insert into groups (name, owner_id) values ('Друзья', 'a')`;
    await client`insert into groups (name, owner_id) values ('друзья', 'b')`;
    await expect(client`insert into groups (name, owner_id) values ('ДРУЗЬЯ', 'a')`).rejects.toThrow();
  });

  it("does not let a contact or a group exist without an owner", async () => {
    await applyMigrations({ databaseUrl: database.url });

    await expect(client`insert into contacts (name) values ('Без владельца')`).rejects.toThrow();
    await expect(client`insert into groups (name) values ('Без владельца')`).rejects.toThrow();
  });
});
