import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import type { User } from "@/context/AppContext";

type Tab = "dashboard" | "rides" | "passengers" | "drivers" | "pricing";

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  const colors = useColors();
  const s = StyleSheet.create({
    card: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: colors.border, alignItems: "center", minWidth: 80,
    },
    num: { fontSize: 26, fontWeight: "900", fontFamily: "Inter_700Bold" },
    label: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
    sub: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  });
  return (
    <View style={s.card}>
      <Text style={[s.num, { color }]}>{value}</Text>
      <Text style={s.label}>{label}</Text>
      {sub && <Text style={[s.sub, { color }]}>{sub}</Text>}
    </View>
  );
}

function EditUserModal({ user, onSave, onDelete, onClose }: {
  user: User;
  onSave: (id: string, data: { name: string; phone: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const s = StyleSheet.create({
    overlay: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100,
      alignItems: "center", justifyContent: "center", padding: 24,
    },
    card: {
      backgroundColor: colors.background, borderRadius: 20, padding: 24,
      width: "100%", maxWidth: 400, borderWidth: 1, borderColor: colors.border,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 18 },
    label: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase" },
    input: {
      backgroundColor: colors.card, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 14, fontSize: 15,
      color: colors.foreground, fontFamily: "Inter_400Regular",
      borderWidth: 1, borderColor: colors.border, marginBottom: 14,
    },
    row: { flexDirection: "row", gap: 10, marginTop: 8 },
    saveBtn: {
      flex: 2, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
    },
    saveBtnText: { fontSize: 15, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    cancelBtn: {
      flex: 1, backgroundColor: colors.muted, borderRadius: 12, paddingVertical: 14, alignItems: "center",
      borderWidth: 1, borderColor: colors.border,
    },
    cancelBtnText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    deleteBtn: {
      backgroundColor: colors.destructive + "22", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6,
      borderWidth: 1, borderColor: colors.destructive,
      marginTop: 16,
    },
    deleteBtnText: { fontSize: 14, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" },
  });

  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <UserAvatar name={user.name} photo={user.photo} size={44} mode={user.mode as any} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{user.mode === "driver" ? "Editar Motorista" : "Editar Passageiro"}</Text>
          </View>
        </View>

        <Text style={s.label}>Nome</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={colors.mutedForeground} />

        <Text style={s.label}>Telefone</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={colors.mutedForeground} />

        <View style={s.row}>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.saveBtn} disabled={saving} onPress={async () => {
            setSaving(true);
            await onSave(user.id, { name: name.trim(), phone: phone.trim() });
            setSaving(false);
            onClose();
          }}>
            {saving ? <ActivityIndicator color="#000" size="small" /> : (
              <>
                <Feather name="check" size={16} color="#000" />
                <Text style={s.saveBtnText}>Salvar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {confirmDelete ? (
          <View style={s.row}>
            <TouchableOpacity style={[s.cancelBtn, { flex: 1 }]} onPress={() => setConfirmDelete(false)}>
              <Text style={s.cancelBtnText}>Não</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.deleteBtn, { flex: 2, marginTop: 0 }]} onPress={async () => {
              setSaving(true);
              await onDelete(user.id);
              onClose();
            }}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={s.deleteBtnText}>Sim, excluir</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.deleteBtn} onPress={() => setConfirmDelete(true)}>
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={s.deleteBtnText}>Excluir usuário</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AdminHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    allRides, allUsers, pricing, adminStats,
    refreshAdminData, refreshAdminStats, refreshPricing,
    setPricingRule, deletePricingRule, logout,
    adminUpdateUser, adminDeleteUser, adminClearRides,
  } = useApp();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [newCity, setNewCity] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [localCityName, setLocalCityName] = useState("");
  const [localPriceValue, setLocalPriceValue] = useState("");
  const [savingLocalPrice, setSavingLocalPrice] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmClearRides, setConfirmClearRides] = useState(false);
  const [clearingRides, setClearingRides] = useState(false);

  useEffect(() => {
    Promise.all([refreshAdminData(), refreshPricing(), refreshAdminStats()])
      .then(() => setLoading(false));
    const interval = setInterval(() => {
      refreshAdminData();
      refreshAdminStats();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Sync local price fields when pricing loads
  useEffect(() => {
    const localRule = pricing.find((p) => p.isLocal);
    if (localRule) {
      setLocalCityName(localRule.destination);
      setLocalPriceValue(localRule.price.toFixed(2));
    }
  }, [pricing]);

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

  const handleSaveLocalPrice = async () => {
    if (!localCityName.trim() || !localPriceValue.trim()) return;
    const price = parseFloat(localPriceValue.replace(",", "."));
    if (isNaN(price) || price <= 0) return;
    setSavingLocalPrice(true);
    await setPricingRule(localCityName.trim(), price, true);
    setSavingLocalPrice(false);
  };

  const handleDeleteLocalPrice = async () => {
    const localRule = pricing.find((p) => p.isLocal);
    if (!localRule) return;
    await deletePricingRule(localRule.id);
    setLocalCityName("");
    setLocalPriceValue("");
  };

  const handleClearRides = async () => {
    if (!confirmClearRides) { setConfirmClearRides(true); return; }
    setClearingRides(true);
    await adminClearRides();
    await refreshAdminStats();
    setConfirmClearRides(false);
    setClearingRides(false);
  };

  const activeRides = allRides.filter((r) => ["waiting", "accepted", "in_progress"].includes(r.status));
  const passengers = allUsers.filter((u) => u.mode === "client");
  const drivers = allUsers.filter((u) => u.mode === "driver");

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title: { fontSize: 24, fontWeight: "900", color: colors.foreground, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    tabs: { flexDirection: "row", paddingHorizontal: 16, gap: 5, marginBottom: 14 },
    tabBtn: {
      flex: 1, paddingVertical: 9, borderRadius: 10,
      alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 4,
    },
    tabText: { fontSize: 10, fontWeight: "700", fontFamily: "Inter_700Bold" },
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
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    userInfo: { flex: 1 },
    userName: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    userPhone: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    userRatingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    userRatingBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: colors.primary + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    },
    userRatingText: { fontSize: 13, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    userRideCount: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    noRating: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 },
    editBtn: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border,
    },
    onlineDot: {
      position: "absolute", bottom: 1, right: 1,
      width: 13, height: 13, borderRadius: 7,
      borderWidth: 2, borderColor: colors.card,
    },
    onlineBadge: {
      borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    },
    onlineBadgeText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
    empty: { alignItems: "center", paddingVertical: 48, gap: 12 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
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
    dashScroll: { flex: 1, paddingHorizontal: 20 },
    dashSection: { marginBottom: 20 },
    dashSectionTitle: {
      fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10,
    },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    revenueCard: {
      backgroundColor: colors.statusAccepted + "18", borderRadius: 16, padding: 18,
      borderWidth: 1, borderColor: colors.statusAccepted + "44", marginBottom: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    revenueLabel: { fontSize: 14, color: colors.statusAccepted, fontFamily: "Inter_600SemiBold" },
    revenueValue: { fontSize: 28, fontWeight: "900", color: colors.statusAccepted, fontFamily: "Inter_700Bold" },
    revenueToday: { fontSize: 12, color: colors.statusAccepted + "aa", fontFamily: "Inter_400Regular", marginTop: 4 },
    dangerCard: {
      backgroundColor: colors.destructive + "15", borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: colors.destructive + "44",
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    dangerCardTitle: { fontSize: 14, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" },
    dangerCardSub: { fontSize: 12, color: colors.destructive + "aa", fontFamily: "Inter_400Regular", marginTop: 2 },
    dangerBtn: {
      backgroundColor: colors.destructive, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    dangerBtnConfirm: {
      backgroundColor: colors.destructive + "33", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
      flexDirection: "row", alignItems: "center", gap: 6,
      borderWidth: 1, borderColor: colors.destructive,
    },
    dangerBtnText: { fontSize: 13, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
    dangerBtnTextAlt: { fontSize: 13, fontWeight: "700", color: colors.destructive, fontFamily: "Inter_700Bold" },
  });

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "bar-chart-2" },
    { id: "rides", label: "Corridas", icon: "car" },
    { id: "passengers", label: "Passag.", icon: "user" },
    { id: "drivers", label: "Motoristas", icon: "truck" },
    { id: "pricing", label: "Preços", icon: "dollar-sign" },
  ];

  const renderUserCard = (item: User) => {
    const isOnline = item.mode === "driver" && (item as any).active === true;
    return (
      <View style={s.userCard} key={item.id}>
        <View style={{ position: "relative" }}>
          <UserAvatar name={item.name} photo={item.photo} size={46} mode={item.mode as any} />
          {item.mode === "driver" && (
            <View style={[
              s.onlineDot,
              { backgroundColor: isOnline ? "#4CAF50" : colors.mutedForeground + "66" },
            ]} />
          )}
        </View>
        <View style={s.userInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.userName}>{item.name}</Text>
            {item.mode === "driver" && (
              <View style={[
                s.onlineBadge,
                { backgroundColor: isOnline ? "#4CAF50" + "22" : colors.muted },
              ]}>
                <Text style={[s.onlineBadgeText, { color: isOnline ? "#4CAF50" : colors.mutedForeground }]}>
                  {isOnline ? "Online" : "Offline"}
                </Text>
              </View>
            )}
          </View>
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
        <TouchableOpacity style={s.editBtn} onPress={() => setEditingUser(item)}>
          <Feather name="edit-2" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={async (id, data) => { await adminUpdateUser(id, data); }}
          onDelete={async (id) => { await adminDeleteUser(id); }}
          onClose={() => setEditingUser(null)}
        />
      )}

      <View style={s.header}>
        <View>
          <Text style={s.title}>Admin</Text>
          <Text style={s.sub}>KD TAXI Dashboard</Text>
        </View>
        <TouchableOpacity style={{ padding: 8 }} onPress={logout}>
          <Feather name="log-out" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.tabBtn, { backgroundColor: tab === t.id ? colors.primary : colors.card, borderWidth: 1, borderColor: tab === t.id ? colors.primary : colors.border }]}
            onPress={() => setTab(t.id)}
          >
            <Feather name={t.icon as any} size={12} color={tab === t.id ? "#000" : colors.mutedForeground} />
            <Text style={[s.tabText, { color: tab === t.id ? "#000" : colors.mutedForeground }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : tab === "dashboard" ? (
        <ScrollView style={s.dashScroll} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}>
          <View style={s.dashSection}>
            <Text style={s.dashSectionTitle}>Receita</Text>
            <View style={s.revenueCard}>
              <View>
                <Text style={s.revenueLabel}>Total arrecadado</Text>
                <Text style={s.revenueValue}>
                  R$ {(adminStats?.totalRevenue ?? 0).toFixed(2).replace(".", ",")}
                </Text>
                <Text style={s.revenueToday}>
                  Hoje: R$ {(adminStats?.todayRevenue ?? 0).toFixed(2).replace(".", ",")}
                </Text>
              </View>
              <MaterialCommunityIcons name="cash-multiple" size={44} color={colors.statusAccepted + "66"} />
            </View>
          </View>

          <View style={s.dashSection}>
            <Text style={s.dashSectionTitle}>Corridas</Text>
            <View style={s.statRow}>
              <StatCard label="Hoje" value={adminStats?.todayRides ?? 0} color={colors.primary} />
              <StatCard label="Ativas" value={adminStats?.activeRides ?? 0} color={colors.statusWaiting} />
              <StatCard label="Finalizadas" value={adminStats?.finishedRides ?? 0} color={colors.statusAccepted} />
              <StatCard label="Canceladas" value={adminStats?.cancelledRides ?? 0} color={colors.mutedForeground} />
            </View>
          </View>

          <View style={s.dashSection}>
            <Text style={s.dashSectionTitle}>Usuários</Text>
            <View style={s.statRow}>
              <StatCard label="Passageiros" value={adminStats?.totalClients ?? 0} color={colors.primary} />
              <StatCard label="Motoristas" value={adminStats?.totalDrivers ?? 0} color={colors.statusAccepted} />
              <StatCard label="Total" value={adminStats?.totalUsers ?? 0} color={colors.foreground} />
              <StatCard
                label="Avaliação"
                value={(adminStats?.avgRating ?? 0) > 0 ? `${(adminStats!.avgRating).toFixed(1)}★` : "—"}
                color={colors.primary}
              />
            </View>
            <View style={s.statRow}>
              <StatCard
                label="Online agora"
                value={adminStats?.onlineDrivers ?? 0}
                sub={adminStats?.onlineDrivers ? "🟢 ativos" : undefined}
                color={adminStats?.onlineDrivers ? "#4CAF50" : colors.mutedForeground}
              />
              <View style={{ flex: 3 }} />
            </View>
          </View>

          <View style={s.dashSection}>
            <Text style={s.dashSectionTitle}>Ações de administrador</Text>
            <View style={s.dangerCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.dangerCardTitle}>Limpar histórico de corridas</Text>
                <Text style={s.dangerCardSub}>Remove todas as corridas do sistema permanentemente</Text>
              </View>
              {confirmClearRides ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={[s.dangerBtnConfirm]} onPress={handleClearRides} disabled={clearingRides}>
                    {clearingRides ? <ActivityIndicator size="small" color={colors.destructive} /> : (
                      <Text style={s.dangerBtnTextAlt}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmClearRides(false)}>
                    <Text style={[s.confirmBtnText, { color: colors.mutedForeground }]}>Não</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.dangerBtn} onPress={handleClearRides}>
                  <Feather name="trash-2" size={15} color="#fff" />
                  <Text style={s.dangerBtnText}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      ) : tab === "pricing" ? (
        <FlatList
          style={s.pricingContent}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}
          data={pricing.filter((p) => !p.isLocal)}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={
            <View>
              {/* Local city price */}
              <View style={[s.addCard, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "0A" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <MaterialCommunityIcons name="home-city" size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.addTitle, { color: colors.primary, marginBottom: 0 }]}>Preço Local (dentro da cidade)</Text>
                    <Text style={[s.pricingHint, { marginBottom: 0, marginTop: 2 }]}>
                      Aplicado quando o destino não coincidir com nenhuma cidade específica
                    </Text>
                  </View>
                </View>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input} value={localCityName} onChangeText={setLocalCityName}
                    placeholder="Nome da cidade local" placeholderTextColor={colors.mutedForeground}
                  />
                  <TextInput
                    style={s.priceInput} value={localPriceValue} onChangeText={setLocalPriceValue}
                    placeholder="R$" placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={[s.addBtn, { flex: 2, backgroundColor: colors.primary, opacity: !localCityName.trim() || !localPriceValue.trim() ? 0.5 : 1 }]}
                    onPress={handleSaveLocalPrice}
                    disabled={savingLocalPrice || !localCityName.trim() || !localPriceValue.trim()}
                  >
                    {savingLocalPrice ? (
                      <ActivityIndicator color="#000" size="small" />
                    ) : (
                      <>
                        <Feather name="save" size={16} color="#000" />
                        <Text style={s.addBtnText}>Salvar preço local</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {pricing.find((p) => p.isLocal) && (
                    <TouchableOpacity
                      style={[s.addBtn, { flex: 1, backgroundColor: colors.destructive + "22", borderWidth: 1, borderColor: colors.destructive }]}
                      onPress={handleDeleteLocalPrice}
                    >
                      <Feather name="trash-2" size={16} color={colors.destructive} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Out-of-city destinations */}
              <View style={s.addCard}>
                <Text style={s.addTitle}>Destinos fora da cidade</Text>
                <Text style={s.pricingHint}>
                  O preço é exibido automaticamente ao cliente quando o destino digitado coincidir com o nome cadastrado.
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
                      <Text style={s.addBtnText}>Adicionar destino</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {pricing.filter((p) => !p.isLocal).length > 0 && (
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
                    onPress={() => { setPendingDeleteId(null); deletePricingRule(item.id); }}
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
                  <TouchableOpacity style={s.deleteBtn} onPress={() => setPendingDeleteId(item.id)}>
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
