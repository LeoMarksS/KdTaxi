import { db as defaultDb } from '@workspace/db';
import { sql } from 'drizzle-orm';
import type { Router, RequestHandler } from 'express';

const DAY = 86400000;
export function recifeTodayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return new Date(`${day}T00:00:00-03:00`);
}
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+time) && time.toISOString().slice(0,10) === value;
}
export function parseHistoryQuery(query: Record<string, unknown>) {
  const { from, to, search = '', page = '1' } = query;
  if (!validDay(from) || !validDay(to) || from > to || (+new Date(to) - +new Date(from))/DAY > 365) throw new Error('Escolha datas válidas, em ordem, com no máximo 366 dias por consulta.');
  if (typeof search !== 'string' || search.length > 100 || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) throw new Error('Busca ou página inválida.');
  return { from, to, search: search.trim(), page: Number(page) };
}
export async function getAdminHistory(query: ReturnType<typeof parseHistoryQuery>, db = defaultDb) {
  const { from, to, search } = query;
  // Date boundaries are interpreted by PostgreSQL in Recife, never in the server's UTC timezone.
  const match = search ? sql`AND (client_name ILIKE ${'%'+search+'%'} OR driver_name ILIKE ${'%'+search+'%'} OR origin ILIKE ${'%'+search+'%'} OR destination ILIKE ${'%'+search+'%'})` : sql``;
  const where = sql`created_at >= (${from}::date::timestamp AT TIME ZONE 'America/Recife') AND created_at < ((${to}::date + 1)::timestamp AT TIME ZONE 'America/Recife') ${match}`;
  // A consistent snapshot prevents totals and list from disagreeing while rides are being updated.
  return db.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const summaryResult = await tx.execute(sql`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='finished')::int AS finished,
      count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
      count(*) FILTER (WHERE status IN ('waiting','accepted','in_progress'))::int AS active,
      COALESCE(sum(price) FILTER (WHERE status='finished'),0)::text AS revenue
      FROM rides WHERE ${where}`);
    const raw = summaryResult.rows[0];
    const summary = { total: Number(raw.total), finished: Number(raw.finished), cancelled: Number(raw.cancelled), active: Number(raw.active), revenue: Number(raw.revenue) };
    const pages = Math.max(1,Math.ceil(summary.total/25)); const page = Math.min(query.page,pages);
    const dailyResult = await tx.execute(sql`SELECT to_char(created_at AT TIME ZONE 'America/Recife','YYYY-MM-DD') AS day,
      count(*)::int AS total, count(*) FILTER (WHERE status='finished')::int AS finished,
      count(*) FILTER (WHERE status='cancelled')::int AS cancelled,
      COALESCE(sum(price) FILTER (WHERE status='finished'),0)::text AS revenue
      FROM rides WHERE ${where} GROUP BY day ORDER BY day DESC`);
    const rows = await tx.execute(sql`SELECT id,client_name AS "clientName",driver_name AS "driverName",origin,destination,
      status,vehicle_type AS "vehicleType",price::text AS price,payment,created_at AS "createdAt",finished_at AS "finishedAt"
      FROM rides WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ${(page-1)*25}`);
    const days = new Map(dailyResult.rows.map(r=>[String(r.day),{day:String(r.day),total:Number(r.total),finished:Number(r.finished),cancelled:Number(r.cancelled),revenue:Number(r.revenue)}]));
    const daily = [];
    for(let time=+new Date(`${to}T00:00:00Z`); time>=+new Date(`${from}T00:00:00Z`);time-=DAY) {
      const day = new Date(time).toISOString().slice(0,10);
      daily.push(days.get(day) ?? {day,total:0,finished:0,cancelled:0,revenue:0});
    }
    return { from,to,search,timeZone:'America/Recife',summary,daily,page,pages,pageSize:25,
      rides:rows.rows.map(r=>({...r,price:r.price===null?null:Number(r.price)})) };
  });
}
export function addHistoryRoutes(router: Router, requireAdmin: RequestHandler) {
  router.get('/admin/history',requireAdmin,async(req,res)=>{
    let query;
    try { query=parseHistoryQuery(req.query as Record<string,unknown>); }
    catch(error) {res.status(400).json({error:error instanceof Error?error.message:'Período inválido.'});return;}
    res.json(await getAdminHistory(query));
  });
}
