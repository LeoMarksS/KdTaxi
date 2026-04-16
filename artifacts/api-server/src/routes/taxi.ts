import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

interface User {
  id: string;
  name: string;
  phone: string;
  password?: string;
  mode: "client" | "driver" | "admin";
  active: boolean;
  photo?: string;
  pushToken?: string;
  rating: number;
  rideCount: number;
  createdAt: string;
}

interface Ride {
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
  status: "waiting" | "accepted" | "in_progress" | "finished" | "cancelled";
  clientRating?: number;
  driverRating?: number;
  createdAt: string;
  acceptedAt?: string;
  finishedAt?: string;
}

interface PriceRule {
  id: string;
  destination: string;
  price: number;
  isLocal?: boolean;
  createdAt: string;
}

const users: Map<string, User> = new Map();
const rides: Map<string, Ride> = new Map();
const pricing: Map<string, PriceRule> = new Map();

function getId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Create default admin account on startup
const defaultAdmin: User = {
  id: "admin-default",
  name: "Administrador",
  phone: "admin",
  password: "admin123",
  mode: "admin",
  active: true,
  rating: 0,
  rideCount: 0,
  createdAt: new Date().toISOString(),
};
users.set(defaultAdmin.id, defaultAdmin);

async function sendPushNotification(token: string, title: string, body: string, data?: object) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default", data: data ?? {} }),
    });
  } catch (_) {}
}

function lookupPrice(destination: string): { price: number; isLocal: boolean } | undefined {
  const dest = destination.toLowerCase().trim();
  // First try to match specific (non-local) pricing rules
  for (const rule of pricing.values()) {
    if (rule.isLocal) continue;
    if (dest.includes(rule.destination.toLowerCase().trim()) ||
        rule.destination.toLowerCase().trim().includes(dest)) {
      return { price: rule.price, isLocal: false };
    }
  }
  // Fallback: use local/intra-city price if configured
  const localRule = Array.from(pricing.values()).find((r) => r.isLocal);
  if (localRule) return { price: localRule.price, isLocal: true };
  return undefined;
}

function safeUser(u: User) {
  return { ...u, photo: u.photo ? "[photo]" : undefined, password: undefined };
}

// POST /login
router.post("/login", (req: Request, res: Response) => {
  const { name, phone, mode, photo, password, pushToken } = req.body as {
    name?: string; phone: string; mode: string; photo?: string; password?: string; pushToken?: string;
  };

  if (!phone || !mode) { res.status(400).json({ error: "Missing required fields" }); return; }

  if (mode === "admin") {
    // Admin login requires password
    const admin = Array.from(users.values()).find((u) => u.mode === "admin" && u.phone === phone);
    if (!admin || admin.password !== password) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }
    if (photo) admin.photo = photo;
    if (pushToken) admin.pushToken = pushToken;
    res.json(safeUser(admin));
    return;
  }

  if (!name) { res.status(400).json({ error: "Nome obrigatório" }); return; }

  // Client/driver: register or return existing by phone+mode
  let user = Array.from(users.values()).find((u) => u.phone === phone && u.mode === mode);
  if (!user) {
    user = {
      id: getId(), name: name.trim(), phone, mode: mode as User["mode"],
      active: true, rating: 0, rideCount: 0, createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
  } else {
    user.name = name.trim();
  }
  if (photo) user.photo = photo;
  if (pushToken) user.pushToken = pushToken;
  res.json(safeUser(user));
});

// PUT /users/:id
router.put("/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { name, photo, pushToken } = req.body as { name?: string; photo?: string; pushToken?: string };
  if (name) user.name = name;
  if (photo !== undefined) user.photo = photo;
  if (pushToken !== undefined) user.pushToken = pushToken;
  res.json(safeUser(user));
});

// GET /users
router.get("/users", (_req: Request, res: Response) => {
  res.json(Array.from(users.values())
    .filter((u) => u.mode !== "admin")
    .map(safeUser));
});

// GET /users/:id
router.get("/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(safeUser(user));
});

// POST /users/:id/active
router.post("/users/:id/active", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  user.active = req.body.active;
  res.json(safeUser(user));
});

// ─── ADMIN ENDPOINTS ───────────────────────────────────────────────────────

