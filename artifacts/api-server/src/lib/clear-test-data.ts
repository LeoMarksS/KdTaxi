import { db, users as dbUsers, sessions as dbSessions, rides as dbRides, chatMessages as dbChatMessages, pricingRules as dbPricingRules } from "@workspace/db";
import { inArray, ne, sql } from "drizzle-orm";

/** Call only after admin authentication, password verification and explicit confirmation. */
export async function clearTestData(scope: 'rides' | 'all', clearPricing: boolean, database = db) {
  return database.transaction(async tx => {
      // Serialize with ongoing writes before checking active rides and removing related data.
      await tx.execute(sql`LOCK TABLE users, sessions, rides, chat_messages, pricing_rules IN EXCLUSIVE MODE`);
      const active = await tx.select({ id: dbRides.id }).from(dbRides)
        .where(inArray(dbRides.status, ['accepted', 'in_progress'])).limit(1);
      if (active.length) throw new Error('ACTIVE_RIDES');
      const accounts = scope === 'all' ? await tx.select({ id: dbUsers.id }).from(dbUsers).where(ne(dbUsers.mode, 'admin')) : [];
      await tx.execute(sql`DELETE FROM driver_settlements`);
      await tx.delete(dbChatMessages);
      await tx.delete(dbRides);
      await tx.update(dbUsers).set({ rating: 0, rideCount: 0 });
      if (scope === 'all') {
        await tx.delete(dbSessions).where(inArray(dbSessions.userId, tx.select({ id: dbUsers.id }).from(dbUsers).where(ne(dbUsers.mode, 'admin'))));
        await tx.delete(dbUsers).where(ne(dbUsers.mode, 'admin'));
      }
      if (clearPricing) await tx.delete(dbPricingRules);
      return accounts.map(account => account.id);
  });
}
