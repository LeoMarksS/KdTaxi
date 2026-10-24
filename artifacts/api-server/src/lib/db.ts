import { Pool } from "pg";
const connectionString = process.env.DATABASE_URL;
export const pool = connectionString ? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
}) : null;
export async function initDb() {
  if (!pool) { console.log("Sem DATABASE_URL - rodando em memória"); return; }
  try {
    await pool.query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS phone TEXT; ALTER TABLE contas ADD COLUMN IF NOT EXISTS mode TEXT; ALTER TABLE contas ADD COLUMN IF NOT EXISTS photo TEXT; ALTER TABLE contas ADD COLUMN IF NOT EXISTS vehicle_type TEXT; ALTER TABLE contas ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true; ALTER TABLE contas ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION DEFAULT 0; ALTER TABLE contas ADD COLUMN IF NOT EXISTS ride_count INT DEFAULT 0; ALTER TABLE contas ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sessoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conta_id uuid, token text NOT NULL UNIQUE, expira_em timestamp with time zone, conta text);`);
    await pool.query(`ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS conta_id uuid;`);
    await pool.query(`ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS token text;`);
    await pool.query(`ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS expira_em timestamp with time zone;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS corridas (id uuid PRIMARY KEY, client_id uuid, client_name text, client_phone text, origin text, destination text, vehicle_type text, status text, driver_id uuid, price double precision, payment text, created_at timestamp with time zone DEFAULT NOW());`);
    const adminId = '00000000-0000-0000-0000-000000000001';
    const adminExists = await pool.query(`SELECT id FROM contas WHERE phone = 'admin' OR email = 'admin' LIMIT 1`);
    if (adminExists.rows.length === 0) {
      const bcrypt = await import("bcryptjs");
      const hash = bcrypt.hashSync("admin123", 10);
      await pool.query(`INSERT INTO contas (id, nome, email, phone, senha, password_hash, tipo, mode, active, rating, ride_count, created_at) VALUES ($1, 'Administrador', 'admin', 'admin', 'admin123', $2, 'admin', 'admin', true, 0, 0, NOW()) ON CONFLICT (id) DO NOTHING`, [adminId, hash]);
    }
    console.log("✅ Neon conectado e tabelas verificadas");
  } catch (e) { console.error("Erro ao inicializar Neon:", e); }
}
export async function getUserByPhone(phone: string) { if (!pool) return null; const res = await pool.query(`SELECT * FROM contas WHERE phone = $1 OR email = $1 LIMIT 1`, [phone]); return res.rows[0] || null; }
export async function getUserById(id: string) { if (!pool) return null; const res = await pool.query(`SELECT * FROM contas WHERE id = $1 LIMIT 1`, [id]); return res.rows[0] || null; }
export async function createUserDb(user: any) { if (!pool) return; await pool.query(`INSERT INTO contas (id, nome, email, phone, senha, password_hash, tipo, mode, photo, vehicle_type, active, rating, ride_count, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) ON CONFLICT (id) DO NOTHING`, [user.id, user.name, user.phone, user.phone, user.passwordHash, user.passwordHash, user.mode, user.mode, user.photo, user.vehicleType, true, 0, 0]); }
export async function createSessionDb(token: string, userId: string, expiresAt: number) { if (!pool) return; try { await pool.query(`INSERT INTO sessoes (id, conta_id, token, expira_em) VALUES (gen_random_uuid(), $2, $1, to_timestamp($3 / 1000.0))`, [token, userId, expiresAt]); console.log(`✅ Sessão salva no Neon: ${token.slice(0,8)}...`); } catch (e) { console.error("Erro ao salvar sessão no Neon:", e); } }
export async function getSessionDb(token: string) { if (!pool) return null; const res = await pool.query(`SELECT * FROM sessoes WHERE token = $1 LIMIT 1`, [token]); return res.rows[0] || null; }
export async function deleteSessionDb(token: string) { if (!pool) return; await pool.query(`DELETE FROM sessoes WHERE token = $1`, [token]); }
