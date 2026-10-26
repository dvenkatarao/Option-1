CREATE TABLE "quote_snapshots" (
	"ticker" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" double precision,
	"volume" double precision,
	"bid" double precision,
	"ask" double precision,
	"market_state" text,
	CONSTRAINT "quote_snapshots_ticker_bucket_pk" PRIMARY KEY("ticker","bucket")
);
--> statement-breakpoint
CREATE INDEX "quote_snapshots_bucket_idx" ON "quote_snapshots" USING btree ("bucket");