import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    status: text("status").notNull().$type<"lobby" | "playing" | "finished">(),
    hostPlayerId: uuid("host_player_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sessions_code_unique").on(t.code)]
);

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  seatOrder: integer("seat_order").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const games = pgTable("games", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
