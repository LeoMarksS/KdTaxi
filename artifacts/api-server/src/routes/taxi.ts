import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const router = Router();

interface User {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
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

interface Session {
  userId: string;
  expiresAt: number;
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

const users: Map<string, User> = new Map();
const rides: Map<string, Ride> = new Map();
const pricing: Map<string, PriceRule> = new Map();
const sessions: Map<string, Session> = new Map();
// Chat history persisted server-side (keyed by rideId) so messages survive
// brief socket disconnects/reconnects and reloads instead of being lost in transit.
const chatByRide: Map<string, ChatMessage[]> = new Map();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return users.get(session.userId);
}

function getSessionUser(req: Request): User | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  return getUserByToken(auth.slice(7));
}

// Exposed for Socket.io connection/message authentication in index.ts, so
// real-time events trust the same session tokens as the REST API instead of
// blindly trusting client-supplied identity fields.
export function authenticateSocketToken(token: string | undefined) {
  const user = getUserByToken(token);
  if (!user) return undefined;
  return safeUser(user);
}

export function isRideParticipant(rideId: string, userId: string): boolean {
  const ride = rides.get(rideId);
  if (!ride) return false;
  return ride.clientId === userId || ride.driverId === userId;
}

export function recordChatMessage(msg: ChatMessage) {
  const list = chatByRide.get(msg.rideId) ?? [];
  list.push(msg);
  chatByRide.set(msg.rideId, list);
}

export function getRideParticipants(rideId: string): { clientId?: string; driverId?: string } {
  const ride = rides.get(rideId);
  if (!ride) return {};
  return { clientId: ride.clientId, driverId: ride.driverId };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
    }
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user || user.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  req.authUser = user;
  next();
}

// Create default admin account on startup
const defaultAdmin: User = {
  id: "admin-default",
  name: "Administrador",
  phone: "admin",
  passwordHash: bcrypt.hashSync("admin123", 10),
  mode: "admin",
  active: true,
  rating: 0,
  rideCount: 0,
  createdAt: new Date().toISOString(),
};
users.set(defaultAdmin.id, defaultAdmin);

