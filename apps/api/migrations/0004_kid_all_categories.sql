-- Explicit "all categories" flag for kid profiles [review R3-1]. Before,
-- "no kid_profile_category rows" meant "everything", so deleting a restricted
-- kid's last category silently unrestricted them.
ALTER TABLE "kid_profile" ADD COLUMN "all_categories" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Profiles that have category rows today are restricted. kid_profile has
-- forced row-level security, so the update runs in system mode.
SELECT set_config('app.system', 'on', false);--> statement-breakpoint
UPDATE "kid_profile" p SET "all_categories" = false
WHERE EXISTS (SELECT 1 FROM "kid_profile_category" k WHERE k."kid_profile_id" = p."id");--> statement-breakpoint
SELECT set_config('app.system', '', false);
