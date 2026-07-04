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

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

type AuthTab = "login" | "register";
type RegisterMode = "client" | "driver";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, register } = useApp();

  const [tab, setTab] = useState<AuthTab>("login");

  // Shared fields
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Register-only fields
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [registerMode, setRegisterMode] = useState<RegisterMode>("client");

  const registerModes: { id: RegisterMode; label: string; icon: string; desc: string }[] = [
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

  const handleLogin = async () => {
    if (!phone.trim() || !password) { setError("Preencha telefone e senha"); return; }
    setLoading(true);
    setError("");
    const result = await login(phone.trim(), password);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(result.error ?? "Credenciais inválidas");
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim() || !password) { setError("Preencha nome, telefone e senha"); return; }
    if (password.length < 4) { setError("A senha deve ter ao menos 4 caracteres"); return; }
    setLoading(true);
    setError("");
    const result = await register(name.trim(), phone.trim(), password, registerMode, photo);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(result.error ?? "Erro ao criar conta.");
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
    loginHint: {
      fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular",
      textAlign: "center", marginBottom: 20, lineHeight: 20,
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

          <View style={s.tabRow}>
            <TouchableOpacity
              style={[s.tabBtn, { backgroundColor: tab === "login" ? colors.primary : "transparent" }]}
              onPress={() => { setTab("login"); setError(""); Haptics.selectionAsync(); }}
            >
              <MaterialCommunityIcons name="login" size={16} color={tab === "login" ? "#000" : colors.mutedForeground} />
              <Text style={[s.tabBtnText, { color: tab === "login" ? "#000" : colors.mutedForeground }]}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabBtn, { backgroundColor: tab === "register" ? colors.card : "transparent", borderWidth: tab === "register" ? 1 : 0, borderColor: colors.border }]}
              onPress={() => { setTab("register"); setError(""); Haptics.selectionAsync(); }}
            >
              <MaterialCommunityIcons name="account-plus" size={16} color={tab === "register" ? colors.foreground : colors.mutedForeground} />
              <Text style={[s.tabBtnText, { color: tab === "register" ? colors.foreground : colors.mutedForeground }]}>Criar conta</Text>
            </TouchableOpacity>
          </View>

          <View style={s.form}>
            {tab === "login" ? (
              <>
                <Text style={s.loginHint}>
                  Entre com seu telefone e senha. O sistema identifica automaticamente se você é cliente, motorista ou administrador.
                </Text>

                <Text style={s.label}>Telefone</Text>
                <TextInput
                  style={s.input} value={phone} onChangeText={setPhone}
                  placeholder="(00) 00000-0000" placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false}
                />

                <Text style={s.label}>Senha</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput} value={password} onChangeText={setPassword}
                    placeholder="Sua senha" placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
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
              </>
            ) : (
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
                  keyboardType="phone-pad" autoCapitalize="none" autoCorrect={false}
                />

                <Text style={s.label}>Senha</Text>
                <View style={s.passwordRow}>
                  <TextInput
                    style={s.passwordInput} value={password} onChangeText={setPassword}
                    placeholder="Crie uma senha (mín. 4 caracteres)" placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <Text style={s.sectionLabel}>Criar conta como</Text>
                <View style={s.modesRow}>
                  {registerModes.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.modeCard, {
                        backgroundColor: registerMode === m.id ? colors.primary : colors.card,
                        borderColor: registerMode === m.id ? colors.primary : colors.border,
                      }]}
                      onPress={() => { setRegisterMode(m.id); Haptics.selectionAsync(); }}
                    >
                      <MaterialCommunityIcons
                        name={m.icon as any} size={30}
                        color={registerMode === m.id ? "#000" : colors.mutedForeground}
                      />
                      <Text style={[s.modeLabel, { color: registerMode === m.id ? "#000" : colors.foreground }]}>
                        {m.label}
                      </Text>
                      <Text style={[s.modeDesc, { color: registerMode === m.id ? "#00000099" : colors.mutedForeground }]}>
                        {m.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!!error && <Text style={s.error}>{error}</Text>}

                <TouchableOpacity
                  style={[s.btn, { backgroundColor: colors.primary }]}
                  onPress={handleRegister}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Feather name="user-plus" size={20} color="#000" />
                      <Text style={[s.btnText, { color: "#000" }]}>Criar conta</Text>
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
