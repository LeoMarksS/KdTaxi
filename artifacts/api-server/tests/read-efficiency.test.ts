import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableColumns, getTableName } from 'drizzle-orm';
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
const schema = await import('@workspace/db');
const queries: string[] = [];
const pg = new PGlite();
const local = drizzle(pg, { logger: { logQuery(query) { queries.push(query); } } });
// Exercise the real Express routes against an isolated PostgreSQL database.
for (const table of [schema.users, schema.sessions, schema.rides]) {
  await pg.exec(`CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table)).map(c => `"${c.name}" ${c.getSQLType()}`).join(',')})`);
}
for (const method of ['select', 'insert', 'update', 'delete', 'transaction'] as const) {
  (schema.db as any)[method] = (local[method] as Function).bind(local);
}
const { default: app } = await import('../src/app');
const { authenticateSocketToken } = await import('../src/routes/taxi');

test('consultas reais preservam totais, visibilidade e revogação sem transferir fotos desnecessárias', async () => {
  const now = new Date();
  for (const [id, mode] of [['admin','admin'], ['client','client'], ['other','client'], ['driver','driver']]) {
    await local.insert(schema.users).values({ id, mode, name: id, phone: id, passwordHash: 'unused', photo: 'x'.repeat(200000), active: true, approvalStatus: id === 'driver' ? 'pending' : 'approved', isOnline: false, rating: id === 'client' ? 4 : 0, rideCount: id === 'client' ? 2 : 0, createdAt: now });
    await local.insert(schema.sessions).values({ token: (id === 'admin' ? 'a' : id === 'client' ? 'b' : id === 'driver' ? 'c' : 'd').repeat(64), userId: id, expiresAt: Date.now()+100000 });
  }
  for (let i=0;i<9;i++) await local.insert(schema.rides).values({ id: `ride-${i}`, clientId: i < 2 ? 'client' : 'other', clientName: 'C', clientPhone: '123', clientPhoto: 'y'.repeat(200000), origin: 'A', destination: 'B', vehicleType: 'car', status: i === 0 ? 'finished' : i === 1 ? 'cancelled' : 'waiting', price: 20, createdAt: now });
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(r => server.once('listening',r));
  const addr=server.address();assert(addr&&typeof addr!=='string');
  const get=async(path:string,token='a')=>{const res=await fetch(`http://127.0.0.1:${addr.port}/api${path}`,{headers:{Authorization:`Bearer ${token.repeat(64)}`}});assert.equal(res.status,200,path);return res.json();};
  try {
    const stats=await get('/admin/stats');
    assert.equal(stats.totalUsers,3); assert.equal(stats.totalClients,2); assert.equal(stats.totalDrivers,1);
    assert.equal(stats.totalRides,9); assert.equal(stats.finishedRides,1);assert.equal(stats.cancelledRides,1);assert.equal(stats.activeRides,7);assert.equal(stats.totalRevenue,20);assert.equal(stats.todayRevenue,20);assert.equal(stats.avgRating,4);
    const aggregates=queries.filter(q=>q.includes('count(*)'));
    assert(aggregates.length>=2);assert(aggregates.every(q=>!q.includes('photo')));
    assert.deepEqual((await get('/rides','b')).map((r:any)=>r.id).sort(),['ride-0','ride-1']);
    assert.deepEqual((await get('/users/client/rides','b')).map((r:any)=>r.id),['ride-0']);
    assert.deepEqual(await get('/rides','c'),[]); // Pending drivers cannot see open requests.
    const summary=await get('/rides?summary=1');assert.equal(summary.length,6);assert(summary.every((r:any)=>!r.clientPhoto&&!r.driverPhoto));
    assert.deepEqual(await get('/admin/pending-drivers'),[{id:'driver'}]);
    queries.length=0;
    assert(await authenticateSocketToken('b'.repeat(64),false));
    const profileQuery=queries.find(q=>q.includes('from "users"'));assert(profileQuery);assert(!profileQuery.includes('"users"."photo"'));
    await pg.exec(`UPDATE users SET active=false WHERE id='client'`);
    assert.equal(await authenticateSocketToken('b'.repeat(64),false),undefined);
    assert.equal(await authenticateSocketToken('b'.repeat(64)),undefined);
  } finally { server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await pg.close(); }
});
