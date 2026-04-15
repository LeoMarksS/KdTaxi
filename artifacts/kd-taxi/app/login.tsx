import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp, API_BASE } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import type { UserMode } from "@/context/AppContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setUser } = useApp();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [selectedMode, setSelectedMode] = useState<UserMode>("client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const modes: { id: UserMode; label: string; icon: string; desc: string }[] = [
    { id: "client", label: "Cliente", icon: "account", desc: "Solicitar táxi" },
    { id: "driver", label: "Motorista", icon: "car", desc: "Aceitar corridas" },
    { id: "admin", label: "Admin", icon: "shield-check", desc: "Gerenciar" },
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

  const handleLogin = async () => {
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
        setUser({ id: data.id, name: data.name, phone: data.phone, mode: selectedMode, photo: photo ?? data.photo, rating: data.rating, rideCount: data.rideCount });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      } else {
        setError("Erro ao entrar. Tente novamente.");
      }
    } catch {
      setUser({ id: Date.now().toString(), name: name.trim(), phone: phone.trim(), mode: selectedMode!, photo });
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { position: "absolute", top: 0, left: 0, right: 0, height: 300 },
    scroll: { flexGrow: 1 },
    top: { paddingTop: insets.top + 40, paddingHorizontal: 28, paddingBottom: 24, alignItems: "center" },
    logoRing: {
      width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center", marginBottom: 16,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
    },
    appName: { fontSize: 38, fontWeight: "900", color: colors.foreground, letterSpacing: -1, fontFamily: "Inter_700Bold" },
    tagline: { fontSize: 15, color: colors.mutedForeground, marginTop: 4, fontFamily: "Inter_400Regular" },
    form: { flex: 1, paddingHorizontal: 24, paddingBottom: insets.bottom + 32 },
    label: {
      fontSize: 13, color: colors.mutedForeground, marginBottom: 8, fontFamily: "Inter_500Medium",
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    input: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: colors.foreground,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16, fontFamily: "Inter_400Regular",
    },
    photoRow: { alignItems: "center", marginBottom: 24 },
    photoBtn: {
      width: 80, height: 80, borderRadius: 40, backgroundColor: colors.card,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", overflow: "hidden",
    },
    photoHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 8, fontFamily: "Inter_400Regular" },
    modesRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
    modeCard: { flex: 1, paddingVertical: 16, paddingHorizontal: 8, borderRadius: colors.radius, alignItems: "center", borderWidth: 2 },
    modeLabel: { fontSize: 12, marginTop: 6, fontFamily: "Inter_600SemiBold" },
    modeDesc: { fontSize: 10, marginTop: 2, fontFamily: "Inter_400Regular" },
    btn: {
      borderRadius: colors.radius, paddingVertical: 18, alignItems: "center",
      justifyContent: "center", flexDirection: "row", gap: 8,
    },
    btnText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
    error: { color: colors.destructive, textAlign: "center", marginBottom: 12, fontFamily: "Inter_400Regular" },
    sectionLabel: {
      fontSize: 13, color: colors.mutedForeground, marginBottom: 10, fontFamily: "Inter_500Medium",
      letterSpacing: 0.5, textTransform: "uppercase",
    },
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

          <View style={s.form}>
            <View style={s.photoRow}>
              <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
                {photo ? (
                  <UserAvatar name={name || "?"} photo={photo} size={80} />
                ) : (
                  <>
                    <Feather name="camera" size={28} color={colors.mutedForeground} />
                  </>
                )}
              </TouchableOpacity>
              <Text style={s.photoHint}>{photo ? "Toque para trocar foto" : "Adicionar foto (opcional)"}</Text>
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
              {modes.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.modeCard, {
                    backgroundColor: selectedMode === m.id ? colors.primary : colors.card,
                    borderColor: selectedMode === m.id ? colors.primary : colors.border,
                  }]}
                  onPress={() => { setSelectedMode(m.id); Haptics.selectionAsync(); }}
                >
                  <MaterialCommunityIcons
                    name={m.icon as any} size={26}
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
              onPress={handleLogin}
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