// PUT /admin/users/:id – admin can edit any user fully
router.put("/admin/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const { name, phone, mode, active, password } = req.body as {
    name?: string; phone?: string; mode?: string; active?: boolean; password?: string;
  };
  if (name !== undefined) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (mode !== undefined) user.mode = mode as User["mode"];
  if (active !== undefined) user.active = active;
  if (password !== undefined && password.length >= 4) user.password = password;
  res.json(safeUser(user));
});

// DELETE /admin/users/:id – admin deletes a user
router.delete("/admin/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  if (user.mode === "admin") { res.status(403).json({ error: "Cannot delete admin account" }); return; }
  users.delete(req.params.id!);
  res.json({ ok: true });
});

// DELETE /admin/rides – clear all rides
router.delete("/admin/rides", (_req: Request, res: Response) => {
  rides.clear();
  res.json({ ok: true });
});

// GET /admin/stats – system statistics
router.get("/admin/stats", (_req: Request, res: Response) => {
  const allRideList = Array.from(rides.values());
  const allUserList = Array.from(users.values());
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const finishedRides = allRideList.filter((r) => r.status === "finished");
  const todayRides = allRideList.filter((r) => new Date(r.createdAt) >= todayStart);
  const todayFinished = todayRides.filter((r) => r.status === "finished");
  const totalRevenue = finishedRides.reduce((s, r) => s + (r.price ?? 0), 0);
  const todayRevenue = todayFinished.reduce((s, r) => s + (r.price ?? 0), 0);

  res.json({
    totalUsers: allUserList.filter((u) => u.mode !== "admin").length,
    totalClients: allUserList.filter((u) => u.mode === "client").length,
    totalDrivers: allUserList.filter((u) => u.mode === "driver").length,
    totalRides: allRideList.length,
    finishedRides: finishedRides.length,
    cancelledRides: allRideList.filter((r) => r.status === "cancelled").length,
    activeRides: allRideList.filter((r) => ["waiting", "accepted", "in_progress"].includes(r.status)).length,
    totalRevenue,
    todayRides: todayRides.length,
    todayRevenue,
    avgRating: allUserList.filter((u) => u.rideCount > 0).reduce((s, u) => s + u.rating, 0) /
      Math.max(1, allUserList.filter((u) => u.rideCount > 0).length),
  });
});

// POST /admin/users – create a new admin account
router.post("/admin/users", (req: Request, res: Response) => {
  const { name, phone, password, mode } = req.body as {
    name: string; phone: string; password: string; mode?: string;
  };
  if (!name || !phone || !password) { res.status(400).json({ error: "Missing fields" }); return; }
  const existing = Array.from(users.values()).find((u) => u.phone === phone);
  if (existing) { res.status(409).json({ error: "Telefone já cadastrado" }); return; }
  const user: User = {
    id: getId(), name: name.trim(), phone: phone.trim(), password,
    mode: (mode as User["mode"]) ?? "admin", active: true, rating: 0, rideCount: 0,
    createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  res.json(safeUser(user));
});

// ─── RIDE ENDPOINTS ────────────────────────────────────────────────────────

// POST /request-ride
router.post("/request-ride", async (req: Request, res: Response) => {
  const { clientId, clientName, clientPhone, clientPhoto, origin, destination, payment } = req.body as {
    clientId: string; clientName: string; clientPhone: string; clientPhoto?: string;
    origin: string; destination: string; payment?: string;
  };
  if (!clientId || !origin || !destination) { res.status(400).json({ error: "Missing required fields" }); return; }

  const priceResult = lookupPrice(destination);
  const price = priceResult?.price;
  const client = users.get(clientId);
  const ride: Ride = {
    id: getId(), clientId, clientName, clientPhone, clientPhoto,
    clientAvgRating: client?.rating ?? 0,
    clientRideCount: client?.rideCount ?? 0,
    origin, destination,
    price, payment: (payment as Ride["payment"]) ?? "dinheiro",
    status: "waiting", createdAt: new Date().toISOString(),
  };
  rides.set(ride.id, ride);

  const io = req.app.get("io");
  if (io) io.emit("nova_corrida", ride);

  for (const u of users.values()) {
    if (u.mode === "driver" && u.active && u.pushToken) {
      sendPushNotification(u.pushToken, "Nova corrida!", `${clientName}: ${origin} → ${destination}`, { rideId: ride.id });
    }
  }

  res.json(ride);
});

// POST /accept-ride
router.post("/accept-ride", async (req: Request, res: Response) => {
  const { rideId, driverId, driverName, driverPhoto } = req.body as {
    rideId: string; driverId: string; driverName: string; driverPhoto?: string;
  };
  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.status !== "waiting") { res.status(409).json({ error: "Ride already taken" }); return; }

  const driver = users.get(driverId);
  ride.driverId = driverId;
  ride.driverName = driverName;
  ride.driverPhoto = driverPhoto;
  ride.driverAvgRating = driver?.rating ?? 0;
  ride.driverRideCount = driver?.rideCount ?? 0;
  ride.status = "accepted";
  ride.acceptedAt = new Date().toISOString();

  const io = req.app.get("io");
  if (io) io.emit("corrida_aceita", ride);

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Motorista encontrado!", `${driverName} está a caminho`, { rideId });
  }

  res.json(ride);
});

