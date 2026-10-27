CREATE TABLE "option_quote_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_symbol" text NOT NULL,
	"ticker" text NOT NULL,
	"type" text NOT NULL,
	"expiration" text NOT NULL,
	"strike" double precision NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"provider_timestamp" timestamp with time zone,
	"source" text NOT NULL,
	"underlying_price" double precision,
	"bid" double precision,
	"ask" double precision,
	"last" double precision,
	"iv" double precision,
	"delta" double precision,
	"gamma" double precision,
	"theta" double precision,
	"vega" double precision,
	"rho" double precision,
	"open_interest" double precision,
	"volume" double precision
);
--> statement-breakpoint
CREATE UNIQUE INDEX "option_quote_snapshots_contract_bucket_idx" ON "option_quote_snapshots" USING btree ("contract_symbol","bucket");--> statement-breakpoint
CREATE INDEX "option_quote_snapshots_ticker_exp_idx" ON "option_quote_snapshots" USING btree ("ticker","expiration");--> statement-breakpoint
CREATE INDEX "option_quote_snapshots_captured_idx" ON "option_quote_snapshots" USING btree ("captured_at");