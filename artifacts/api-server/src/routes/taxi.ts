import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { pool, initDb, getUserByPhone, getUserById, createUserDb, createSessionDb, getSessionDb, deleteSessionDb } from "../lib/db";

const router = Router();

interface User {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  mode: "client" | "driver" | "admin";
  vehicleType?: "car" | "motorcycle";
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
  vehicleType: "car" | "motorcycle";
  price?: number;
  payment?: "pix" | "dinheiro";
  status: "waiting" | "accepted" | "in_progress" | "finished" | "cancelled";
  clientRating?: number;
  driverRating?: number;
  createdAt: string;
  acceptedAt?: string;
  finishedAt?: string;
}

function driverVehicleType(user: User): "car" | "motorcycle" {
  return user.vehicleType === "motorcycle" ? "motorcycle" : "car";
}

function driverCanTakeRide(user: User, ride: Ride): boolean {
  return user.mode === "driver" && driverVehicleType(user) === ride.vehicleType;
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
const chatByRide: Map<string, ChatMessage[]> = new Map();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getId() {
  // Usa UUID válido para coluna uuid no Neon
  return crypto.randomUUID();
}

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { userId, expiresAt });
  if (pool) createSessionDb(token, userId, expiresAt).catch(console.error);
  return token;
}

function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    if (pool) deleteSessionDb(token).catch(console.error);
    return undefined;
  }
  return users.get(session.userId);
}

function getSessionUser(req: Request): User | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  return getUserByToken(auth.slice(7));
}

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

