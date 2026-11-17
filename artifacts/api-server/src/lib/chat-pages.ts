import { db, chatMessages, rides } from "@workspace/db";
import { and, desc, eq, ne, sql } from "drizzle-orm";

interface Cursor {
  time: string;
  id: string;
}
export function parseChatPage(query: Record<string, unknown>) {
  const { before, readId } = query;
  if (
    readId !== undefined &&
    (typeof readId !== "string" ||
      !readId ||
      readId.length > 100 ||
      readId.includes("\0"))
  )
    throw new Error("Referência de leitura inválida.");
  let cursor: Cursor | undefined;
  if (before !== undefined) {
    try {
      if (
        typeof before !== "string" ||
        before.length > 1000 ||
        !/^[A-Za-z0-9_-]+$/.test(before)
      )
        throw new Error();
      cursor = JSON.parse(Buffer.from(before, "base64url").toString());
      if (
        !cursor ||
        typeof cursor.time !== "string" ||
        cursor.time.length > 50 ||
        !/^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
          cursor.time,
        ) ||
        !Number.isFinite(Date.parse(cursor.time)) ||
        new Date(cursor.time.slice(0, 10) + "T00:00:00Z")
          .toISOString()
          .slice(0, 10) !== cursor.time.slice(0, 10) ||
        typeof cursor.id !== "string" ||
        !cursor.id ||
        cursor.id.length > 100 ||
        cursor.id.includes("\0")
      )
        throw new Error();
    } catch {
      throw new Error("Página de mensagens inválida.");
    }
  }
  return { cursor, readId: readId as string | undefined };
}
const boundary = (cursor: Cursor, direction: "before" | "after") =>
  direction === "before"
    ? sql`(${chatMessages.timestamp},${chatMessages.id}) < (${cursor.time}::timestamptz,${cursor.id})`
    : sql`(${chatMessages.timestamp},${chatMessages.id}) > (${cursor.time}::timestamptz,${cursor.id})`;

export async function getChatPage(
  rideId: string,
  viewer: { id: string; mode: string },
  query: ReturnType<typeof parseChatPage>,
  database = db,
) {
  return database.transaction(
    async (tx) => {
      const [ride] = await tx
        .select({ clientId: rides.clientId, driverId: rides.driverId })
        .from(rides)
        .where(eq(rides.id, rideId))
        .limit(1);
      if (!ride)
        return { error: "Corrida não encontrada.", status: 404 } as const;
      if (
        viewer.mode !== "admin" &&
        viewer.id !== ride.clientId &&
        viewer.id !== ride.driverId
      )
        return { error: "Acesso negado", status: 403 } as const;
      const records = await tx
        .select({
          id: chatMessages.id,
          rideId: chatMessages.rideId,
          senderId: chatMessages.senderId,
          senderName: chatMessages.senderName,
          senderPhoto: chatMessages.senderPhoto,
          text: chatMessages.text,
          timestamp: chatMessages.timestamp,
          cursorTime: sql<string>`${chatMessages.timestamp}::text`,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.rideId, rideId),
            query.cursor ? boundary(query.cursor, "before") : undefined,
          ),
        )
        .orderBy(desc(chatMessages.timestamp), desc(chatMessages.id))
        .limit(31);
      const hasMore = records.length > 30;
      const page = records.slice(0, 30);
      const oldest = page.at(-1);
      let unreadCount: number | undefined;
      if (!query.cursor) {
        const [read] = query.readId
          ? await tx
              .select({
                time: sql<string>`${chatMessages.timestamp}::text`,
                id: chatMessages.id,
              })
              .from(chatMessages)
              .where(
                and(
                  eq(chatMessages.rideId, rideId),
                  eq(chatMessages.id, query.readId),
                ),
              )
              .limit(1)
          : [];
        const [count] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.rideId, rideId),
              ne(chatMessages.senderId, viewer.id),
              read ? boundary(read, "after") : undefined,
            ),
          );
        unreadCount = count.total;
      }
      return {
        messages: page
          .reverse()
          .map(({ cursorTime: _cursor, ...m }) => ({
            ...m,
            senderPhoto: m.senderPhoto ?? undefined,
            timestamp: m.timestamp.toISOString(),
          })),
        nextCursor:
          hasMore && oldest
            ? Buffer.from(
                JSON.stringify({ time: oldest.cursorTime, id: oldest.id }),
              ).toString("base64url")
            : null,
        unreadCount,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function loadActiveRideRecords(database = db) {
  return database
    .select()
    .from(rides)
    .where(sql`${rides.status} in ('waiting','accepted','in_progress')`);
}
