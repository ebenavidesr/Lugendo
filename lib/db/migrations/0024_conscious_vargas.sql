CREATE TABLE "trip_note_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"traveler_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_note_shares_note_id_traveler_id_unique" UNIQUE("note_id","traveler_id")
);
--> statement-breakpoint
CREATE TABLE "trip_document_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"traveler_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_shares_document_id_traveler_id_unique" UNIQUE("document_id","traveler_id")
);
--> statement-breakpoint
ALTER TABLE "trip_note_shares" ADD CONSTRAINT "trip_note_shares_note_id_trip_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."trip_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_note_shares" ADD CONSTRAINT "trip_note_shares_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_document_shares" ADD CONSTRAINT "trip_document_shares_document_id_trip_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."trip_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_document_shares" ADD CONSTRAINT "trip_document_shares_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;