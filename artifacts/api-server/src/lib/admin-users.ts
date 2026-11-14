import { db, users } from "@workspace/db";
import {
  and,
  asc,
  eq,
  getTableColumns,
  ilike,
  isNull,
  or,
  sql,
} from "drizzle-orm";

export function parseAdminUsersQuery(q: Record<string, unknown>) {
  const { page = "1", search = "", mode = "all", pending = "false" } = q;
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,5}$/.test(page) ||
    typeof search !== "string" ||
    search.length > 150 ||
    (mode !== "all" && mode !== "client" && mode !== "driver") ||
    (pending !== "false" && pending !== "true")
  )
    throw new Error("Confira a página e os filtros da busca.");
  return {
    page: Number(page),
    search: search.trim(),
    mode,
    pending: pending === "true",
  };
}

export async function getAdminUsers(
  query: ReturnType<typeof parseAdminUsersQuery>,
  database = db,
) {
  const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
  const base = and(
    isNull(users.deletedAt),
    or(eq(users.mode, "client"), eq(users.mode, "driver")),
    query.pending
      ? and(eq(users.mode, "driver"), eq(users.approvalStatus, "pending"))
      : undefined,
    query.search
      ? or(ilike(users.name, pattern), ilike(users.phone, pattern))
      : undefined,
  );
  // Count and page share one consistent, read-only snapshot; account edits are unaffected.
  return database.transaction(
    async (tx) => {
      const [counts] = await tx
        .select({
          clients: sql<number>`count(*) filter (where ${users.mode}='client')::int`,
          drivers: sql<number>`count(*) filter (where ${users.mode}='driver')::int`,
        })
        .from(users)
        .where(base);
      const total =
        query.mode === "client"
          ? counts.clients
          : query.mode === "driver"
            ? counts.drivers
            : counts.clients + counts.drivers;
      const pages = Math.max(1, Math.ceil(total / 20));
      const page = Math.min(query.page, pages);
      const {
        passwordHash: _password,
        pushToken: _push,
        deletedAt: _deleted,
        ...columns
      } = getTableColumns(users);
      const records = await tx
        .select(columns)
        .from(users)
        .where(
          and(
            base,
            query.mode === "all" ? undefined : eq(users.mode, query.mode),
          ),
        )
        .orderBy(asc(sql`lower(${users.name})`), asc(users.id))
        .limit(20)
        .offset((page - 1) * 20);
      return {
        users: records.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        counts,
        page,
        pages,
        pageSize: 20,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
