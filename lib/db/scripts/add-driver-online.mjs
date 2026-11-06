import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const before = await pool.query(`
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'
       AND column_name = 'is_online'
  `);
  if (before.rows.length > 0 &&
      (before.rows[0].data_type !== "boolean" ||
       before.rows[0].is_nullable !== "NO" ||
       before.rows[0].column_default !== "false")) {
    throw new Error("A coluna is_online já existe com definição inesperada.");
  }

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false
  `);

  const result = await pool.query(`
    SELECT count(*) FILTER (WHERE mode = 'driver') AS motoristas,
           count(*) FILTER (WHERE mode = 'driver' AND is_online) AS online
      FROM users
  `);
  console.log("Disponibilidade pronta:", result.rows[0]);
} finally {
  await pool.end();
}