// Login attempts are limited per phone+IP so one blocked account never locks out other users on the same network
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${(req.body?.phone ?? "").toString().trim().toLowerCase()}`,
  message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

// Registration is a rare, one-off action per user, so it gets a much more generous allowance
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de cadastro. Tente novamente em alguns minutos." },
});

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
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

function safeUserList(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

// POST /register – create a new client or driver account
router.post("/register", registerLimiter, (req: Request, res: Response) => {
  const { name, phone, password, mode, photo } = req.body as {
    name?: string; phone?: string; password?: string; mode?: string; photo?: string;
  };

  if (!name?.trim() || !phone?.trim() || !password) {
    res.status(400).json({ error: "Nome, telefone e senha são obrigatórios" });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: "A senha deve ter ao menos 4 caracteres" });
    return;
  }
  if (mode !== "client" && mode !== "driver") {
    res.status(400).json({ error: "Tipo de conta inválido" });
    return;
  }

  const normalizedPhone = phone.trim();
  const existing = Array.from(users.values()).find((u) => u.phone === normalizedPhone);
  if (existing) {
    res.status(409).json({ error: "Este telefone já está cadastrado" });
    return;
  }

  const user: User = {
    id: getId(), name: name.trim(), phone: normalizedPhone,
    passwordHash: bcrypt.hashSync(password, 10),
    mode, active: true, rating: 0, rideCount: 0,
    photo, createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  const token = createSession(user.id);
  res.json({ user: safeUser(user), token });
});

// POST /login – identifies the account (and its role) purely from phone + password
router.post("/login", loginLimiter, (req: Request, res: Response) => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone?.trim() || !password) {
    res.status(400).json({ error: "Telefone e senha são obrigatórios" });
    return;
  }

  const user = Array.from(users.values()).find((u) => u.phone === phone.trim());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: "Telefone ou senha inválidos" });
    return;
  }

  const token = createSession(user.id);
  res.json({ user: safeUser(user), token });
});

// POST /logout – invalidate the current session token
router.post("/logout", requireAuth, (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  const token = auth?.slice(7);
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// PUT /users/:id – a user may only edit their own profile
router.put("/users/:id", requireAuth, (req: Request, res: Response) => {
  if (req.authUser!.id !== (req.params.id as string)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const user = users.get((req.params.id as string));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { name, photo, pushToken } = req.body as { name?: string; photo?: string; pushToken?: string };
  if (name) user.name = name;
  if (photo !== undefined) user.photo = photo;
  if (pushToken !== undefined) user.pushToken = pushToken;
  res.json(safeUser(user));
});

// GET /users – admin only, list of clients/drivers (no photos, for perf)
router.get("/users", requireAdmin, (_req: Request, res: Response) => {
  res.json(Array.from(users.values())
    .filter((u) => u.mode !== "admin")
    .map(safeUserList));
});

// GET /users/:id – self or admin only
router.get("/users/:id", requireAuth, (req: Request, res: Response) => {
  if (req.authUser!.id !== (req.params.id as string) && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const user = users.get((req.params.id as string));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(safeUser(user));
});

// POST /users/:id/active – self only
router.post("/users/:id/active", requireAuth, (req: Request, res: Response) => {
  if (req.authUser!.id !== (req.params.id as string)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const user = users.get((req.params.id as string));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  user.active = req.body.active;
  res.json(safeUser(user));
});

// ─── ADMIN ENDPOINTS ───────────────────────────────────────────────────────

// PUT /admin/users/:id – admin can edit any user fully
router.put("/admin/users/:id", requireAdmin, (req: Request, res: Response) => {
  const user = users.get((req.params.id as string));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const { name, phone, mode, active, password } = req.body as {
    name?: string; phone?: string; mode?: string; active?: boolean; password?: string;
  };
  if (name !== undefined) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (mode !== undefined) user.mode = mode as User["mode"];
  if (active !== undefined) user.active = active;
  if (password !== undefined && password.length >= 4) user.passwordHash = bcrypt.hashSync(password, 10);
  res.json(safeUser(user));
});

// DELETE /admin/users/:id – admin deletes a user
router.delete("/admin/users/:id", requireAdmin, (req: Request, res: Response) => {
  const user = users.get((req.params.id as string));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  if (user.mode === "admin") { res.status(403).json({ error: "Cannot delete admin account" }); return; }
  users.delete((req.params.id as string));
  res.json({ ok: true });
});

// DELETE /admin/rides – clear all rides
router.delete("/admin/rides", requireAdmin, (_req: Request, res: Response) => {
  rides.clear();
  res.json({ ok: true });
});

// GET /admin/stats – system statistics
router.get("/admin/stats", requireAdmin, (_req: Request, res: Response) => {
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
    onlineDrivers: allUserList.filter((u) => u.mode === "driver" && u.active).length,
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
router.post("/admin/users", requireAdmin, (req: Request, res: Response) => {
  const { name, phone, password, mode } = req.body as {
    name: string; phone: string; password: string; mode?: string;
  };
  if (!name || !phone || !password) { res.status(400).json({ error: "Missing fields" }); return; }
  if (password.length < 4) { res.status(400).json({ error: "A senha deve ter ao menos 4 caracteres" }); return; }
  const existing = Array.from(users.values()).find((u) => u.phone === phone);
  if (existing) { res.status(409).json({ error: "Telefone já cadastrado" }); return; }
  const user: User = {
    id: getId(), name: name.trim(), phone: phone.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    mode: (mode as User["mode"]) ?? "admin", active: true, rating: 0, rideCount: 0,
    createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  res.json(safeUser(user));
});

// ─── RIDE ENDPOINTS ────────────────────────────────────────────────────────

// POST /request-ride
router.post("/request-ride", requireAuth, async (req: Request, res: Response) => {
  const { clientId, clientName, clientPhone, clientPhoto, origin, destination, payment } = req.body as {
    clientId: string; clientName: string; clientPhone: string; clientPhoto?: string;
    origin: string; destination: string; payment?: string;
  };
  if (!clientId || !origin || !destination) { res.status(400).json({ error: "Missing required fields" }); return; }
  if (req.authUser!.id !== clientId || req.authUser!.mode !== "client") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

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
router.post("/accept-ride", requireAuth, async (req: Request, res: Response) => {
  const { rideId, driverId, driverName, driverPhoto } = req.body as {
    rideId: string; driverId: string; driverName: string; driverPhoto?: string;
  };
  if (req.authUser!.id !== driverId || req.authUser!.mode !== "driver") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
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
router.post("/finish-ride", requireAuth, async (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };
  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.driverId !== req.authUser!.id) { res.status(403).json({ error: "Acesso negado" }); return; }

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
router.post("/cancel-ride", requireAuth, (req: Request, res: Response) => {
  const ride = rides.get(req.body.rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.clientId !== req.authUser!.id && ride.driverId !== req.authUser!.id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  ride.status = "cancelled";
  const io = req.app.get("io");
  if (io) io.emit("corrida_cancelada", ride.id);
  res.json(ride);
});

// GET /rides/:id/chat – participants (or admin) only, used to recover chat
// history after a reconnect or app reload since messages are no longer
// solely reliant on both sockets being connected at the exact same moment.
router.get("/rides/:id/chat", requireAuth, (req: Request, res: Response) => {
  const rideId = req.params.id as string;
  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (req.authUser!.id !== ride.clientId && req.authUser!.id !== ride.driverId && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  res.json(chatByRide.get(rideId) ?? []);
});

// POST /rides/:id/rate
router.post("/rides/:id/rate", requireAuth, (req: Request, res: Response) => {
  const ride = rides.get((req.params.id as string));
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  const { raterMode, rating } = req.body as { raterMode: "client" | "driver"; rating: number };
  const expectedId = raterMode === "client" ? ride.clientId : ride.driverId;
  if (req.authUser!.id !== expectedId) { res.status(403).json({ error: "Acesso negado" }); return; }

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

// GET /rides – any authenticated user (drivers need this to see waiting rides)
router.get("/rides", requireAuth, (_req: Request, res: Response) => {
  res.json(Array.from(rides.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ));
});

// GET /users/:id/rides – self or admin only
router.get("/users/:id/rides", requireAuth, (req: Request, res: Response) => {
  if (req.authUser!.id !== (req.params.id as string) && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const userId = (req.params.id as string);
  const userRides = Array.from(rides.values())
    .filter((r) => (r.clientId === userId || r.driverId === userId) && r.status === "finished")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(userRides);
});

// GET /pricing
router.get("/pricing", requireAuth, (_req: Request, res: Response) => {
  res.json(Array.from(pricing.values()).sort((a, b) => a.destination.localeCompare(b.destination)));
});

// POST /pricing – admin only
router.post("/pricing", requireAdmin, (req: Request, res: Response) => {
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

// DELETE /pricing/:id – admin only
router.delete("/pricing/:id", requireAdmin, (req: Request, res: Response) => {
  pricing.delete((req.params.id as string));
  res.json({ ok: true });
});

// GET /pricing/lookup?destination=xxx
router.get("/pricing/lookup", requireAuth, (req: Request, res: Response) => {
  const destination = (req.query.destination as string) ?? "";
  const result = lookupPrice(destination);
  res.json({ price: result?.price ?? null, isLocal: result?.isLocal ?? false });
});

export default router;
