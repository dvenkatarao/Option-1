CREATE TABLE "market_data_connections" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_tokens" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
