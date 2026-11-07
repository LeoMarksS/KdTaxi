import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
process.env.DATABASE_URL='postgres://unused:unused@localhost/unused';
const { initializeFinance, calculateCommission, driverBalance, getFeeSettings }=await import('../src/lib/commission');

test('PostgreSQL isolado preserva lançamento, snapshots e acertos com integridade', async () => {
 const pg=new PGlite();const db=drizzle(pg);
 try {
  await pg.exec(`CREATE TABLE users(id varchar(100) PRIMARY KEY); CREATE TABLE rides(id varchar(100) PRIMARY KEY,driver_id varchar(100),status text);
  INSERT INTO users VALUES('admin'),('driver'); INSERT INTO rides VALUES('free','driver','finished'),('paid','driver','finished'),('cancelled','driver','cancelled'),('active','driver','in_progress');`);
  await initializeFinance(db as never); await initializeFinance(db as never);
  const initial=await getFeeSettings(db as never);assert.equal(initial.enabled,false);
  const free=calculateCommission(6,initial.rateBps,initial.enabled);
  await db.execute(sql`INSERT INTO ride_financials(ride_id,base_cents,fee_cents,rate_bps) VALUES('free',${free.baseCents},${free.feeCents},${free.rateBps})`);
  await db.execute(sql`UPDATE platform_fee_settings SET enabled=true,rate_bps=833 WHERE id=1`);
  const charge=calculateCommission(6,833,true);
  for(const id of ['paid','cancelled','active'])await db.execute(sql`INSERT INTO ride_financials(ride_id,base_cents,fee_cents,rate_bps) VALUES(${id},${charge.baseCents},${charge.feeCents},${charge.rateBps})`);
  assert.equal(await driverBalance(db as never,'driver'),50);
  const snapshot=await pg.query(`SELECT fee_cents FROM ride_financials WHERE ride_id='free'`);assert.equal(Number(snapshot.rows[0].fee_cents),0);
  await db.execute(sql`INSERT INTO driver_settlements(id,driver_id,amount_cents,admin_id) VALUES('00000000-0000-4000-8000-000000000001','driver',20,'admin')`);
  assert.equal(await driverBalance(db as never,'driver'),30);
  await db.execute(sql`UPDATE driver_settlements SET voided_at=now(),voided_by='admin',void_reason='Teste'`);
  assert.equal(await driverBalance(db as never,'driver'),50);
  await assert.rejects(pg.exec(`INSERT INTO driver_settlements(id,driver_id,amount_cents,admin_id) VALUES('00000000-0000-4000-8000-000000000001','driver',20,'admin')`));
  await assert.rejects(pg.exec(`INSERT INTO ride_financials(ride_id,base_cents,fee_cents,rate_bps) VALUES('missing',600,50,833)`));
  await assert.rejects(pg.exec(`UPDATE platform_fee_settings SET rate_bps=-1`));
  await assert.rejects(pg.exec(`DELETE FROM users WHERE id='driver'`));
  await pg.exec(`DELETE FROM driver_settlements; DELETE FROM rides`);
  assert.equal((await pg.query(`SELECT count(*) FROM ride_financials`)).rows[0].count,0);
 } finally {await pg.close();}
});
