import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";
import { ActivityIndicator, View } from "react-native";
import ClientHome from "@/screens/ClientHome";
import DriverHome from "@/screens/DriverHome";
import AdminHome from "@/screens/AdminHome";

export default function HomeScreen() {
  const { user, isAuthLoading } = useApp();

  if (isAuthLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.mode === "client") return <ClientHome />;
  if (user.mode === "driver") return <DriverHome />;
  if (user.mode === "admin") return <AdminHome />;
  return <Redirect href="/login" />;
}
