import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator, FlatList, Platform, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

export default function MyRidesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, myRides, fetchMyRides } = useApp();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    fetchMyRides().then(() => setLoading(false));
  }, []);

  const isDriver = user?.mode === "driver";

  const statusLabels: Record<string, string> = {
    waiting: "Aguardando", accepted: "Aceita",
    in_progress: "Em andamento", finished: "Finalizada", cancelled: "Cancelada",
  };
  const statusColors: Record<string, string> = {
    waiting: colors.statusWaiting, accepted: colors.statusAccepted,
    in_progress: colors.statusInProgress, finished: colors.statusAccepted, cancelled: colors.mutedForeground,
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
    headerCount: {
      backgroundColor: colors.primary + "22", borderRadius: 12,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    headerCountText: { fontSize: 12, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    list: { flex: 1 },
    card: {
      backgroundColor: colors.card, borderRadius: 16,
      marginHorizontal: 16, marginBottom: 10,
      borderWidth: 1, borderColor: colors.border,
      overflow: "hidden",
    },
    cardTop: { padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
    avatarWrap: {},
    cardInfo: { flex: 1 },
    personName: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    personSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
    statusText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 14 },
    cardBottom: { padding: 14 },
    routeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    routeDot: { width: 8, height: 8, borderRadius: 4 },
    routeText: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 },
    metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    metaDate: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    priceTag: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: colors.statusAccepted + "15", borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 4,
    },
    priceText: { fontSize: 14, fontWeight: "700", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    payText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    ratingText: { fontSize: 12, color: colors.primary, fontFamily: "Inter_500Medium" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 60 },
    emptyText: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    emptySub: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Minhas corridas</Text>
        {!loading && myRides.length > 0 && (
          <View style={s.headerCount}>
            <Text style={s.headerCountText}>{myRides.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : myRides.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="car-outline" size={56} color={colors.mutedForeground} />
          <Text style={s.emptyText}>Nenhuma corrida ainda</Text>
          <Text style={s.emptySub}>
            {isDriver
              ? "Suas corridas finalizadas aparecerão aqui."
              : "Suas viagens finalizadas aparecerão aqui."}
          </Text>
        </View>
      ) : (
        <FlatList
          style={s.list}
          data={myRides}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 24 }}
          renderItem={({ item: ride }) => {
            const otherName = isDriver ? ride.clientName : (ride.driverName ?? "—");
            const otherPhoto = isDriver ? ride.clientPhoto : ride.driverPhoto;
            const otherMode = isDriver ? "client" : "driver" as const;
            const otherLabel = isDriver ? "Passageiro" : "Motorista";
            const rating = isDriver ? ride.driverRating : ride.clientRating;
            const statusColor = statusColors[ride.status] ?? colors.mutedForeground;

            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <UserAvatar name={otherName} photo={otherPhoto} size={44} mode={otherMode} />
                  <View style={s.cardInfo}>
                    <Text style={s.personName}>{otherName}</Text>
                    <Text style={s.personSub}>{otherLabel}</Text>
                    {rating !== undefined && (
                      <View style={s.ratingRow}>
                        <Feather name="star" size={11} color={colors.primary} />
                        <Text style={s.ratingText}>Avaliação: {rating.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>
                      {statusLabels[ride.status] ?? ride.status}
                    </Text>
                  </View>
                </View>
                <View style={s.divider} />
                <View style={s.cardBottom}>
                  <View style={s.routeRow}>
                    <View style={[s.routeDot, { backgroundColor: colors.statusAccepted }]} />
                    <Text style={s.routeText} numberOfLines={1}>{ride.origin}</Text>
                  </View>
                  <View style={s.routeRow}>
                    <View style={[s.routeDot, { backgroundColor: colors.statusInProgress }]} />
                    <Text style={s.routeText} numberOfLines={1}>{ride.destination}</Text>
                  </View>
                  <View style={s.metaRow}>
                    <Text style={s.metaDate}>
                      {new Date(ride.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })}
                    </Text>
                    {ride.price !== undefined ? (
                      <View style={s.priceTag}>
                        <Text style={s.priceText}>R$ {ride.price.toFixed(2).replace(".", ",")}</Text>
                        <Text style={s.payText}>· {ride.payment === "pix" ? "PIX" : "Dinheiro"}</Text>
                      </View>
                    ) : (
                      <Text style={s.payText}>Sem valor</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
