import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList, Platform, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import { RatingModal } from "@/components/RatingModal";
import type { Ride } from "@/context/AppContext";

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Feather
          key={s}
          name="star"
          size={size}
          color={s <= Math.round(rating) ? colors.primary : colors.border}
        />
      ))}
    </View>
  );
}

function RideCard({ ride, onAccept, onDecline, compact }: {
  ride: Ride; onAccept: () => void; onDecline: () => void; compact?: boolean;
}) {
  const colors = useColors();
  const slideIn = useSharedValue(compact ? 0 : -60);

  useEffect(() => {
    if (!compact) slideIn.value = withSpring(0, { damping: 14, stiffness: 120 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideIn.value }],
    opacity: compact ? 1 : (slideIn.value === -60 ? 0 : 1),
  }));

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: compact ? 12 : 18, marginBottom: 10, borderWidth: 1,
      borderColor: colors.border, opacity: compact ? 0.75 : 1,
    },
    badge: {
      alignSelf: "flex-start", backgroundColor: colors.statusWaiting + "22",
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: compact ? 8 : 14,
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    badgeText: { fontSize: 11, color: colors.statusWaiting, fontFamily: "Inter_600SemiBold" },
    clientRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: compact ? 8 : 14 },
    clientName: { fontSize: compact ? 15 : 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    clientPhone: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: compact ? 13 : 14, color: colors.foreground, flex: 1, fontFamily: "Inter_400Regular" },
    priceRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.statusAccepted + "15", borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, alignSelf: "flex-start",
    },
    priceText: { fontSize: compact ? 14 : 16, fontWeight: "700", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    payText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    actions: { flexDirection: "row", gap: 10, marginTop: compact ? 10 : 14 },
    acceptBtn: {
      flex: 2, backgroundColor: colors.primary, borderRadius: 14,
      paddingVertical: compact ? 10 : 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    acceptText: { fontSize: compact ? 14 : 16, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    declineBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 14,
      paddingVertical: compact ? 10 : 14, alignItems: "center",
    },
    declineText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <Animated.View style={animStyle}>
      <View style={s.card}>
        <View style={s.badge}>
          <Feather name="clock" size={11} color={colors.statusWaiting} />
          <Text style={s.badgeText}>{compact ? "EM ESPERA" : "NOVA CORRIDA"}</Text>
        </View>
        <View style={s.clientRow}>
          <UserAvatar name={ride.clientName} photo={ride.clientPhoto} size={compact ? 36 : 48} mode="client" />
          <View>
            <Text style={s.clientName}>{ride.clientName}</Text>
            {!compact && <Text style={s.clientPhone}>{ride.clientPhone}</Text>}
            {(ride.clientAvgRating ?? 0) > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                <StarRating rating={ride.clientAvgRating!} size={12} />
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  {ride.clientAvgRating!.toFixed(1)} ({ride.clientRideCount} corridas)
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                Sem avaliações ainda
              </Text>
            )}
          </View>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: colors.statusAccepted }]} />
          <Text style={s.routeText}>{ride.origin}</Text>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: colors.statusInProgress }]} />
          <Text style={s.routeText}>{ride.destination}</Text>
        </View>
        {ride.price !== undefined && (
          <View style={s.priceRow}>
            <Feather name="dollar-sign" size={14} color={colors.statusAccepted} />
            <Text style={s.priceText}>R$ {ride.price.toFixed(2).replace(".", ",")}</Text>
            <Text style={s.payText}>· {ride.payment === "pix" ? "PIX" : "Dinheiro"}</Text>
          </View>
        )}
        <View style={s.actions}>
          <TouchableOpacity style={s.acceptBtn} onPress={onAccept}>
            <Feather name="check" size={18} color="#000" />
            <Text style={s.acceptText}>Aceitar</Text>
          </TouchableOpacity>
          {!compact && (
            <TouchableOpacity style={s.declineBtn} onPress={onDecline}>
              <Text style={s.declineText}>Recusar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function DriverHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    user, isDriverOnline, setDriverOnline, activeRide, pendingRides,
    acceptRide, declineRide, finishRide, logout, unreadChatCount,
    myRides, fetchMyRides,
  } = useApp();

  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const toggleAnim = useSharedValue(isDriverOnline ? 1 : 0);

  useEffect(() => {
    toggleAnim.value = withTiming(isDriverOnline ? 1 : 0, { duration: 250 });
  }, [isDriverOnline]);

  useEffect(() => {
    fetchMyRides();
  }, []);

  useEffect(() => {
    const pendingIds = new Set(pendingRides.map((r) => r.id));
    setDeclinedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => { if (pendingIds.has(id)) next.add(id); });
      return next;
    });
  }, [pendingRides]);

  const toggleStyle = useAnimatedStyle(() => ({
    backgroundColor: toggleAnim.value > 0.5 ? colors.statusOnline : colors.statusOffline,
  }));

  const handleAccept = async (rideId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDeclinedIds((prev) => { const next = new Set(prev); next.delete(rideId); return next; });
    await acceptRide(rideId);
  };

  const handleDecline = (rideId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDeclinedIds((prev) => new Set([...prev, rideId]));
  };

  const handleFinish = async () => {
    if (!activeRide) return;
    if (!confirmingFinish) { setConfirmingFinish(true); return; }
    setConfirmingFinish(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await finishRide(activeRide.id);
  };

  const activeRides = pendingRides.filter((r) => !declinedIds.has(r.id));
  const declinedRides = pendingRides.filter((r) => declinedIds.has(r.id));
  const totalEarned = myRides.reduce((sum, r) => sum + (r.price ?? 0), 0);
  const rating = user?.rating ?? 0;
  const rideCount = user?.rideCount ?? 0;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24, paddingBottom: 16,
    },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    driverInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
    userName: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    userSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    // Stats row
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
    },
    statValue: { fontSize: 18, fontWeight: "900", fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
    ratingCard: {
      backgroundColor: colors.primary + "18", borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: colors.primary + "44",
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14,
    },
    ratingLeft: {},
    ratingLabel: { fontSize: 11, color: colors.primary + "cc", fontFamily: "Inter_500Medium", marginBottom: 4 },
    ratingValue: { fontSize: 26, fontWeight: "900", color: colors.primary, fontFamily: "Inter_700Bold" },
    ratingCount: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    statusToggle: {
      borderRadius: 20, paddingVertical: 14, paddingHorizontal: 22,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    toggleIcon: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.2)",
      alignItems: "center", justifyContent: "center",
    },
    toggleLabel: { fontSize: 18, fontWeight: "800", color: "#fff", fontFamily: "Inter_700Bold" },
    toggleSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
    content: { flex: 1, paddingHorizontal: 24 },
    sectionTitle: {
      fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium",
      letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12,
    },
    empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
    emptyText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    activeCard: {
      backgroundColor: colors.card, borderRadius: colors.radius, padding: 20,
      borderWidth: 2, borderColor: colors.statusInProgress, marginBottom: 14,
    },
    activeBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
    activeBadgeText: { fontSize: 15, fontWeight: "700", color: colors.statusInProgress, fontFamily: "Inter_700Bold" },
    clientRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    clientName: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    clientPhone: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: 15, color: colors.foreground, flex: 1, fontFamily: "Inter_400Regular" },
    priceRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.statusAccepted + "15", borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, marginBottom: 4, alignSelf: "flex-start",
    },
    priceText: { fontSize: 16, fontWeight: "700", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    payText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    activeActions: { flexDirection: "row", gap: 10, marginTop: 14 },
    chatBtnWrap: { position: "relative", flex: 1 },
    chatBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", justifyContent: "center", gap: 8,
    },
    chatText: { fontSize: 15, color: colors.foreground, fontFamily: "Inter_500Medium" },
    chatBadge: {
      position: "absolute", top: -6, right: -6,
      backgroundColor: colors.destructive, borderRadius: 10,
      minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
      zIndex: 10,
    },
    chatBadgeText: { fontSize: 11, color: "#fff", fontWeight: "700", fontFamily: "Inter_700Bold" },
    finishBtn: {
      flex: 1, backgroundColor: colors.statusAccepted, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    finishBtnConfirm: {
      flex: 1, backgroundColor: colors.destructive, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    finishText: { fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    cancelConfirmBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
    },
    cancelConfirmText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    offlineMessage: { alignItems: "center", paddingVertical: 40, gap: 12 },
    offlineText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
    declinedSection: { marginBottom: 12 },
    declinedLabel: {
      fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium",
      letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8,
    },
    historyToggle: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8,
    },
    historyTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    historySubtitle: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    historyCard: {
      backgroundColor: colors.card, borderRadius: 12,
      padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
    },
    historyRoute: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 4 },
    historyMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    historyDate: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    historyAmount: { fontSize: 15, fontWeight: "700", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    historyAmountNone: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    historyClient: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 4 },
    totalCard: {
      backgroundColor: colors.statusAccepted + "18", borderRadius: 12, padding: 14,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
      borderWidth: 1, borderColor: colors.statusAccepted + "44",
    },
    totalLabel: { fontSize: 13, color: colors.statusAccepted, fontFamily: "Inter_600SemiBold" },
    totalValue: { fontSize: 20, fontWeight: "900", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
  });

  const listHeader = (
    <View>
      {activeRide && (
        <View>
          <Text style={s.sectionTitle}>Corrida ativa</Text>
          <View style={s.activeCard}>
            <View style={s.activeBadge}>
              <Feather name="navigation" size={16} color={colors.statusInProgress} />
              <Text style={s.activeBadgeText}>Em andamento</Text>
            </View>
            <View style={s.clientRow}>
              <UserAvatar name={activeRide.clientName} photo={activeRide.clientPhoto} size={50} mode="client" />
              <View>
                <Text style={s.clientName}>{activeRide.clientName}</Text>
                <Text style={s.clientPhone}>{activeRide.clientPhone}</Text>
                {(activeRide.clientAvgRating ?? 0) > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <StarRating rating={activeRide.clientAvgRating!} size={12} />
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                      {activeRide.clientAvgRating!.toFixed(1)}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                    Novo passageiro
                  </Text>
                )}
              </View>
            </View>
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: colors.statusAccepted }]} />
              <Text style={s.routeText}>{activeRide.origin}</Text>
            </View>
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: colors.statusInProgress }]} />
              <Text style={s.routeText}>{activeRide.destination}</Text>
            </View>
            {activeRide.price !== undefined && (
              <View style={s.priceRow}>
                <Feather name="dollar-sign" size={14} color={colors.statusAccepted} />
                <Text style={s.priceText}>R$ {activeRide.price.toFixed(2).replace(".", ",")}</Text>
                <Text style={s.payText}>· {activeRide.payment === "pix" ? "PIX" : "Dinheiro"}</Text>
              </View>
            )}
            <View style={s.activeActions}>
              <View style={s.chatBtnWrap}>
                <TouchableOpacity style={s.chatBtn} onPress={() => router.push("/chat")}>
                  <Feather name="message-circle" size={18} color={colors.foreground} />
                  <Text style={s.chatText}>Chat</Text>
                </TouchableOpacity>
                {unreadChatCount > 0 && (
                  <View style={s.chatBadge}>
                    <Text style={s.chatBadgeText}>{unreadChatCount > 99 ? "99+" : unreadChatCount}</Text>
                  </View>
                )}
              </View>
              {confirmingFinish ? (
                <>
                  <TouchableOpacity style={s.finishBtnConfirm} onPress={handleFinish}>
                    <Feather name="flag" size={18} color="#fff" />
                    <Text style={s.finishText}>Confirmar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelConfirmBtn} onPress={() => setConfirmingFinish(false)}>
                    <Text style={s.cancelConfirmText}>Voltar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
                  <Feather name="flag" size={18} color="#fff" />
                  <Text style={s.finishText}>Finalizar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {activeRides.length > 0 && (
            <Text style={[s.sectionTitle, { marginTop: 4 }]}>Novas corridas</Text>
          )}
        </View>
      )}
      {!activeRide && isDriverOnline && activeRides.length > 0 && (
        <Text style={s.sectionTitle}>Novas corridas</Text>
      )}
    </View>
  );

  return (
    <View style={s.container}>
      <RatingModal />
      <View style={s.header}>
        <View style={s.topRow}>
          <View style={s.driverInfo}>
            <TouchableOpacity onPress={() => router.push("/profile")}>
              <UserAvatar name={user?.name ?? "?"} photo={user?.photo} size={44} mode="driver" />
            </TouchableOpacity>
            <View>
              <Text style={s.userName}>{user?.name}</Text>
              <Text style={s.userSub}>Motorista</Text>
            </View>
          </View>
          <TouchableOpacity style={{ padding: 8 }} onPress={logout}>
            <Feather name="log-out" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.statusAccepted }]}>
              R$ {totalEarned.toFixed(0)}
            </Text>
            <Text style={s.statLabel}>Total ganho</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: colors.primary }]}>{myRides.length}</Text>
            <Text style={s.statLabel}>Corridas</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}>
            {rating > 0 ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="star" size={14} color={colors.primary} />
                  <Text style={[s.statValue, { color: colors.primary, fontSize: 20 }]}>{rating.toFixed(1)}</Text>
                </View>
                <Text style={[s.statLabel, { color: colors.primary }]}>{rideCount} avaliações</Text>
              </>
            ) : (
              <>
                <Feather name="star" size={18} color={colors.mutedForeground} />
                <Text style={s.statLabel}>Sem avaliações</Text>
              </>
            )}
          </View>
        </View>

        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setDriverOnline(!isDriverOnline); }}>
          <Animated.View style={[s.statusToggle, toggleStyle]}>
            <View style={s.toggleIcon}>
              <MaterialCommunityIcons name={isDriverOnline ? "car" : "car-off"} size={24} color="#fff" />
            </View>
            <View>
              <Text style={s.toggleLabel}>{isDriverOnline ? "Online" : "Offline"}</Text>
              <Text style={s.toggleSub}>{isDriverOnline ? "Recebendo corridas" : "Toque para ativar"}</Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <FlatList
        style={s.content}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
        data={isDriverOnline ? activeRides : []}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <RideCard
            ride={item}
            onAccept={() => handleAccept(item.id)}
            onDecline={() => handleDecline(item.id)}
          />
        )}
        ListFooterComponent={
          <View>
            {isDriverOnline && declinedRides.length > 0 && (
              <View style={s.declinedSection}>
                <Text style={s.declinedLabel}>Em espera (recusadas)</Text>
                {declinedRides.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    onAccept={() => handleAccept(ride.id)}
                    onDecline={() => {}}
                    compact
                  />
                ))}
              </View>
            )}
            {myRides.length > 0 && (
              <View>
                <TouchableOpacity style={s.historyToggle} onPress={() => setShowHistory((v) => !v)}>
                  <View>
                    <Text style={s.historyTitle}>Histórico de corridas</Text>
                    <Text style={s.historySubtitle}>{myRides.length} corrida{myRides.length !== 1 ? "s" : ""} concluída{myRides.length !== 1 ? "s" : ""}</Text>
                  </View>
                  <Feather name={showHistory ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
                {showHistory && (
                  <View>
                    <View style={s.totalCard}>
                      <Text style={s.totalLabel}>Total ganho</Text>
                      <Text style={s.totalValue}>R$ {totalEarned.toFixed(2).replace(".", ",")}</Text>
                    </View>
                    {myRides.map((ride) => (
                      <View key={ride.id} style={s.historyCard}>
                        <Text style={s.historyClient}>Passageiro: {ride.clientName}</Text>
                        <Text style={s.historyRoute}>{ride.origin} → {ride.destination}</Text>
                        <View style={s.historyMeta}>
                          <Text style={s.historyDate}>
                            {new Date(ride.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </Text>
                          {ride.price !== undefined ? (
                            <Text style={s.historyAmount}>R$ {ride.price.toFixed(2).replace(".", ",")}</Text>
                          ) : (
                            <Text style={s.historyAmountNone}>Sem valor</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !isDriverOnline ? (
            <View style={s.offlineMessage}>
              <MaterialCommunityIcons name="car-off" size={48} color={colors.mutedForeground} />
              <Text style={s.offlineText}>Você está offline{"\n"}Ative para receber corridas</Text>
            </View>
          ) : !activeRide && declinedRides.length === 0 ? (
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
