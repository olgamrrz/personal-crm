// The script with demo data (scripts/seed.mts): who gets the contacts, and when it does nothing.

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, notes, users } from "@/db/schema";

import { seedDemoData } from "../scripts/seed.mts";

import { countRows, makeContact, makeUser } from "./factories";

const DATABASE_URL = process.env.DATABASE_URL!;

async function ownedBy(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ? db.select().from(contacts).where(eq(contacts.ownerId, user.id)) : [];
}

describe("seedDemoData", () => {
  it("makes the owner and gives them the demo contacts with notes", async () => {
    const result = await seedDemoData({
      databaseUrl: DATABASE_URL,
      ownerEmail: "owner@example.com",
      contactCount: 12,
    });

    expect(result.seeded).toBe(true);
    expect(await ownedBy("owner@example.com")).toHaveLength(12);
    expect(await countRows(contacts)).toBe(12);
    expect(await countRows(notes)).toBe(result.notes);
    expect(result.notes).toBeGreaterThan(0);
    expect(await countRows(users)).toBe(1);
  });

  it("writes the address of the owner in one form: no spaces, lower case", async () => {
    await seedDemoData({ databaseUrl: DATABASE_URL, ownerEmail: "  Owner@Example.COM ", contactCount: 3 });

    expect(await ownedBy("owner@example.com")).toHaveLength(3);
  });

  it("uses the owner who has signed in already, instead of making another", async () => {
    const owner = await makeUser("owner@example.com");

    await seedDemoData({ databaseUrl: DATABASE_URL, ownerEmail: "owner@example.com", contactCount: 5 });

    expect(await countRows(users)).toBe(1);
    expect(await db.select().from(contacts).where(eq(contacts.ownerId, owner.id))).toHaveLength(5);
  });

  it("gives other people no demo contacts", async () => {
    const other = await makeUser("other@example.com");

    await seedDemoData({ databaseUrl: DATABASE_URL, ownerEmail: "owner@example.com", contactCount: 5 });

    expect(await db.select().from(contacts).where(eq(contacts.ownerId, other.id))).toHaveLength(0);
  });

  it("changes nothing when the owner already has contacts", async () => {
    const owner = await makeUser("owner@example.com");
    await makeContact(owner.id, "Мария Соколова");

    const result = await seedDemoData({
      databaseUrl: DATABASE_URL,
      ownerEmail: "owner@example.com",
      contactCount: 5,
    });

    expect(result).toEqual({ seeded: false, contacts: 0, notes: 0 });
    expect(await countRows(contacts)).toBe(1);
    expect(await countRows(notes)).toBe(0);
  });

  it("does not mind that other people have contacts: it looks at the owner's only", async () => {
    const other = await makeUser("other@example.com");
    await makeContact(other.id, "Борис Иванов");

    const result = await seedDemoData({
      databaseUrl: DATABASE_URL,
      ownerEmail: "owner@example.com",
      contactCount: 4,
    });

    expect(result.seeded).toBe(true);
    expect(await ownedBy("owner@example.com")).toHaveLength(4);
    expect(
      await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.ownerId, other.id), eq(contacts.name, "Борис Иванов"))),
    ).toHaveLength(1);
  });

  it("says what to do when OWNER_EMAIL is not set, and creates nothing", async () => {
    await expect(seedDemoData({ databaseUrl: DATABASE_URL, ownerEmail: undefined })).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );
    await expect(seedDemoData({ databaseUrl: DATABASE_URL, ownerEmail: "   " })).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );

    expect(await countRows(users)).toBe(0);
    expect(await countRows(contacts)).toBe(0);
  });
});
