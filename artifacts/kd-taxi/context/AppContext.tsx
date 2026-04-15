import AsyncStorage from "@react-native-async-storage/async-storage";
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
}

export type RideStatus =
  | "waiting"
  | "accepted"
  | "in_progress"
  | "finished"
  | "cancelled";

export interface Ride {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  driverId?: string;
  driverName?: string;
  origin: string;
  destination: string;
  status: RideStatus;
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

interface AppContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  isDriverOnline: boolean;
  setDriverOnline: (online: boolean) => void;
  activeRide: Ride | null;
  setActiveRide: (ride: Ride | null) => void;
  pendingRides: Ride[];
  setPendingRides: (rides: Ride[]) => void;
  chatMessages: ChatMessage[];
  setChatMessages: (msgs: ChatMessage[]) => void;
  sendChatMessage: (text: string) => void;
  socket: Socket | null;
  requestRide: (origin: string, destination: string) => Promise<Ride | null>;
  acceptRide: (rideId: string) => Promise<void>;
  declineRide: (rideId: string) => void;
  finishRide: (rideId: string) => Promise<void>;
  cancelRide: (rideId: string) => Promise<void>;
  logout: () => void;
  allRides: Ride[];
  allUsers: User[];
  refreshAdminData: () => Promise<void>;
  toggleDriverStatus: (userId: string, active: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isDriverOnline, setDriverOnlineState] = useState(false);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [allRides, setAllRides] = useState<Ride[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("kd_user").then((data) => {
      if (data) {
        const u = JSON.parse(data) as User;
        setUserState(u);
      }
    });
    AsyncStorage.getItem("kd_driver_online").then((data) => {
      if (data === "true") setDriverOnlineState(true);
    });
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) {
      AsyncStorage.setItem("kd_user", JSON.stringify(u));
    } else {
      AsyncStorage.removeItem("kd_user");
    }
  }, []);

  const setDriverOnline = useCallback((online: boolean) => {
    setDriverOnlineState(online);
    AsyncStorage.setItem("kd_driver_online", online ? "true" : "false");
  }, []);

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
      }
    });

    socket.on("corrida_aceita", (ride: Ride) => {
      setActiveRide(ride);
      setPendingRides((prev) => prev.filter((r) => r.id !== ride.id));
    });

    socket.on("corrida_finalizada", (ride: Ride) => {
      setActiveRide(null);
      setChatMessages([]);
    });

    socket.on("corrida_cancelada", (rideId: string) => {
      setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
      setActiveRide((prev) => (prev?.id === rideId ? null : prev));
    });

    socket.on("mensagem_chat", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const requestRide = useCallback(
    async (origin: string, destination: string): Promise<Ride | null> => {
      if (!user) return null;
      const res = await fetch(`${API_BASE}/request-ride`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: user.id,
          clientName: user.name,
          clientPhone: user.phone,
          origin,
          destination,
        }),
      });
      if (!res.ok) return null;
      const ride: Ride = await res.json();
      setActiveRide(ride);
      return ride;
    },
    [user]
  );

  const acceptRide = useCallback(
    async (rideId: string) => {
      if (!user) return;
      const res = await fetch(`${API_BASE}/accept-ride`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, driverId: user.id, driverName: user.name }),
      });
      if (res.ok) {
        const ride: Ride = await res.json();
        setActiveRide(ride);
        setPendingRides((prev) => prev.filter((r) => r.id !== rideId));
      }
    },
    [user]
  );

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
      setActiveRide(null);
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

  const sendChatMessage = useCallback(
    (text: string) => {
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
    },
    [user, activeRide]
  );

  const logout = useCallback(() => {
    setUser(null);
    setActiveRide(null);
    setPendingRides([]);
    setChatMessages([]);
    setDriverOnlineState(false);
    AsyncStorage.removeItem("kd_driver_online");
  }, [setUser]);

  const refreshAdminData = useCallback(async () => {
    const [ridesRes, usersRes] = await Promise.all([
      fetch(`${API_BASE}/rides`),
      fetch(`${API_BASE}/users`),
    ]);
    if (ridesRes.ok) setAllRides(await ridesRes.json());
    if (usersRes.ok) setAllUsers(await usersRes.json());
  }, []);

  const toggleDriverStatus = useCallback(
    async (userId: string, active: boolean) => {
      await fetch(`${API_BASE}/users/${userId}/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      await refreshAdminData();
    },
    [refreshAdminData]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        isDriverOnline,
        setDriverOnline,
        activeRide,
        setActiveRide,
        pendingRides,
        setPendingRides,
        chatMessages,
        setChatMessages,
        sendChatMessage,
        socket: socketRef.current,
        requestRide,
        acceptRide,
        declineRide,
        finishRide,
        cancelRide,
        logout,
        allRides,
        allUsers,
        refreshAdminData,
        toggleDriverStatus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
