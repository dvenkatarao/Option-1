CREATE TABLE "wheel_iv_history" (
	"id" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"expiration" text NOT NULL,
	"strike" double precision NOT NULL,
	"iv" double precision,
	"hv30" double precision,
	"dte" double precision
);
--> statement-breakpoint
CREATE TABLE "wheel_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"strike" double precision NOT NULL,
	"expiration" text NOT NULL,
	"premium" double precision NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"opened_at" text NOT NULL,
	"closed_at" text,
	"cost_basis" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wheel_iv_history_ticker_idx" ON "wheel_iv_history" USING btree ("ticker");--> statement-breakpoint
CREATE INDEX "wheel_iv_history_captured_idx" ON "wheel_iv_history" USING btree ("captured_at");