const defaultAdmin: User = {
  id: "00000000-0000-0000-0000-000000000001",
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

// Carrega usuários do Neon para memória no startup (modo profissional)
async function loadUsersFromNeon() {
  if (!pool) return;
  try {
    const res = await pool.query(`SELECT * FROM contas`);
    for (const row of res.rows) {
      const user: User = {
        id: row.id,
        name: row.nome,
        phone: row.phone || row.email,
        passwordHash: row.password_hash || row.senha || "",
        mode: (row.mode || row.tipo || "client") as any,
        vehicleType: row.vehicle_type as any,
        active: true,
        photo: row.photo,
        rating: Number(row.rating || 0),
        rideCount: Number(row.ride_count || 0),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      };
      if (user.phone) users.set(user.id, user);
    }
    console.log(`✅ ${res.rows.length} usuários carregados do Neon para memória`);
  } catch (e) {
    console.error("Erro ao carregar usuários do Neon:", e);
  }
}

async function loadSessionsFromNeon() {
  if (!pool) return;
  try {
    const res = await pool.query(`SELECT token, conta_id, expira_em FROM sessoes WHERE expira_em > NOW()`);
    for (const row of res.rows) {
      const expiresAt = row.expira_em ? new Date(row.expira_em).getTime() : Date.now() + 7*24*60*60*1000;
      if (row.token && row.conta_id) {
        sessions.set(row.token, { userId: row.conta_id, expiresAt });
      }
    }
    console.log(`✅ ${res.rows.length} sessões carregadas do Neon para memória`);
  } catch (e) {
    console.error("Erro ao carregar sessões do Neon:", e);
  }
}

async function loadRidesFromNeon() {
  if (!pool) return;
  try {
    const res = await pool.query(`SELECT * FROM corridas WHERE status != 'finished' AND status != 'cancelled' ORDER BY created_at DESC LIMIT 100`);
    for (const row of res.rows) {
      const ride: Ride = {
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        clientPhone: row.client_phone,
        origin: row.origin,
        destination: row.destination,
        vehicleType: (row.vehicle_type as any) || "car",
        status: (row.status as any) || "waiting",
        driverId: row.driver_id,
        price: row.price ? Number(row.price) : undefined,
        payment: row.payment as any,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        finishedAt: row.finished_at,
      };
      rides.set(ride.id, ride);
    }
    console.log(`✅ ${res.rows.length} corridas ativas carregadas do Neon`);
  } catch (e) {
    console.error("Erro ao carregar corridas do Neon:", e);
  }
}

loadUsersFromNeon().then(() => {
  loadSessionsFromNeon();
  loadRidesFromNeon();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${(req.body?.phone ?? "").toString().trim().toLowerCase()}`,
  message: { error: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

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
  for (const rule of pricing.values()) {
    if (rule.isLocal) continue;
    if (dest.includes(rule.destination.toLowerCase().trim()) ||
        rule.destination.toLowerCase().trim().includes(dest)) {
      return { price: rule.price, isLocal: false };
    }
  }
  const localRule = Array.from(pricing.values()).find((r) => r.isLocal);
  if (localRule) return { price: localRule.price, isLocal: true };
  return undefined;
}

function safeUser(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

function safeUserList(u: User) {
  const { passwordHash: _ph, pushToken: _pushToken, ...rest } = u;
  return rest;
}

// POST /register – PROFISSIONAL: salva no Neon
router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const { name, phone, password, mode, photo, vehicleType } = req.body as {
    name?: string; phone?: string; password?: string; mode?: string; photo?: string;
    vehicleType?: string;
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
  let existing = Array.from(users.values()).find((u) => u.phone === normalizedPhone);
  if (!existing && pool) {
    const dbRow = await getUserByPhone(normalizedPhone);
    if (dbRow) {
      existing = {
        id: dbRow.id,
        name: dbRow.nome,
        phone: dbRow.phone || dbRow.email,
        passwordHash: dbRow.password_hash || dbRow.senha,
        mode: (dbRow.mode || dbRow.tipo) as any,
        vehicleType: dbRow.vehicle_type as any,
        active: true,
        photo: dbRow.photo,
        rating: Number(dbRow.rating || 0),
        rideCount: Number(dbRow.ride_count || 0),
        createdAt: dbRow.created_at,
      };
      users.set(existing.id, existing);
    }
  }
  if (existing) {
    res.status(409).json({ error: "Este telefone já está cadastrado" });
    return;
  }

  const user: User = {
    id: getId(), name: name.trim(), phone: normalizedPhone,
    passwordHash: bcrypt.hashSync(password, 10),
    mode,
    vehicleType: mode === "driver" && vehicleType === "motorcycle" ? "motorcycle" : mode === "driver" ? "car" : undefined,
    active: true, rating: 0, rideCount: 0,
    photo, createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  if (pool) {
    try {
      await createUserDb(user);
      console.log(`✅ Usuário ${user.phone} salvo no Neon`);
    } catch (e) {
      console.error("Erro ao salvar no Neon:", e);
    }
  }
  const token = createSession(user.id);
  res.json({ user: safeUser(user), token });
});

// POST /login – PROFISSIONAL: busca no Neon
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone?.trim() || !password) {
    res.status(400).json({ error: "Telefone e senha são obrigatórios" });
    return;
  }

  let user = Array.from(users.values()).find((u) => u.phone === phone.trim());
  if (!user && pool) {
    const dbRow = await getUserByPhone(phone.trim());
    if (dbRow) {
      user = {
        id: dbRow.id,
        name: dbRow.nome,
        phone: dbRow.phone || dbRow.email,
        passwordHash: dbRow.password_hash || dbRow.senha,
        mode: (dbRow.mode || dbRow.tipo) as any,
        vehicleType: dbRow.vehicle_type as any,
        active: true,
        photo: dbRow.photo,
        rating: Number(dbRow.rating || 0),
        rideCount: Number(dbRow.ride_count || 0),
        createdAt: dbRow.created_at ? new Date(dbRow.created_at).toISOString() : new Date().toISOString(),
      };
      users.set(user.id, user);
    }
  }
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    res.status(401).json({ error: "Telefone ou senha inválidos" });
    return;
  }

  const token = createSession(user.id);
  res.json({ user: safeUser(user), token });
});

// GET /me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: safeUser(req.authUser!) });
});

// POST /push-token
router.post("/push-token", requireAuth, (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Token obrigatório" });
    return;
  }
  const user = users.get(req.authUser!.id);
  if (user) user.pushToken = token;
  res.json({ ok: true });
});

// GET /users (admin)
router.get("/users", requireAdmin, (req, res) => {
  const list = Array.from(users.values()).map(safeUserList);
  res.json(list);
});

// PUT /users/:id/toggle (admin)
router.put("/users/:id/toggle", requireAdmin, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado" });
    return;
  }
  user.active = !user.active;
  if (pool) {
    pool.query(`UPDATE contas SET active = $1 WHERE id = $2`, [user.active, user.id]).catch(console.error);
  }
  res.json(safeUserList(user));
});

// GET /rides
router.get("/rides", requireAuth, (req, res) => {
  const user = req.authUser!;
  let list = Array.from(rides.values());
  if (user.mode === "client") {
    list = list.filter((r) => r.clientId === user.id);
  } else if (user.mode === "driver") {
    list = list.filter((r) => r.status === "waiting" && driverCanTakeRide(user, r));
  }
  res.json(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

// POST /rides
router.post("/rides", requireAuth, (req, res) => {
  const user = req.authUser!;
  if (user.mode !== "client") {
    res.status(403).json({ error: "Apenas clientes podem pedir corridas" });
    return;
  }
  const { origin, destination, vehicleType, payment } = req.body as {
    origin?: string; destination?: string; vehicleType?: string; payment?: string;
  };
  if (!origin?.trim() || !destination?.trim()) {
    res.status(400).json({ error: "Origem e destino obrigatórios" });
    return;
  }
  const vt = vehicleType === "motorcycle" ? "motorcycle" : "car";
  const pricingInfo = lookupPrice(destination);
  const ride: Ride = {
    id: getId(),
    clientId: user.id,
    clientName: user.name,
    clientPhone: user.phone,
    clientPhoto: user.photo,
    clientAvgRating: user.rating,
    clientRideCount: user.rideCount,
    origin: origin.trim(),
    destination: destination.trim(),
    vehicleType: vt,
    status: "waiting",
    price: pricingInfo?.price,
    payment: payment as any,
    createdAt: new Date().toISOString(),
  };
  rides.set(ride.id, ride);
  if (pool) {
    pool.query(`INSERT INTO corridas (id, client_id, client_name, client_phone, origin, destination, vehicle_type, status, price, payment, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
    [ride.id, ride.clientId, ride.clientName, ride.clientPhone, ride.origin, ride.destination, ride.vehicleType, ride.status, ride.price, ride.payment, ride.createdAt]).catch(console.error);
  }
  res.json(ride);
});

