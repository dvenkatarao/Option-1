CREATE TABLE "cache_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etf_history" (
	"ticker" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etfs" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text,
	"category" text,
	"family" text,
	"exchange" text,
	"instrument_type" text,
	"inception_date" text,
	"expense_ratio" double precision,
	"turnover" double precision,
	"total_assets" double precision,
	"nav_price" double precision,
	"reported_yield" double precision,
	"beta_3y" double precision,
	"last_close" double precision,
	"last_close_date" text,
	"profile" jsonb,
	"metrics" jsonb,
	"sources" jsonb,
	"last_error" text,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"broker_type" text NOT NULL,
	"account_number_masked" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"encrypted_credentials" text,
	"sync_error" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"ticker" text NOT NULL,
	"asset_type" text DEFAULT 'ETF' NOT NULL,
	"quantity" double precision NOT NULL,
	"average_cost_basis" double precision NOT NULL,
	"purchase_date" text,
	"current_price" double precision,
	"market_value" double precision,
	"unrealized_gain" double precision,
	"unrealized_gain_pct" double precision,
	"last_price_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"ticker" text,
	"type" text NOT NULL,
	"quantity" double precision,
	"price" double precision,
	"amount" double precision NOT NULL,
	"fee" double precision DEFAULT 0,
	"transaction_date" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "positions_portfolio_ticker_uq" ON "positions" USING btree ("portfolio_id","ticker");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_date_idx" ON "transactions" USING btree ("portfolio_id","transaction_date");