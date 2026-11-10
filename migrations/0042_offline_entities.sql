CREATE TABLE "offline_entity_deletions" (
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_entity_deletions_project_id_kind_entity_id_pk" PRIMARY KEY("project_id","kind","entity_id")
);
--> statement-breakpoint
ALTER TABLE "offline_entity_deletions" ADD CONSTRAINT "offline_entity_deletions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;