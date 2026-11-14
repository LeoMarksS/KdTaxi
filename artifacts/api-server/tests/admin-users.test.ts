import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns, getTableName } from "drizzle-orm";
process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
const schema = await import("@workspace/db");
const { parseAdminUsersQuery } = await import("../src/lib/admin-users");

test("filtros recusam páginas inválidas e objetos em vez de textos", () => {
  for (const q of [
    { page: "0" },
    { page: "1.5" },
    { page: "1000000" },
    { page: ["1"] },
    { search: ["nome"] },
    { search: "a".repeat(151) },
    { mode: "admin" },
    { pending: "yes" },
  ])
    assert.throws(() => parseAdminUsersQuery(q));
  assert.deepEqual(parseAdminUsersQuery({}), {
    page: 1,
    search: "",
    mode: "all",
    pending: false,
  });
});

test("lista real pagina sem alterar dados, pesquisa no banco, preserva aprovações e não expõe senhas", async () => {
  const pg = new PGlite();
  const queries: string[] = [];
  const local = drizzle(pg, {
    logger: {
      logQuery(q) {
        queries.push(q);
      },
    },
  });
  for (const table of [schema.users, schema.sessions])
    await pg.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(
        getTableColumns(table),
      )
        .map(
          (c) =>
            `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`,
        )
        .join(",")})`,
    );
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "execute",
    "transaction",
  ] as const)
    (schema.db as any)[method] = (local[method] as Function).bind(local);
  const now = new Date();
  for (let i = 0; i < 47; i++)
    await local
      .insert(schema.users)
      .values({
        id: `user-${i}`,
        name:
          i === 44
            ? "Cliente 100% _real"
            : `Pessoa ${String(i).padStart(2, "0")}`,
        phone: `8190000${String(i).padStart(4, "0")}`,
        passwordHash: "private-password",
        pushToken: "private-push",
        mode: i === 45 ? "admin" : i % 2 ? "driver" : "client",
        approvalStatus: i % 4 === 1 ? "pending" : "approved",
        active: true,
        isOnline: false,
        rating: 4,
        rideCount: 2,
        photo: "data:image/jpeg;base64," + "x".repeat(10000),
        deletedAt: i === 46 ? now : null,
        createdAt: now,
      });
  for (const [id, token] of [
    ["user-45", "a"],
    ["user-0", "b"],
  ])
    await local
      .insert(schema.sessions)
      .values({
        token: token.repeat(64),
        userId: id,
        expiresAt: Date.now() + 100000,
      });
  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  assert(addr && typeof addr !== "string");
  const get = (path: string, token = "a") =>
    fetch(`http://127.0.0.1:${addr.port}/api${path}`, {
      headers: { Authorization: `Bearer ${token.repeat(64)}` },
    });
  const page = async (q = "") => {
    const r = await get("/admin/users" + q);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    return r.json();
  };
  try {
    assert.equal((await get("/admin/users", "b")).status, 403);
    assert.equal(
      (await fetch(`http://127.0.0.1:${addr.port}/api/admin/users`)).status,
      403,
    );
    for (const q of [
      "?page=0",
      "?search=abc&search=def",
      "?mode=admin",
      "?pending=invalid",
    ])
      assert.equal((await get("/admin/users" + q)).status, 400);
    const first = await page();
    const second = await page("?page=2");
    const third = await page("?page=3");
    assert.equal(first.total, 45);
    assert.deepEqual(first.counts, { clients: 23, drivers: 22 });
    assert.equal(first.pages, 3);
    assert.equal(first.pageSize, 20);
    assert.equal(first.users.length, 20);
    assert.equal(second.users.length, 20);
    assert.equal(third.users.length, 5);
    const ids = [...first.users, ...second.users, ...third.users].map(
      (u: any) => u.id,
    );
    assert.equal(new Set(ids).size, 45);
    assert(!ids.includes("user-45"));
    assert(!ids.includes("user-46"));
    assert(!JSON.stringify(first).includes("private-"));
    assert(first.users.every((u: any) => u.photo));
    const rows = queries.filter(
      (q) => q.includes("order by lower(") && q.includes('from "users"'),
    );
    assert(rows.length >= 3);
    assert(
      rows.every(
        (q) => !q.includes('"password_hash"') && !q.includes('"push_token"'),
      ),
    );
    assert.equal((await page("?mode=driver")).total, 22);
    assert.equal((await page("?pending=true")).total, 11);
    assert.equal((await page("?pending=true&mode=client")).total, 0);
    assert.equal((await page("?search=81900000042")).users[0].id, "user-42");
    assert.equal((await page("?search=100%25%20_real")).total, 1); // Literal %, underscore, not wildcards.
    assert.equal((await page("?search=Pessoa%2042")).total, 1);
    assert.equal((await page("?search=%27%20OR%201%3D1--")).total, 0);
    const empty = await page("?search=missing");
    assert.equal(empty.total, 0);
    assert.equal(empty.page, 1);
    assert.equal(empty.pages, 1);
    const clamped = await page("?page=999999");
    assert.equal(clamped.page, 3);
    assert.equal(clamped.users.length, 5);
    const legacy = await (await get("/users")).json();
    assert(Array.isArray(legacy));
    assert.equal(legacy.length, 45);
    assert(
      Buffer.byteLength(JSON.stringify(first)) <
        Buffer.byteLength(JSON.stringify(legacy)) / 2,
    );
    assert.equal(
      Number((await pg.query("SELECT count(*) FROM users")).rows[0].count),
      47,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await pg.close();
  }
});
