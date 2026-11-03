-- One membership per person per family [review M2]. Remove any duplicates
-- first (keep the oldest row; an owner row wins over a parent row).
DELETE FROM "member" m
USING "member" k
WHERE m."organization_id" = k."organization_id"
  AND m."user_id" = k."user_id"
  AND m."id" <> k."id"
  AND (
    (k."role" = 'owner' AND m."role" <> 'owner')
    OR (k."role" = m."role" AND (k."created_at", k."id") < (m."created_at", m."id"))
  );--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uq" ON "member" USING btree ("organization_id","user_id");
