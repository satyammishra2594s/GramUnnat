import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appStates = pgTable("app_states", {
  userKey: text("user_key").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
