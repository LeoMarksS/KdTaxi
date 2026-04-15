import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import type { PriceRule, Ride } from "@/context/AppContext";

type Tab = "rides" | "passengers" | "drivers" | "pricing";

export default function AdminHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { allRides, allUsers, pricing, refreshAdminData, refreshPricing, setPricingRule, deletePricingRule, logout } = useApp();
  const [tab, setTab] = useState<Tab>("rides");
  const [loading, setLoading] = useState(true);
  const [newCity, setNewCity] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([refreshAdminData(), refreshPricing()]).then(() => setLoading(false));
    const interval = setInterval(() => refreshAdminData(), 5000);
    return () => clearInterval(interval);
  }, []);

  const statusColors: Record<string, string> = {
    waiting: colors.statusWaiting, accepted: colors.statusAccepted,
    in_progress: colors.statusInProgress, finished: colors.statusFinished, cancelled: colors.mutedForeground,
  };
  const statusLabels: Record<string, string> = {
    waiting: "Aguardando", accepted: "Aceita",
    in_progress: "Em andamento", finished: "Finalizada", cancelled: "Cancelada",
  };

  const handleAddPrice = async () => {
    if (!newCity.trim() || !newPrice.trim()) return;
    const price = parseFloat(newPrice.replace(",", "."));
    if (isNaN(price) || price <= 0) return;
    setSavingPrice(true);
    await setPricingRule(newCity.trim(), price);
    setNewCity(""); setNewPrice("");
    setSavingPrice(false);
  };

  const handleDeletePrice = (rule: PriceRule) => {
    setPendingDeleteId(rule.id);
  };

  const confirmDeletePrice = async (id: string) => {
    setPendingDeleteId(null);
    await deletePricingRule(id);
  };

  const activeRides = allRides.filter((r) => ["waiting", "accepted", "in_progress"].includes(r.status));
  const passengers = allUsers.filter((u) => u.mode === "client");
  const drivers = allUsers.filter((u) => u.mode === "driver");

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24, paddingBottom: 16,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title: { fontSize: 24, fontWeight: "900", color: colors.foreground, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    stats: { flexDirection: "row", paddingHorizontal: 24, gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
    },
    statNum: { fontSize: 24, fontWeight: "900", color: colors.foreground, fontFamily: "Inter_700Bold" },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    tabs: { flexDirection: "row", paddingHorizontal: 24, gap: 6, marginBottom: 16 },
    tabBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 12,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5,
    },
    tabText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    list: { flex: 1, paddingHorizontal: 24 },
    card: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
    },
    cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    rideId: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    clientName: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 8, fontFamily: "Inter_700Bold" },
    rideRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    rideText: { fontSize: 13, color: colors.mutedForeground, flex: 1, fontFamily: "Inter_400Regular" },
    driverText: { fontSize: 13, color: colors.foreground, marginTop: 8, fontFamily: "Inter_500Medium" },
    priceInlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    priceInlineText: { fontSize: 13, color: colors.statusAccepted, fontFamily: "Inter_600SemiBold" },
    paymentTag: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    userCard: {
      backgroundColor: colors.card, borderRadius: colors.radius, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", alignItems: "center", gap: 14,
    },
    userInfo: { flex: 1 },
    userName: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    userPhone: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    userRatingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    userRatingBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: colors.primary + "22", borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    userRatingText: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    userRideCount: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    noRating: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 },
    empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },

    // Pricing tab
    pricingContent: { flex: 1, paddingHorizontal: 24 },
    addCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 18, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
    },
    addTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 14, fontFamily: "Inter_700Bold" },
    inputRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    input: {
      flex: 2, backgroundColor: colors.muted, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 14, fontSize: 15,
      color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    priceInput: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 14, fontSize: 15,
      color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    addBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    addBtnText: { fontSize: 15, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    priceCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", alignItems: "center",
    },
    cityName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    priceValue: { fontSize: 18, fontWeight: "800", color: colors.statusAccepted, fontFamily: "Inter_700Bold", marginRight: 14 },
    deleteBtn: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: colors.destructive + "22",
      alignItems: "center", justifyContent: "center",
    },
    confirmBtn: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      flexDirection: "row", alignItems: "center", gap: 4,
    },
    confirmBtnText: { fontSize: 12, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    pricingHint: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 16, lineHeight: 18 },
    sectionHeader: {
      fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium",
      letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, marginTop: 4,
    },
  });

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "rides", label: "Corridas", icon: "car" },
    { id: "passengers", label: "Passag.", icon: "user" },
    { id: "drivers", label: "Motoristas", icon: "truck" },
    { id: "pricing", label: "Preços", icon: "dollar-sign" },
  ];

  const renderUserCard = (item: typeof allUsers[number]) => (
    <View style={s.userCard} key={item.id}>
      <UserAvatar name={item.name} size={46} mode={item.mode as any} />
      <View style={s.userInfo}>
        <Text style={s.userName}>{item.name}</Text>
        <Text style={s.userPhone}>{item.phone}</Text>
        {(item as any).rating > 0 ? (
          <View style={s.userRatingRow}>
            <View style={s.userRatingBadge}>
              <Feather name="star" size={12} color={colors.primary} />
              <Text style={s.userRatingText}>{(item as any).rating.toFixed(1)}</Text>
            </View>
            <Text style={s.userRideCount}>{(item as any).rideCount} corrida{(item as any).rideCount !== 1 ? "s" : ""}</Text>
          </View>
        ) : (
          <Text style={s.noRating}>Sem avaliações ainda</Text>
        )}
      </View>
    </View>
  );

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
          <Text style={[s.statNum, { color: colors.primary }]}>{passengers.length}</Text>
          <Text style={s.statLabel}>Passag.</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: colors.statusInProgress }]}>{allRides.length}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
      </View>

      <View style={s.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, { backgroundColor: tab === t.id ? colors.primary : colors.card }]}
            onPress={() => setTab(t.id)}
          >
            <Feather name={t.icon as any} size={13} color={tab === t.id ? "#000" : colors.mutedForeground} />
            <Text style={[s.tabText, { color: tab === t.id ? "#000" : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : tab === "pricing" ? (
        <FlatList
          style={s.pricingContent}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          data={pricing}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={
            <View>
              <View style={s.addCard}>
                <Text style={s.addTitle}>Adicionar / Atualizar destino</Text>
                <Text style={s.pricingHint}>
                  O preço é exibido automaticamente ao cliente quando o destino digitado coincidir com o nome da cidade cadastrada.
                </Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input} value={newCity} onChangeText={setNewCity}
                    placeholder="Nome da cidade/destino" placeholderTextColor={colors.mutedForeground}
                  />
                  <TextInput
                    style={s.priceInput} value={newPrice} onChangeText={setNewPrice}
                    placeholder="R$" placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
                <TouchableOpacity
                  style={[s.addBtn, { opacity: !newCity.trim() || !newPrice.trim() ? 0.5 : 1 }]}
                  onPress={handleAddPrice}
                  disabled={savingPrice || !newCity.trim() || !newPrice.trim()}
                >
                  {savingPrice ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <>
                      <Feather name="plus" size={18} color="#000" />
                      <Text style={s.addBtnText}>Salvar preço</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {pricing.length > 0 && (
                <Text style={[s.pricingHint, { marginBottom: 10 }]}>Destinos cadastrados:</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.priceCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.cityName}>{item.destination}</Text>
              </View>
              {pendingDeleteId === item.id ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    style={[s.confirmBtn, { backgroundColor: colors.destructive }]}
                    onPress={() => confirmDeletePrice(item.id)}
                  >
                    <Feather name="check" size={13} color="#fff" />
                    <Text style={s.confirmBtnText}>Remover</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, { backgroundColor: colors.muted }]}
                    onPress={() => setPendingDeleteId(null)}
                  >
                    <Text style={[s.confirmBtnText, { color: colors.mutedForeground }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={s.priceValue}>R$ {item.price.toFixed(2).replace(".", ",")}</Text>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeletePrice(item)}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="dollar-sign" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Nenhum destino cadastrado</Text>
            </View>
          }
        />
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
              {item.price !== undefined && (
                <View style={s.priceInlineRow}>
                  <Feather name="dollar-sign" size={13} color={colors.statusAccepted} />
                  <Text style={s.priceInlineText}>R$ {item.price.toFixed(2).replace(".", ",")}</Text>
                  <Text style={s.paymentTag}>· {item.payment === "pix" ? "PIX" : "Dinheiro"}</Text>
                </View>
              )}
              {item.driverName && <Text style={s.driverText}>Motorista: {item.driverName}</Text>}
              {(item.clientRating || item.driverRating) && (
                <Text style={[s.driverText, { color: colors.primary }]}>
                  {item.clientRating ? `Cliente: ${item.clientRating}★ ` : ""}
                  {item.driverRating ? `Motorista: ${item.driverRating}★` : ""}
                </Text>
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
      ) : tab === "passengers" ? (
        <FlatList
          style={s.list}
          data={passengers}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          ListHeaderComponent={
            passengers.length > 0 ? (
              <Text style={s.sectionHeader}>{passengers.length} passageiro{passengers.length !== 1 ? "s" : ""} cadastrado{passengers.length !== 1 ? "s" : ""}</Text>
            ) : null
          }
          renderItem={({ item }) => renderUserCard(item)}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="user" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Nenhum passageiro ainda</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          style={s.list}
          data={drivers}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          ListHeaderComponent={
            drivers.length > 0 ? (
              <Text style={s.sectionHeader}>{drivers.length} motorista{drivers.length !== 1 ? "s" : ""} cadastrado{drivers.length !== 1 ? "s" : ""}</Text>
            ) : null
          }
          renderItem={({ item }) => renderUserCard(item)}
          ListEmptyComponent={
            <View style={s.empty}>
              <MaterialCommunityIcons name="car" size={48} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Nenhum motorista ainda</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
