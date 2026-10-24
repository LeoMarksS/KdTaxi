import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString ? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
}) : null;

export async function initDb() {
  if (!pool) {
    console.log("Sem DATABASE_URL - rodando em memória");
    return;
  }
  try {
    await pool.query(`
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS mode TEXT;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS photo TEXT;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS ride_count INT DEFAULT 0;
      ALTER TABLE contas ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessoes (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      );
    `);
    const adminId = '00000000-0000-0000-0000-000000000001';
    const adminExists = await pool.query(`SELECT id FROM contas WHERE phone = 'admin' OR email = 'admin' LIMIT 1`);
    if (adminExists.rows.length === 0) {
      const bcrypt = await import("bcryptjs");
      const hash = bcrypt.hashSync("admin123", 10);
      await pool.query(`
        INSERT INTO contas (id, nome, email, phone, senha, password_hash, tipo, mode, active, rating, ride_count, created_at)
        VALUES ($1, 'Administrador', 'admin', 'admin', 'admin123', $2, 'admin', 'admin', true, 0, 0, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [adminId, hash]);
      console.log("Admin criado no Neon com UUID", adminId);
    }
    console.log("✅ Neon conectado e tabelas verificadas");
  } catch (e) {
    console.error("Erro ao inicializar Neon:", e);
  }
}

export async function getUserByPhone(phone: string) {
  if (!pool) return null;
  const res = await pool.query(`SELECT * FROM contas WHERE phone = $1 OR email = $1 LIMIT 1`, [phone]);
  return res.rows[0] || null;
}

export async function getUserById(id: string) {
  if (!pool) return null;
  const res = await pool.query(`SELECT * FROM contas WHERE id = $1 LIMIT 1`, [id]);
  return res.rows[0] || null;
}

export async function createUserDb(user: any) {
  if (!pool) return;
  await pool.query(`
    INSERT INTO contas (id, nome, email, phone, senha, password_hash, tipo, mode, photo, vehicle_type, active, rating, ride_count, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
  `, [
    user.id, user.name, user.phone, user.phone, user.passwordHash, user.passwordHash,
    user.mode, user.mode, user.photo, user.vehicleType, true, 0, 0
  ]);
}

export async function createSessionDb(token: string, userId: string, expiresAt: number) {
  if (!pool) return;
  await pool.query(`INSERT INTO sessoes (token, user_id, expires_at) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET expires_at = $3`, [token, userId, expiresAt]);
}

export async function getSessionDb(token: string) {
  if (!pool) return null;
  const res = await pool.query(`SELECT * FROM sessoes WHERE token = $1 LIMIT 1`, [token]);
  return res.rows[0] || null;
}

export async function deleteSessionDb(token: string) {
  if (!pool) return;
  await pool.query(`DELETE FROM sessoes WHERE token = $1`, [token]);
}
