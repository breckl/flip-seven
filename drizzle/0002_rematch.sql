ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "rematch_target_session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "rematch_from_player_id" uuid REFERENCES "players"("id") ON DELETE SET NULL;
