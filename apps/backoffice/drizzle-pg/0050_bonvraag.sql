CREATE TABLE "shop_line_answers" (
	"order_line_id" bigint PRIMARY KEY NOT NULL,
	"participant_id" text,
	"remember" bigint DEFAULT 0 NOT NULL,
	"answered_at" text NOT NULL,
	"answered_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_line_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shop_line_answers" ADD CONSTRAINT "shop_line_answers_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_line_answers" ADD CONSTRAINT "shop_line_answers_participant_id_coop_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."coop_participants"("id") ON DELETE no action ON UPDATE no action;