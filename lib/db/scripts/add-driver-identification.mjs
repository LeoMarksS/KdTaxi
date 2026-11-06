import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const columns = [
  ["users", "vehicle_brand", "varchar(80)"],
  ["users", "vehicle_model", "varchar(80)"],
  ["users", "vehicle_color", "varchar(50)"],
  ["users", "vehicle_plate", "varchar(10)"],
  ["users", "approval_status", "varchar(20) NOT NULL DEFAULT 'approved'"],
  ["rides", "driver_vehicle_brand", "varchar(80)"],
  ["rides", "driver_vehicle_model", "varchar(80)"],
  ["rides", "driver_vehicle_color", "varchar(50)"],
  ["rides", "driver_vehicle_plate", "varchar(10)"],
];

try {
  await pool.query("BEGIN");
  for (const [table, column, definition] of columns) {
    await pool.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'users_approval_check' AND conrelid = 'public.users'::regclass
      ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_approval_check
          CHECK (approval_status IN ('pending', 'approved', 'rejected'));
      END IF;
    END $$
  `);
  await pool.query("COMMIT");
  const result = await pool.query(`
    SELECT count(*) FILTER (WHERE mode = 'driver') AS motoristas,
           count(*) FILTER (WHERE mode = 'driver' AND approval_status = 'approved') AS aprovados
      FROM public.users
  `);
  console.log("Cadastro de veículos pronto:", result.rows[0]);
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
