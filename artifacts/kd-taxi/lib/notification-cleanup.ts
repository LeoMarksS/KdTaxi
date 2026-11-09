// Separate the system notification tray from the app's chat read state.
export async function clearSystemNotifications(runtime: {
  dismissAllNotificationsAsync: () => Promise<void>;
  setBadgeCountAsync: (count: number) => Promise<boolean>;
}) {
  // Some launchers derive the badge from delivered notifications, others keep a separate count.
  try { await runtime.dismissAllNotificationsAsync(); } catch { /* Still try the launcher counter. */ }
  try { await runtime.setBadgeCountAsync(0); } catch { /* Unsupported launchers must not break the app. */ }
}
