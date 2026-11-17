import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns, getTableName } from "drizzle-orm";
process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:1/unused";
const schema = await import("@workspace/db");
const { parseChatPage, loadActiveRideRecords } =
  await import("../src/lib/chat-pages");
const { mergeChatMessages } = createRequire(import.meta.url)(
  "../../kd-taxi/lib/chat-history.ts",
) as typeof import("../../kd-taxi/lib/chat-history");
const cursor = (time: string, id = "a") =>
  Buffer.from(JSON.stringify({ time, id })).toString("base64url");

test("cursor rejeita parâmetros malformados e preserva microssegundos", () => {
  for (const q of [
    { before: "!" },
    { before: ["a"] },
    { readId: [] },
    { readId: "" },
    { before: cursor("invalid") },
    { before: cursor("1") },
    { before: cursor("2026-02-30 12:00:00+00") },
    { before: cursor("2026-11-16 25:00:00+00") },
  ])
    assert.throws(() => parseChatPage(q));
  assert.equal(
    parseChatPage({ before: cursor("2026-11-16 12:00:00.123456+00") }).cursor
      ?.time,
    "2026-11-16 12:00:00.123456+00",
  );
});
test("mescla páginas e mensagens recebidas sem repetir ou perder a ordem", () => {
  const msg = (id: string, time: string) => ({
    id,
    timestamp: `2026-11-16T12:00:${time}.000Z`,
  });
  const result = mergeChatMessages(
    [msg("c", "03"), msg("b", "02")],
    [msg("b", "02"), msg("a", "01")],
  );
  assert.deepEqual(
    result.map((m) => m.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    mergeChatMessages([msg("b", "01")], [msg("a", "01")]).map((m) => m.id),
    ["a", "b"],
  );
});

test("chat real pagina com empates e microssegundos, conta não lidas além da página e funciona após início leve", async () => {
  const pg = new PGlite();
  const queries: string[] = [];
  const local = drizzle(pg, {
    logger: {
      logQuery(q) {
        queries.push(q);
      },
    },
  });
  for (const table of [
    schema.users,
    schema.sessions,
    schema.rides,
    schema.chatMessages,
    schema.pricingRules,
  ])
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
  for (const [id, mode, token] of [
    ["admin", "admin", "a"],
    ["client", "client", "b"],
    ["driver", "driver", "c"],
    ["outsider", "client", "d"],
  ]) {
    await local.insert(schema.users).values({
      id,
      mode,
      name: id,
      phone: id,
      passwordHash: "unused",
      active: true,
      isOnline: false,
      approvalStatus: "approved",
      rating: 0,
      rideCount: 0,
      createdAt: now,
    });
    await local.insert(schema.sessions).values({
      token: token.repeat(64),
      userId: id,
      expiresAt: Date.now() + 100000,
    });
  }
  for (const status of [
    "waiting",
    "accepted",
    "in_progress",
    "finished",
    "cancelled",
  ])
    await local.insert(schema.rides).values({
      id: status,
      clientId: "client",
      clientName: "C",
      clientPhone: "123",
      driverId: "driver",
      origin: "A",
      destination: "B",
      vehicleType: "car",
      status,
      price: 20,
      createdAt: now,
    });
  for (let i = 0; i < 75; i++)
    await pg.query(
      `INSERT INTO chat_messages(id,ride_id,sender_id,sender_name,text,timestamp) VALUES($1,'finished',$2,$2,'mensagem',$3)`,
      [
        `m${String(i).padStart(3, "0")}`,
        i % 2 ? "driver" : "client",
        `2026-11-16 12:00:00.${String(100000 + Math.floor(i / 10)).padStart(6, "0")}+00`,
      ],
    );
  await pg.exec(
    `INSERT INTO chat_messages(id,ride_id,sender_id,sender_name,text,timestamp) VALUES('foreign','cancelled','driver','D','outra conversa','2026-11-16 15:00:00+00')`,
  );
  const { initializeAuthStore, getRideParticipants } =
    await import("../src/routes/taxi");
  queries.length = 0;
  await initializeAuthStore();
  assert(
    queries
      .filter((q) => q.includes('from "rides"'))
      .every((q) => q.includes("where")),
  );
  assert.deepEqual(
    (await loadActiveRideRecords()).map((r) => r.status).sort(),
    ["accepted", "in_progress", "waiting"],
  );
  assert.deepEqual(await getRideParticipants("finished"), {
    clientId: "client",
    driverId: "driver",
  });
  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  assert(addr && typeof addr !== "string");
  const req = (path: string, token = "b", body?: object) =>
    fetch(`http://127.0.0.1:${addr.port}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token.repeat(64)}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const get = async (q = "") => {
    const res = await req("/rides/finished/chat/page" + q);
    assert.equal(res.status, 200);
    return res.json();
  };
  try {
    assert.equal((await req("/rides/finished/chat/page", "d")).status, 403);
    assert.equal((await req("/rides/missing/chat/page")).status, 404);
    assert.equal(
      (await req("/rides/finished/chat/page?before=invalid")).status,
      400,
    );
    queries.length = 0;
    const first = await get();
    assert.equal(first.messages.length, 30);
    assert.equal(first.unreadCount, 37);
    assert(first.nextCursor);
    const permissionRead = queries.find((q) => q.includes('from "rides"'));
    assert(permissionRead);
    assert(!permissionRead.includes("photo"));
    await pg.exec(
      `INSERT INTO chat_messages(id,ride_id,sender_id,sender_name,text,timestamp) VALUES('new','finished','driver','D','nova','2026-11-16 15:00:00+00')`,
    );
    const second = await get("?before=" + first.nextCursor);
    const third = await get("?before=" + second.nextCursor);
    const all = [...third.messages, ...second.messages, ...first.messages];
    assert.equal(all.length, 75);
    assert.equal(new Set(all.map((m: any) => m.id)).size, 75);
    assert.equal(all[0].id, "m000");
    assert.equal(all.at(-1).id, "m074");
    assert.equal(third.nextCursor, null);
    assert.equal((await get("?readId=m004")).unreadCount, 36); // 35 older unread + the new message.
    assert.equal((await get("?readId=foreign")).unreadCount, 38); // Another ride's read marker cannot hide messages.
    const old = await (await req("/rides/finished/chat")).json();
    assert(Array.isArray(old));
    assert.equal(old.length, 76);
    assert.equal(
      (await req("/start-ride", "c", { rideId: "finished" })).status,
      409,
    ); // Lazy fetch, not a false 404 after restart.
    assert.equal(
      (await req("/cancel-ride", "b", { rideId: "finished" })).status,
      409,
    );
    assert.equal((await req("/rides/finished/chat/page", "a")).status, 200);
    const active = await req("/start-ride", "c", { rideId: "accepted" });
    assert.equal(active.status, 200);
    const started = await active.json();
    assert.equal(started.status, "in_progress");
    assert.equal(started.price, 20);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await pg.close();
  }
});
