export interface OrderedChatMessage {
  id: string;
  timestamp: string;
}
export function compareChatMessages(
  a: OrderedChatMessage,
  b: OrderedChatMessage,
) {
  return (
    Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
export function mergeChatMessages<T extends OrderedChatMessage>(
  existing: T[],
  incoming: T[],
): T[] {
  const messages = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) messages.set(message.id, message);
  return Array.from(messages.values()).sort(compareChatMessages);
}
