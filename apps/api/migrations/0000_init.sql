CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"kid_profile_id" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "family_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_state" (
	"family_id" text PRIMARY KEY NOT NULL,
	"feed_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kid_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"default_theme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kid_profile_category" (
	"family_id" text NOT NULL,
	"kid_profile_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "kid_profile_category_kid_profile_id_category_id_pk" PRIMARY KEY("kid_profile_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "parent_pin" (
	"family_id" text PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "video" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text,
	"category_id" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_kid_profile_id_kid_profile_id_fk" FOREIGN KEY ("kid_profile_id") REFERENCES "public"."kid_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_state" ADD CONSTRAINT "family_state_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kid_profile" ADD CONSTRAINT "kid_profile_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kid_profile_category" ADD CONSTRAINT "kid_profile_category_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kid_profile_category" ADD CONSTRAINT "kid_profile_category_kid_profile_id_kid_profile_id_fk" FOREIGN KEY ("kid_profile_id") REFERENCES "public"."kid_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kid_profile_category" ADD CONSTRAINT "kid_profile_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_pin" ADD CONSTRAINT "parent_pin_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_family_at_idx" ON "audit_log" USING btree ("family_id","at");--> statement-breakpoint
CREATE INDEX "category_family_idx" ON "category" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_key_hash_uq" ON "device" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "device_family_idx" ON "device" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "family_invite_email_idx" ON "family_invite" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "family_invite_token_uq" ON "family_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "kid_profile_family_idx" ON "kid_profile" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_family_youtube_uq" ON "video" USING btree ("family_id","youtube_id");--> statement-breakpoint
CREATE INDEX "video_family_idx" ON "video" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");