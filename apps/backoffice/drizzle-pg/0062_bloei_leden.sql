CREATE TABLE "bloei_leden" (
	"member_id" text PRIMARY KEY NOT NULL,
	"bron" text NOT NULL,
	"data_sealed" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bloei_leden" ENABLE ROW LEVEL SECURITY;