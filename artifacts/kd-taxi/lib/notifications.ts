import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

const RIDE_ALERTS_CHANNEL_ID = "ride_alerts_v1";
const EAS_PROJECT_ID = "5fb3cb5d-d1c2-4bf7-b2a7-aef44055f44a";

function isAndroidExpoGo() {
  return Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function initializeNotifications() {
  if (isAndroidExpoGo()) return;

  const Notifications = await import("expo-notifications");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(RIDE_ALERTS_CHANNEL_ID, {
      name: "Alertas de corridas",
      importance: 7,
      sound: "default",
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
      showBadge: true,
    });
  }

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

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
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
      content: { title, body, sound: "default" },
      trigger: Platform.OS === "android"
        ? { channelId: RIDE_ALERTS_CHANNEL_ID }
        : null,
    });
  } catch {
    // Real-time in-app updates remain available when the runtime lacks local notifications.
  }
}
