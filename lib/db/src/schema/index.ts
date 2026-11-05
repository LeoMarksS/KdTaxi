import {
  pgTable,
  varchar,
  text,
  boolean,
  integer,
  doublePrecision,
  numeric,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Usuários: passageiros, motoristas e administradores
export const users = pgTable("users", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  mode: varchar("mode", { length: 20 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 20 }),
  active: boolean("active").notNull().default(true),
  photo: text("photo"),
  pushToken: text("push_token"),
  rating: doublePrecision("rating").notNull().default(0),
  rideCount: integer("ride_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_phone_unique").on(table.phone),
  check("users_rating_check", sql`${table.rating} >= 0 and ${table.rating} <= 5`),
  check("users_ride_count_check", sql`${table.rideCount} >= 0`),
  check("users_mode_check", sql`${table.mode} in ('client', 'driver', 'admin')`),
  check("users_vehicle_check", sql`${table.vehicleType} is null or ${table.vehicleType} in ('car', 'motorcycle')`),
]);

// Sessões de autenticação
export const sessions = pgTable("sessions", {
  token: varchar("token", { length: 128 }).primaryKey(),
  userId: varchar("user_id", { length: 100 }).notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

// Corridas
export const rides = pgTable("rides", {
  id: varchar("id", { length: 100 }).primaryKey(),

  clientId: varchar("client_id", { length: 100 }).notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  clientName: varchar("client_name", { length: 150 }).notNull(),
  clientPhone: varchar("client_phone", { length: 30 }).notNull(),
  clientPhoto: text("client_photo"),
  clientAvgRating: doublePrecision("client_avg_rating"),
  clientRideCount: integer("client_ride_count"),

  driverId: varchar("driver_id", { length: 100 })
    .references(() => users.id, { onDelete: "restrict" }),
  driverName: varchar("driver_name", { length: 150 }),
  driverPhoto: text("driver_photo"),
  driverAvgRating: doublePrecision("driver_avg_rating"),
  driverRideCount: integer("driver_ride_count"),

  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  vehicleType: varchar("vehicle_type", { length: 20 }).notNull(),
  price: numeric("price", { precision: 10, scale: 2, mode: "number" }),
  payment: varchar("payment", { length: 20 }).default("dinheiro"),
  status: varchar("status", { length: 30 }).notNull().default("waiting"),

  clientRating: integer("client_rating"),
  driverRating: integer("driver_rating"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("rides_client_id_idx").on(table.clientId),
  index("rides_driver_id_idx").on(table.driverId),
  index("rides_status_idx").on(table.status),
  uniqueIndex("rides_one_active_per_driver_unique")
    .on(table.driverId)
    .where(sql`${table.driverId} is not null and ${table.status} in ('accepted', 'in_progress')`),
  index("rides_created_at_idx").on(table.createdAt),
  check("rides_price_check", sql`${table.price} is null or ${table.price} >= 0`),
  check("rides_vehicle_check", sql`${table.vehicleType} in ('car', 'motorcycle')`),
  check("rides_payment_check", sql`${table.payment} is null or ${table.payment} in ('pix', 'dinheiro')`),
  check("rides_status_check", sql`${table.status} in ('waiting', 'accepted', 'in_progress', 'finished', 'cancelled')`),
  check("rides_client_rating_check", sql`${table.clientRating} is null or (${table.clientRating} >= 1 and ${table.clientRating} <= 5)`),
  check("rides_driver_rating_check", sql`${table.driverRating} is null or (${table.driverRating} >= 1 and ${table.driverRating} <= 5)`),
]);

// Tarifas por destino e tarifa local
export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id", { length: 100 }).primaryKey(),
  destination: varchar("destination", { length: 200 }).notNull(),
  carPrice: numeric("car_price", { precision: 10, scale: 2, mode: "number" }),
  motorcyclePrice: numeric("motorcycle_price", { precision: 10, scale: 2, mode: "number" }),
  isLocal: boolean("is_local").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("pricing_rules_car_price_check", sql`${table.carPrice} is null or ${table.carPrice} >= 0`),
  check("pricing_rules_motorcycle_price_check", sql`${table.motorcyclePrice} is null or ${table.motorcyclePrice} >= 0`),
  uniqueIndex("pricing_rules_destination_unique")
    .on(sql`lower(${table.destination})`)
    .where(sql`${table.isLocal} = false`),
  uniqueIndex("pricing_rules_single_local_unique")
    .on(table.isLocal)
    .where(sql`${table.isLocal} = true`),
]);

// Mensagens do chat vinculadas a uma corrida
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id", { length: 100 }).primaryKey(),
  rideId: varchar("ride_id", { length: 100 }).notNull()
    .references(() => rides.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 100 }).notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  senderName: varchar("sender_name", { length: 150 }).notNull(),
  senderPhoto: text("sender_photo"),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("chat_messages_ride_timestamp_idx").on(table.rideId, table.timestamp),
  check("chat_messages_text_length_check", sql`char_length(${table.text}) <= 1000`),
]);

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type RideRecord = typeof rides.$inferSelect;
export type NewRideRecord = typeof rides.$inferInsert;
export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type NewChatMessageRecord = typeof chatMessages.$inferInsert;
export type SessionRecord = typeof sessions.$inferSelect;
export type PricingRuleRecord = typeof pricingRules.$inferSelect;
