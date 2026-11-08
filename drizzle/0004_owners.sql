-- Every contact and group gets an owner. The columns start nullable, so the existing rows can be given to the owner
-- before "not null" is set. The owner's address comes from OWNER_EMAIL (scripts/migrate.mts passes it as the setting
-- app.owner_email). All migrations run in one transaction: if the address is missing, nothing at all is changed.
ALTER TABLE "contacts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" text;--> statement-breakpoint
DO $$
DECLARE
  owner_email text := lower(btrim(coalesce(current_setting('app.owner_email', true), '')));
  owner_user_id text;
BEGIN
  -- An empty database needs no owner
  IF NOT EXISTS (SELECT 1 FROM "contacts") AND NOT EXISTS (SELECT 1 FROM "groups") THEN
    RETURN;
  END IF;

  IF owner_email = '' THEN
    RAISE EXCEPTION 'OWNER_EMAIL is not set: set it in .env so that the existing contacts and groups get an owner';
  END IF;

  -- The owner may have signed in already; if not, the user is made now and the first sign-in link opens it
  SELECT "id" INTO owner_user_id FROM "users" WHERE "email" = owner_email;
  IF owner_user_id IS NULL THEN
    INSERT INTO "users" ("id", "name", "email", "email_verified")
    VALUES (gen_random_uuid()::text, '', owner_email, true)
    RETURNING "id" INTO owner_user_id;
  END IF;

  UPDATE "contacts" SET "owner_id" = owner_user_id;
  UPDATE "groups" SET "owner_id" = owner_user_id;
END $$;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_owner_id_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
DROP INDEX "groups_name_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "groups_owner_name_key_idx" ON "groups" USING btree ("owner_id",lower(translate("name", 'Ёё', 'Ее') collate "ru-RU-x-icu"));
