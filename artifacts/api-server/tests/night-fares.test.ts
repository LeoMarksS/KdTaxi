import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableColumns, getTableName } from 'drizzle-orm';
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
const schema = await import('@workspace/db');
const { defaultNightFares, validNightFares, isNightFare, initializeNightFares } = await import('../src/lib/night-fares');
const { initializeFinance } = await import('../src/lib/commission');

test('tarifa usa o fuso local e os limites exatos, inclusive janela que cruza a meia-noite', () => {
  const s = { ...defaultNightFares, enabled: true };
  for (const [time, expected] of [['02:59:59',false],['03:00:00',true],['07:59:59',true],['08:00:00',false]]) {
    assert.equal(isNightFare(s,new Date(`2026-11-13T${time}Z`)),expected,time);
  }
  assert.equal(isNightFare(defaultNightFares,new Date('2026-11-13T04:00:00Z')),false);
  assert.equal(isNightFare({...s,start:'22:00',end:'05:00'},new Date('2026-11-13T02:00:00Z')),true);
  assert.equal(validNightFares(s),true);
  for (const change of [{start:'24:00'},{end:'00:00'},{timeZone:'invalid'},{carPrice:-1},{carPrice:25.001},{enabled:'true'},{motorcyclePrice:NaN}]) assert.equal(validNightFares({...s,...change}),false);
});

test('API configura horário, aplica tarifa por categoria, mantém preço solicitado e impede confirmação desatualizada', async () => {
  const pg=new PGlite(); const local=drizzle(pg);
  for (const table of [schema.users,schema.sessions,schema.rides,schema.pricingRules]) await pg.exec(`CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table)).map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?' PRIMARY KEY':''}`).join(',')})`);
  for (const method of ['select','insert','update','delete','execute','transaction'] as const) (schema.db as any)[method]=(local[method] as Function).bind(local);
  await initializeNightFares(schema.db); await initializeNightFares(schema.db); await initializeFinance(schema.db);
  const now=new Date();
  for (const [id,mode,token] of [['admin','admin','a'],['client','client','b']]) {
    await local.insert(schema.users).values({id,mode,name:id,phone:id,passwordHash:'unused',active:true,isOnline:false,approvalStatus:'approved',rating:0,rideCount:0,createdAt:now});
    await local.insert(schema.sessions).values({token:token.repeat(64),userId:id,expiresAt:Date.now()+100000});
  }
  await local.insert(schema.pricingRules).values([{id:'local',destination:'Local',carPrice:20,motorcyclePrice:6,isLocal:true,createdAt:now},{id:'intercity',destination:'Cidade vizinha',carPrice:100,motorcyclePrice:50,isLocal:false,createdAt:now}]);
  const {default:app}=await import('../src/app');
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const addr=server.address();assert(addr&&typeof addr!=='string');
  const req=async(path:string,method='GET',body?:object,token='a')=>fetch(`http://127.0.0.1:${addr.port}/api${path}`,{method,headers:{Authorization:`Bearer ${token.repeat(64)}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  try {
    assert.equal((await req('/admin/night-fares','GET',undefined,'b')).status,403);
    assert.equal((await req('/admin/night-fares','PUT',{...defaultNightFares,start:'invalid'})).status,400);
    const getPrice=async(vehicle='car',destination='Centro')=>(await req(`/pricing/lookup?destination=${encodeURIComponent(destination)}&vehicleType=${vehicle}`,'GET',undefined,'b')).json();
    assert.equal((await getPrice()).price,20);
    // Build a night interval around the current local minute, independent of test time.
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Recife',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).split(':').map(Number);
    const minute=parts[0]*60+parts[1];const clock=(n:number)=>`${String(Math.floor(((n+1440)%1440)/60)).padStart(2,'0')}:${String(((n+1440)%1440)%60).padStart(2,'0')}`;
    const s={...defaultNightFares,enabled:true,start:clock(minute-10),end:clock(minute+10)};
    assert.equal((await req('/admin/night-fares','PUT',s)).status,200);
    assert.equal((await getPrice()).price,25);assert.equal((await getPrice('motorcycle')).price,10);assert.equal((await getPrice('car','Cidade vizinha')).price,100);
    const body={clientId:'client',origin:'Casa',destination:'Centro',vehicleType:'car',payment:'dinheiro'};
    assert.equal((await req('/request-ride','POST',{...body,expectedPrice:20},'b')).status,409);
    assert.equal((await local.select().from(schema.rides)).length,0);
    const response=await req('/request-ride','POST',{...body,expectedPrice:25},'b');assert.equal(response.status,200);const ride=await response.json();assert.equal(ride.price,25);
    assert.equal((await req('/admin/night-fares','PUT',{...s,enabled:false})).status,200);
    assert.equal((await getPrice()).price,20);
    assert.equal((await local.select().from(schema.rides))[0].price,25);
    await pg.exec('UPDATE platform_fee_settings SET enabled=true');
    assert.equal((await getPrice('motorcycle')).price,6.5);
    await req('/admin/night-fares','PUT',s);
    assert.equal((await getPrice('motorcycle')).price,10.83);
    assert.equal(Number((await pg.query('SELECT count(*) FROM night_fare_audit')).rows[0].count),3);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await pg.close();}
});