// POST /finish-ride
router.post("/finish-ride", async (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };
  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }

  ride.status = "finished";
  ride.finishedAt = new Date().toISOString();

  const io = req.app.get("io");
  if (io) io.emit("corrida_finalizada", ride);

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida finalizada!", "Avalie sua experiência", { rideId });
  }

  res.json(ride);
});

// POST /cancel-ride
router.post("/cancel-ride", (req: Request, res: Response) => {
  const ride = rides.get(req.body.rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  ride.status = "cancelled";
  const io = req.app.get("io");
  if (io) io.emit("corrida_cancelada", ride.id);
  res.json(ride);
});

// POST /rides/:id/rate
router.post("/rides/:id/rate", (req: Request, res: Response) => {
  const ride = rides.get(req.params.id!);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  const { raterMode, rating } = req.body as { raterMode: "client" | "driver"; rating: number };
  if (raterMode === "client") ride.clientRating = rating;
  if (raterMode === "driver") ride.driverRating = rating;

  const targetId = raterMode === "client" ? ride.driverId : ride.clientId;
  if (targetId) {
    const u = users.get(targetId);
    if (u) {
      const total = u.rating * u.rideCount + rating;
      u.rideCount++;
      u.rating = parseFloat((total / u.rideCount).toFixed(1));
    }
  }
  res.json(ride);
});

// GET /rides
router.get("/rides", (_req: Request, res: Response) => {
  res.json(Array.from(rides.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ));
});

// GET /users/:id/rides
router.get("/users/:id/rides", (req: Request, res: Response) => {
  const userId = req.params.id!;
  const userRides = Array.from(rides.values())
    .filter((r) => (r.clientId === userId || r.driverId === userId) && r.status === "finished")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(userRides);
});

// GET /pricing
router.get("/pricing", (_req: Request, res: Response) => {
  res.json(Array.from(pricing.values()).sort((a, b) => a.destination.localeCompare(b.destination)));
});

// POST /pricing
router.post("/pricing", (req: Request, res: Response) => {
  const { destination, price, isLocal } = req.body as { destination: string; price: number; isLocal?: boolean };
  if (!destination || price === undefined) { res.status(400).json({ error: "Missing fields" }); return; }

  if (isLocal) {
    // Only one local rule allowed — upsert it
    const existing = Array.from(pricing.values()).find((p) => p.isLocal);
    if (existing) {
      existing.price = price;
      existing.destination = destination.trim();
      res.json(existing);
      return;
    }
    const rule: PriceRule = { id: "local-price", destination: destination.trim(), price, isLocal: true, createdAt: new Date().toISOString() };
    pricing.set(rule.id, rule);
    res.json(rule);
    return;
  }

  const existing = Array.from(pricing.values()).find(
    (p) => !p.isLocal && p.destination.toLowerCase() === destination.toLowerCase()
  );
  if (existing) {
    existing.price = price;
    res.json(existing);
    return;
  }

  const rule: PriceRule = { id: getId(), destination: destination.trim(), price, createdAt: new Date().toISOString() };
  pricing.set(rule.id, rule);
  res.json(rule);
});

// DELETE /pricing/:id
router.delete("/pricing/:id", (req: Request, res: Response) => {
  pricing.delete(req.params.id!);
  res.json({ ok: true });
});

// GET /pricing/lookup?destination=xxx
router.get("/pricing/lookup", (req: Request, res: Response) => {
  const destination = (req.query.destination as string) ?? "";
  const result = lookupPrice(destination);
  res.json({ price: result?.price ?? null, isLocal: result?.isLocal ?? false });
});

export default router;