// POST /rides/:id/accept
router.post("/rides/:id/accept", requireAuth, (req, res) => {
  const user = req.authUser!;
  const ride = rides.get(req.params.id);
  if (!ride) {
    res.status(404).json({ error: "Corrida não encontrada" });
    return;
  }
  if (ride.status !== "waiting") {
    res.status(400).json({ error: "Corrida já foi aceita" });
    return;
  }
  if (!driverCanTakeRide(user, ride)) {
    res.status(403).json({ error: "Veículo incompatível" });
    return;
  }
  ride.driverId = user.id;
  ride.driverName = user.name;
  ride.driverPhoto = user.photo;
  ride.driverAvgRating = user.rating;
  ride.driverRideCount = user.rideCount;
  ride.status = "accepted";
  ride.acceptedAt = new Date().toISOString();
  res.json(ride);
});

// POST /rides/:id/finish
router.post("/rides/:id/finish", requireAuth, (req, res) => {
  const ride = rides.get(req.params.id);
  if (!ride) {
    res.status(404).json({ error: "Corrida não encontrada" });
    return;
  }
  ride.status = "finished";
  ride.finishedAt = new Date().toISOString();
  res.json(ride);
});

// POST /finish-ride
router.post("/finish-ride", requireAuth, (req, res) => {
  const { rideId } = req.body as { rideId?: string };
  const ride = rides.get(rideId || "");
  if (!ride) {
    res.status(404).json({ error: "Corrida não encontrada" });
    return;
  }
  ride.status = "finished";
  ride.finishedAt = new Date().toISOString();
  res.json(ride);
});

// GET /admin/stats
router.get("/admin/stats", requireAdmin, (req, res) => {
  res.json({
    users: users.size,
    rides: rides.size,
    waiting: Array.from(rides.values()).filter((r) => r.status === "waiting").length,
  });
});

// Pricing routes
router.get("/pricing", requireAuth, (req, res) => {
  res.json(Array.from(pricing.values()));
});

router.post("/pricing", requireAdmin, (req, res) => {
  const { destination, price, isLocal } = req.body as { destination?: string; price?: number; isLocal?: boolean };
  if (!destination?.trim() || typeof price !== "number") {
    res.status(400).json({ error: "Destino e preço obrigatórios" });
    return;
  }
  const rule: PriceRule = {
    id: getId(),
    destination: destination.trim(),
    price,
    isLocal: !!isLocal,
    createdAt: new Date().toISOString(),
  };
  pricing.set(rule.id, rule);
  res.json(rule);
});

router.delete("/pricing/:id", requireAdmin, (req, res) => {
  pricing.delete(req.params.id);
  res.json({ ok: true });
});

export default router;
