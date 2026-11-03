-- Row-level security: family-owned rows are only visible inside a transaction
-- whose `app.family_id` setting matches (set by db/context.ts withFamily()).
-- FORCE makes the policies apply to the table owner too, so the app's own
-- database user can't bypass them. `app.system` is set only by withSystem(),
-- for the few lookups that must happen before the family is known (resolving
-- a device key) or that span families (instance admin).
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "category" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "category" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "video" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "video" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "kid_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kid_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "kid_profile" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "kid_profile_category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kid_profile_category" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "kid_profile_category" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "device" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "parent_pin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parent_pin" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "parent_pin" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "family_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "family_state" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "family_state" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "family_isolation" ON "audit_log" USING ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on') WITH CHECK ("family_id" = current_setting('app.family_id', true) OR current_setting('app.system', true) = 'on');
