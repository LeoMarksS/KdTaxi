import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";
import ClientHome from "@/screens/ClientHome";
import DriverHome from "@/screens/DriverHome";
import AdminHome from "@/screens/AdminHome";

export default function HomeScreen() {
  const { user, token, isSessionReady } = useApp();

  // Não redireciona enquanto os dados salvos ainda estão sendo recuperados.
  if (!isSessionReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user || !token) return <Redirect href="/login" />;
  if (user.mode === "client") return <ClientHome />;
  if (user.mode === "driver") return <DriverHome />;
  if (user.mode === "admin") return <AdminHome />;
  return <Redirect href="/login" />;
}
