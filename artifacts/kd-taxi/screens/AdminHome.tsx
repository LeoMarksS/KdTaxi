import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import type { Ride, User } from "@/context/AppContext";

type Tab = "rides" | "users";

export default function AdminHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { allRides, allUsers, refreshAdminData, toggleDriverStatus, logout } = useApp();
  const [tab, setTab] = useState<Tab>("rides");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshAdminData().then(() => setLoading(false));
    const interval = setInterval(() => refreshAdminData(), 5000);
    return () => clearInterval(interval);
  }, []);

  const statusColors: Record<string, string> = {
    waiting: colors.statusWaiting,
    accepted: colors.statusAccepted,
    in_progress: colors.statusInProgress,
    finished: colors.statusFinished,
    cancelled: colors.mutedForeground,
  };

  const statusLabels: Record<string, string> = {
    waiting: "Aguardando",
    accepted: "Aceita",
    in_progress: "Em andamento",
    finished: "Finalizada",
    cancelled: "Cancelada",
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: { fontSize: 24, fontWeight: "900", color: colors.foreground, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: 24,
      gap: 8,
      marginBottom: 16,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    },
    tabText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    list: { flex: 1, paddingHorizontal: 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    rideId: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    statusBadge: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    clientName: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 8, fontFamily: "Inter_700Bold" },
    rideRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    rideText: { fontSize: 13, color: colors.mutedForeground, flex: 1, fontFamily: "Inter_400Regular" },
    driverText: { fontSize: 13, color: colors.foreground, marginTop: 8, fontFamily: "Inter_500Medium" },
    userCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    userName: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    userPhone: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    userMode: { fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" },
    empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    stats: {
      flexDirection: "row",
      paddingHorizontal: 24,
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: { fontSize: 24, fontWeight: "900", color: colors.foreground, fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
  });

  const activeRides = allRides.filter((r) => r.status === "waiting" || r.status === "accepted" || r.status === "in_progress");
  const drivers = allUsers.filter((u) => u.mode === "driver");
  const clients = allUsers.filter((u) => u.mode === "client");

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Admin</Text>
          <Text style={s.sub}>KD TAXI Dashboard</Text>
        </View>
        <TouchableOpacity style={{ padding: 8 }} onPress={logout}>
          <Feather name="log-out" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={s.stats}>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: colors.statusWaiting }]}>{activeRides.length}</Text>
          <Text style={s.statLabel}>Ativas</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: colors.statusAccepted }]}>{drivers.length}</Text>
          <Text style={s.statLabel}>Motoristas</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: colors.statusInProgress }]}>{allRides.length}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity
          style={[
            s.tabBtn,
            { backgroundColor: tab === "rides" ? colors.primary : colors.card },
          ]}
          onPress={() => setTab("rides")}
        >
          <MaterialCommunityIcons
            name="car"
            size={16}
            color={tab === "rides" ? "#000" : colors.mutedForeground}
          />
          <Text style={[s.tabText, { color: tab === "rides" ? "#000" : colors.mutedForeground }]}>
            Corridas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.tabBtn,
            { backgroundColor: tab === "users" ? colors.primary : colors.card },
          ]}
          onPress={() => setTab("users")}
        >
          <Feather
            name="users"
            size={16}
            color={tab === "users" ? "#000" : colors.mutedForeground}
          />
          <Text style={[s.tabText, { color: tab === "users" ? "#000" : colors.mutedForeground }]}>
            Usuários
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : tab === "rides" ? (
        <FlatList
          style={s.list}
          data={allRides}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardRow}>
                <Text style={s.rideId}>#{item.id.slice(-6)}</Text>
                <View style={[s.statusBadge, { backgroundColor: (statusColors[item.status] ?? colors.mutedForeground) + "22" }]}>
                  <Text style={[s.statusText, { color: statusColors[item.status] ?? colors.mutedForeground }]}>
                    {statusLabels[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
              <Text style={s.clientName}>{item.clientName}</Text>
              <View style={s.rideRow}>
                <Feather name="map-pin" size={13} color={colors.statusAccepted} />
                <Text style={s.rideText}>{item.origin}</Text>
              </View>
              <View style={s.rideRow}>
                <Feather name="flag" size={13} color={colors.statusInProgress} />
                <Text style={s.rideText}>{item.destination}</Text>
              </View>
              {item.driverName && (
                <Text style={s.driverText}>Motorista: {item.driverName}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <MaterialCommunityIcons name="car-off" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Nenhuma corrida ainda</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          style={s.list}
          data={allUsers}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={s.userCard}>
              <View style={s.avatar}>
                <MaterialCommunityIcons
                  name={item.mode === "driver" ? "car" : item.mode === "admin" ? "shield-check" : "account"}
                  size={22}
                  color="#000"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{item.name}</Text>
                <Text style={s.userPhone}>{item.phone}</Text>
                <Text style={s.userMode}>{item.mode === "driver" ? "Motorista" : item.mode === "admin" ? "Admin" : "Cliente"}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="users" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Nenhum usuário ainda</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
