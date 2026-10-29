---
name: KD TAXI real-time reliability (sockets + chat)
description: Why socket auth, room targeting, chat persistence, and reconnect reconciliation were added for cross-device reliability.
---

Socket.io connections are authenticated with the same bearer session token as REST (`socket.handshake.auth.token`), never from client-supplied query params like `userId`/`mode`. Each socket joins a `user:${id}` room; targeted events use `io.to(...)` instead of `io.emit`/`socket.broadcast.emit` global broadcast.

**Multi-ride driver model:** drivers use `activeRides: Ride[]` (multiple simultaneous accepted rides); clients use `activeRide: Ride | null` (single). Chat is keyed per-ride: `chatMessagesByRide: Record<rideId, ChatMessage[]>` and `unreadByRide: Record<rideId, number>`. Chat screen receives `rideId` as a query param (`/chat?rideId=...`). Sound alert repeats 3× (4 s intervals) and is cancelled by `soundTimersRef` when driver accepts or declines.

**Why:** the original implementation broadcast ride and chat events to every connected socket and trusted client-supplied identity in chat payloads (spoofable), with zero server-side chat persistence — messages were lost if the recipient's socket was mid-reconnect (very common on mobile), which is what caused the reported "driver-to-client chat not delivered" and "driver misses ride requests" bugs.

**How to apply:** any new real-time event added to KD TAXI should (1) derive identity from the authenticated socket, not the payload, (2) target the specific `user:${id}` room(s) rather than broadcasting globally, and (3) if the event represents state the client needs to recover after a dropped connection (e.g. pending rides, active ride, chat history), also expose a REST fallback and call it from a `socket.on("connect", reconcile)` handler client-side — don't rely solely on the live event having been received.

Chat messages are persisted in an in-memory `chatByRide` map (`GET /rides/:id/chat`) and the id/sender/timestamp are always assigned server-side in the `mensagem_chat` handler — the client only sends `{ rideId, text }`. The server echoes the message back to the sender's own room too, so the client does not optimistically append locally (avoids duplicate-with-different-id entries).
