import {
  pgTable,
  varchar,
  uuid,
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
  vehicleBrand: varchar("vehicle_brand", { length: 80 }),
  vehicleModel: varchar("vehicle_model", { length: 80 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  vehiclePlate: varchar("vehicle_plate", { length: 10 }),
  approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("approved"),
  active: boolean("active").notNull().default(true),
  isOnline: boolean("is_online").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
  check("users_approval_check", sql`${table.approvalStatus} in ('pending', 'approved', 'rejected')`),
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
  driverVehicleBrand: varchar("driver_vehicle_brand", { length: 80 }),
  driverVehicleModel: varchar("driver_vehicle_model", { length: 80 }),
  driverVehicleColor: varchar("driver_vehicle_color", { length: 50 }),
  driverVehiclePlate: varchar("driver_vehicle_plate", { length: 10 }),

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

// Taxa adicionada à tarifa base; desativada por padrão no lançamento.
export const platformFeeSettings = pgTable('platform_fee_settings', {
  id: integer('id').primaryKey(), enabled: boolean('enabled').notNull().default(false),
  rateBps: integer('rate_bps').notNull().default(833),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('platform_fee_settings_id_check', sql`${t.id}=1`), check('platform_fee_settings_rate_bps_check', sql`${t.rateBps} BETWEEN 0 AND 10000`)]);
export const rideFinancials = pgTable('ride_financials', {
  rideId: varchar('ride_id', { length: 100 }).primaryKey().references(() => rides.id, { onDelete: 'cascade' }),
  baseCents: bigint('base_cents', { mode: 'number' }).notNull(),
  feeCents: bigint('fee_cents', { mode: 'number' }).notNull(), rateBps: integer('rate_bps').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('ride_financials_base_cents_check', sql`${t.baseCents}>=0`),check('ride_financials_fee_cents_check', sql`${t.feeCents}>=0`),check('ride_financials_rate_bps_check', sql`${t.rateBps} BETWEEN 0 AND 10000`)]);
export const driverSettlements = pgTable('driver_settlements', {
  id: uuid('id').primaryKey(), driverId: varchar('driver_id', { length: 100 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(), note: varchar('note', { length: 300 }).notNull().default(''),
  adminId: varchar('admin_id', { length: 100 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp('voided_at', { withTimezone: true }), voidedBy: varchar('voided_by', { length: 100 }).references(() => users.id), voidReason: varchar('void_reason', { length: 300 }),
}, t => [index('driver_settlements_driver_idx').on(t.driverId),check('driver_settlements_amount_cents_check', sql`${t.amountCents}>0`)]);
export const platformFeeAudit = pgTable('platform_fee_audit', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(), adminId: varchar('admin_id', { length: 100 }).notNull(),
  enabled: boolean('enabled').notNull(), rateBps: integer('rate_bps').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
