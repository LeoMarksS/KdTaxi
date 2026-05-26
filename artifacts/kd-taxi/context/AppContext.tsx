import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Audio } from "expo-av";
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
  senderPhoto?: string;
  text: string;
  timestamp: string;
}

export interface PriceRule {
  id: string;
  destination: string;
  price: number;
  isLocal?: boolean;
}

export interface AdminStats {
  totalUsers: number;
  totalClients: number;
  totalDrivers: number;
  totalRides: number;
  finishedRides: number;
  cancelledRides: number;
  activeRides: number;
  totalRevenue: number;
  todayRides: number;
  todayRevenue: number;
  avgRating: number;
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
  unreadChatCount: number;
  markChatRead: () => void;
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
  myRides: Ride[];
  fetchMyRides: () => Promise<void>;
  adminStats: AdminStats | null;
  refreshAdminData: () => Promise<void>;
  refreshAdminStats: () => Promise<void>;
  refreshPricing: () => Promise<void>;
  setPricingRule: (destination: string, price: number, isLocal?: boolean) => Promise<void>;
  deletePricingRule: (id: string) => Promise<void>;
  lookupPrice: (destination: string) => Promise<{ price: number; isLocal: boolean } | null>;
  finishedRideToRate: Ride | null;
  clearFinishedRideToRate: () => void;
  // Admin operations
  adminUpdateUser: (id: string, data: { name?: string; phone?: string; mode?: string; active?: boolean; password?: string }) => Promise<boolean>;
  adminDeleteUser: (id: string) => Promise<boolean>;
  adminClearRides: () => Promise<boolean>;
  // Chat open state
  setChatOpen: (open: boolean) => void;
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

// Play a beep sound to alert driver of incoming ride
async function playRideRequestSound() {
  if (Platform.OS === "web") {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const freqs = [880, 1100, 880, 1100];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.2);
      });
    } catch {}
    return;
  }
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
      { shouldPlay: true, volume: 1.0 }
    );
    setTimeout(() => sound.unloadAsync().catch(() => {}), 5000);
  } catch {}
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isDriverOnline, setDriverOnlineState] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pricing, setPricing] = useState<PriceRule[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [finishedRideToRate, setFinishedRideToRate] = useState<Ride | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef<User | null>(null);
  const isDriverOnlineRef = useRef(false);
  const isChatOpenRef = useRef(false);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { isDriverOnlineRef.current = isDriverOnline; }, [isDriverOnline]);

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
      if (userRef.current?.mode === "driver") {
        setPendingRides((prev) => {
          const exists = prev.find((r) => r.id === ride.id);
          if (exists) return prev;
          return [ride, ...prev];
        });
        // Only play sound and notify when driver is online
        if (isDriverOnlineRef.current) {
          playRideRequestSound();
          Notifications.scheduleNotificationAsync({
            content: {
              title: "Nova corrida!",
              body: `${ride.clientName}: ${ride.origin} → ${ride.destination}`,
              sound: true,
            },
            trigger: null,
          }).catch(() => {});
        }
      }
    });

    socket.on("corrida_aceita", (ride: Ride) => {
      const me = userRef.current;
      const isInvolved = me?.id === ride.driverId || me?.id === ride.clientId;
      // Only set as active ride for the driver who accepted or the client who requested it
      if (isInvolved) {
        setActiveRide(ride);
      }
      // All drivers: remove from pending list (ride is taken)
      if (me?.mode === "driver") {
        setPendingRides((prev) => prev.filter((r) => r.id !== ride.id));
      }
      // Notify only the client whose ride was accepted
      if (me?.id === ride.clientId) {
        Notifications.scheduleNotificationAsync({
          content: { title: "Motorista encontrado!", body: `${ride.driverName} está a caminho`, sound: true },
          trigger: null,
        }).catch(() => {});
      }
    });

    socket.on("corrida_finalizada", (ride: Ride) => {
      const me = userRef.current;
      // Only update state for the driver or client involved in this ride
      if (me?.id !== ride.driverId && me?.id !== ride.clientId) return;
      setActiveRide(null);
      setFinishedRideToRate(ride);
      setMyRides((prev) => [ride, ...prev.filter((r) => r.id !== ride.id)]);
      Notifications.scheduleNotificationAsync({
        content: { title: "Corrida finalizada!", body: "Avalie sua experiência", sound: true },
        trigger: null,
      }).catch(() => {});
    });

    socket.on("corrida_cancelada", (rideId: string) => {
      const me = userRef.current;
      // All drivers: remove from pending (client cancelled before anyone accepted)
      if (me?.mode === "driver") {
        setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
      }
      // Only clear active ride for the users directly involved
      setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    });

    socket.on("mensagem_chat", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
      if (msg.senderId !== userRef.current?.id) {
        // Only increment badge and notify when chat screen is not open
        if (!isChatOpenRef.current) {
          setUnreadChatCount((c) => c + 1);
          Notifications.scheduleNotificationAsync({
            content: { title: `Mensagem de ${msg.senderName}`, body: msg.text, sound: true },
            trigger: null,
          }).catch(() => {});
        }
      }
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
      setMyRides((prev) => [ride, ...prev.filter((r) => r.id !== ride.id)]);
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
      senderPhoto: user.photo,
      text,
      timestamp: new Date().toISOString(),
    };
    socketRef.current.emit("mensagem_chat", msg);
    setChatMessages((prev) => [...prev, msg]);
  }, [user, activeRide]);

  const markChatRead = useCallback(() => {
    setUnreadChatCount(0);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setActiveRide(null);
    setPendingRides([]);
    setChatMessages([]);
    setMyRides([]);
    setUnreadChatCount(0);
    setFinishedRideToRate(null);
    setDriverOnlineState(false);
    setAdminStats(null);
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

  const refreshAdminStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`);
      if (res.ok) setAdminStats(await res.json());
    } catch {}
  }, []);

  const fetchMyRides = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/rides`);
      if (res.ok) setMyRides(await res.json());
    } catch {}
  }, [user]);

  const refreshPricing = useCallback(async () => {
    const res = await fetch(`${API_BASE}/pricing`);
    if (res.ok) setPricing(await res.json());
  }, []);

  const setPricingRule = useCallback(async (destination: string, price: number, isLocal?: boolean) => {
    await fetch(`${API_BASE}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, price, isLocal }),
    });
    await refreshPricing();
  }, [refreshPricing]);

  const deletePricingRule = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/pricing/${id}`, { method: "DELETE" });
    await refreshPricing();
  }, [refreshPricing]);

  const lookupPrice = useCallback(async (destination: string): Promise<{ price: number; isLocal: boolean } | null> => {
    try {
      const res = await fetch(`${API_BASE}/pricing/lookup?destination=${encodeURIComponent(destination)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.price !== null && d.price !== undefined) return { price: d.price, isLocal: d.isLocal ?? false };
      }
    } catch {}
    return null;
  }, []);

  const adminUpdateUser = useCallback(async (id: string, data: {
    name?: string; phone?: string; mode?: string; active?: boolean; password?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setAllUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...updated } : u));
        return true;
      }
    } catch {}
    return false;
  }, []);

  const adminDeleteUser = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAllUsers((prev) => prev.filter((u) => u.id !== id));
        return true;
      }
    } catch {}
    return false;
  }, []);

  const adminClearRides = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/admin/rides`, { method: "DELETE" });
      if (res.ok) {
        setAllRides([]);
        return true;
      }
    } catch {}
    return false;
  }, []);

  const setChatOpen = useCallback((open: boolean) => {
    isChatOpenRef.current = open;
    if (open) setUnreadChatCount(0);
  }, []);

  return (
    <AppContext.Provider value={{
      user, setUser, updateProfile,
      isDriverOnline, setDriverOnline,
      activeRide, setActiveRide,
      pendingRides, chatMessages, sendChatMessage,
      unreadChatCount, markChatRead,
      socket: socketRef.current,
      requestRide, acceptRide, declineRide, finishRide, cancelRide, rateRide,
      logout, allRides, allUsers, pricing,
      myRides, fetchMyRides,
      adminStats, refreshAdminData, refreshAdminStats, refreshPricing,
      setPricingRule, deletePricingRule, lookupPrice,
      finishedRideToRate, clearFinishedRideToRate: () => setFinishedRideToRate(null),
      adminUpdateUser, adminDeleteUser, adminClearRides,
      setChatOpen,
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
