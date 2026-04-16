CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "status" text NOT NULL,
  "expected_player_count" integer NOT NULL,
  "host_player_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_code_unique" ON "sessions" ("code");

CREATE TABLE IF NOT EXISTS "players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "seat_order" integer NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "games" (
  "session_id" uuid PRIMARY KEY REFERENCES "sessions"("id") ON DELETE CASCADE,
  "state" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
