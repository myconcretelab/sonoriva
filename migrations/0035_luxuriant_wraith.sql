ALTER TABLE "tracks" DROP CONSTRAINT "tracks_storage_key_unique";--> statement-breakpoint
ALTER TABLE "bridge_devices" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_users" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "bridge_devices" ADD CONSTRAINT "bridge_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tracks_storage_key_idx" ON "tracks" USING btree ("storage_key");
--> statement-breakpoint
UPDATE projects p SET user_id = (SELECT m.user_id FROM account_memberships m WHERE m.account_id = p.account_id ORDER BY (m.role = 'owner') DESC, m.created_at, m.user_id LIMIT 1);
--> statement-breakpoint
UPDATE bridge_devices d SET user_id = (SELECT m.user_id FROM account_memberships m WHERE m.account_id = d.account_id ORDER BY (m.role = 'owner') DESC, m.created_at, m.user_id LIMIT 1);
--> statement-breakpoint
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE bridge_devices ALTER COLUMN user_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE plans ADD CONSTRAINT plans_max_users_nonnegative CHECK (max_users >= 0);
--> statement-breakpoint
-- Keep only the newest existing session in each account.
DELETE FROM sessions WHERE token_hash IN (
 SELECT token_hash FROM (
  SELECT s.token_hash, row_number() OVER (PARTITION BY m.account_id ORDER BY s.created_at DESC, s.token_hash) AS position
  FROM sessions s JOIN account_memberships m ON m.user_id = s.user_id
 ) ranked WHERE position > 1
);
