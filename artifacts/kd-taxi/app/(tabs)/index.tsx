import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";
import ClientHome from "@/screens/ClientHome";
import DriverHome from "@/screens/DriverHome";
import AdminHome from "@/screens/AdminHome";

export default function HomeScreen() {
  const { user } = useApp();

  if (!user) return <Redirect href="/login" />;
  if (user.mode === "client") return <ClientHome />;
  if (user.mode === "driver") return <DriverHome />;
  if (user.mode === "admin") return <AdminHome />;
  return <Redirect href="/login" />;
}
