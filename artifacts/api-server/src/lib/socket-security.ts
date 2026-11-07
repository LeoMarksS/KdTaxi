import type { Socket } from 'socket.io';

/** Revalidate each packet: a connected socket must not outlive its login session. */
export function secureSocket(socket: Pick<Socket, 'use' | 'disconnect' | 'data'>,
  authenticate: (token: string | undefined) => Promise<{ id: string } | undefined>, now = Date.now) {
  let windowStart = now();
  let packets = 0;
  socket.use(async (_packet, next) => {
    const time = now();
    if (time - windowStart >= 10_000) { windowStart = time; packets = 0; }
    if (++packets > 30) { next(new Error('rate_limit')); return; }
    try {
      const user = await authenticate(socket.data.sessionToken);
      if (!user || user.id !== socket.data.user.id) {
        next(new Error('unauthorized')); socket.disconnect(true); return;
      }
      next();
    } catch {
      next(new Error('authentication_error')); socket.disconnect(true);
    }
  });
}

export function parseChatInput(msg: unknown): { rideId: string; text: string } | undefined {
  if (!msg || typeof msg !== 'object') return;
  const { rideId, text } = msg as Record<string, unknown>;
  if (typeof rideId !== 'string' || !rideId || rideId.length > 100 || typeof text !== 'string' || !text.trim() || text.length > 1000) return;
  return { rideId, text: text.trim() };
}
