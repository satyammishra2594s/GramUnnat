CREATE TABLE "app_states" (
	"user_key" text PRIMARY KEY,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
