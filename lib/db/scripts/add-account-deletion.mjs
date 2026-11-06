import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
  console.log("Exclusão de acesso com histórico preservado: estrutura pronta.");
} finally { await pool.end(); }
