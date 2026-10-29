import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  name: string;
  photo?: string;
  size?: number;
  mode?: "client" | "driver" | "admin";
}

export function UserAvatar({ name, photo, size = 44, mode }: Props) {
  const colors = useColors();
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (photo && photo !== "[photo]") {
    return (
      <Image
        source={{ uri: photo }}
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.muted }]}
        resizeMode="cover"
      />
    );
  }

  const iconName = mode === "driver" ? "car" : mode === "admin" ? "shield-check" : "account";

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <MaterialCommunityIcons name={iconName as any} size={size * 0.5} color="#000" />
    </View>
  );
}
