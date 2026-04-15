import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import type { Ride } from "@/context/AppContext";

function RideCard({ ride, onAccept, onDecline }: { ride: Ride; onAccept: () => void; onDecline: () => void }) {
  const colors = useColors();
  const slideIn = useSharedValue(-60);

  useEffect(() => {
    slideIn.value = withSpring(0, { damping: 14, stiffness: 120 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideIn.value }],
    opacity: slideIn.value === -60 ? 0 : 1,
  }));

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 18,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badge: {
      alignSelf: "flex-start",
      backgroundColor: colors.statusWaiting + "22",
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    badgeText: { fontSize: 11, color: colors.statusWaiting, fontFamily: "Inter_600SemiBold" },
    clientName: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 12, fontFamily: "Inter_700Bold" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: 14, color: colors.foreground, flex: 1, fontFamily: "Inter_400Regular" },
    actions: { flexDirection: "row", gap: 10, marginTop: 14 },
    acceptBtn: {
      flex: 2,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    acceptText: { fontSize: 16, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    declineBtn: {
      flex: 1,
      backgroundColor: colors.muted,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    declineText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <Animated.View style={animStyle}>
      <View style={s.card}>
        <View style={s.badge}>
          <Feather name="clock" size={11} color={colors.statusWaiting} />
          <Text style={s.badgeText}>NOVA CORRIDA</Text>
        </View>
        <Text style={s.clientName}>{ride.clientName}</Text>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: colors.statusAccepted }]} />
          <Text style={s.routeText}>{ride.origin}</Text>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: colors.statusInProgress }]} />
          <Text style={s.routeText}>{ride.destination}</Text>
        </View>
        <View style={s.actions}>
          <TouchableOpacity style={s.acceptBtn} onPress={onAccept}>
            <Feather name="check" size={18} color="#000" />
            <Text style={s.acceptText}>Aceitar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.declineBtn} onPress={onDecline}>
            <Text style={s.declineText}>Recusar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

export default function DriverHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isDriverOnline, setDriverOnline, activeRide, pendingRides, acceptRide, declineRide, finishRide, logout } = useApp();

  const toggleAnim = useSharedValue(isDriverOnline ? 1 : 0);

  useEffect(() => {
    toggleAnim.value = withTiming(isDriverOnline ? 1 : 0, { duration: 250 });
  }, [isDriverOnline]);

  const toggleStyle = useAnimatedStyle(() => ({
    backgroundColor: toggleAnim.value === 1 ? colors.statusOnline : colors.statusOffline,
  }));

  const handleAccept = async (rideId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await acceptRide(rideId);
  };

  const handleFinish = async () => {
    if (!activeRide) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await finishRide(activeRide.id);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24,
      paddingBottom: 20,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    userName: { fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    userSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    logoutBtn: { padding: 8 },
    statusToggle: {
      borderRadius: 24,
      paddingVertical: 18,
      paddingHorizontal: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    toggleIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    toggleLabel: { fontSize: 20, fontWeight: "800", color: "#fff", fontFamily: "Inter_700Bold" },
    toggleSub: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    content: { flex: 1, paddingHorizontal: 24 },
    sectionTitle: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    empty: {
      alignItems: "center",
      paddingVertical: 48,
      gap: 12,
    },
    emptyText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    activeCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 22,
      borderWidth: 2,
      borderColor: colors.statusInProgress,
      marginBottom: 16,
    },
    activeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    activeBadgeText: { fontSize: 16, fontWeight: "700", color: colors.statusInProgress, fontFamily: "Inter_700Bold" },
    clientName: { fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 14, fontFamily: "Inter_700Bold" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: 15, color: colors.foreground, flex: 1, fontFamily: "Inter_400Regular" },
    activeActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    finishBtn: {
      flex: 1,
      backgroundColor: colors.statusAccepted,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    finishText: { fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    chatBtn: {
      flex: 1,
      backgroundColor: colors.muted,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    chatText: { fontSize: 15, color: colors.foreground, fontFamily: "Inter_500Medium" },
    offlineMessage: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 12,
    },
    offlineText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.topRow}>
          <View>
            <Text style={s.userName}>{user?.name}</Text>
            <Text style={s.userSub}>Motorista</Text>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={logout}>
            <Feather name="log-out" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setDriverOnline(!isDriverOnline);
          }}
        >
          <Animated.View style={[s.statusToggle, toggleStyle]}>
            <View style={s.toggleIcon}>
              <MaterialCommunityIcons
                name={isDriverOnline ? "car" : "car-off"}
                size={24}
                color="#fff"
              />
            </View>
            <View>
              <Text style={s.toggleLabel}>{isDriverOnline ? "Online" : "Offline"}</Text>
              <Text style={s.toggleSub}>
                {isDriverOnline ? "Recebendo corridas" : "Toque para ativar"}
              </Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <FlatList
        style={s.content}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
        data={isDriverOnline ? pendingRides : []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          activeRide ? (
            <View>
              <Text style={s.sectionTitle}>Corrida ativa</Text>
              <View style={s.activeCard}>
                <View style={s.activeBadge}>
                  <Feather name="navigation" size={16} color={colors.statusInProgress} />
                  <Text style={s.activeBadgeText}>Em andamento</Text>
                </View>
                <Text style={s.clientName}>{activeRide.clientName}</Text>
                <View style={s.row}>
                  <View style={[s.dot, { backgroundColor: colors.statusAccepted }]} />
                  <Text style={s.routeText}>{activeRide.origin}</Text>
                </View>
                <View style={s.row}>
                  <View style={[s.dot, { backgroundColor: colors.statusInProgress }]} />
                  <Text style={s.routeText}>{activeRide.destination}</Text>
                </View>
                <View style={s.activeActions}>
                  <TouchableOpacity style={s.chatBtn} onPress={() => router.push("/chat")}>
                    <Feather name="message-circle" size={18} color={colors.foreground} />
                    <Text style={s.chatText}>Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
                    <Feather name="flag" size={18} color="#fff" />
                    <Text style={s.finishText}>Finalizar</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {pendingRides.length > 0 && (
                <Text style={[s.sectionTitle, { marginTop: 8 }]}>Corridas pendentes</Text>
              )}
            </View>
          ) : isDriverOnline && pendingRides.length > 0 ? (
            <Text style={s.sectionTitle}>Novas corridas</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <RideCard
            ride={item}
            onAccept={() => handleAccept(item.id)}
            onDecline={() => declineRide(item.id)}
          />
        )}
        ListEmptyComponent={
          !isDriverOnline ? (
            <View style={s.offlineMessage}>
              <MaterialCommunityIcons name="car-off" size={48} color={colors.mutedForeground} />
              <Text style={s.offlineText}>Você está offline{"\n"}Ative para receber corridas</Text>
            </View>
          ) : !activeRide ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="clock-outline" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Aguardando corridas...</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
