import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

function isAndroidExpoGo() {
  return Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function initializeNotifications() {
  if (isAndroidExpoGo()) return;

  const Notifications = await import("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web" || isAndroidExpoGo()) return null;

  try {
    await initializeNotifications();
    const Notifications = await import("expo-notifications");
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

export async function scheduleLocalNotification(title: string, body: string) {
  if (isAndroidExpoGo()) return;

  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // Real-time in-app updates remain available when the runtime lacks local notifications.
  }
}
