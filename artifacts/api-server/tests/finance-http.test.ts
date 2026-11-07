import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
process.env.DATABASE_URL='postgres://unused:unused@localhost/unused';
const {initializeFinance}=await import('../src/lib/commission');
const {addFinanceRoutes}=await import('../src/lib/finance-routes');
test('financeiro HTTP confirma senha, impede saldo negativo e duplica apenas a resposta, nunca o acerto',async()=>{
 const pg=new PGlite(); const db=drizzle(pg);const hash=await bcrypt.hash('test-password',4);
 await pg.exec(`CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,mode text,active boolean DEFAULT true,deleted_at timestamptz,password_hash text); CREATE TABLE rides(id varchar(100) PRIMARY KEY,driver_id varchar(100),status text); INSERT INTO users(id,name,mode) VALUES('admin','Admin','admin'),('driver','Driver','driver'); INSERT INTO rides VALUES('ride','driver','finished');`);
 await pg.query(`UPDATE users SET password_hash=$1 WHERE id='admin'`,[hash]);
 await initializeFinance(db as never);
 await pg.exec(`INSERT INTO ride_financials(ride_id,base_cents,fee_cents,rate_bps) VALUES('ride',600,50,833)`);
 const app=express();app.use(express.json());const router=express.Router();
 addFinanceRoutes(router,(req,res,next)=>{if(req.headers.authorization!=='Bearer test-admin'){res.status(403).json({error:'denied'});return;}req.authUser={id:'admin'} as never;next();},db as never);app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();assert(addr&&typeof addr!=='string');const base=`http://127.0.0.1:${addr.port}/admin/finance`;
 const send=async(path:string,body:object,method='POST')=>fetch(base+path,{method,headers:{Authorization:'Bearer test-admin','Content-Type':'application/json'},body:JSON.stringify({currentPassword:'test-password',...body})});
 const receipt={id:'00000000-0000-4000-8000-000000000001',driverId:'driver',amountCents:20,note:'teste'};
 try{
  assert.equal((await fetch(base)).status,403);
  assert.equal((await send('/settings',{enabled:true,rateBps:833,currentPassword:'wrong'},'PUT')).status,403);
  assert.equal((await send('/settings',{enabled:true,rateBps:833},'PUT')).status,200);
  assert.equal(Number((await pg.query(`SELECT count(*) FROM platform_fee_audit`)).rows[0].count),1);
  assert.equal((await send('/settlements',{...receipt,amountCents:51})).status,409);
  assert.equal((await send('/settlements',receipt)).status,200);
  assert.equal((await send('/settlements',receipt)).status,200);
  assert.equal(Number((await pg.query(`SELECT count(*) FROM driver_settlements`)).rows[0].count),1);
  const summary=await (await fetch(base,{headers:{Authorization:'Bearer test-admin'}})).json();assert.equal(summary.drivers[0].balance,0.3);
  assert.equal((await send(`/settlements/${receipt.id}/void`,{reason:'Lançamento incorreto'})).status,200);
  assert.equal((await send(`/settlements/${receipt.id}/void`,{reason:'Repetição'})).status,200);
  const after=await (await fetch(base,{headers:{Authorization:'Bearer test-admin'}})).json();assert.equal(after.drivers[0].balance,0.5);assert.equal(after.settlements[0].voidReason,'Lançamento incorreto');
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await pg.close();}
});
