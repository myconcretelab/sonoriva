CREATE TABLE "notification_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email_recipient" text,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_subscription_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"telegram_sent" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_subscription_notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "plan_subscription_notifications" ADD CONSTRAINT "plan_subscription_notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscription_notifications" ADD CONSTRAINT "plan_subscription_notifications_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;