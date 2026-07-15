import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateProfile, logout } = useApp();

  const [name, setName] = useState(user?.name ?? "");
  const [photo, setPhoto] = useState(user?.photo);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Precisamos de acesso à galeria de fotos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset?.base64) {
      const mime = asset.mimeType ?? "image/jpeg";
      setPhoto(`data:${mime};base64,${asset.base64}`);
      Haptics.selectionAsync();
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Precisamos de acesso à câmera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset?.base64) {
      const mime = asset.mimeType ?? "image/jpeg";
      setPhoto(`data:${mime};base64,${asset.base64}`);
      Haptics.selectionAsync();
    }
  };

  const handlePhotoPress = () => {
    Alert.alert("Foto do perfil", "Escolha uma opção", [
      { text: "Câmera", onPress: takePhoto },
      { text: "Galeria", onPress: pickPhoto },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const hasChanges = name.trim() !== (user?.name ?? "") || photo !== user?.photo;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateProfile(name.trim(), photo);
    setSaving(false);
    router.back();
  };

  const handleCancel = () => {
    setName(user?.name ?? "");
    setPhoto(user?.photo);
    router.back();
  };

  const modeLabel = user?.mode === "driver" ? "Motorista" : user?.mode === "admin" ? "Admin" : "Cliente";

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 24, paddingBottom: 16,
      flexDirection: "row", alignItems: "center", gap: 14,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    scroll: { flex: 1, paddingHorizontal: 24 },
    avatarSection: { alignItems: "center", paddingVertical: 32 },
    avatarWrap: { position: "relative" },
    editBadge: {
      position: "absolute", bottom: 0, right: 0,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
      borderWidth: 2, borderColor: colors.background,
    },
    modeBadge: {
      marginTop: 12, backgroundColor: colors.muted, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 6,
    },
    modeText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    ratingText: { fontSize: 14, color: colors.statusWaiting, fontFamily: "Inter_600SemiBold" },
    ratingCount: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    formCard: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      padding: 20, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
    },
    label: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" },
    input: {
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 16,
      paddingVertical: 14, fontSize: 16, color: colors.foreground, fontFamily: "Inter_400Regular",
    },
    phoneRow: {
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 16,
      paddingVertical: 14, flexDirection: "row", alignItems: "center",
    },
    phoneText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    saveBtn: {
      backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18,
      alignItems: "center", marginBottom: 16, flexDirection: "row", justifyContent: "center", gap: 8,
    },
    saveBtnText: { fontSize: 17, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    cancelBtn: {
      backgroundColor: colors.muted, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.border,
    },
    cancelBtnText: { fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    logoutBtn: {
      backgroundColor: colors.card, borderRadius: 14, paddingVertical: 16,
      alignItems: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 32,
    },
    logoutText: { fontSize: 16, color: colors.destructive, fontFamily: "Inter_600SemiBold" },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Meu Perfil</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 }}>
          <View style={s.avatarSection}>
            <TouchableOpacity style={s.avatarWrap} onPress={handlePhotoPress}>
              <UserAvatar name={user?.name ?? "?"} photo={photo} size={96} mode={user?.mode ?? "client"} />
              <View style={s.editBadge}>
                <Feather name="camera" size={14} color="#000" />
              </View>
            </TouchableOpacity>
            <View style={s.modeBadge}>
              <Text style={s.modeText}>{modeLabel}</Text>
            </View>
            {(user?.rating ?? 0) > 0 && (
              <View style={s.ratingRow}>
                <Feather name="star" size={14} color={colors.statusWaiting} />
                <Text style={s.ratingText}>{user?.rating}</Text>
                <Text style={s.ratingCount}>({user?.rideCount} corridas)</Text>
              </View>
            )}
          </View>

          <View style={s.formCard}>
            <Text style={s.label}>Nome</Text>
            <TextInput
              style={s.input} value={name} onChangeText={setName}
              placeholder="Seu nome" placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>

          <View style={s.formCard}>
            <Text style={s.label}>Telefone</Text>
            <View style={s.phoneRow}>
              <Text style={s.phoneText}>{user?.phone}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[s.saveBtn, { opacity: !name.trim() || saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Feather name="check" size={20} color="#000" />
                <Text style={s.saveBtnText}>Salvar perfil</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.cancelBtn, { opacity: saving ? 0.5 : 1 }]}
            onPress={handleCancel}
            disabled={saving}
          >
            <Text style={s.cancelBtnText}>Descartar alterações</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.logoutBtn} onPress={() => { logout(); router.replace("/login"); }}>
            <Text style={s.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
