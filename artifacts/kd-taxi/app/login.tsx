import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp, API_BASE } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import type { UserMode } from "@/context/AppContext";

type LoginTab = "user" | "admin";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setUser } = useApp();

  const [tab, setTab] = useState<LoginTab>("user");

  // User login fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [selectedMode, setSelectedMode] = useState<UserMode>("client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Admin login fields
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const userModes: { id: UserMode; label: string; icon: string; desc: string }[] = [
    { id: "client", label: "Cliente", icon: "account", desc: "Solicitar táxi" },
    { id: "driver", label: "Motorista", icon: "car", desc: "Aceitar corridas" },
  ];

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
      Haptics.selectionAsync();
    }
  };

  const handleUserLogin = async () => {
    if (!name.trim() || !phone.trim()) { setError("Preencha nome e telefone"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), mode: selectedMode, photo }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id, name: data.name, phone: data.phone, mode: selectedMode,
          photo: photo ?? data.photo, rating: data.rating, rideCount: data.rideCount,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Erro ao entrar. Tente novamente.");
      }
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    if (!adminPhone.trim() || !adminPassword.trim()) { setError("Preencha usuário e senha"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: adminPhone.trim(), password: adminPassword, mode: "admin" }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser({ id: data.id, name: data.name, phone: data.phone, mode: "admin", photo: data.photo, rating: data.rating, rideCount: data.rideCount });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Credenciais inválidas");
      }
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { position: "absolute", top: 0, left: 0, right: 0, height: 260 },
    scroll: { flexGrow: 1 },
    top: { paddingTop: (Platform.OS === "web" ? 60 : insets.top) + 32, paddingHorizontal: 28, paddingBottom: 20, alignItems: "center" },
    logoRing: {
      width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center", marginBottom: 14,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
    },
    appName: { fontSize: 38, fontWeight: "900", color: colors.foreground, letterSpacing: -1, fontFamily: "Inter_700Bold" },
    tagline: { fontSize: 15, color: colors.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" },
    tabRow: {
      flexDirection: "row", marginHorizontal: 24, marginBottom: 24,
      backgroundColor: colors.card, borderRadius: 14, padding: 4,
      borderWidth: 1, borderColor: colors.border,
    },
    tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
    tabBtnText: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    form: { flex: 1, paddingHorizontal: 24, paddingBottom: (Platform.OS === "web" ? 32 : insets.bottom) + 20 },
    label: {
      fontSize: 13, color: colors.mutedForeground, marginBottom: 8, fontFamily: "Inter_500Medium",
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    input: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: colors.foreground,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16, fontFamily: "Inter_400Regular",
    },
    passwordRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: colors.card, borderRadius: colors.radius,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16,
    },
    passwordInput: {
      flex: 1, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16,
      color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    eyeBtn: { padding: 14 },
    photoRow: { alignItems: "center", marginBottom: 20 },
    photoBtn: {
      width: 76, height: 76, borderRadius: 38, backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", overflow: "hidden",
    },
    photoHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 8, fontFamily: "Inter_400Regular" },
    modesRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
    modeCard: { flex: 1, paddingVertical: 18, paddingHorizontal: 8, borderRadius: colors.radius, alignItems: "center", borderWidth: 2 },
    modeLabel: { fontSize: 13, marginTop: 8, fontFamily: "Inter_600SemiBold" },
    modeDesc: { fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
    btn: {
      borderRadius: colors.radius, paddingVertical: 18, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    btnText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
    error: { color: colors.destructive, textAlign: "center", marginBottom: 12, fontFamily: "Inter_400Regular", fontSize: 14 },
    sectionLabel: {
      fontSize: 13, color: colors.mutedForeground, marginBottom: 10, fontFamily: "Inter_500Medium",
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    adminHint: {
      fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular",
      textAlign: "center", marginBottom: 20, lineHeight: 20,
    },
    adminCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 18, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", alignItems: "center", gap: 14,
    },
    adminCardIcon: {
      width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + "33",
      alignItems: "center", justifyContent: "center",
    },
    adminCardTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    adminCardSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={["#2A2000", colors.background]} style={s.gradient} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <View style={s.logoRing}>
              <MaterialCommunityIcons name="car-side" size={40} color="#000" />
            </View>
            <Text style={s.appName}>KD TAXI</Text>
            <Text style={s.tagline}>Seu táxi na cidade</Text>
          </View>

          <View style={s.tabRow}>
            <TouchableOpacity
              style={[s.tabBtn, { backgroundColor: tab === "user" ? colors.primary : "transparent" }]}
              onPress={() => { setTab("user"); setError(""); Haptics.selectionAsync(); }}
            >
              <MaterialCommunityIcons name="account" size={16} color={tab === "user" ? "#000" : colors.mutedForeground} />
              <Text style={[s.tabBtnText, { color: tab === "user" ? "#000" : colors.mutedForeground }]}>Usuário</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, { backgroundColor: tab === "admin" ? colors.card : "transparent", borderWidth: tab === "admin" ? 1 : 0, borderColor: colors.border }]}
              onPress={() => { setTab("admin"); setError(""); Haptics.selectionAsync(); }}
            >
              <MaterialCommunityIcons name="shield-check" size={16} color={tab === "admin" ? colors.foreground : colors.mutedForeground} />
              <Text style={[s.tabBtnText, { color: tab === "admin" ? colors.foreground : colors.mutedForeground }]}>Admin</Text>
            </TouchableOpacity>
          </View>

          <View style={s.form}>
            {tab === "user" ? (
              <>
                <View style={s.photoRow}>
                  <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
                    {photo ? (
                      <UserAvatar name={name || "?"} photo={photo} size={76} />
                    ) : (
                      <Feather name="camera" size={26} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                  <Text style={s.photoHint}>{photo ? "Toque para trocar" : "Adicionar foto (opcional)"}</Text>
                </View>

                <Text style={s.label}>Nome</Text>
                <TextInput
                  style={s.input} value={name} onChangeText={setName}
                  placeholder="Seu nome completo" placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />

                <Text style={s.label}>Telefone</Text>
                <TextInput
                  style={s.input} value={phone} onChangeText={setPhone}
                  placeholder="(00) 00000-0000" placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                />

                <Text style={s.sectionLabel}>Entrar como</Text>
                <View style={s.modesRow}>
                  {userModes.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.modeCard, {
                        backgroundColor: selectedMode === m.id ? colors.primary : colors.card,
                        borderColor: selectedMode === m.id ? colors.primary : colors.border,
                      }]}
                      onPress={() => { setSelectedMode(m.id); Haptics.selectionAsync(); }}
                    >
                      <MaterialCommunityIcons
                        name={m.icon as any} size={30}
                        color={selectedMode === m.id ? "#000" : colors.mutedForeground}
                      />
                      <Text style={[s.modeLabel, { color: selectedMode === m.id ? "#000" : colors.foreground }]}>
                        {m.label}
                      </Text>
                      <Text style={[s.modeDesc, { color: selectedMode === m.id ? "#00000099" : colors.mutedForeground }]}>
                        {m.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!!error && <Text style={s.error}>{error}</Text>}

                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.primary }]}
                  onPress={handleUserLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Feather name="arrow-right" size={20} color="#000" />
                      <Text style={[s.btnText, { color: "#000" }]}>Entrar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.adminCard}>
                  <View style={s.adminCardIcon}>
                    <MaterialCommunityIcons name="shield-check" size={24} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.adminCardTitle}>Área Restrita</Text>
                    <Text style={s.adminCardSub}>Acesso exclusivo para administradores cadastrados</Text>
                  </View>
                </View>

                <Text style={s.label}>Usuário Admin</Text>
                <TextInput
                  style={s.input} value={adminPhone} onChangeText={setAdminPhone}
                  placeholder="Usuário (ex: admin)" placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none" autoCorrect={false}
                />

                <Text style={s.label}>Senha</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput} value={adminPassword} onChangeText={setAdminPassword}
                    placeholder="Senha de acesso" placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {!!error && <Text style={s.error}>{error}</Text>}

                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={handleAdminLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.foreground} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="shield-lock" size={20} color={colors.foreground} />
                      <Text style={[s.btnText, { color: colors.foreground }]}>Acessar Painel</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
