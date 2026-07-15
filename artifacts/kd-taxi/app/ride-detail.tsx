import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

export default function RideDetailScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { activeRides, unreadByRide, finishRide, cancelRide } = useApp();

  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [loading, setLoading] = useState(false);

  const ride = activeRides.find((r) => r.id === rideId);
  const unread = unreadByRide[rideId ?? ""] ?? 0;

  const handleFinish = async () => {
    if (!confirmFinish) { setConfirmFinish(true); return; }
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await finishRide(rideId!);
    router.back();
  };

  const handleCancel = async () => {
    if (!confirmCancel) { setConfirmCancel(true); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await cancelRide(rideId!);
    router.back();
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 20, paddingBottom: 16,
      flexDirection: "row", alignItems: "center", gap: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center",
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    statusBadge: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.statusInProgress + "22", borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 5,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusInProgress },
    statusText: { fontSize: 12, fontWeight: "700", color: colors.statusInProgress, fontFamily: "Inter_700Bold" },
    scroll: { flex: 1 },
    section: {
      margin: 16, backgroundColor: colors.card, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    },
    sectionHeader: {
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
      fontSize: 11, fontWeight: "700", color: colors.mutedForeground,
      fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase",
    },
    clientRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingTop: 10 },
    clientName: { fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    clientPhone: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    ratingText: { fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" },
    ratingCount: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    routeSection: { padding: 16 },
    routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
    routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
    routeLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 2 },
    routeText: { fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    routeLine: { width: 2, height: 20, backgroundColor: colors.border, marginLeft: 5, marginTop: 2, marginBottom: 2 },
    priceSection: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingVertical: 14,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    priceLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    priceValue: { fontSize: 24, fontWeight: "900", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    payBadge: {
      backgroundColor: colors.muted, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 4, marginTop: 4, alignSelf: "flex-end",
    },
    payText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    chatBtn: {
      margin: 16, marginBottom: 8, backgroundColor: colors.card,
      borderRadius: 16, paddingVertical: 18,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    chatBtnText: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    chatBadge: {
      backgroundColor: colors.destructive, borderRadius: 12,
      paddingHorizontal: 8, paddingVertical: 3, marginLeft: 4,
    },
    chatBadgeText: { fontSize: 12, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    actions: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginBottom: 12 },
    finishBtn: {
      flex: 2, backgroundColor: colors.statusAccepted, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    finishBtnConfirm: {
      flex: 2, backgroundColor: colors.destructive, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    finishBtnText: { fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    cancelBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
    },
    cancelBtnConfirm: {
      flex: 1, backgroundColor: colors.destructive + "22", borderRadius: 14, paddingVertical: 16,
      alignItems: "center", borderWidth: 1, borderColor: colors.destructive,
    },
    cancelBtnText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    cancelBtnTextConfirm: { fontSize: 14, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" },
    notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    notFoundText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    bottomPad: { height: Platform.OS === "web" ? 24 : insets.bottom + 12 },
  });

  if (!ride) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Detalhes da corrida</Text>
        </View>
        <View style={s.notFound}>
          <MaterialCommunityIcons name="car-off" size={48} color={colors.mutedForeground} />
          <Text style={s.notFoundText}>Corrida não encontrada</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Corrida em andamento</Text>
        <View style={s.statusBadge}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>Ativa</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingTop: 4 }}>
        {/* Client info */}
        <View style={s.section}>
          <Text style={s.sectionHeader}>Passageiro</Text>
          <View style={s.clientRow}>
            <UserAvatar name={ride.clientName} photo={ride.clientPhoto} size={60} mode="client" />
            <View style={{ flex: 1 }}>
              <Text style={s.clientName}>{ride.clientName}</Text>
              <Text style={s.clientPhone}>{ride.clientPhone}</Text>
              {(ride.clientAvgRating ?? 0) > 0 ? (
                <View style={s.ratingRow}>
                  <Feather name="star" size={13} color={colors.primary} />
                  <Text style={s.ratingText}>{ride.clientAvgRating!.toFixed(1)}</Text>
                  <Text style={s.ratingCount}>({ride.clientRideCount} corridas)</Text>
                </View>
              ) : (
                <Text style={[s.ratingCount, { marginTop: 4 }]}>Novo passageiro</Text>
              )}
            </View>
          </View>
        </View>

        {/* Route */}
        <View style={s.section}>
          <Text style={s.sectionHeader}>Rota</Text>
          <View style={s.routeSection}>
            <View style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: colors.statusAccepted }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.routeLabel}>Origem</Text>
                <Text style={s.routeText}>{ride.origin}</Text>
              </View>
            </View>
            <View style={s.routeLine} />
            <View style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: colors.statusInProgress }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.routeLabel}>Destino</Text>
                <Text style={s.routeText}>{ride.destination}</Text>
              </View>
            </View>
          </View>
          {ride.price !== undefined && (
            <View style={s.priceSection}>
              <View>
                <Text style={s.priceLabel}>Valor</Text>
                <Text style={s.priceValue}>R$ {ride.price.toFixed(2).replace(".", ",")}</Text>
              </View>
              <View style={s.payBadge}>
                <Text style={s.payText}>{ride.payment === "pix" ? "PIX" : "Dinheiro"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Chat */}
        <TouchableOpacity
          style={s.chatBtn}
          onPress={() => router.push(`/chat?rideId=${ride.id}` as any)}
        >
          <Feather name="message-circle" size={22} color={colors.foreground} />
          <Text style={s.chatBtnText}>Abrir chat</Text>
          {unread > 0 && (
            <View style={s.chatBadge}>
              <Text style={s.chatBadgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Actions */}
        <View style={s.actions}>
          {confirmCancel ? (
            <>
              <TouchableOpacity style={s.cancelBtnConfirm} disabled={loading} onPress={handleCancel}>
                <Text style={s.cancelBtnTextConfirm}>Confirmar cancel.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setConfirmCancel(false)}>
                <Text style={s.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
            </>
          ) : confirmFinish ? (
            <>
              <TouchableOpacity style={s.finishBtnConfirm} disabled={loading} onPress={handleFinish}>
                <Feather name="flag" size={18} color="#fff" />
                <Text style={s.finishBtnText}>Confirmar fim</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setConfirmFinish(false)}>
                <Text style={s.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
                <Feather name="flag" size={18} color="#fff" />
                <Text style={s.finishBtnText}>Finalizar corrida</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                <Text style={s.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <View style={s.bottomPad} />
      </ScrollView>
    </View>
  );
}
