CREATE TABLE "user_countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_countries_user_id_country_code_unique" UNIQUE("user_id","country_code")
);
--> statement-breakpoint
ALTER TABLE "user_countries" ADD CONSTRAINT "user_countries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;