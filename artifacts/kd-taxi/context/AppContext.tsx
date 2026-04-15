import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

export type UserMode = "client" | "driver" | "admin" | null;

export interface User {
  id: string;
  name: string;
  phone: string;
  mode: UserMode;
  photo?: string;
  rating?: number;
  rideCount?: number;
}

export type RideStatus = "waiting" | "accepted" | "in_progress" | "finished" | "cancelled";

export interface Ride {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientPhoto?: string;
  clientAvgRating?: number;
  clientRideCount?: number;
  driverId?: string;
  driverName?: string;
  driverPhoto?: string;
  driverAvgRating?: number;
  driverRideCount?: number;
  origin: string;
  destination: string;
  price?: number;
  payment?: "pix" | "dinheiro";
  status: RideStatus;
  clientRating?: number;
  driverRating?: number;
  createdAt: string;
  acceptedAt?: string;
  finishedAt?: string;
}

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export interface PriceRule {
  id: string;
  destination: string;
  price: number;
}

interface AppContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  updateProfile: (name: string, photo?: string) => Promise<void>;
  isDriverOnline: boolean;
  setDriverOnline: (online: boolean) => void;
  activeRide: Ride | null;
  setActiveRide: (ride: Ride | null) => void;
  pendingRides: Ride[];
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string) => void;
  socket: Socket | null;
  requestRide: (origin: string, destination: string, payment: "pix" | "dinheiro") => Promise<Ride | null>;
  acceptRide: (rideId: string) => Promise<void>;
  declineRide: (rideId: string) => void;
  finishRide: (rideId: string) => Promise<void>;
  cancelRide: (rideId: string) => Promise<void>;
  rateRide: (rideId: string, rating: number) => Promise<void>;
  logout: () => void;
  allRides: Ride[];
  allUsers: User[];
  pricing: PriceRule[];
  refreshAdminData: () => Promise<void>;
  refreshPricing: () => Promise<void>;
  setPricingRule: (destination: string, price: number) => Promise<void>;
  deletePricingRule: (id: string) => Promise<void>;
  lookupPrice: (destination: string) => Promise<number | null>;
  finishedRideToRate: Ride | null;
  clearFinishedRideToRate: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
