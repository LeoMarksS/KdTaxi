import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.DATABASE_URL = 'postgres://unused:unused@localhost/unused';
const { calculateCommission, driverBalance } = await import('../src/lib/commission');
test('lançamento sem taxa mantém o preço original', () => {
  assert.deepEqual(calculateCommission(6,833,false),{baseCents:600,feeCents:0,rateBps:0,total:6});
});
test('8,33% produz 6,50 na moto e arredonda a taxa ao centavo por corrida', () => {
  assert.deepEqual(calculateCommission(6,833,true),{baseCents:600,feeCents:50,rateBps:833,total:6.5});
  assert.equal(calculateCommission(10,833,true).total,10.83);
  assert.equal(calculateCommission(20,833,true).total,21.67);
  assert.equal(calculateCommission(0.01,5000,true).feeCents,1);
});
test('configuração posterior não altera um cálculo já registrado', () => {
  const original=calculateCommission(6,833,false);
  calculateCommission(6,1000,true);
  assert.equal(original.total,6); assert.equal(original.feeCents,0);
});
test('recusa percentuais inválidos e total que excede o limite de armazenamento', () => {
  for(const p of [-1,10001,8.33,NaN]) assert.throws(()=>calculateCommission(6,p,true));
  assert.throws(()=>calculateCommission(-6,833,true));
  assert.throws(()=>calculateCommission(99999999.99,833,true));
});
test('saldo conta só corridas concluídas e recebimentos não anulados', async () => {
  let query='';
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const balance=await driverBalance({execute: async (q: any)=>{query=new PgDialect().sqlToQuery(q).sql;return {rows:[{earned:'150',received:'50'}]};}} as never,'driver');
  assert.equal(balance,100); assert.match(query,/status='finished'/); assert.match(query,/voided_at IS NULL/);
});
