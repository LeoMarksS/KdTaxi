import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserAvatar";
import type { ChatMessage } from "@/context/AppContext";

function Message({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  const colors = useColors();

  const s = StyleSheet.create({
    wrapper: {
      flexDirection: isMe ? "row-reverse" : "row",
      marginBottom: 12,
      paddingHorizontal: 16,
      alignItems: "flex-end",
      gap: 8,
    },
    bubble: {
      maxWidth: "72%",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: isMe ? colors.primary : colors.card,
      borderTopRightRadius: isMe ? 4 : 18,
      borderTopLeftRadius: isMe ? 18 : 4,
    },
    senderName: {
      fontSize: 11,
      color: isMe ? "#00000088" : colors.mutedForeground,
      marginBottom: 3,
      fontFamily: "Inter_500Medium",
    },
    text: {
      fontSize: 15,
      color: isMe ? "#000" : colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
    },
    time: {
      fontSize: 10,
      color: isMe ? "#00000066" : colors.mutedForeground,
      marginTop: 4,
      fontFamily: "Inter_400Regular",
      textAlign: isMe ? "right" : "left",
    },
  });

  const time = new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={s.wrapper}>
      {!isMe && (
        <UserAvatar name={msg.senderName} photo={msg.senderPhoto} size={30} mode="client" />
      )}
      <View style={s.bubble}>
        {!isMe && <Text style={s.senderName}>{msg.senderName}</Text>}
        <Text style={s.text}>{msg.text}</Text>
        <Text style={s.time}>{time}</Text>
      </View>
      {isMe && (
        <UserAvatar name={msg.senderName} photo={msg.senderPhoto} size={30} mode="driver" />
      )}
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const {
    user, chatMessagesByRide, sendChatMessage,
    activeRide, activeRides, myRides, markChatRead, setChatOpen, fetchChatHistory,
  } = useApp();
  const [text, setText] = useState("");
  const flatRef = useRef<FlatList>(null);

  // Find the ride this chat belongs to — client uses activeRide, driver
  // finds the matching entry in their activeRides list.
  const ride = user?.mode === "driver"
    ? activeRides.find((r) => r.id === rideId)
    : (activeRide?.id === rideId ? activeRide : undefined);

  // Ride found in myRides means it's already finished — read-only chat
  const finishedRide = !ride && rideId
    ? myRides.find((r) => r.id === rideId)
    : undefined;
  const rideInfo = ride ?? finishedRide;
  const isFinished = !ride && !!finishedRide;

  const messages = (rideId ? chatMessagesByRide[rideId] : undefined) ?? [];

  // Fetch server-side history and mark as read whenever this chat is focused
  useFocusEffect(
    useCallback(() => {
      if (!rideId) return;
      setChatOpen(true, rideId);
      markChatRead(rideId);
      fetchChatHistory(rideId);
      return () => {
        setChatOpen(false, rideId);
      };
    }, [rideId, setChatOpen, markChatRead, fetchChatHistory])
  );

  // Fetch history also when new messages arrive (keeps history fresh in case
  // the component was already mounted when a message came in while offline)
  useEffect(() => {
    if (rideId) fetchChatHistory(rideId);
  }, [rideId]);

  const handleSend = () => {
    if (!text.trim() || !rideId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendChatMessage(text.trim(), rideId);
    setText("");
  };

  const otherPerson = user?.mode === "client" ? rideInfo?.driverName : rideInfo?.clientName;
  const otherPhoto = user?.mode === "client" ? rideInfo?.driverPhoto : rideInfo?.clientPhoto;
  const otherMode = user?.mode === "client" ? "driver" : "client";

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
      paddingHorizontal: 16,
      paddingBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerAvatar: { marginRight: 2 },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    headerSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    messages: { flex: 1 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
    emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    inputArea: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      maxHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    finishedBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      paddingHorizontal: 24,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.muted,
    },
    finishedText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </TouchableOpacity>
        {otherPerson && (
          <View style={s.headerAvatar}>
            <UserAvatar name={otherPerson} photo={otherPhoto} size={36} mode={otherMode} />
          </View>
        )}
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>{otherPerson ?? "Chat"}</Text>
          <Text style={s.headerSub}>
            {rideInfo?.origin} → {rideInfo?.destination}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatRef}
          inverted
          style={s.messages}
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
          renderItem={({ item }) => (
            <Message msg={item} isMe={item.senderId === user?.id} />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="message-circle" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyText}>Inicie a conversa</Text>
            </View>
          }
        />

        {isFinished ? (
          <View style={s.finishedBanner}>
            <Feather name="flag" size={14} color={colors.mutedForeground} />
            <Text style={s.finishedText}>Corrida encerrada — conversa bloqueada</Text>
          </View>
        ) : (
          <View style={s.inputArea}>
            <TextInput
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder="Mensagem..."
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Feather name="send" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
