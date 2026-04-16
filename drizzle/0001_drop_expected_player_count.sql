-- Remove fixed table size; host starts when at least two players have joined.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "expected_player_count";
