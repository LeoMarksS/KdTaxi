import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { prepareProfilePhoto } from "@/utils/profilePhoto";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import type { VehicleType } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateProfile, changePassword, updateDriverVehicle, logout } = useApp();

  const [name, setName] = useState(user?.name ?? "");
  const [photo, setPhoto] = useState(user?.photo);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [vehicleType, setVehicleType] = useState<VehicleType>(user?.vehicleType ?? "car");
  const [vehicleBrand, setVehicleBrand] = useState(user?.vehicleBrand ?? "");
  const [vehicleModel, setVehicleModel] = useState(user?.vehicleModel ?? "");
  const [vehicleColor, setVehicleColor] = useState(user?.vehicleColor ?? "");
  const [vehiclePlate, setVehiclePlate] = useState(user?.vehiclePlate ?? "");

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
    });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset) {
      try {
        setPhoto(await prepareProfilePhoto(asset));
        Haptics.selectionAsync();
      } catch { Alert.alert("Foto", "Não foi possível preparar a foto. Tente outra imagem."); }
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
    });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset) {
      try {
        setPhoto(await prepareProfilePhoto(asset));
        Haptics.selectionAsync();
      } catch { Alert.alert("Foto", "Não foi possível preparar a foto. Tente outra imagem."); }
    }
  };

  const handlePhotoPress = () => {
    Alert.alert("Foto do perfil", "Escolha uma opção", [
      { text: "Câmera", onPress: takePhoto },
      { text: "Galeria", onPress: pickPhoto },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const vehicleChanged = user?.mode === "driver" && (
    vehicleType !== (user.vehicleType ?? "car") ||
    vehicleBrand.trim() !== (user.vehicleBrand ?? "") ||
    vehicleModel.trim() !== (user.vehicleModel ?? "") ||
    vehicleColor.trim() !== (user.vehicleColor ?? "") ||
    vehiclePlate.toUpperCase().replace(/[\s-]/g, "") !== (user.vehiclePlate ?? "")
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    if (vehicleChanged && (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() ||
        !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(vehiclePlate.toUpperCase().replace(/[\s-]/g, "")))) {
      Alert.alert("Veículo incompleto", "Informe marca, modelo, cor e placa válida.");
      return;
    }
    setSaving(true);
    if (vehicleChanged) {
      const result = await updateDriverVehicle({ vehicleType, vehicleBrand, vehicleModel, vehicleColor, vehiclePlate });
      if (!result.ok) {
        setSaving(false);
        Alert.alert("Não foi possível salvar", result.error);
        return;
      }
    }
    if (name.trim() !== user?.name || photo !== user?.photo) await updateProfile(name.trim(), photo);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    if (vehicleChanged) Alert.alert("Veículo enviado", "Aguarde nova aprovação antes de receber corridas.");
    router.back();
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Atenção", "Preencha os três campos de senha.");
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      Alert.alert("Senha inválida", "A nova senha deve ter entre 12 e 128 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Atenção", "A confirmação da nova senha não corresponde.");
      return;
    }

    setChangingPassword(true);
    const result = await changePassword(currentPassword, newPassword);
    setChangingPassword(false);

    if (!result.ok) {
      Alert.alert("Não foi possível alterar", result.error ?? "Verifique os dados e tente novamente.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    Alert.alert("Senha alterada", "Sua senha foi atualizada. As outras sessões foram encerradas.");
  };

  const handleCancel = () => {
    setName(user?.name ?? "");
    setPhoto(user?.photo);
    setVehicleType(user?.vehicleType ?? "car");
    setVehicleBrand(user?.vehicleBrand ?? "");
    setVehicleModel(user?.vehicleModel ?? "");
    setVehicleColor(user?.vehicleColor ?? "");
    setVehiclePlate(user?.vehiclePlate ?? "");
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

          <View style={s.formCard}>
            <Text style={s.label}>Senha atual</Text>
            <TextInput
              style={s.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Digite sua senha atual"
              placeholderTextColor={colors.mutedForeground}
              maxLength={128}
            />

            <Text style={[s.label, { marginTop: 16 }]}>Nova senha</Text>
            <TextInput
              style={s.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Mínimo de 12 caracteres"
              placeholderTextColor={colors.mutedForeground}
              maxLength={128}
            />

            <Text style={[s.label, { marginTop: 16 }]}>Confirmar nova senha</Text>
            <TextInput
              style={s.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Digite novamente a nova senha"
              placeholderTextColor={colors.mutedForeground}
              maxLength={128}
            />
          </View>

          <TouchableOpacity
            style={[s.saveBtn, { opacity: changingPassword ? 0.6 : 1 }]}
            onPress={handleChangePassword}
            disabled={changingPassword}
          >
            {changingPassword ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Feather name="lock" size={18} color="#000" />
                <Text style={s.saveBtnText}>Alterar senha</Text>
              </>
            )}
          </TouchableOpacity>
          {user?.mode === "driver" && (
            <View style={s.formCard}>
              <Text style={s.label}>Veículo</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {(["car", "motorcycle"] as const).map((type) => (
                  <TouchableOpacity key={type} onPress={() => setVehicleType(type)}
                    style={{ padding: 12, borderRadius: 10, backgroundColor: vehicleType === type ? colors.primary : colors.muted }}>
                    <Text style={{ color: vehicleType === type ? "#000" : colors.foreground }}>
                      {type === "car" ? "Carro" : "Moto"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>Marca</Text>
              <TextInput style={[s.input, { marginBottom: 12 }]} value={vehicleBrand} onChangeText={setVehicleBrand} maxLength={80} placeholder="Marca" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Modelo</Text>
              <TextInput style={[s.input, { marginBottom: 12 }]} value={vehicleModel} onChangeText={setVehicleModel} maxLength={80} placeholder="Modelo" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Cor</Text>
              <TextInput style={[s.input, { marginBottom: 12 }]} value={vehicleColor} onChangeText={setVehicleColor} maxLength={50} placeholder="Cor" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.label}>Placa</Text>
              <TextInput style={s.input} value={vehiclePlate} onChangeText={setVehiclePlate} maxLength={8} autoCapitalize="characters" placeholder="ABC1D23" placeholderTextColor={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>
                Alterações no veículo exigem nova aprovação antes de receber corridas.
              </Text>
            </View>
          )}

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

          <TouchableOpacity style={s.logoutBtn} onPress={() => {
            const performLogout = () => {
              logout();
              router.replace("/login");
            };

            if (Platform.OS === "web") {
              const confirmed = window.confirm("Tem certeza que deseja sair?");
              if (confirmed) performLogout();
            } else {
              Alert.alert("Sair da conta", "Tem certeza que deseja sair?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Sair", style: "destructive", onPress: performLogout },
              ]);
            }
          }}>
            <Text style={s.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.mutedForeground, textAlign: "center", marginBottom: 20 }}>Versão {Constants.expoConfig?.version} · {Constants.expoConfig?.extra?.buildRevision ?? "local"}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
