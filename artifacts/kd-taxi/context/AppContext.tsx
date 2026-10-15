import AsyncStorage from "@react-native-async-storage/async-storage";
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

import { registerForPushNotifications, scheduleLocalNotification } from "@/lib/notifications";

export type UserMode = "client" | "driver" | "admin" | null;

export interface User {
  id: string;
  name: string;
  phone: string;
  mode: UserMode;
  vehicleType?: VehicleType;
  photo?: string;
  rating?: number;
  rideCount?: number;
}

const MAX_CACHED_USER_PHOTO_CHARS = 32 * 1024;

function getPersistedUser(user: User): User {
  const compactUser: User = {
    id: user.id,
    name: user.name,
    phone: user.phone,
    mode: user.mode,
  };
  if (user.vehicleType) compactUser.vehicleType = user.vehicleType;
  if (user.photo && user.photo.length <= MAX_CACHED_USER_PHOTO_CHARS) {
    compactUser.photo = user.photo;
  }
  if (user.rating !== undefined) compactUser.rating = user.rating;
  if (user.rideCount !== undefined) compactUser.rideCount = user.rideCount;
  return compactUser;
}

export type RideStatus = "waiting" | "accepted" | "in_progress" | "finished" | "cancelled";
export type VehicleType = "car" | "motorcycle";

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
  vehicleType?: VehicleType;
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
  onlineDrivers: number;
  onlineCarDrivers: number;
  onlineMotorcycleDrivers: number;
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
  // Clients use activeRide (single); drivers use activeRides (multiple)
  activeRide: Ride | null;
  setActiveRide: (ride: Ride | null) => void;
  activeRides: Ride[];
  pendingRides: Ride[];
  chatMessagesByRide: Record<string, ChatMessage[]>;
  sendChatMessage: (text: string, rideId: string) => void;
  unreadChatCount: number;
  unreadByRide: Record<string, number>;
  markChatRead: (rideId: string) => void;
  fetchChatHistory: (rideId: string) => Promise<void>;
  socket: Socket | null;
  requestRide: (origin: string, destination: string, payment: "pix" | "dinheiro", vehicleType?: VehicleType) => Promise<Ride | null>;
  acceptRide: (rideId: string) => Promise<void>;
  declineRide: (rideId: string) => void;
  finishRide: (rideId: string) => Promise<void>;
  cancelRide: (rideId: string) => Promise<void>;
  rateRide: (rideId: string, rating: number) => Promise<void>;
  cancelSoundAlerts: () => void;
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
  // Chat open state — pass rideId so only that ride's unread count is cleared
  setChatOpen: (open: boolean, rideId?: string) => void;
  // Auth
  token: string | null;
  login: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (
    name: string,
    phone: string,
    password: string,
    mode: "client" | "driver",
    photo?: string,
    vehicleType?: VehicleType,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const AppContext = createContext<AppContextValue | null>(null);
export const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

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
    const { createAudioPlayer, setAudioModeAsync } = await import("expo-audio");
    await setAudioModeAsync({ playsInSilentMode: true });
    const player = createAudioPlayer("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    player.volume = 1;
    player.play();
    setTimeout(() => player.remove(), 5000);
  } catch {}
}

