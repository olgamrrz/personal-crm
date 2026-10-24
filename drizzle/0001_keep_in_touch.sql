ALTER TABLE "contacts" ADD COLUMN "contact_frequency" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_frequency_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_frequency_check" CHECK ("contacts"."contact_frequency" in ('week', 'month', 'quarter', 'year'));