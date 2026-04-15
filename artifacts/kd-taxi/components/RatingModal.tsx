import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { UserAvatar } from "@/components/UserAvatar";

export function RatingModal() {
  const colors = useColors();
  const { finishedRideToRate, rateRide, clearFinishedRideToRate, user } = useApp();
  const [selected, setSelected] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (!finishedRideToRate) return null;

  const isClient = user?.mode === "client";
  const otherName = isClient ? finishedRideToRate.driverName : finishedRideToRate.clientName;
  const otherPhoto = isClient ? finishedRideToRate.driverPhoto : finishedRideToRate.clientPhoto;

  const handleSubmit = async () => {
    if (selected === 0) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await rateRide(finishedRideToRate.id, selected);
    setSelected(0);
    setSubmitting(false);
  };

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#000000CC", alignItems: "center", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.card, borderRadius: 24, padding: 28, width: "100%", alignItems: "center" },
    title: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginTop: 16, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 14, color: colors.mutedForeground, marginTop: 6, marginBottom: 24, fontFamily: "Inter_400Regular", textAlign: "center" },
    stars: { flexDirection: "row", gap: 12, marginBottom: 28 },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      width: "100%",
      alignItems: "center",
    },
    submitText: { fontSize: 17, fontWeight: "700", color: "#000", fontFamily: "Inter_700Bold" },
    skipBtn: { marginTop: 14, paddingVertical: 8 },
    skipText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    routeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
    routeText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  });

  return (
    <Modal transparent animationType="fade" visible>
      <View style={s.overlay}>
        <View style={s.card}>
          <UserAvatar name={otherName ?? "?"} photo={otherPhoto} size={72} />
          <Text style={s.title}>Como foi a corrida?</Text>
          <Text style={s.sub}>Avalie {isClient ? "o motorista" : "o passageiro"}{otherName ? ` ${otherName}` : ""}</Text>

          <View style={s.routeRow}>
            <Feather name="map-pin" size={13} color={colors.statusAccepted} />
            <Text style={s.routeText} numberOfLines={1}>{finishedRideToRate.origin}</Text>
            <Feather name="arrow-right" size={13} color={colors.mutedForeground} />
            <Text style={s.routeText} numberOfLines={1}>{finishedRideToRate.destination}</Text>
          </View>

          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => { setSelected(star); Haptics.selectionAsync(); }}
              >
                <Feather
                  name="star"
                  size={38}
                  color={star <= selected ? colors.primary : colors.border}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[s.submitBtn, { opacity: selected === 0 || submitting ? 0.5 : 1 }]}
            onPress={handleSubmit}
            disabled={selected === 0 || submitting}
          >
            <Text style={s.submitText}>Enviar avaliação</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.skipBtn} onPress={clearFinishedRideToRate}>
            <Text style={s.skipText}>Pular</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
