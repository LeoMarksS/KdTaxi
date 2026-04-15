import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { UserAvatar } from "@/components/UserAvatar";
import { RatingModal } from "@/components/RatingModal";

export default function ClientHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, activeRide, requestRide, cancelRide, logout, lookupPrice, finishedRideToRate } = useApp();

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [payment, setPayment] = useState<"pix" | "dinheiro">("dinheiro");
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [priceLookingUp, setPriceLookingUp] = useState(false);

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (activeRide?.status === "waiting") {
      pulseScale.value = withRepeat(
        withSequence(withTiming(1.08, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1, false
      );
    } else {
      pulseScale.value = withSpring(1);
    }
  }, [activeRide?.status]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  useEffect(() => {
    if (!destination.trim() || destination.trim().length < 3) { setPrice(null); return; }
    const timer = setTimeout(async () => {
      setPriceLookingUp(true);
      const p = await lookupPrice(destination.trim());
      setPrice(p);
      setPriceLookingUp(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [destination]);

  const handleRequest = async () => {
    if (!origin.trim() || !destination.trim()) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await requestRide(origin.trim(), destination.trim(), payment);
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!activeRide) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await cancelRide(activeRide.id);
  };

  const statusConfig = {
    waiting: { label: "Procurando motorista...", color: colors.statusWaiting, icon: "clock" as const },
    accepted: { label: "Motorista a caminho!", color: colors.statusAccepted, icon: "check-circle" as const },
    in_progress: { label: "Em andamento", color: colors.statusInProgress, icon: "navigation" as const },
    finished: { label: "Corrida finalizada", color: colors.statusFinished, icon: "flag" as const },
    cancelled: { label: "Cancelada", color: colors.destructive, icon: "x-circle" as const },
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24, paddingBottom: 16,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    greeting: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    userName: { fontSize: 20, color: colors.foreground, fontWeight: "700", fontFamily: "Inter_700Bold" },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
    scroll: { flex: 1, paddingHorizontal: 24 },
    bigBtn: {
      borderRadius: 24, paddingVertical: 28, alignItems: "center", justifyContent: "center",
      marginBottom: 24, shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
    },
    bigBtnIcon: { marginBottom: 8 },
    bigBtnText: { fontSize: 24, fontWeight: "900", color: "#000", fontFamily: "Inter_700Bold" },
    bigBtnSub: { fontSize: 14, color: "#00000088", marginTop: 4, fontFamily: "Inter_400Regular" },
    formCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
    },
    formTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 16, fontFamily: "Inter_700Bold" },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    inputDot: { width: 10, height: 10, borderRadius: 5 },
    input: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 14, fontSize: 15,
      color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    connector: { width: 10, alignItems: "center", paddingVertical: 4 },
    connLine: { width: 2, height: 16, backgroundColor: colors.border },
    priceRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
      marginBottom: 14,
    },
    priceLabel: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    priceValue: { fontSize: 18, fontWeight: "800", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    paymentRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    payBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 12,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
      borderWidth: 2,
    },
    payBtnText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    confirmBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", marginTop: 4, flexDirection: "row", justifyContent: "center", gap: 8,
    },
    confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    statusCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 24, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
    },
    statusBadge: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
    statusText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
    rideDetail: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    rideDetailText: { fontSize: 14, color: colors.foreground, flex: 1, fontFamily: "Inter_400Regular" },
    ridePriceBadge: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.statusAccepted + "22", borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 4, marginBottom: 12, alignSelf: "flex-start",
    },
    ridePriceText: { fontSize: 16, fontWeight: "700", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    driverInfo: {
      backgroundColor: colors.muted, borderRadius: 12, padding: 14,
      marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12,
    },
    driverName: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    driverSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    driverRating: { fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold", marginTop: 2 },
    actionRow: { flexDirection: "row", gap: 12, marginTop: 16 },
    chatBtn: {
      flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    chatBtnText: { fontSize: 15, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    cancelBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
    },
    cancelBtnText: { fontSize: 15, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    paymentInfoBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.muted, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, marginTop: 4, alignSelf: "flex-start",
    },
    paymentInfoText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  });

  return (
    <View style={s.container}>
      <RatingModal />
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Olá,</Text>
          <Text style={s.userName}>{user?.name}</Text>
          {(user?.rating ?? 0) > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Feather name="star" size={11} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {user!.rating!.toFixed(1)} · {user!.rideCount} corridas
              </Text>
            </View>
          )}
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={() => router.push("/profile")}>
            <UserAvatar name={user?.name ?? "?"} photo={user?.photo} size={38} mode="client" />
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 4 }} onPress={logout}>
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {!activeRide ? (
            <>
              <Animated.View style={pulseStyle}>
                <LinearGradient
                  colors={[colors.primary, "#E6A800"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.bigBtn}
                >
                  <MaterialCommunityIcons name="car-side" size={52} color="#000" style={s.bigBtnIcon} />
                  <Text style={s.bigBtnText}>KD TAXI</Text>
                  <Text style={s.bigBtnSub}>Preencha os campos abaixo</Text>
                </LinearGradient>
              </Animated.View>

              <View style={s.formCard}>
                <Text style={s.formTitle}>Para onde vamos?</Text>

                <View style={s.inputRow}>
                  <View style={[s.inputDot, { backgroundColor: colors.statusAccepted }]} />
                  <TextInput
                    style={s.input} value={origin} onChangeText={setOrigin}
                    placeholder="Local de origem" placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                <View style={s.connector}><View style={s.connLine} /></View>

                <View style={s.inputRow}>
                  <View style={[s.inputDot, { backgroundColor: colors.statusInProgress }]} />
                  <TextInput
                    style={s.input} value={destination} onChangeText={setDestination}
                    placeholder="Destino" placeholderTextColor={colors.mutedForeground}
                  />
                </View>

                {(price !== null || priceLookingUp) && (
                  <View style={s.priceRow}>
                    <Text style={s.priceLabel}>Valor da corrida</Text>
                    {priceLookingUp ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={s.priceValue}>
                        R$ {price!.toFixed(2).replace(".", ",")}
                      </Text>
                    )}
                  </View>
                )}

                <Text style={[s.formTitle, { fontSize: 13, marginBottom: 10, marginTop: 4 }]}>Forma de pagamento</Text>
                <View style={s.paymentRow}>
                  {(["pix", "dinheiro"] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        s.payBtn,
                        {
                          backgroundColor: payment === p ? colors.primary : colors.card,
                          borderColor: payment === p ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => { setPayment(p); Haptics.selectionAsync(); }}
                    >
                      <MaterialCommunityIcons
                        name={p === "pix" ? "qrcode" : "cash"}
                        size={18}
                        color={payment === p ? "#000" : colors.mutedForeground}
                      />
                      <Text style={[s.payBtnText, { color: payment === p ? "#000" : colors.mutedForeground }]}>
                        {p === "pix" ? "PIX" : "Dinheiro"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.confirmBtn, { opacity: !origin.trim() || !destination.trim() ? 0.5 : 1 }]}
                  onPress={handleRequest}
                  disabled={loading || !origin.trim() || !destination.trim()}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="car" size={20} color="#000" />
                      <Text style={s.confirmBtnText}>Solicitar Corrida</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={s.statusCard}>
              {activeRide.status in statusConfig && (
                <Animated.View style={[s.statusBadge, activeRide.status === "waiting" ? pulseStyle : {}]}>
                  <Feather
                    name={statusConfig[activeRide.status as keyof typeof statusConfig]?.icon ?? "clock"}
                    size={22}
                    color={statusConfig[activeRide.status as keyof typeof statusConfig]?.color ?? colors.primary}
                  />
                  <Text style={[s.statusText, { color: statusConfig[activeRide.status as keyof typeof statusConfig]?.color ?? colors.primary }]}>
                    {statusConfig[activeRide.status as keyof typeof statusConfig]?.label ?? ""}
                  </Text>
                </Animated.View>
              )}

              <View style={s.rideDetail}>
                <View style={[s.inputDot, { backgroundColor: colors.statusAccepted }]} />
                <Text style={s.rideDetailText}>{activeRide.origin}</Text>
              </View>
              <View style={s.rideDetail}>
                <View style={[s.inputDot, { backgroundColor: colors.statusInProgress }]} />
                <Text style={s.rideDetailText}>{activeRide.destination}</Text>
              </View>

              {activeRide.price !== undefined && (
                <View style={s.ridePriceBadge}>
                  <Feather name="dollar-sign" size={14} color={colors.statusAccepted} />
                  <Text style={s.ridePriceText}>R$ {activeRide.price.toFixed(2).replace(".", ",")}</Text>
                  <Text style={[s.ridePriceText, { fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }]}>
                    · {activeRide.payment === "pix" ? "PIX" : "Dinheiro"}
                  </Text>
                </View>
              )}

              {activeRide.driverName && (
                <View style={s.driverInfo}>
                  <UserAvatar name={activeRide.driverName} photo={activeRide.driverPhoto} size={52} mode="driver" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{activeRide.driverName}</Text>
                    <Text style={s.driverSub}>Seu motorista</Text>
                    {(activeRide.driverAvgRating ?? 0) > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                        <Feather name="star" size={12} color={colors.primary} />
                        <Text style={s.driverRating}>{activeRide.driverAvgRating!.toFixed(1)} · {activeRide.driverRideCount} corridas</Text>
                      </View>
                    ) : (
                      <Text style={[s.driverSub, { marginTop: 2 }]}>Novo motorista</Text>
                    )}
                  </View>
                </View>
              )}

              <View style={s.actionRow}>
                {(activeRide.status === "accepted" || activeRide.status === "in_progress") && (
                  <TouchableOpacity style={s.chatBtn} onPress={() => router.push("/chat")}>
                    <Feather name="message-circle" size={18} color="#000" />
                    <Text style={s.chatBtnText}>Chat</Text>
                  </TouchableOpacity>
                )}
                {(activeRide.status === "waiting" || activeRide.status === "accepted") && (
                  <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                    <Text style={s.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                )}
                {activeRide.status === "finished" && (
                  <TouchableOpacity style={[s.confirmBtn, { flex: 1 }]} onPress={() => router.replace("/(tabs)")}>
                    <Text style={s.confirmBtnText}>Nova corrida</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
