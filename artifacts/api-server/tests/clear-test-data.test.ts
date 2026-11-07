import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
process.env.DATABASE_URL = 'postgres://unused:unused@localhost/unused';
const { clearTestData } = await import('../src/lib/clear-test-data');

function database(active = false, fail = false) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      const sql = typeof config === 'string' ? config : config.text;
      queries.push({ sql, params });
      if (sql.startsWith('select') && sql.includes('from "rides"')) return { rows: active ? [['active-ride']] : [] };
      if (sql.startsWith('select') && sql.includes('from "users"')) return { rows: [['driver-id']] };
      if (fail && sql.startsWith('delete from "rides"')) throw new Error('simulated database failure');
      return { rows: [] };
    },
  };
  return { queries, db: drizzle(client as never) };
}

test('limpeza completa revoga sessões e exclui apenas não administradores, mantendo tarifas por padrão', async () => {
  const fake = database();
  assert.deepEqual(await clearTestData('all', false, fake.db as never), ['driver-id']);
  const deletion = fake.queries.find(q => q.sql.startsWith('delete from "users"'))!;
  assert.match(deletion.sql, /where "users"\."mode" <> \$1/);
  assert.deepEqual(deletion.params, ['admin']);
  const sessions = fake.queries.find(q => q.sql.startsWith('delete from "sessions"'))!;
  assert.match(sessions.sql, /select "id" from "users" where "users"\."mode" <> \$1/);
  assert.deepEqual(sessions.params, ['admin']);
  assert(!fake.queries.some(q => q.sql.startsWith('delete from "pricing_rules"')));
  assert.equal(fake.queries.at(-1)?.sql, 'commit');
});
test('limpeza de corridas mantém usuários e sessões, tarifas só são removidas quando selecionadas', async () => {
  const fake = database(); await clearTestData('rides', true, fake.db as never);
  assert(!fake.queries.some(q => /^delete from "(users|sessions)"/.test(q.sql)));
  assert(fake.queries.some(q => q.sql.startsWith('delete from "pricing_rules"')));
  assert(fake.queries.some(q => q.sql.startsWith('update "users" set "rating" =')));
});
test('corrida ativa bloqueia qualquer exclusão e desfaz a transação', async () => {
  const fake = database(true);
  await assert.rejects(clearTestData('all', true, fake.db as never), /ACTIVE_RIDES/);
  assert(!fake.queries.some(q => q.sql.startsWith('delete')));
  assert.equal(fake.queries.at(-1)?.sql, 'rollback');
});
test('falha no banco desfaz a transação inteira', async () => {
  const fake = database(false, true);
  await assert.rejects(clearTestData('all', true, fake.db as never), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message === 'simulated database failure');
  assert.equal(fake.queries.at(-1)?.sql, 'rollback');
  assert(!fake.queries.some(q => q.sql === 'commit'));
});