function matchesDriverVehicle(user: User, ride: Ride): boolean {
  return (user.vehicleType ?? "car") === (ride.vehicleType ?? "car");
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [isDriverOnline, setDriverOnlineState] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [activeRides, setActiveRides] = useState<Ride[]>([]);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [chatMessagesByRide, setChatMessagesByRide] = useState<Record<string, ChatMessage[]>>({});
  const [unreadByRide, setUnreadByRide] = useState<Record<string, number>>({});
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pricing, setPricing] = useState<PriceRule[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [finishedRideToRate, setFinishedRideToRate] = useState<Ride | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef<User | null>(null);
  const activeRideRef = useRef<Ride | null>(null);
  const activeRidesRef = useRef<Ride[]>([]);
  const isDriverOnlineRef = useRef(false);
  // Stores the rideId whose chat is currently visible (null = no chat screen open)
  const isChatOpenRef = useRef<string | null>(null);
  // Timeout handles for the repeating ride-alert sound (cleared on accept/decline)
  const soundTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  useEffect(() => { activeRidesRef.current = activeRides; }, [activeRides]);
  useEffect(() => { isDriverOnlineRef.current = isDriverOnline; }, [isDriverOnline]);

  // Load persisted state
  useEffect(() => {
    AsyncStorage.getItem("kd_user").then((data) => {
      if (data) setUserState(JSON.parse(data) as User);
    });
    AsyncStorage.getItem("kd_token").then((data) => {
      if (data) {
        tokenRef.current = data;
        setTokenState(data);
      }
    });
    AsyncStorage.getItem("kd_driver_online").then((data) => {
      if (data === "true") setDriverOnlineState(true);
    });
    AsyncStorage.getItem("kd_active_ride").then((data) => {
      if (data) setActiveRide(JSON.parse(data) as Ride);
    });
  }, []);

  const setToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setTokenState(t);
    if (t) AsyncStorage.setItem("kd_token", t);
    else AsyncStorage.removeItem("kd_token");
  }, []);

  // Authenticated fetch helper: attaches the bearer token to every request.
  // If the server says the session is no longer valid (e.g. it restarted and
  // lost its in-memory sessions), clear local auth state so the app returns
  // to the login screen instead of silently failing every request forever.
  const authFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (tokenRef.current) headers.set("Authorization", `Bearer ${tokenRef.current}`);
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (res.status === 401 && tokenRef.current) {
      tokenRef.current = null;
      setTokenState(null);
      AsyncStorage.removeItem("kd_token");
      setUserState(null);
      AsyncStorage.removeItem("kd_user");
    }
    return res;
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
    if (u) {
      void AsyncStorage.setItem("kd_user", JSON.stringify(getPersistedUser(u))).catch((error: unknown) => {
        console.warn("KD TAXI could not save the compact user cache; the profile can be refreshed from the server.", error);
        void AsyncStorage.removeItem("kd_user").catch(() => {});
      });
    } else {
      void AsyncStorage.removeItem("kd_user").catch(() => {});
    }
  }, []);

  // Keep large profile photos in memory, not in AsyncStorage. Rehydrate them
  // from the authenticated profile endpoint after login or app restart.
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !token) return;
    let cancelled = false;
    void authFetch(`/users/${userId}`)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const refreshedUser = await response.json() as User;
        if (!cancelled) setUser(refreshedUser);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, token, authFetch, setUser]);

  const setDriverOnline = useCallback((online: boolean) => {
    setDriverOnlineState(online);
    AsyncStorage.setItem("kd_driver_online", online ? "true" : "false");
    // Sync online/offline status to server so admin dashboard reflects reality
    const uid = userRef.current?.id;
    if (uid) {
      authFetch(`/users/${uid}/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: online }),
      }).catch(() => {});
    }
    if (online) {
      authFetch(`/rides`)
        .then((r) => (r.ok ? r.json() : []))
        .then((allRides: Ride[]) => {
          const currentUser = userRef.current;
          const waiting = currentUser?.mode === "driver"
            ? allRides.filter((r) => r.status === "waiting" && matchesDriverVehicle(currentUser, r))
            : [];
          if (waiting.length === 0) return;
          setPendingRides((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const fresh = waiting.filter((r) => !existingIds.has(r.id));
            return fresh.length > 0 ? [...fresh, ...prev] : prev;
          });
        })
        .catch(() => {});
    }
  }, [authFetch]);

  const updateProfile = useCallback(async (name: string, photo?: string) => {
    if (!user) return;
    const updated: User = { ...user, name, photo: photo ?? user.photo };
    setUser(updated);
    try {
      await authFetch(`/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, photo: photo ?? user.photo }),
      });
    } catch {}
  }, [user, setUser, authFetch]);

  const login = useCallback(async (phone: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "Credenciais inválidas" };
      setToken(data.token);
      setUser(data.user as User);
      return { ok: true };
    } catch {
      return { ok: false, error: "Sem conexão com o servidor." };
    }
  }, [setUser, setToken]);

  const register = useCallback(async (
    name: string,
    phone: string,
    password: string,
    mode: "client" | "driver",
    photo?: string,
    vehicleType?: VehicleType,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password, mode, photo, vehicleType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "Erro ao criar conta." };
      setToken(data.token);
      setUser(data.user as User);
      return { ok: true };
    } catch {
      return { ok: false, error: "Sem conexão com o servidor." };
    }
  }, [setUser, setToken]);

  // Register push notifications when user logs in
  useEffect(() => {
    if (!user) return;
    registerForPushNotifications().then(async (pushToken) => {
      if (pushToken && user.id) {
        try {
          await authFetch(`/users/${user.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pushToken }),
          });
        } catch {}
      }
    });
  }, [user?.id]);

  // Socket connection
  useEffect(() => {
    if (!user || !token) return;

    const socket = io(`https://${process.env.EXPO_PUBLIC_DOMAIN}`, {
      path: "/api/socket.io",
      transports: ["polling", "websocket"],
      // Identity is verified server-side from this token, never trusted
      // from client-supplied fields, and doubles as socket auth.
      auth: { token },
    });
    socketRef.current = socket;

    // Reconnects happen constantly on mobile (backgrounding, network
    // switches, weak signal). Any event that fired while disconnected is
    // otherwise lost forever, so reconcile state from the server whenever a
    // connection (re)establishes rather than relying purely on push events.
    const reconcile = async () => {
      const me = userRef.current;
      if (!me) return;
      try {
        const res = await authFetch(`/rides`);
        if (!res.ok) return;
        const all: Ride[] = await res.json();

        if (me.mode === "driver") {
          // Restore waiting rides visible to all drivers
          setPendingRides(all.filter((r) => r.status === "waiting" && matchesDriverVehicle(me, r)));
          // Restore this driver's own in-progress rides so re-logging
          // after a logout never loses contact with an active client.
          const myActive = all.filter(
            (r) => r.driverId === me.id &&
              (r.status === "accepted" || r.status === "in_progress")
          );
          if (myActive.length > 0) {
            setActiveRides((prev) => {
              const existingIds = new Set(prev.map((r) => r.id));
              const toAdd = myActive.filter((r) => !existingIds.has(r.id));
              return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
          }
        } else if (me.mode === "client") {
          // Server is the source of truth for the client's active ride.
          // This covers both reconnects and re-logins after logout.
          const myRide = all.find(
            (r) => r.clientId === me.id &&
              (r.status === "waiting" || r.status === "accepted" || r.status === "in_progress")
          );
          if (myRide) {
            setActiveRide(myRide);
          } else {
            const current = activeRideRef.current;
            if (current) {
              const fresh = all.find((r) => r.id === current.id);
              if (fresh && (fresh.status === "finished" || fresh.status === "cancelled")) {
                setActiveRide(null);
              }
            }
          }
        }
      } catch {}
    };

    socket.on("connect", reconcile);

    socket.on("nova_corrida", (ride: Ride) => {
      const currentUser = userRef.current;
      if (currentUser?.mode === "driver" && matchesDriverVehicle(currentUser, ride)) {
        setPendingRides((prev) => {
          const exists = prev.find((r) => r.id === ride.id);
          if (exists) return prev;
          return [ride, ...prev];
        });
        // Only play sound and notify when driver is online.
        // Sound repeats up to 3 times (every 4 s) — timers are cancelled
        // automatically when the driver accepts or declines the ride.
        if (isDriverOnlineRef.current) {
          let plays = 0;
          const schedulePlay = () => {
            playRideRequestSound();
            plays++;
            if (plays < 3) {
              const t = setTimeout(schedulePlay, 4000);
              soundTimersRef.current.push(t);
            }
          };
          schedulePlay();
          scheduleLocalNotification(
            "Nova corrida!",
            `${ride.clientName}: ${ride.origin} → ${ride.destination} · ${ride.vehicleType === "motorcycle" ? "KD MOTO" : "KD CARRO"}`,
          );
        }
      }
    });

    socket.on("corrida_aceita", (ride: Ride) => {
      const me = userRef.current;
      if (me?.mode === "driver" && me?.id === ride.driverId) {
        // Driver who accepted: add to their active rides list (they may run
        // multiple rides simultaneously — each one stays until finished).
        setActiveRides((prev) => {
          if (prev.some((r) => r.id === ride.id)) return prev;
          return [...prev, ride];
        });
      } else if (me?.id === ride.clientId) {
        // Client whose ride was accepted: set their single active ride.
        setActiveRide(ride);
        scheduleLocalNotification("Motorista encontrado!", `${ride.driverName} está a caminho`);
      }
      // All drivers: remove from pending list regardless of who accepted
      if (me?.mode === "driver") {
        setPendingRides((prev) => prev.filter((r) => r.id !== ride.id));
      }
    });

    socket.on("corrida_finalizada", (ride: Ride) => {
      const me = userRef.current;
      if (me?.mode === "driver" && me?.id === ride.driverId) {
        setActiveRides((prev) => prev.filter((r) => r.id !== ride.id));
        setMyRides((prev) => [ride, ...prev.filter((r) => r.id !== ride.id)]);
        setFinishedRideToRate(ride);
        scheduleLocalNotification("Corrida finalizada!", "Avalie sua experiência");
      } else if (me?.id === ride.clientId) {
        setActiveRide(null);
        setFinishedRideToRate(ride);
        setMyRides((prev) => [ride, ...prev.filter((r) => r.id !== ride.id)]);
        scheduleLocalNotification("Corrida finalizada!", "Avalie sua experiência");
      }
    });

    socket.on("corrida_cancelada", (rideId: string) => {
      const me = userRef.current;
      if (me?.mode === "driver") {
        setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
        setActiveRides((prev) => prev.filter((r) => r.id !== rideId));
      }
      setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    });

    socket.on("mensagem_chat", (msg: ChatMessage) => {
      // Deduplicate by id, then append to the per-ride bucket
      setChatMessagesByRide((prev) => {
        const existing = prev[msg.rideId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [msg.rideId]: [...existing, msg] };
      });
      if (msg.senderId !== userRef.current?.id) {
        // Only increment and notify when the relevant chat screen is not open
        if (isChatOpenRef.current !== msg.rideId) {
          setUnreadByRide((prev) => ({ ...prev, [msg.rideId]: (prev[msg.rideId] ?? 0) + 1 }));
          scheduleLocalNotification(`Mensagem de ${msg.senderName}`, msg.text);
        }
      }
    });

    return () => {
      socket.off("connect", reconcile);
      socket.disconnect();
      socketRef.current = null;
      // Cancel any pending sound repeat timers when connection is torn down
      soundTimersRef.current.forEach(clearTimeout);
      soundTimersRef.current = [];
    };
  }, [user, token]);

  const requestRide = useCallback(async (
    origin: string,
    destination: string,
    payment: "pix" | "dinheiro",
    vehicleType: VehicleType = "car",
  ): Promise<Ride | null> => {
    if (!user) return null;
    const res = await authFetch(`/request-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: user.id, clientName: user.name, clientPhone: user.phone,
         clientPhoto: user.photo, origin, destination, payment, vehicleType,
      }),
    });
    if (!res.ok) return null;
    const ride: Ride = await res.json();
    setActiveRide(ride);
    return ride;
  }, [user, authFetch]);

  const acceptRide = useCallback(async (rideId: string) => {
    if (!user) return;
    // Cancel any pending sound repeats — driver is actively responding
    soundTimersRef.current.forEach(clearTimeout);
    soundTimersRef.current = [];
    const res = await authFetch(`/accept-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId, driverId: user.id, driverName: user.name, driverPhoto: user.photo }),
    });
    if (res.ok) {
      const ride: Ride = await res.json();
      // Add to driver's active rides (socket event also does this, but we
      // handle it here too so the UI responds immediately without waiting
      // for the round-trip echo).
      setActiveRides((prev) => (prev.some((r) => r.id === ride.id) ? prev : [...prev, ride]));
      setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
    }
  }, [user, authFetch]);

  const cancelSoundAlerts = useCallback(() => {
    soundTimersRef.current.forEach(clearTimeout);
    soundTimersRef.current = [];
  }, []);

  const declineRide = useCallback((rideId: string) => {
    // Cancel pending sound repeats when driver declines
    soundTimersRef.current.forEach(clearTimeout);
    soundTimersRef.current = [];
    setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
  }, []);

  const finishRide = useCallback(async (rideId: string) => {
    const res = await authFetch(`/finish-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId }),
    });
    if (res.ok) {
      const ride: Ride = await res.json();
      setActiveRide(null);
      setActiveRides((prev) => prev.filter((r) => r.id !== rideId));
      setFinishedRideToRate(ride);
      setMyRides((prev) => [ride, ...prev.filter((r) => r.id !== ride.id)]);
      setChatMessagesByRide((prev) => { const next = { ...prev }; delete next[rideId]; return next; });
    }
  }, [authFetch]);

  const cancelRide = useCallback(async (rideId: string) => {
    await authFetch(`/cancel-ride`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId }),
    });
    setActiveRide(null);
    setActiveRides((prev) => prev.filter((r) => r.id !== rideId));
    setChatMessagesByRide((prev) => { const next = { ...prev }; delete next[rideId]; return next; });
  }, [authFetch]);

  const rateRide = useCallback(async (rideId: string, rating: number) => {
    if (!user) return;
    await authFetch(`/rides/${rideId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raterMode: user.mode, rating }),
    });
    setFinishedRideToRate(null);
  }, [user, authFetch]);

  const sendChatMessage = useCallback((text: string, rideId: string) => {
    if (!user || !socketRef.current) return;
    socketRef.current.emit("mensagem_chat", { rideId, text });
  }, [user]);

  const markChatRead = useCallback((rideId: string) => {
    setUnreadByRide((prev) => ({ ...prev, [rideId]: 0 }));
  }, []);

  const fetchChatHistory = useCallback(async (rideId: string) => {
    try {
      const res = await authFetch(`/rides/${rideId}/chat`);
      if (!res.ok) return;
      const history: ChatMessage[] = await res.json();
      setChatMessagesByRide((prev) => {
        const existing = prev[rideId] ?? [];
        const merged = [...history];
        for (const m of existing) {
          if (!merged.some((h) => h.id === m.id)) merged.push(m);
        }
        return { ...prev, [rideId]: merged };
      });
    } catch {}
  }, [authFetch]);

  const logout = useCallback(() => {
    if (tokenRef.current) {
      authFetch(`/logout`, { method: "POST" }).catch(() => {});
    }
    setUser(null);
    setToken(null);
    setActiveRide(null);
    setActiveRides([]);
    setPendingRides([]);
    setChatMessagesByRide({});
    setUnreadByRide({});
    setMyRides([]);
    setFinishedRideToRate(null);
    setDriverOnlineState(false);
    setAdminStats(null);
    soundTimersRef.current.forEach(clearTimeout);
    soundTimersRef.current = [];
    AsyncStorage.multiRemove(["kd_driver_online", "kd_active_ride"]);
  }, [setUser, setToken, authFetch]);

  const refreshAdminData = useCallback(async () => {
    const [ridesRes, usersRes] = await Promise.all([
      authFetch(`/rides`),
      authFetch(`/users`),
    ]);
    if (ridesRes.ok) setAllRides(await ridesRes.json());
    if (usersRes.ok) setAllUsers(await usersRes.json());
  }, [authFetch]);

  const refreshAdminStats = useCallback(async () => {
    try {
      const res = await authFetch(`/admin/stats`);
      if (res.ok) setAdminStats(await res.json());
    } catch {}
  }, [authFetch]);

  const fetchMyRides = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authFetch(`/users/${user.id}/rides`);
      if (res.ok) setMyRides(await res.json());
    } catch {}
  }, [user, authFetch]);

  const refreshPricing = useCallback(async () => {
    const res = await authFetch(`/pricing`);
    if (res.ok) setPricing(await res.json());
  }, [authFetch]);

  const setPricingRule = useCallback(async (destination: string, price: number, isLocal?: boolean) => {
    await authFetch(`/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, price, isLocal }),
    });
    await refreshPricing();
  }, [refreshPricing, authFetch]);

  const deletePricingRule = useCallback(async (id: string) => {
    await authFetch(`/pricing/${id}`, { method: "DELETE" });
    await refreshPricing();
  }, [refreshPricing, authFetch]);

  const lookupPrice = useCallback(async (destination: string): Promise<{ price: number; isLocal: boolean } | null> => {
    try {
      const res = await authFetch(`/pricing/lookup?destination=${encodeURIComponent(destination)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.price !== null && d.price !== undefined) return { price: d.price, isLocal: d.isLocal ?? false };
      }
    } catch {}
    return null;
  }, [authFetch]);

  const adminUpdateUser = useCallback(async (id: string, data: {
    name?: string; phone?: string; mode?: string; active?: boolean; password?: string;
  }): Promise<boolean> => {
    try {
      const res = await authFetch(`/admin/users/${id}`, {
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
  }, [authFetch]);

  const adminDeleteUser = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await authFetch(`/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAllUsers((prev) => prev.filter((u) => u.id !== id));
        return true;
      }
    } catch {}
    return false;
  }, [authFetch]);

  const adminClearRides = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authFetch(`/admin/rides`, { method: "DELETE" });
      if (res.ok) {
        setAllRides([]);
        return true;
      }
    } catch {}
    return false;
  }, [authFetch]);

  const setChatOpen = useCallback((open: boolean, rideId?: string) => {
    isChatOpenRef.current = open ? (rideId ?? null) : null;
    if (open && rideId) {
      setUnreadByRide((prev) => ({ ...prev, [rideId]: 0 }));
    }
  }, []);

  const unreadChatCount = Object.values(unreadByRide).reduce((a, b) => a + b, 0);

  return (
    <AppContext.Provider value={{
      user, setUser, updateProfile,
      isDriverOnline, setDriverOnline,
      activeRide, setActiveRide, activeRides,
      pendingRides, chatMessagesByRide, sendChatMessage,
      unreadChatCount, unreadByRide, markChatRead, fetchChatHistory,
      socket: socketRef.current,
      requestRide, acceptRide, declineRide, finishRide, cancelRide, rateRide, cancelSoundAlerts,
      logout, allRides, allUsers, pricing,
      myRides, fetchMyRides,
      adminStats, refreshAdminData, refreshAdminStats, refreshPricing,
      setPricingRule, deletePricingRule, lookupPrice,
      finishedRideToRate, clearFinishedRideToRate: () => setFinishedRideToRate(null),
      adminUpdateUser, adminDeleteUser, adminClearRides,
      setChatOpen,
      token, login, register,
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
