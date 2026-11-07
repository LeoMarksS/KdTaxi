import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

export function calculateCommission(base: number, rateBps: number, enabled: boolean) {
  const baseCents = Math.round(base * 100);
  if (!Number.isFinite(base) || base < 0 || !Number.isSafeInteger(baseCents) || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error('INVALID_COMMISSION');
  const appliedBps = enabled ? rateBps : 0;
  const feeCents = Math.floor((baseCents * appliedBps + 5000) / 10000);
  if (baseCents + feeCents > 9999999999) throw new Error('PRICE_LIMIT');
  return { baseCents, feeCents, rateBps: appliedBps, total: (baseCents + feeCents) / 100 };
}

export async function initializeFinance(database = db) {
  await database.transaction(async tx => {
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS platform_fee_settings (
      id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
      rate_bps integer NOT NULL DEFAULT 833 CHECK(rate_bps BETWEEN 0 AND 10000), updated_at timestamptz NOT NULL DEFAULT now())`);
    await tx.execute(sql`INSERT INTO platform_fee_settings(id) VALUES(1) ON CONFLICT DO NOTHING`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS ride_financials (
      ride_id varchar(100) PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
      base_cents bigint NOT NULL CHECK(base_cents>=0), fee_cents bigint NOT NULL CHECK(fee_cents>=0),
      rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000), created_at timestamptz NOT NULL DEFAULT now())`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS driver_settlements (
      id uuid PRIMARY KEY, driver_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount_cents bigint NOT NULL CHECK(amount_cents>0), note varchar(300) NOT NULL DEFAULT '',
      admin_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
      voided_at timestamptz, voided_by varchar(100) REFERENCES users(id), void_reason varchar(300))`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS driver_settlements_driver_idx ON driver_settlements(driver_id)`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS platform_fee_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, admin_id varchar(100) NOT NULL,
      enabled boolean NOT NULL, rate_bps integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  });
}

export async function getFeeSettings(executor: Pick<typeof db, 'execute'> = db, lock = false) {
  const result = await executor.execute(sql`SELECT enabled, rate_bps FROM platform_fee_settings WHERE id=1 ${lock ? sql`FOR SHARE` : sql``}`);
  const row = result.rows[0];
  if (!row) throw new Error('MISSING_FEE_SETTINGS');
  return { enabled: row.enabled === true, rateBps: Number(row.rate_bps) };
}

export async function driverBalance(executor: Pick<typeof db, 'execute'>, id: string) {
  const result = await executor.execute(sql`SELECT
    COALESCE((SELECT sum(f.fee_cents) FROM ride_financials f JOIN rides r ON r.id=f.ride_id WHERE r.driver_id=${id} AND r.status='finished'),0)::text AS earned,
    COALESCE((SELECT sum(amount_cents) FROM driver_settlements WHERE driver_id=${id} AND voided_at IS NULL),0)::text AS received`);
  return Number(result.rows[0].earned) - Number(result.rows[0].received);
}
