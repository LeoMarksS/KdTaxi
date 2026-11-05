import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

const LEGACY_ALERTS_CHANNEL_ID = "ride_alerts_v1";
const RIDE_ALERTS_CHANNEL_ID = "ride_alerts_v2";
const CHAT_CHANNEL_ID = "chat_messages_v1";
const RIDE_ALERT_SOUND = "ride_alert.wav";
const EAS_PROJECT_ID = "5fb3cb5d-d1c2-4bf7-b2a7-aef44055f44a";

export type LocalNotificationKind = "ride" | "chat";

function isAndroidExpoGo() {
  return Platform.OS === "android" &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function initializeNotifications() {
  if (isAndroidExpoGo()) return;

  const Notifications = await import("expo-notifications");

  if (Platform.OS === "android") {
    // O canal antigo continua disponível para status enviados por versões anteriores.
    await Notifications.setNotificationChannelAsync(LEGACY_ALERTS_CHANNEL_ID, {
      name: "Atualizações da corrida",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(RIDE_ALERTS_CHANNEL_ID, {
      name: "Chamadas de corrida",
      importance: Notifications.AndroidImportance.MAX,
      sound: RIDE_ALERT_SOUND,
      vibrationPattern: [0, 250, 150, 250],
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync(CHAT_CHANNEL_ID, {
      name: "Mensagens do chat",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
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

    if (finalStatus !== "granted") {
      console.warn("[push] Permissão de notificações não concedida.");
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    return token.data;
  } catch {
    console.warn("[push] Não foi possível registrar o aparelho no Expo.");
    return null;
  }
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  kind: LocalNotificationKind = "ride",
) {
  if (isAndroidExpoGo()) return;

  try {
    await initializeNotifications();
    const Notifications = await import("expo-notifications");
    const isChat = kind === "chat";
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: isChat ? "default" : RIDE_ALERT_SOUND,
      },
      trigger: Platform.OS === "android"
        ? { channelId: isChat ? CHAT_CHANNEL_ID : RIDE_ALERTS_CHANNEL_ID }
        : null,
    });
  } catch {
    // Real-time in-app updates remain available when the runtime lacks local notifications.
  }
}
