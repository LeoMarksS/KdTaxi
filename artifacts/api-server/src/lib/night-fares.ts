import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface NightFares {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string;
  carPrice: number;
  motorcyclePrice: number;
}
export const defaultNightFares: NightFares = {
  enabled: false,
  start: "00:00",
  end: "05:00",
  timeZone: "America/Recife",
  carPrice: 25,
  motorcyclePrice: 10,
};
const validTime = (v: unknown): v is string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
export function validNightFares(v: unknown): v is NightFares {
  if (!v || typeof v !== "object") return false;
  const s = v as NightFares;
  if (
    typeof s.enabled !== "boolean" ||
    !validTime(s.start) ||
    !validTime(s.end) ||
    s.start === s.end ||
    typeof s.timeZone !== "string" ||
    s.timeZone.length > 80 ||
    ![s.carPrice, s.motorcyclePrice].every(
      (p) =>
        typeof p === "number" &&
        Number.isFinite(p) &&
        p >= 0 &&
        p <= 9999999.99 &&
        Math.abs(p * 100 - Math.round(p * 100)) < 0.00001,
    )
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
export function isNightFare(s: NightFares, at = new Date()): boolean {
  if (!s.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: s.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const now =
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value);
  const start = minutes(s.start),
    end = minutes(s.end);
  return start < end ? now >= start && now < end : now >= start || now < end;
}
export async function initializeNightFares(database = db) {
  await database.transaction(async (tx) => {
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS night_fare_settings (
      id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
      start_time varchar(5) NOT NULL DEFAULT '00:00', end_time varchar(5) NOT NULL DEFAULT '05:00',
      time_zone varchar(80) NOT NULL DEFAULT 'America/Recife',
      car_price numeric(10,2) NOT NULL DEFAULT 25 CHECK(car_price>=0),
      motorcycle_price numeric(10,2) NOT NULL DEFAULT 10 CHECK(motorcycle_price>=0),
      updated_at timestamptz NOT NULL DEFAULT now())`);
    await tx.execute(
      sql`INSERT INTO night_fare_settings(id) VALUES(1) ON CONFLICT DO NOTHING`,
    );
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS night_fare_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, admin_id varchar(100) NOT NULL,
      settings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  });
}
export async function getNightFares(
  executor: Pick<typeof db, "execute"> = db,
): Promise<NightFares> {
  const result = await executor.execute(
    sql`SELECT enabled,start_time,end_time,time_zone,car_price,motorcycle_price FROM night_fare_settings WHERE id=1`,
  );
  const r = result.rows[0];
  if (!r) throw new Error("MISSING_NIGHT_FARES");
  return {
    enabled: r.enabled === true,
    start: String(r.start_time),
    end: String(r.end_time),
    timeZone: String(r.time_zone),
    carPrice: Number(r.car_price),
    motorcyclePrice: Number(r.motorcycle_price),
  };
}
export async function saveNightFares(
  s: NightFares,
  adminId: string,
  database = db,
) {
  await database.transaction(async (tx) => {
    await tx.execute(
      sql`UPDATE night_fare_settings SET enabled=${s.enabled},start_time=${s.start},end_time=${s.end},time_zone=${s.timeZone},car_price=${s.carPrice},motorcycle_price=${s.motorcyclePrice},updated_at=now() WHERE id=1`,
    );
    await tx.execute(
      sql`INSERT INTO night_fare_audit(admin_id,settings) VALUES(${adminId},${JSON.stringify(s)}::jsonb)`,
    );
  });
}
