import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
process.env.DATABASE_URL='postgres://unused:unused@localhost/unused';
const {getAdminHistory,parseHistoryQuery,recifeTodayStart}=await import('../src/lib/admin-history');

test('resumo de hoje troca o dia à meia-noite de Recife, não às 21h',()=>{
 assert.equal(recifeTodayStart(new Date('2026-11-09T02:59:59Z')).toISOString(),'2026-11-08T03:00:00.000Z');
 assert.equal(recifeTodayStart(new Date('2026-11-09T03:00:00Z')).toISOString(),'2026-11-09T03:00:00.000Z');
});
test('período rejeita datas inexistentes, ordem invertida e consultas excessivas',()=>{
 for(const q of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-11-09',to:'2026-11-08'},{from:'2024-01-01',to:'2026-01-01'},{from:['2026-11-08'],to:'2026-11-08'},{from:'2026-11-08',to:'2026-11-08',page:'1;DROP TABLE rides'}])assert.throws(()=>parseHistoryQuery(q));
 assert.equal(parseHistoryQuery({from:'2024-02-29',to:'2024-03-01'}).page,1);
});
test('histórico usa meia-noite de Recife, inclui dias zerados e pagina sem fotos',async()=>{
 const pg=new PGlite();const db=drizzle(pg);
 try {
 await pg.exec(`CREATE TABLE rides(id text PRIMARY KEY,client_name text,driver_name text,origin text,destination text,status text,vehicle_type text,price numeric(10,2),payment text,created_at timestamptz,finished_at timestamptz,client_photo text);`);
 const add=async(id:string,date:string,status:string,price:number,name='Maria')=>pg.query(`INSERT INTO rides VALUES($1,$2,'José','Centro','Bairro',$3,'motorcycle',$4,'pix',$5,NULL,'photo-not-for-report')`,[id,name,status,price,date]);
 await add('before','2026-11-08T02:59:59Z','finished',100);
 await add('start','2026-11-08T03:00:00Z','finished',6.5);
 await add('end','2026-11-09T02:59:59Z','cancelled',10);
 await add('active','2026-11-08T12:00:00Z','accepted',20);
 await add('after','2026-11-09T03:00:00Z','finished',200);
 let result=await getAdminHistory(parseHistoryQuery({from:'2026-11-08',to:'2026-11-08'}),db as never);
 assert.deepEqual(result.summary,{total:3,finished:1,cancelled:1,active:1,revenue:6.5});
 assert.deepEqual(result.rides.map(r=>r.id),['end','active','start']);
 assert(!JSON.stringify(result).includes('photo-not-for-report'));
 result=await getAdminHistory(parseHistoryQuery({from:'2026-11-06',to:'2026-11-08'}),db as never);
 assert.equal(result.daily.length,3);assert.equal(result.daily[2].total,0);
 for(let i=0;i<30;i++)await add(`bulk-${String(i).padStart(3,'0')}`,'2026-11-08T15:00:00Z','finished',6,'Pedro');
 result=await getAdminHistory(parseHistoryQuery({from:'2026-11-08',to:'2026-11-08',search:'Pedro',page:'1'}),db as never);
 assert.equal(result.summary.total,30);assert.equal(result.rides.length,25);assert.equal(result.pages,2);assert.equal(result.summary.revenue,180);
 const second=await getAdminHistory(parseHistoryQuery({from:'2026-11-08',to:'2026-11-08',search:'Pedro',page:'2'}),db as never);
 assert.equal(second.rides.length,5);assert(!second.rides.some(r=>result.rides.some(first=>first.id===r.id)));
 const empty=await getAdminHistory(parseHistoryQuery({from:'2026-11-08',to:'2026-11-08',search:"' OR 1=1 --"}),db as never);
 assert.equal(empty.summary.total,0);
 }finally{await pg.close();}
});
