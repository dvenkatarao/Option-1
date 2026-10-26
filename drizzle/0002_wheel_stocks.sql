CREATE TABLE "stocks" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text,
	"sector" text,
	"industry" text,
	"market_cap" double precision,
	"price" double precision,
	"price_at" timestamp with time zone,
	"fundamentals" jsonb,
	"events" jsonb,
	"technicals" jsonb,
	"last_error" text,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wheel_scans" (
	"ticker" text PRIMARY KEY NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"source" text,
	"fallback_reason" text,
	"price" double precision,
	"contracts" jsonb,
	"error" text
);
