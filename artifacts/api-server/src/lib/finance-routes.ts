import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import type { Router, RequestHandler } from 'express';
import { db as defaultDb } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { driverBalance, getFeeSettings } from './commission';

export function addFinanceRoutes(router: Router, requireAdmin: RequestHandler, db = defaultDb) {
  const sensitive = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });
  const password: RequestHandler = async (req, res, next) => {
    const result = await db.execute(sql`SELECT password_hash FROM users WHERE id=${req.authUser!.id} AND mode='admin' AND active=true AND deleted_at IS NULL`);
    const hash = result.rows[0]?.password_hash;
    if (typeof req.body.currentPassword !== 'string' || typeof hash !== 'string' || !(await bcrypt.compare(req.body.currentPassword, hash))) {
      res.status(403).json({ error: 'Informe sua senha atual para confirmar.' }); return;
    }
    next();
  };
  router.get('/admin/finance', requireAdmin, async (_req, res) => {
    const settings = await getFeeSettings(db);
    const result = await db.execute(sql`WITH fees AS (
      SELECT r.driver_id, count(*)::int AS rides, sum(f.base_cents)::text AS base, sum(f.fee_cents)::text AS fees
      FROM rides r JOIN ride_financials f ON f.ride_id=r.id WHERE r.status='finished' AND r.driver_id IS NOT NULL GROUP BY r.driver_id
    ), paid AS (SELECT driver_id, sum(amount_cents)::text AS received FROM driver_settlements WHERE voided_at IS NULL GROUP BY driver_id)
    SELECT u.id, u.name, (u.deleted_at IS NOT NULL) AS deleted, COALESCE(f.rides,0) AS rides,
    COALESCE(f.base,'0') AS base, COALESCE(f.fees,'0') AS fees, COALESCE(p.received,'0') AS received
    FROM users u LEFT JOIN fees f ON f.driver_id=u.id LEFT JOIN paid p ON p.driver_id=u.id
    WHERE u.mode='driver' OR f.driver_id IS NOT NULL OR p.driver_id IS NOT NULL ORDER BY u.name`);
    const history = await db.execute(sql`SELECT s.id, s.driver_id AS "driverId", u.name AS "driverName", s.amount_cents::text AS cents, s.note,
      s.created_at AS "createdAt", s.voided_at AS "voidedAt", s.void_reason AS "voidReason"
      FROM driver_settlements s JOIN users u ON u.id=s.driver_id ORDER BY s.created_at DESC LIMIT 100`);
    res.json({ settings, drivers: result.rows.map(r => ({ id: r.id, name: r.name, deleted: r.deleted, rides: Number(r.rides),
      base: Number(r.base)/100, fees: Number(r.fees)/100, received: Number(r.received)/100, balance: (Number(r.fees)-Number(r.received))/100 })),
      settlements: history.rows.map(r => ({ ...r, amount: Number(r.cents)/100 })) });
  });
  router.put('/admin/finance/settings', requireAdmin, sensitive, password, async (req, res) => {
    const { enabled, rateBps } = req.body;
    if (typeof enabled !== 'boolean' || !Number.isInteger(rateBps) || rateBps<0 || rateBps>10000) { res.status(400).json({ error: 'Informe uma porcentagem entre 0 e 100, com até duas casas decimais.' }); return; }
    await db.transaction(async tx => {
      await tx.execute(sql`UPDATE platform_fee_settings SET enabled=${enabled}, rate_bps=${rateBps}, updated_at=now() WHERE id=1`);
      await tx.execute(sql`INSERT INTO platform_fee_audit(admin_id,enabled,rate_bps) VALUES(${req.authUser!.id},${enabled},${rateBps})`);
    });
    res.json({ ok: true });
  });
  router.post('/admin/finance/settlements', requireAdmin, sensitive, password, async (req, res) => {
    const { driverId, amountCents, id, note = '' } = req.body;
    if (typeof driverId!=='string' || driverId.length>100 || !Number.isSafeInteger(amountCents) || amountCents<=0 || amountCents>9999999999 || typeof id!=='string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || typeof note!=='string' || note.length>300) {
      res.status(400).json({ error: 'Motorista, valor ou referência do acerto inválidos.' }); return;
    }
    const result = await db.transaction(async tx => {
      // One driver lock serializes receipts, reversals and duplicate submissions.
      const account = await tx.execute(sql`SELECT id FROM users WHERE id=${driverId} FOR UPDATE`);
      if (!account.rows.length) return 'missing';
      const previous = await tx.execute(sql`SELECT driver_id,amount_cents::text AS amount FROM driver_settlements WHERE id=${id}::uuid`);
      if (previous.rows.length) return previous.rows[0].driver_id===driverId && Number(previous.rows[0].amount)===amountCents ? 'ok' : 'conflict';
      if (amountCents > await driverBalance(tx, driverId)) return 'exceeds';
      await tx.execute(sql`INSERT INTO driver_settlements(id,driver_id,amount_cents,note,admin_id) VALUES(${id}::uuid,${driverId},${amountCents},${note},${req.authUser!.id})`);
      return 'ok';
    });
    if (result!=='ok') { res.status(409).json({ error: result==='exceeds' ? 'O valor excede o saldo devido. Atualize o painel.' : 'Não foi possível registrar este acerto. Atualize o painel.' }); return; }
    res.json({ ok: true });
  });
  router.post('/admin/finance/settlements/:id/void', requireAdmin, sensitive, password, async (req,res) => {
    const { reason } = req.body;
    if (typeof reason!=='string' || !reason.trim() || reason.length>300 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(req.params.id))) { res.status(400).json({error:'Informe o motivo da correção.'}); return; }
    const row = await db.execute(sql`SELECT driver_id FROM driver_settlements WHERE id=${String(req.params.id)}::uuid`);
    if (!row.rows.length) {res.status(404).json({error:'Acerto não encontrado.'});return;}
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM users WHERE id=${row.rows[0].driver_id} FOR UPDATE`);
      await tx.execute(sql`UPDATE driver_settlements SET voided_at=now(),voided_by=${req.authUser!.id},void_reason=${reason.trim()} WHERE id=${String(req.params.id)}::uuid AND voided_at IS NULL`);
    });
    res.json({ok:true});
  });
}