export const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isDriverOnline, setDriverOnlineState] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pricing, setPricing] = useState<PriceRule[]>([]);
  const [finishedRideToRate, setFinishedRideToRate] = useState<Ride | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Load persisted state
  useEffect(() => {
    AsyncStorage.getItem("kd_user").then((data) => {
      if (data) setUserState(JSON.parse(data) as User);
    });
    AsyncStorage.getItem("kd_driver_online").then((data) => {
      if (data === "true") setDriverOnlineState(true);
    });
    AsyncStorage.getItem("kd_active_ride").then((data) => {
      if (data) setActiveRide(JSON.parse(data) as Ride);
    });
  }, []);

  // Persist active ride
  useEffect(() => {
    if (activeRide) {
      AsyncStorage.setItem("kd_active_ride", JSON.stringify(activeRide));
    } else {
      AsyncStorage.removeItem("kd_active_ride");
    }
  }, [activeRide]);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) AsyncStorage.setItem("kd_user", JSON.stringify(u));
    else AsyncStorage.removeItem("kd_user");
  }, []);

  const setDriverOnline = useCallback((online: boolean) => {
    setDriverOnlineState(online);
    AsyncStorage.setItem("kd_driver_online", online ? "true" : "false");
  }, []);

  const updateProfile = useCallback(async (name: string, photo?: string) => {
    if (!user) return;
    const updated: User = { ...user, name, photo: photo ?? user.photo };
    setUser(updated);
    try {
      await fetch(`${API_BASE}/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, photo: photo ?? user.photo }),
      });
    } catch {}
  }, [user, setUser]);

  // Register push notifications when user logs in
  useEffect(() => {
    if (!user) return;
    registerForPushNotifications().then(async (token) => {
      if (token && user.id) {
        try {
          await fetch(`${API_BASE}/users/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pushToken: token }),
          });
        } catch {}
      }
    });
  }, [user?.id]);

  // Socket connection
  useEffect(() => {
    if (!user) return;

    const socket = io(`https://${process.env.EXPO_PUBLIC_DOMAIN}`, {
      path: "/api/socket.io",
      transports: ["polling", "websocket"],
      query: { userId: user.id, mode: user.mode },
    });
    socketRef.current = socket;

    socket.on("nova_corrida", (ride: Ride) => {
      if (user.mode === "driver") {
        setPendingRides((prev) => {
          const exists = prev.find((r) => r.id === ride.id);
          if (exists) return prev;
          return [ride, ...prev];
        });
        // In-app notification for driver
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Nova corrida!",
            body: `${ride.clientName}: ${ride.origin} → ${ride.destination}`,
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
      }
    });

    socket.on("corrida_aceita", (ride: Ride) => {
      setActiveRide(ride);
      setPendingRides((prev) => prev.filter((r) => r.id !== ride.id));
      if (user.mode === "client") {
        Notifications.scheduleNotificationAsync({
          content: { title: "Motorista encontrado!", body: `${ride.driverName} está a caminho`, sound: true },
          trigger: null,
        }).catch(() => {});
      }
    });

    socket.on("corrida_finalizada", (ride: Ride) => {
      setActiveRide(null);
      setFinishedRideToRate(ride);
      Notifications.scheduleNotificationAsync({
        content: { title: "Corrida finalizada!", body: "Avalie sua experiência", sound: true },
        trigger: null,
      }).catch(() => {});
    });

    socket.on("corrida_cancelada", (rideId: string) => {
      setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
      setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    });

    socket.on("mensagem_chat", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      Notifications.scheduleNotificationAsync({
        content: { title: `Mensagem de ${msg.senderName}`, body: msg.text, sound: true },
        trigger: null,
      }).catch(() => {});
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const requestRide = useCallback(async (origin: string, destination: string, payment: "pix" | "dinheiro"): Promise<Ride | null> => {
    if (!user) return null;
    const res = await fetch(`${API_BASE}/request-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: user.id, clientName: user.name, clientPhone: user.phone,
        clientPhoto: user.photo, origin, destination, payment,
      }),
    });
    if (!res.ok) return null;
    const ride: Ride = await res.json();
    setActiveRide(ride);
    return ride;
  }, [user]);

  const acceptRide = useCallback(async (rideId: string) => {
    if (!user) return;
    const res = await fetch(`${API_BASE}/accept-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId, driverId: user.id, driverName: user.name, driverPhoto: user.photo }),
    });
    if (res.ok) {
      const ride: Ride = await res.json();
      setActiveRide(ride);
      setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
    }
  }, [user]);

  const declineRide = useCallback((rideId: string) => {
    setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
  }, []);

  const finishRide = useCallback(async (rideId: string) => {
    const res = await fetch(`${API_BASE}/finish-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId }),
    });
    if (res.ok) {
      const ride: Ride = await res.json();
      setActiveRide(null);
      setFinishedRideToRate(ride);
      setChatMessages([]);
    }
  }, []);

  const cancelRide = useCallback(async (rideId: string) => {
    await fetch(`${API_BASE}/cancel-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId }),
    });
    setActiveRide(null);
    setChatMessages([]);
  }, []);

  const rateRide = useCallback(async (rideId: string, rating: number) => {
    if (!user) return;
    await fetch(`${API_BASE}/rides/${rideId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raterMode: user.mode, rating }),
    });
    setFinishedRideToRate(null);
  }, [user]);

  const sendChatMessage = useCallback((text: string) => {
    if (!user || !activeRide || !socketRef.current) return;
    const msg: ChatMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      rideId: activeRide.id,
      senderId: user.id,
      senderName: user.name,
      text,
      timestamp: new Date().toISOString(),
    };
    socketRef.current.emit("mensagem_chat", msg);
    setChatMessages((prev) => [...prev, msg]);
  }, [user, activeRide]);

  const logout = useCallback(() => {
    setUser(null);
    setActiveRide(null);
    setPendingRides([]);
    setChatMessages([]);
    setFinishedRideToRate(null);
    setDriverOnlineState(false);
    AsyncStorage.multiRemove(["kd_driver_online", "kd_active_ride"]);
  }, [setUser]);

  const refreshAdminData = useCallback(async () => {
    const [ridesRes, usersRes] = await Promise.all([
      fetch(`${API_BASE}/rides`),
      fetch(`${API_BASE}/users`),
    ]);
    if (ridesRes.ok) setAllRides(await ridesRes.json());
    if (usersRes.ok) setAllUsers(await usersRes.json());
  }, []);

  const refreshPricing = useCallback(async () => {
    const res = await fetch(`${API_BASE}/pricing`);
    if (res.ok) setPricing(await res.json());
  }, []);

  const setPricingRule = useCallback(async (destination: string, price: number) => {
    await fetch(`${API_BASE}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, price }),
    });
    await refreshPricing();
  }, [refreshPricing]);

  const deletePricingRule = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/pricing/${id}`, { method: "DELETE" });
    await refreshPricing();
  }, [refreshPricing]);

  const lookupPrice = useCallback(async (destination: string): Promise<number | null> => {
    try {
      const res = await fetch(`${API_BASE}/pricing/lookup?destination=${encodeURIComponent(destination)}`);
      if (res.ok) { const d = await res.json(); return d.price; }
    } catch {}
    return null;
  }, []);

  return (
    <AppContext.Provider value={{
      user, setUser, updateProfile,
      isDriverOnline, setDriverOnline,
      activeRide, setActiveRide,
      pendingRides, chatMessages, sendChatMessage,
      socket: socketRef.current,
      requestRide, acceptRide, declineRide, finishRide, cancelRide, rateRide,
      logout, allRides, allUsers, pricing,
      refreshAdminData, refreshPricing, setPricingRule, deletePricingRule, lookupPrice,
      finishedRideToRate, clearFinishedRideToRate: () => setFinishedRideToRate(null),
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
