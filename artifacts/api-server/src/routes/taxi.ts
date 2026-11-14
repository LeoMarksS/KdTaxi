import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, users as dbUsers, sessions as dbSessions, rides as dbRides, chatMessages as dbChatMessages, pricingRules as dbPricingRules } from "@workspace/db";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";

import { clearTestData } from "../lib/clear-test-data";

import { calculateCommission, getFeeSettings, driverBalance } from "../lib/commission";
import { addHistoryRoutes, recifeTodayStart } from "../lib/admin-history";
import { addFinanceRoutes } from "../lib/finance-routes";

import { getNightFares, isNightFare, saveNightFares, validNightFares } from "../lib/night-fares";

const router = Router();

let socketServer: SocketIOServer | undefined;

export function isDriverOnline(userId: string): boolean {
  const user = users.get(userId);
  return user?.mode === "driver" && user.active &&
    user.approvalStatus === "approved" && user.isOnline === true &&
    Array.from(sessions.values()).some((session) =>
      session.userId === userId && session.expiresAt > Date.now());
}

export async function isUserForeground(userId: string): Promise<boolean> {
  if (!socketServer) return false;
  const sockets = await socketServer.in(`user:${userId}`).fetchSockets();
  return sockets.some((socket) => socket.data.appState === "active");
}

export function setSocketServer(server: SocketIOServer): void {
  socketServer = server;
}

interface User {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  mode: "client" | "driver" | "admin";
  vehicleType?: "car" | "motorcycle";
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
  approvalStatus: "pending" | "approved" | "rejected";
  active: boolean;
  isOnline: boolean;
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
  driverVehicleBrand?: string;
  driverVehicleModel?: string;
  driverVehicleColor?: string;
  driverVehiclePlate?: string;
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
  return user.mode === "driver" && user.active &&
    user.approvalStatus === "approved" &&
    driverVehicleType(user) === ride.vehicleType;
}

function vehicleDetailsFromBody(body: Record<string, unknown>): {
  vehicleType: "car" | "motorcycle";
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
} | undefined {
  const vehicleType = body.vehicleType;
  if (vehicleType !== "car" && vehicleType !== "motorcycle") return undefined;
  const vehicleBrand = typeof body.vehicleBrand === "string" ? body.vehicleBrand.trim() : "";
  const vehicleModel = typeof body.vehicleModel === "string" ? body.vehicleModel.trim() : "";
  const vehicleColor = typeof body.vehicleColor === "string" ? body.vehicleColor.trim() : "";
  const vehiclePlate = typeof body.vehiclePlate === "string"
    ? body.vehiclePlate.toUpperCase().replace(/[\s-]/g, "") : "";
  if (!vehicleBrand || vehicleBrand.length > 80 || !vehicleModel || vehicleModel.length > 80 ||
      !vehicleColor || vehicleColor.length > 50 ||
      !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(vehiclePlate)) return undefined;
  return { vehicleType, vehicleBrand, vehicleModel, vehicleColor, vehiclePlate };
}

function hasVehicleDetails(user: User): boolean {
  return Boolean(user.vehicleBrand && user.vehicleModel && user.vehicleColor && user.vehiclePlate);
}

interface PriceRule {
  id: string;
  destination: string;
  carPrice: number | null;
  motorcyclePrice: number | null;
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

function userFromRecord(record: typeof dbUsers.$inferSelect): User {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    passwordHash: record.passwordHash,
    mode: record.mode as User["mode"],
    vehicleType: record.vehicleType === "motorcycle" ? "motorcycle" :
      record.vehicleType === "car" ? "car" : undefined,
    vehicleBrand: record.vehicleBrand ?? undefined,
    vehicleModel: record.vehicleModel ?? undefined,
    vehicleColor: record.vehicleColor ?? undefined,
    vehiclePlate: record.vehiclePlate ?? undefined,
    approvalStatus: record.approvalStatus as User["approvalStatus"],
    active: record.active,
    isOnline: record.isOnline,
    photo: record.photo ?? undefined,
    pushToken: record.pushToken ?? undefined,
    rating: record.rating,
    rideCount: record.rideCount,
    createdAt: record.createdAt.toISOString(),
  };
}

function rideFromRecord(record: typeof dbRides.$inferSelect): Ride {
  return {
    id: record.id,
    clientId: record.clientId,
    clientName: record.clientName,
    clientPhone: record.clientPhone,
    clientPhoto: record.clientPhoto ?? undefined,
    clientAvgRating: record.clientAvgRating ?? undefined,
    clientRideCount: record.clientRideCount ?? undefined,
    driverId: record.driverId ?? undefined,
    driverName: record.driverName ?? undefined,
    driverPhoto: record.driverPhoto ?? undefined,
    driverAvgRating: record.driverAvgRating ?? undefined,
    driverRideCount: record.driverRideCount ?? undefined,
    driverVehicleBrand: record.driverVehicleBrand ?? undefined,
    driverVehicleModel: record.driverVehicleModel ?? undefined,
    driverVehicleColor: record.driverVehicleColor ?? undefined,
    driverVehiclePlate: record.driverVehiclePlate ?? undefined,
    origin: record.origin,
    destination: record.destination,
    vehicleType: record.vehicleType as Ride["vehicleType"],
    price: record.price ?? undefined,
    payment: (record.payment ?? undefined) as Ride["payment"],
    status: record.status as Ride["status"],
    clientRating: record.clientRating ?? undefined,
    driverRating: record.driverRating ?? undefined,
    createdAt: record.createdAt.toISOString(),
    acceptedAt: record.acceptedAt?.toISOString(),
    finishedAt: record.finishedAt?.toISOString(),
  };
}

// O telefone do passageiro só é devolvido a ele próprio ou ao administrador.
function rideForViewer(ride: Ride, viewer: User) {
  if (viewer.mode === "admin" ||
      (viewer.mode === "client" && viewer.id === ride.clientId)) return ride;
  const { clientPhone: _clientPhone, ...withoutPhone } = ride;
  return withoutPhone;
}

// Carrega usuários e sessões persistidos antes de o servidor receber conexões.
export async function initializeAuthStore(): Promise<void> {
  const [existingAdmin] = await db.select().from(dbUsers)
    .where(eq(dbUsers.mode, "admin")).limit(1);

  if (!existingAdmin) {
    const initialPhone = process.env.ADMIN_INITIAL_PHONE?.trim();
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const initialName = process.env.ADMIN_INITIAL_NAME?.trim() || "Administrador";

    if (!initialPhone || !initialPassword) {
      throw new Error(
        "Nenhum administrador foi encontrado. Configure ADMIN_INITIAL_PHONE e ADMIN_INITIAL_PASSWORD (mínimo de 12 caracteres) para criar o primeiro administrador."
      );
    }

    if (initialPassword.length < 12 || Buffer.byteLength(initialPassword, "utf8") > 72) {
      throw new Error("ADMIN_INITIAL_PASSWORD deve ter no mínimo 12 caracteres e no máximo 72 bytes.");
    }

    const now = new Date();
    await db.insert(dbUsers).values({
      id: crypto.randomUUID(),
      name: initialName,
      phone: initialPhone,
      passwordHash: await bcrypt.hash(initialPassword, 10),
      mode: "admin",
      active: true,
      rating: 0,
      rideCount: 0,
      createdAt: now,
    });
  }

  const userRecords = await db.select().from(dbUsers);
  users.clear();
  for (const record of userRecords.filter((r) => !r.deletedAt)) {
    users.set(record.id, userFromRecord(record));
  }

  await db.delete(dbSessions).where(lt(dbSessions.expiresAt, Date.now()));
  const sessionRecords = await db.select().from(dbSessions);
  sessions.clear();
  for (const record of sessionRecords) {
    sessions.set(record.token, {
      userId: record.userId,
      expiresAt: record.expiresAt,
    });
  }

  const rideRecords = await db.select().from(dbRides);
  rides.clear();
  for (const record of rideRecords) {
    rides.set(record.id, rideFromRecord(record));
  }

  const pricingRecords = await db.select().from(dbPricingRules);
  pricing.clear();
  for (const record of pricingRecords) {
    pricing.set(record.id, {
      id: record.id,
      destination: record.destination,
      carPrice: record.carPrice,
      motorcyclePrice: record.motorcyclePrice,
      isLocal: record.isLocal,
      createdAt: record.createdAt.toISOString(),
    });
  }

  console.info(
    `[auth] ${users.size} usuários, ${sessions.size} sessões, ` +
    `${rides.size} corridas e ${pricing.size} tarifas carregados do Neon.`
  );
}

async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await db.insert(dbSessions).values({ token, userId, expiresAt });
  sessions.set(token, { userId, expiresAt });
  return token;
}

async function revokeOtherUserSessions(userId: string, keepToken?: string): Promise<void> {
  const records = await db.select({ token: dbSessions.token })
    .from(dbSessions)
    .where(eq(dbSessions.userId, userId));

  const tokens = records.map((record) => record.token)
    .filter((token) => token !== keepToken);

  if (tokens.length > 0) {
    await db.delete(dbSessions).where(inArray(dbSessions.token, tokens));
    for (const token of tokens) sessions.delete(token);
  }

  if (socketServer) {
    const connectedSockets = await socketServer.in(`user:${userId}`).fetchSockets();
    for (const socket of connectedSockets) {
      const socketToken = (socket.data as { sessionToken?: string }).sessionToken;
      if (socketToken !== keepToken) socket.disconnect(true);
    }
  }
}

async function getUserByToken(token: string | undefined, includePhoto = true): Promise<User | undefined> {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return undefined;

  const [session] = await db.select().from(dbSessions)
    .where(eq(dbSessions.token, token)).limit(1);

  if (!session) {
    sessions.delete(token);
    return undefined;
  }

  if (session.expiresAt < Date.now()) {
    await db.delete(dbSessions).where(eq(dbSessions.token, token));
    sessions.delete(token);
    return undefined;
  }

  // Re-read account permissions so revocation is effective across sessions and restarts.
  const columns = getTableColumns(dbUsers);
  const [record] = await db.select({ ...columns,
    photo: includePhoto ? columns.photo : sql<string | null>`null`,
  }).from(dbUsers).where(eq(dbUsers.id, session.userId)).limit(1);
  if (!record || record.deletedAt) { users.delete(session.userId); return undefined; }
  const user = userFromRecord(record);
  // Lightweight socket checks refresh permissions without erasing the cached photo.
  if (!includePhoto) user.photo = users.get(user.id)?.photo;
  users.set(user.id, user);

  if (!user.active) {
    await revokeOtherUserSessions(user.id);
    return undefined;
  }

  sessions.set(token, { userId: session.userId, expiresAt: session.expiresAt });
  return user;
}

async function getSessionUser(req: Request): Promise<User | undefined> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  return getUserByToken(auth.slice(7), req.method !== "GET");
}

export async function authenticateSocketToken(token: string | undefined, includePhoto = true) {
  const user = await getUserByToken(token, includePhoto);
  if (!user) return undefined;
  return safeUser(user);
}

export function isRideParticipant(rideId: string, userId: string): boolean {
  const ride = rides.get(rideId);
  if (!ride) return false;
  return ride.clientId === userId || ride.driverId === userId;
}

export async function recordChatMessage(msg: ChatMessage): Promise<void> {
  await db.insert(dbChatMessages).values({
    id: msg.id,
    rideId: msg.rideId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderPhoto: msg.senderPhoto ?? null,
    text: msg.text,
    timestamp: new Date(msg.timestamp),
  });

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

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  req.authUser = user;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user || user.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  req.authUser = user;
  next();
}

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

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." },
});

async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: object,
  options?: { channelId?: string; sound?: string },
) {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: options?.sound ?? "default",
        channelId: options?.channelId ?? "ride_alerts_v1",
        priority: "high",
        data: data ?? {},
      }),
    });

    if (!response.ok) {
      console.warn("[push] Serviço recusou o envio.", {
        httpStatus: response.status,
      });
      return;
    }

    const payload = await response.json() as {
      data?: {
        status?: string;
        details?: { error?: string };
      } | Array<{
        status?: string;
        details?: { error?: string };
      }>;
    };

    const ticket = Array.isArray(payload.data)
      ? payload.data[0]
      : payload.data;

    if (ticket?.status !== "ok") {
      const rawCode = ticket?.details?.error;
      const code = typeof rawCode === "string" &&
        /^[A-Za-z0-9_]{1,80}$/.test(rawCode)
          ? rawCode
          : "UNKNOWN_PUSH_ERROR";

      console.warn("[push] Expo não aceitou a notificação.", { code });
      return;
    }

    console.info("[push] Expo aceitou o envio; entrega ainda não confirmada.");
  } catch {
    console.warn("[push] Falha de conexão ou tempo limite ao enviar.");
  }
}

export function sendChatPushNotification(userId: string, senderName: string, rideId: string): void {
  const recipient = users.get(userId);
  if (!recipient?.active || !recipient.pushToken) return;
  void sendPushNotification(
    recipient.pushToken,
    "Nova mensagem no KD TAXI",
    `Mensagem de ${senderName} no chat da sua corrida.`,
    { type: "chat_message", rideId },
    { channelId: "chat_messages_v2", sound: "chat_message.wav" },
  );
}

async function lookupPrice(
  destination: string,
  vehicleType: "car" | "motorcycle",
  at = new Date(),
): Promise<{ price: number; isLocal: boolean; farePeriod?: "day" | "night" } | undefined> {
  const dest = destination.toLowerCase().trim();
  if (!dest) return undefined;

  const currentRules = await db.select().from(dbPricingRules).orderBy(asc(dbPricingRules.destination));
  const vehiclePrice = (rule: typeof dbPricingRules.$inferSelect) =>
    vehicleType === "motorcycle" ? rule.motorcyclePrice : rule.carPrice;

  for (const rule of currentRules) {
    if (rule.isLocal) continue;

    const ruleDestination = rule.destination.toLowerCase().trim();

    if (dest.includes(ruleDestination) || ruleDestination.includes(dest)) {
      const price = vehiclePrice(rule);
      return typeof price === "number" && Number.isFinite(price)
        ? { price, isLocal: false }
        : undefined;
    }
  }

  const localRule = currentRules.find((rule) => rule.isLocal);
  if (!localRule) return undefined;

  const night = await getNightFares();
  const nighttime = isNightFare(night, at);
  // An unset daytime vehicle fare remains unavailable at night too.
  if (vehiclePrice(localRule) === null) return undefined;
  const price = nighttime ? (vehicleType === 'motorcycle' ? night.motorcyclePrice : night.carPrice) : vehiclePrice(localRule);
  return typeof price === "number" && Number.isFinite(price)
    ? { price, isLocal: true, farePeriod: nighttime ? "night" : "day" }
    : undefined;
}

function safeUser(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, isOnline: u.mode === "driver" && isDriverOnline(u.id) };
}

function safeUserList(u: User) {
  const { passwordHash: _ph, pushToken: _pushToken, ...rest } = u;
  return { ...rest, isOnline: u.mode === "driver" && isDriverOnline(u.id) };
}

// POST /register – create a new client or driver account
router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const { name, phone, password, mode, photo, vehicleType } = req.body as {
    name?: string; phone?: string; password?: string; mode?: string; photo?: string;
    vehicleType?: string;
  };

  if (!name?.trim() || !phone?.trim() || !password) {
    res.status(400).json({ error: "Nome, telefone e senha são obrigatórios" });
    return;
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "A senha deve ter entre 8 e 128 caracteres." });
    return;
  }
  if (mode !== "client" && mode !== "driver") {
    res.status(400).json({ error: "Tipo de conta inválido" });
    return;
  }
  if (mode === "driver" && vehicleType !== undefined && vehicleType !== "car" && vehicleType !== "motorcycle") {
    res.status(400).json({ error: "Tipo de veículo inválido" });
    return;
  }
  const hasSubmittedVehicleDetails = ["vehicleBrand", "vehicleModel", "vehicleColor", "vehiclePlate"]
    .some((field) => req.body[field] !== undefined);
  const vehicleDetails = mode === "driver" ? vehicleDetailsFromBody(req.body) : undefined;
  if (hasSubmittedVehicleDetails && !vehicleDetails) {
    res.status(400).json({ error: "Informe marca, modelo, cor e placa válidos" });
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
    passwordHash: await bcrypt.hash(password, 10),
    mode,
    vehicleType: mode === "driver" && vehicleType === "motorcycle" ? "motorcycle" : mode === "driver" ? "car" : undefined,
    ...(vehicleDetails ?? {}),
    approvalStatus: mode === "driver" ? "pending" : "approved",
    active: true, isOnline: false, rating: 0, rideCount: 0,
    photo, createdAt: new Date().toISOString(),
  };
  try {
    await db.insert(dbUsers).values({
      id: user.id,
      name: user.name,
      phone: user.phone,
      passwordHash: user.passwordHash,
      mode: user.mode,
      vehicleType: user.vehicleType ?? null,
      vehicleBrand: user.vehicleBrand ?? null,
      vehicleModel: user.vehicleModel ?? null,
      vehicleColor: user.vehicleColor ?? null,
      vehiclePlate: user.vehiclePlate ?? null,
      approvalStatus: user.approvalStatus,
      active: user.active,
      photo: user.photo ?? null,
      pushToken: user.pushToken ?? null,
      rating: user.rating,
      rideCount: user.rideCount,
      createdAt: new Date(user.createdAt),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Este telefone já está cadastrado" });
      return;
    }
    throw error;
  }
  users.set(user.id, user);
  const token = await createSession(user.id);
  res.json({ user: safeUser(user), token });
});

// POST /login – identifies the account (and its role) purely from phone + password
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitas tentativas de acesso. Aguarde alguns minutos." },
});
router.post("/login", loginIpLimiter, loginLimiter, async (req: Request, res: Response) => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone?.trim() || !password) {
    res.status(400).json({ error: "Telefone e senha são obrigatórios" });
    return;
  }

  try {
    const [record] = await db.select()
      .from(dbUsers)
      .where(eq(dbUsers.phone, phone.trim()))
      .limit(1);

    if (!record || !(await bcrypt.compare(password, record.passwordHash))) {
      res.status(401).json({ error: "Telefone ou senha inválidos" });
      return;
    }

    if (!record.active || record.deletedAt) {
      res.status(403).json({ error: "Esta conta está desativada" });
      return;
    }

    const user = userFromRecord(record);
    users.set(user.id, user);

    const token = await createSession(user.id);
    res.json({ user: safeUser(user), token });
  } catch (error) {
    console.error("[auth] Erro ao realizar login:");
    res.status(500).json({ error: "Não foi possível realizar o login" });
  }
});

// POST /logout – invalidate the current session token
router.post("/change-password", requireAuth, changePasswordLimiter, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof currentPassword !== "string" || !currentPassword) {
      res.status(400).json({ error: "Informe sua senha atual." });
      return;
    }

    if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) {
      res.status(400).json({ error: "A nova senha deve ter entre 12 e 128 caracteres." });
      return;
    }

    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }

    const currentIsValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentIsValid) {
      res.status(400).json({ error: "A senha atual está incorreta." });
      return;
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      res.status(400).json({ error: "A nova senha deve ser diferente da senha atual." });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.update(dbUsers)
      .set({ passwordHash: newPasswordHash })
      .where(eq(dbUsers.id, user.id));

    user.passwordHash = newPasswordHash;

    const authorization = req.headers.authorization;
    const currentToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    await revokeOtherUserSessions(user.id, currentToken);

    res.json({ ok: true });
  } catch (error) {
    console.error("[auth] Erro ao alterar senha:");
    res.status(500).json({ error: "Não foi possível alterar a senha." });
  }
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const auth = req.headers.authorization;
    const token = auth?.slice(7);
    await db.transaction(async (tx) => {
      if (user.mode === "driver") {
        await tx.update(dbUsers).set({ isOnline: false }).where(eq(dbUsers.id, user.id));
      }
      if (token) await tx.delete(dbSessions).where(eq(dbSessions.token, token));
    });
    if (user.mode === "driver") user.isOnline = false;
    if (token) {
      sessions.delete(token);
      const sockets = await socketServer?.in(`user:${user.id}`).fetchSockets();
      for (const socket of sockets ?? []) if (socket.data.sessionToken === token) socket.disconnect(true);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[auth] Erro ao encerrar sessão:");
    res.status(500).json({ error: "Não foi possível encerrar a sessão" });
  }
});

// PUT /users/:id – a user may only edit their own profile
router.put("/users/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (req.authUser!.id !== id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const user = users.get(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { name, photo, pushToken } = req.body as {
    name?: string;
    photo?: string;
    pushToken?: string;
  };

  const updatedName = name !== undefined ? name.trim() : user.name;
  const identityChanged = user.mode === "driver" &&
    (updatedName !== user.name || (photo !== undefined && photo !== user.photo));

  try {
    const saved = await db.transaction(async tx => {
      const [account] = await tx.select({ id: dbUsers.id }).from(dbUsers)
        .where(eq(dbUsers.id, id)).for("update");
      if (!account) return false;
      if (identityChanged) {
        const active = await tx.select({ id: dbRides.id }).from(dbRides)
          .where(and(eq(dbRides.driverId, id), inArray(dbRides.status, ["accepted", "in_progress"]))).limit(1);
        if (active.length) return false;
      }
      await tx.update(dbUsers).set({
        name: updatedName,
        ...(photo !== undefined ? { photo } : {}),
        ...(pushToken !== undefined ? { pushToken } : {}),
        ...(identityChanged ? { approvalStatus: "pending", isOnline: false } : {}),
      }).where(eq(dbUsers.id, id));
      return true;
    });
    if (!saved) { res.status(409).json({ error: "Finalize a corrida antes de alterar a identificação do motorista." }); return; }
    user.name = updatedName;
    if (photo !== undefined) user.photo = photo;
    if (pushToken !== undefined) user.pushToken = pushToken;
    if (identityChanged) { user.approvalStatus = "pending"; user.isOnline = false; }

    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao atualizar perfil:");
    res.status(500).json({ error: "Não foi possível atualizar o perfil" });
  }
});

// GET /users – admin only, list of clients/drivers without passwords or push tokens
router.get("/users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const records = await db.select().from(dbUsers).where(isNull(dbUsers.deletedAt));

    for (const record of records) {
      const user = userFromRecord(record);
      users.set(user.id, user);
    }

    res.json(records
      .map(userFromRecord)
      .filter((u) => u.mode !== "admin")
      .map(safeUserList));
  } catch (error) {
    console.error("[admin] Erro ao listar usuários:");
    res.status(500).json({ error: "Não foi possível listar os usuários" });
  }
});

// Lightweight approval notification; photos are loaded only on the review page.
router.get('/admin/pending-drivers', requireAdmin, async (_req: Request, res: Response) => {
  const records = await db.select({ id: dbUsers.id }).from(dbUsers)
    .where(and(isNull(dbUsers.deletedAt), eq(dbUsers.mode, 'driver'), eq(dbUsers.approvalStatus, 'pending')));
  res.json(records);
});

// GET /users/:id – self or admin only
router.get("/users/:id", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (req.authUser!.id !== id && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    const [record] = await db.select()
      .from(dbUsers)
      .where(eq(dbUsers.id, id))
      .limit(1);

    if (!record || record.deletedAt) {
      users.delete(id);
      res.status(404).json({ error: "Not found" });
      return;
    }

    const user = userFromRecord(record);
    users.set(user.id, user);
    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao consultar usuário:");
    res.status(500).json({ error: "Não foi possível consultar o usuário" });
  }
});

// POST /users/:id/availability – disponibilidade do motorista, separada da conta ativa.
router.post("/users/:id/availability", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (req.authUser!.id !== id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const user = users.get(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.mode !== "driver") {
    res.status(400).json({ error: "Somente motoristas podem alterar a disponibilidade" });
    return;
  }
  if (!user.active) {
    res.status(403).json({ error: "Esta conta está desativada" });
    return;
  }
  if (req.body.online === true && user.approvalStatus !== "approved") {
    res.status(403).json({ error: "Aguarde a aprovação do motorista" });
    return;
  }

  try {
    const online = req.body.online === true;
    await db.update(dbUsers).set({ isOnline: online }).where(eq(dbUsers.id, id));
    user.isOnline = online;
    res.json({ isOnline: isDriverOnline(id) });
  } catch (error) {
    console.error("[availability] Erro ao salvar disponibilidade:");
    res.status(500).json({ error: "Não foi possível salvar a disponibilidade" });
  }
});

// PUT /users/:id/vehicle – alterações aguardam nova aprovação.
router.put("/users/:id/vehicle", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = users.get(id);
  if (!user || user.mode !== "driver") {
    res.status(404).json({ error: "Motorista não encontrado" });
    return;
  }
  if (req.authUser!.id !== id && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  const details = vehicleDetailsFromBody(req.body);
  if (!details) {
    res.status(400).json({ error: "Informe categoria, marca, modelo, cor e placa válidos" });
    return;
  }
  try {
    const activeRide = await db.select({ id: dbRides.id }).from(dbRides)
      .where(and(eq(dbRides.driverId, id),
        inArray(dbRides.status, ["accepted", "in_progress"]))).limit(1);
    if (activeRide.length) {
      res.status(409).json({ error: "Finalize a corrida antes de alterar o veículo" });
      return;
    }
    const changed = Object.entries(details).some(([key, value]) =>
      user[key as keyof User] !== value);
    if (changed) {
      await db.update(dbUsers).set({
        ...details, approvalStatus: "pending", isOnline: false,
      }).where(eq(dbUsers.id, id));
      Object.assign(user, details, { approvalStatus: "pending", isOnline: false });
    }
    res.json(safeUser(user));
  } catch (error) {
    console.error("[vehicle] Erro ao atualizar veículo:");
    res.status(500).json({ error: "Não foi possível atualizar o veículo" });
  }
});

// POST /users/:id/active – self only
router.post("/users/:id/active", requireAuth, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (req.authUser!.id !== id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const user = users.get(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const active = req.body.active === true;

  try {
    // APKs anteriores usam /active para o botão Online/Offline do motorista.
    // Mantenha a conta ativa e grave somente a disponibilidade.
    if (user.mode === "driver") {
      if (active && user.approvalStatus !== "approved") {
        res.status(403).json({ error: "Aguarde a aprovação do motorista" });
        return;
      }
      await db.update(dbUsers).set({ isOnline: active }).where(eq(dbUsers.id, id));
      user.isOnline = active;
      res.json(safeUser(user));
      return;
    }

    // Impede que o único administrador ativo desative a própria conta.
    if (!active && user.mode === "admin" && user.active) {
      const activeAdmins = await db.select({ id: dbUsers.id })
        .from(dbUsers)
        .where(and(eq(dbUsers.mode, "admin"), eq(dbUsers.active, true)));

      if (activeAdmins.length <= 1) {
        res.status(409).json({
          error: "Não é possível desativar a conta do último administrador ativo."
        });
        return;
      }
    }

    await db.update(dbUsers)
      .set({ active, ...(!active ? { isOnline: false } : {}) })
      .where(eq(dbUsers.id, id));

    user.active = active;
    if (!active) user.isOnline = false;
    if (!active) await revokeOtherUserSessions(id);
    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao alterar status da conta:");
    res.status(500).json({ error: "Não foi possível alterar o status da conta" });
  }
});

// ─── ADMIN ENDPOINTS ───────────────────────────────────────────────────────

router.post("/admin/drivers/:id/approval", requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = users.get(id);
  if (!user || user.mode !== "driver") {
    res.status(404).json({ error: "Motorista não encontrado" });
    return;
  }
  const status = req.body.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    res.status(400).json({ error: "Decisão inválida" });
    return;
  }
  if (status === "approved" && (!hasVehicleDetails(user) || !user.photo)) {
    res.status(409).json({ error: "Antes de aprovar, confira foto, marca, modelo, cor e placa" });
    return;
  }
  try {
    await db.update(dbUsers).set({ approvalStatus: status, isOnline: false })
      .where(eq(dbUsers.id, id));
    user.approvalStatus = status;
    user.isOnline = false;
    res.json(safeUser(user));
  } catch (error) {
    console.error("[approval] Erro ao decidir aprovação:");
    res.status(500).json({ error: "Não foi possível salvar a decisão" });
  }
});

// PUT /admin/users/:id – admin can edit any user fully
router.put("/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = users.get(id);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { name, phone, mode, vehicleType, active, password } = req.body as {
    name?: string;
    phone?: string;
    mode?: string;
    vehicleType?: string;
    active?: boolean;
    password?: string;
  };

  if (mode !== undefined && mode !== "client" && mode !== "driver" && mode !== "admin") {
    res.status(400).json({ error: "Tipo de conta inválido" });
    return;
  }

  if (vehicleType !== undefined && vehicleType !== "car" && vehicleType !== "motorcycle") {
    res.status(400).json({ error: "Tipo de veículo inválido" });
    return;
  }

  if (vehicleType !== undefined && (mode ?? user.mode) !== "driver") {
    res.status(400).json({ error: "O tipo de veículo só pode ser definido para motoristas" });
    return;
  }

  const updatedName = name !== undefined ? name.trim() : user.name;
  const updatedPhone = phone !== undefined ? phone.trim() : user.phone;
  const updatedMode = (mode ?? user.mode) as User["mode"];
  const updatedVehicleType = (vehicleType ?? user.vehicleType) as User["vehicleType"];
  const updatedActive = active !== undefined ? active : user.active;
  const vehicleChanged = updatedMode === "driver" &&
    (user.mode !== "driver" || updatedVehicleType !== user.vehicleType);
  const updatedApprovalStatus: User["approvalStatus"] = updatedMode !== "driver"
    ? "approved" : vehicleChanged ? "pending" : user.approvalStatus;
  if (password !== undefined &&
      (typeof password !== "string" || password.length < 8 || password.length > 128)) {
    res.status(400).json({ error: "A nova senha deve ter entre 8 e 128 caracteres." });
    return;
  }

  try {
    // Impede que o sistema fique sem nenhum administrador ativo.
    const activeAdmins = await db.select({ id: dbUsers.id })
      .from(dbUsers)
      .where(and(eq(dbUsers.mode, "admin"), eq(dbUsers.active, true)));

    const isCurrentActiveAdmin = activeAdmins.some((admin) => admin.id === id);
    const isRemovingAdminAccess = updatedMode !== "admin" || !updatedActive;

    if (isCurrentActiveAdmin && isRemovingAdminAccess && activeAdmins.length <= 1) {
      res.status(409).json({
        error: "Não é possível desativar ou rebaixar o último administrador ativo."
      });
      return;
    }

    const updatedPasswordHash = password !== undefined
      ? await bcrypt.hash(password, 10)
      : user.passwordHash;

    await db.update(dbUsers)
      .set({
        name: updatedName,
        phone: updatedPhone,
        mode: updatedMode,
        vehicleType: updatedVehicleType ?? null,
        active: updatedActive,
        isOnline: updatedMode === "driver" && updatedActive && !vehicleChanged ? user.isOnline : false,
        approvalStatus: updatedApprovalStatus,
        passwordHash: updatedPasswordHash,
      })
      .where(eq(dbUsers.id, id));

    user.name = updatedName;
    user.phone = updatedPhone;
    user.mode = updatedMode;
    if (vehicleType !== undefined) user.vehicleType = updatedVehicleType;
    user.active = updatedActive;
    user.approvalStatus = updatedApprovalStatus;
    if (updatedMode !== "driver" || !updatedActive || vehicleChanged) user.isOnline = false;
    user.passwordHash = updatedPasswordHash;

    if (!updatedActive) {
      await revokeOtherUserSessions(id);
    } else if (password !== undefined) {
      const authorization = req.headers.authorization;
      const currentToken = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : undefined;
      const keepToken = req.authUser?.id === id ? currentToken : undefined;
      await revokeOtherUserSessions(id, keepToken);
    }

    res.json(safeUser(user));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Telefone já cadastrado" });
      return;
    }
    console.error("[admin] Erro ao atualizar usuário:");
    res.status(500).json({ error: "Não foi possível atualizar o usuário" });
  }
});

// DELETE /admin/users/:id – admin deletes a user
router.delete("/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = users.get(id);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (user.mode === "admin") {
    res.status(403).json({ error: "Cannot delete admin account" });
    return;
  }

  try {
    const removed = await db.transaction(async (tx) => {
      // Serializa exclusões concorrentes da mesma conta.
      await tx.select({ id: dbUsers.id }).from(dbUsers).where(eq(dbUsers.id, id)).for("update");
      const [activeRide] = await tx.select({ id: dbRides.id }).from(dbRides).where(and(
        or(eq(dbRides.clientId, id), eq(dbRides.driverId, id)),
        inArray(dbRides.status, ["waiting", "accepted", "in_progress"]),
      )).limit(1);
      if (activeRide) return "active";
      if (await driverBalance(tx, id) > 0) return "balance";
      await tx.delete(dbSessions).where(eq(dbSessions.userId, id));
      await tx.update(dbUsers).set({
        deletedAt: new Date(), active: false, isOnline: false,
        name: "Conta excluída", phone: `deleted:${crypto.randomBytes(10).toString("hex")}`,
        passwordHash: bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10),
        photo: null, pushToken: null,
        vehicleBrand: null, vehicleModel: null, vehicleColor: null, vehiclePlate: null,
      }).where(eq(dbUsers.id, id));
      return "ok";
    });
    if (removed !== "ok") {
      res.status(409).json({ error: removed === "balance" ? "Registre o acerto do saldo devido ao KD TAXI antes de excluir esta conta." : "Finalize ou cancele as corridas ativas desta conta antes de excluí-la." });
      return;
    }
    for (const [token, session] of sessions.entries()) {
      if (session.userId === id) {
        sessions.delete(token);
      }
    }

    users.delete(id);
    try {
      const sockets = await socketServer?.in(`user:${id}`).fetchSockets();
      sockets?.forEach((socket) => socket.disconnect(true));
    } catch { console.warn("[admin] Conta excluída; conexão antiga será recusada na próxima autenticação."); }
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin] Erro ao excluir usuário:");
    res.status(500).json({ error: "Não foi possível excluir o usuário" });
  }
});

// The legacy deletion endpoint cannot bypass password and confirmation safeguards.
router.delete("/admin/rides", requireAdmin, (_req: Request, res: Response) => {
  res.status(409).json({ error: "Use Configurações > Limpar dados de teste, com senha e confirmação." });
});

const resetDataLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 });
router.post("/admin/reset-test-data", requireAdmin, resetDataLimiter, async (req: Request, res: Response) => {
  const { scope, clearPricing, confirmation, currentPassword } = req.body ?? {};
  if (!['rides', 'all'].includes(scope) || typeof clearPricing !== 'boolean' || confirmation !== 'LIMPAR DADOS' || typeof currentPassword !== 'string' || currentPassword.length > 128) {
    res.status(400).json({ error: "Confira a seleção e digite LIMPAR DADOS para confirmar." }); return;
  }
  try {
    const adminId = req.authUser!.id;
    const [admin] = await db.select().from(dbUsers).where(eq(dbUsers.id, adminId)).limit(1);
    if (!admin?.active || admin.deletedAt || admin.mode !== 'admin' || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      res.status(403).json({ error: "A senha atual está incorreta." }); return;
    }
    const removedIds = await clearTestData(scope, clearPricing);
    rides.clear(); chatByRide.clear();
    for (const user of users.values()) { user.rating = 0; user.rideCount = 0; }
    for (const id of removedIds) users.delete(id);
    const removed = new Set(removedIds);
    for (const [token, session] of sessions) if (removed.has(session.userId)) sessions.delete(token);
    if (clearPricing) pricing.clear();
    // Revoked sessions also block reconnection, even if an individual disconnect fails.
    for (const id of removedIds) {
      try { socketServer?.in(`user:${id}`).disconnectSockets(true); } catch { /* Session already revoked. */ }
    }
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACTIVE_RIDES') {
      res.status(409).json({ error: "Finalize ou cancele as corridas aceitas ou em andamento antes da limpeza." }); return;
    }
    console.error('[admin] Falha na limpeza de dados de teste.');
    res.status(500).json({ error: "A limpeza não foi concluída. Tente novamente." });
  }
});

// GET /admin/stats – estatísticas calculadas diretamente do Neon.
router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const todayStart = recifeTodayStart();
    const [rideTotals, userTotals, onlineCandidates] = await Promise.all([
      db.select({
        totalRides: sql<number>`count(*)::int`,
        finishedRides: sql<number>`count(*) filter (where ${dbRides.status} = 'finished')::int`,
        cancelledRides: sql<number>`count(*) filter (where ${dbRides.status} = 'cancelled')::int`,
        activeRides: sql<number>`count(*) filter (where ${dbRides.status} in ('waiting','accepted','in_progress'))::int`,
        totalRevenue: sql<number>`coalesce(sum(${dbRides.price}) filter (where ${dbRides.status} = 'finished'),0)::float8`,
        todayRides: sql<number>`count(*) filter (where ${dbRides.createdAt} >= ${todayStart.toISOString()})::int`,
        todayRevenue: sql<number>`coalesce(sum(${dbRides.price}) filter (where ${dbRides.status} = 'finished' and ${dbRides.createdAt} >= ${todayStart.toISOString()}),0)::float8`,
      }).from(dbRides),
      db.select({
        totalUsers: sql<number>`count(*) filter (where ${dbUsers.mode} <> 'admin')::int`,
        totalClients: sql<number>`count(*) filter (where ${dbUsers.mode} = 'client')::int`,
        totalDrivers: sql<number>`count(*) filter (where ${dbUsers.mode} = 'driver')::int`,
        avgRating: sql<number>`coalesce(avg(${dbUsers.rating}) filter (where ${dbUsers.rideCount} > 0),0)::float8`,
      }).from(dbUsers).where(isNull(dbUsers.deletedAt)),
      db.select({ id: dbUsers.id, vehicleType: dbUsers.vehicleType }).from(dbUsers)
        .where(and(isNull(dbUsers.deletedAt), eq(dbUsers.mode, 'driver'), eq(dbUsers.active, true), eq(dbUsers.approvalStatus, 'approved'), eq(dbUsers.isOnline, true))),
    ]);
    const online = onlineCandidates.filter(u => isDriverOnline(u.id));

    res.json({
      ...rideTotals[0], ...userTotals[0],
      onlineDrivers: online.length,
      onlineCarDrivers: online.filter(u => u.vehicleType !== 'motorcycle').length,
      onlineMotorcycleDrivers: online.filter(u => u.vehicleType === 'motorcycle').length,
    });
  } catch (error) {
    console.error("[admin] Erro ao consultar estatísticas:");
    res.status(500).json({ error: "Não foi possível consultar as estatísticas" });
  }
});

// POST /admin/users – create a client, driver, or admin account
router.post("/admin/users", requireAdmin, async (req: Request, res: Response) => {
  const { name, phone, password, mode, vehicleType } = req.body as {
    name: string;
    phone: string;
    password: string;
    mode?: string;
    vehicleType?: string;
  };

  if (!name?.trim() || !phone?.trim() || !password) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }

  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "A senha deve ter entre 8 e 128 caracteres." });
    return;
  }

  if (mode !== undefined && mode !== "client" && mode !== "driver" && mode !== "admin") {
    res.status(400).json({ error: "Tipo de conta inválido" });
    return;
  }

  if (vehicleType !== undefined && vehicleType !== "car" && vehicleType !== "motorcycle") {
    res.status(400).json({ error: "Tipo de veículo inválido" });
    return;
  }

  if (vehicleType !== undefined && mode !== "driver") {
    res.status(400).json({ error: "O tipo de veículo só pode ser definido para motoristas" });
    return;
  }

  const normalizedPhone = phone.trim();
  const existing = Array.from(users.values()).find((u) => u.phone === normalizedPhone);

  if (existing) {
    res.status(409).json({ error: "Telefone já cadastrado" });
    return;
  }

  const resolvedMode = (mode as User["mode"]) ?? "admin";
  const user: User = {
    id: getId(),
    name: name.trim(),
    phone: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 10),
    mode: resolvedMode,
    ...(resolvedMode === "driver"
      ? { vehicleType: (vehicleType as User["vehicleType"]) ?? "car" }
      : {}),
    active: true,
    isOnline: false,
    approvalStatus: resolvedMode === "driver" ? "pending" : "approved",
    rating: 0,
    rideCount: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.insert(dbUsers).values({
      id: user.id,
      name: user.name,
      phone: user.phone,
      passwordHash: user.passwordHash,
      mode: user.mode,
      vehicleType: user.vehicleType ?? null,
      approvalStatus: user.approvalStatus,
      active: user.active,
      photo: null,
      pushToken: null,
      rating: user.rating,
      rideCount: user.rideCount,
      createdAt: new Date(user.createdAt),
    });

    users.set(user.id, user);
    res.json(safeUser(user));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Telefone já cadastrado" });
      return;
    }

    console.error("[admin] Erro ao criar usuário:");
    res.status(500).json({ error: "Não foi possível criar o usuário" });
  }
});

// ─── RIDE ENDPOINTS ────────────────────────────────────────────────────────

// POST /request-ride
router.post("/request-ride", requireAuth, async (req: Request, res: Response) => {
  const { clientId, origin, destination, payment, vehicleType } = req.body as {
    clientId: string; origin: string; destination: string; payment?: string; vehicleType?: string;
  };
  if (!clientId || !origin || !destination) { res.status(400).json({ error: "Missing required fields" }); return; }

  if (req.authUser!.mode !== "client" || req.authUser!.id !== clientId) {
    res.status(403).json({ error: "Apenas o passageiro autenticado pode solicitar sua própria corrida" });
    return;
  }

  if (payment !== undefined && payment !== "pix" && payment !== "dinheiro") {
    res.status(400).json({ error: "Forma de pagamento inválida" });
    return;
  }
  if (vehicleType !== undefined && vehicleType !== "car" && vehicleType !== "motorcycle") {
    res.status(400).json({ error: "Tipo de veículo inválido" });
    return;
  }
  if (req.authUser!.id !== clientId || req.authUser!.mode !== "client") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const selectedVehicle: "car" | "motorcycle" =
    vehicleType === "motorcycle" ? "motorcycle" : "car";

  const requestedAt = new Date();
  const priceResult = await lookupPrice(destination, selectedVehicle, requestedAt);

  if (!priceResult) {
    const vehicleName = selectedVehicle === "motorcycle" ? "moto" : "carro";
    res.status(409).json({
      error: `Não há tarifa cadastrada para ${vehicleName} neste destino.`,
      code: "FARE_NOT_CONFIGURED",
    });
    return;
  }

  const price = priceResult.price;
  const client = req.authUser!;
  const ride: Ride = {
    id: getId(),
    clientId,
    clientName: client.name,
    clientPhone: client.phone,
    clientPhoto: client.photo,
    clientAvgRating: client.rating,
    clientRideCount: client.rideCount,
    origin,
    destination,
    vehicleType: selectedVehicle,
    price,
    payment: (payment as Ride["payment"]) ?? "dinheiro",
    status: "waiting",
    createdAt: requestedAt.toISOString(),
  };

  try {
    const created = await db.transaction(async (tx) => {
      const [account] = await tx.select().from(dbUsers).where(eq(dbUsers.id, clientId)).for("update");
      if (!account?.active || account.deletedAt) return false;
      const settings = await getFeeSettings(tx, true);
      const financial = calculateCommission(price, settings.rateBps, settings.enabled);
      if (req.body.expectedPrice !== undefined &&
          (typeof req.body.expectedPrice !== 'number' || !Number.isFinite(req.body.expectedPrice) ||
           Math.round(req.body.expectedPrice * 100) !== Math.round(financial.total * 100))) return 'FARE_CHANGED';
      ride.price = financial.total;
      await tx.insert(dbRides).values({
      id: ride.id,
      clientId: ride.clientId,
      clientName: ride.clientName,
      clientPhone: ride.clientPhone,
      clientPhoto: ride.clientPhoto ?? null,
      clientAvgRating: ride.clientAvgRating ?? null,
      clientRideCount: ride.clientRideCount ?? null,
      driverId: null,
      driverName: null,
      driverPhoto: null,
      driverAvgRating: null,
      driverRideCount: null,
      origin: ride.origin,
      destination: ride.destination,
      vehicleType: ride.vehicleType,
      price: ride.price ?? null,
      payment: ride.payment ?? "dinheiro",
      status: ride.status,
      createdAt: new Date(ride.createdAt),
      acceptedAt: null,
      finishedAt: null,
    });
      await tx.execute(sql`INSERT INTO ride_financials(ride_id,base_cents,fee_cents,rate_bps) VALUES(${ride.id},${financial.baseCents},${financial.feeCents},${financial.rateBps})`);
      return true;
    });
    if (created === 'FARE_CHANGED') {
      res.status(409).json({ error: 'A tarifa mudou. Confira o novo valor antes de confirmar.', code: 'FARE_CHANGED' });
      return;
    }
    if (!created) { res.status(403).json({ error: "Conta indisponível" }); return; }
  } catch (error) {
    console.error("[rides] Erro ao salvar nova corrida:");
    res.status(500).json({ error: "Não foi possível registrar a corrida" });
    return;
  }

  rides.set(ride.id, ride);

  const io = req.app.get("io");
  for (const u of users.values()) {
    if (isDriverOnline(u.id) && driverCanTakeRide(u, ride)) {
      if (io) io.to(`user:${u.id}`).emit("nova_corrida", rideForViewer(ride, u));
      if (!u.pushToken) continue;
      // Em primeiro plano, o Socket.IO já toca o alerta local do aplicativo.
      // Em segundo plano, enviamos o push com o canal de som personalizado.
      if (await isUserForeground(u.id)) continue;
      sendPushNotification(
        u.pushToken,
        "Nova corrida!",
        `${ride.clientName}: ${origin} → ${destination} · ${ride.vehicleType === "motorcycle" ? "KD MOTO" : "KD CARRO"}`,
        { type: "new_ride", rideId: ride.id },
        { channelId: "ride_alerts_v2", sound: "ride_alert.wav" },
      );
    }
  }

  res.json(ride);
});

// POST /accept-ride
router.post("/accept-ride", requireAuth, async (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };
  const driver = req.authUser!;
  if (driver.mode !== "driver") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  if (driver.approvalStatus !== "approved") {
    res.status(403).json({ error: "Motorista aguardando aprovação" });
    return;
  }

  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.status !== "waiting") { res.status(409).json({ error: "Ride already taken" }); return; }

  if (!driverCanTakeRide(driver, ride)) {
    res.status(403).json({ error: "Esta corrida é de outra categoria de veículo" });
    return;
  }
  if (!isDriverOnline(driver.id)) {
    res.status(403).json({ error: "Fique online para aceitar corridas" });
    return;
  }

  const acceptedAt = new Date();
  try {
    const updatedRide = await db.transaction(async (tx) => {
      const [account] = await tx.select().from(dbUsers).where(eq(dbUsers.id, driver.id)).for("update");
      if (!account?.active || account.deletedAt || account.approvalStatus !== "approved" || !account.isOnline) return undefined;
      const [accepted] = await tx.update(dbRides)
      .set({
        driverId: driver.id,
        driverName: driver.name,
        driverPhoto: driver.photo ?? null,
        driverAvgRating: driver.rating,
        driverRideCount: driver.rideCount,
        driverVehicleBrand: driver.vehicleBrand ?? null,
        driverVehicleModel: driver.vehicleModel ?? null,
        driverVehicleColor: driver.vehicleColor ?? null,
        driverVehiclePlate: driver.vehiclePlate ?? null,
        status: "accepted",
        acceptedAt,
      })
      .where(and(eq(dbRides.id, rideId), eq(dbRides.status, "waiting")))
      .returning({ id: dbRides.id });
      return accepted;
    });

    if (!updatedRide) {
      res.status(409).json({ error: "Ride already taken" });
      return;
    }
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string };

    if (
      dbError.code === "23505" &&
      dbError.constraint === "rides_one_active_per_driver_unique"
    ) {
      res.status(409).json({
        error: "Você já possui uma corrida ativa. Finalize ou cancele antes de aceitar outra.",
      });
      return;
    }

    console.error("[rides] Erro ao aceitar corrida:");
    res.status(500).json({ error: "Não foi possível aceitar a corrida" });
    return;
  }

  ride.driverId = driver.id;
  ride.driverName = driver.name;
  ride.driverPhoto = driver.photo;
  ride.driverAvgRating = driver.rating;
  ride.driverRideCount = driver.rideCount;
  ride.driverVehicleBrand = driver.vehicleBrand;
  ride.driverVehicleModel = driver.vehicleModel;
  ride.driverVehicleColor = driver.vehicleColor;
  ride.driverVehiclePlate = driver.vehiclePlate;
  ride.status = "accepted";
  ride.acceptedAt = acceptedAt.toISOString();

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_aceita", ride);
    io.to(`user:${driver.id}`).emit("corrida_aceita", rideForViewer(ride, driver));
    io.to(`driver-vehicle:${ride.vehicleType}`).emit("corrida_indisponivel", ride.id);
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida aceita", `${driver.name} aceitou sua solicitação.`, { rideId });
  }

  res.json(rideForViewer(ride, driver));
});

// POST /start-ride
router.post("/start-ride", requireAuth, async (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };
  const driver = req.authUser!;

  if (driver.mode !== "driver") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const ride = rides.get(rideId);
  if (!ride) {
    res.status(404).json({ error: "Corrida não encontrada" });
    return;
  }
  if (ride.driverId !== driver.id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  if (ride.status !== "accepted") {
    res.status(409).json({ error: "A corrida não está aguardando início" });
    return;
  }

  try {
    const [updatedRide] = await db.update(dbRides)
      .set({ status: "in_progress" })
      .where(and(
        eq(dbRides.id, rideId),
        eq(dbRides.driverId, driver.id),
        eq(dbRides.status, "accepted"),
      ))
      .returning({ id: dbRides.id });

    if (!updatedRide) {
      res.status(409).json({ error: "A corrida já foi iniciada ou mudou de estado" });
      return;
    }
  } catch (error) {
    console.error("[rides] Erro ao iniciar corrida:");
    res.status(500).json({ error: "Não foi possível iniciar a corrida" });
    return;
  }

  ride.status = "in_progress";

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_iniciada", ride);
    if (ride.driverId) {
      io.to(`user:${ride.driverId}`).emit("corrida_iniciada", rideForViewer(ride, driver));
    }
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida iniciada!", "Sua corrida está em andamento", { rideId });
  }

  res.json(rideForViewer(ride, driver));
});

// POST /finish-ride
router.post("/finish-ride", requireAuth, async (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };
  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (req.authUser!.mode !== "driver" || ride.driverId !== req.authUser!.id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  if (ride.status !== "in_progress") {
    res.status(409).json({ error: "Inicie a corrida antes de finalizá-la" });
    return;
  }

  const finishedAt = new Date();
  try {
    const [updatedRide] = await db.update(dbRides)
      .set({ status: "finished", finishedAt })
      .where(and(
        eq(dbRides.id, rideId),
        eq(dbRides.driverId, req.authUser!.id),
        eq(dbRides.status, "in_progress"),
      ))
      .returning({ id: dbRides.id });

    if (!updatedRide) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }
  } catch (error) {
    console.error("[rides] Erro ao finalizar corrida:");
    res.status(500).json({ error: "Não foi possível finalizar a corrida" });
    return;
  }

  ride.status = "finished";
  ride.finishedAt = finishedAt.toISOString();

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_finalizada", ride);
    if (ride.driverId) {
      io.to(`user:${ride.driverId}`).emit("corrida_finalizada", rideForViewer(ride, req.authUser!));
    }
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida finalizada!", "Avalie sua experiência", { rideId });
  }

  res.json(rideForViewer(ride, req.authUser!));
});

// POST /cancel-ride
router.post("/cancel-ride", requireAuth, async (req: Request, res: Response) => {
  const ride = rides.get(req.body.rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.clientId !== req.authUser!.id && ride.driverId !== req.authUser!.id) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  if (!["waiting", "accepted", "in_progress"].includes(ride.status)) {
    res.status(409).json({ error: "Esta corrida não pode mais ser cancelada" });
    return;
  }

  try {
    const [updatedRide] = await db.update(dbRides)
      .set({ status: "cancelled" })
      .where(and(
        eq(dbRides.id, ride.id),
        or(
          eq(dbRides.clientId, req.authUser!.id),
          eq(dbRides.driverId, req.authUser!.id),
        ),
        inArray(dbRides.status, ["waiting", "accepted", "in_progress"]),
      ))
      .returning({ id: dbRides.id });

    if (!updatedRide) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }
  } catch (error) {
    console.error("[rides] Erro ao cancelar corrida:");
    res.status(500).json({ error: "Não foi possível cancelar a corrida" });
    return;
  }

  ride.status = "cancelled";
  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_cancelada", ride.id);
    io.to(`driver-vehicle:${ride.vehicleType}`).emit("corrida_cancelada", ride.id);
    if (ride.driverId) {
      io.to(`user:${ride.driverId}`).emit("corrida_cancelada", ride.id);
    }
  }
  res.json(rideForViewer(ride, req.authUser!));
});

// GET /rides/:id/chat – recupera o histórico persistido no Neon.
router.get("/rides/:id/chat", requireAuth, async (req: Request, res: Response) => {
  const rideId = req.params.id as string;

  try {
    const [ride] = await db.select().from(dbRides)
      .where(eq(dbRides.id, rideId)).limit(1);

    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    if (
      req.authUser!.id !== ride.clientId &&
      req.authUser!.id !== ride.driverId &&
      req.authUser!.mode !== "admin"
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const messages = await db.select().from(dbChatMessages)
      .where(eq(dbChatMessages.rideId, rideId))
      .orderBy(asc(dbChatMessages.timestamp));

    const history: ChatMessage[] = messages.map((message) => ({
      id: message.id,
      rideId: message.rideId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderPhoto: message.senderPhoto ?? undefined,
      text: message.text,
      timestamp: message.timestamp.toISOString(),
    }));

    chatByRide.set(rideId, history);
    res.json(history);
  } catch (error) {
    console.error("[chat] Erro ao buscar histórico no Neon:");
    res.status(500).json({ error: "Não foi possível carregar o histórico do chat" });
  }
});

// POST /rides/:id/rate – grava a avaliação e atualiza a média em uma transação.
router.post("/rides/:id/rate", requireAuth, async (req: Request, res: Response) => {
  const rideId = req.params.id as string;
  const { raterMode, rating } = req.body as {
    raterMode: "client" | "driver";
    rating: number;
  };

  if (raterMode !== "client" && raterMode !== "driver") {
    res.status(400).json({ error: "Tipo de avaliador inválido" });
    return;
  }

  if (req.authUser!.mode !== raterMode) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "A avaliação deve ser um número inteiro entre 1 e 5" });
    return;
  }

  try {
    const [rideRecord] = await db.select().from(dbRides)
      .where(eq(dbRides.id, rideId)).limit(1);

    if (!rideRecord) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    const expectedId = raterMode === "client" ? rideRecord.clientId : rideRecord.driverId;
    if (req.authUser!.id !== expectedId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    if (rideRecord.status !== "finished") {
      res.status(409).json({ error: "A corrida precisa estar finalizada para receber avaliação" });
      return;
    }

    const targetId = raterMode === "client" ? rideRecord.driverId : rideRecord.clientId;
    if (!targetId) {
      res.status(409).json({ error: "Não existe usuário para receber esta avaliação" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const ratingColumn = raterMode === "client"
        ? dbRides.clientRating
        : dbRides.driverRating;

      const [updatedRide] = await tx.update(dbRides)
        .set(raterMode === "client"
          ? { clientRating: rating }
          : { driverRating: rating })
        .where(and(
          eq(dbRides.id, rideId),
          eq(dbRides.status, "finished"),
          isNull(ratingColumn)
        ))
        .returning();

      if (!updatedRide) return undefined;

      const [targetUser] = await tx.select().from(dbUsers)
        .where(eq(dbUsers.id, targetId)).for("update").limit(1);

      if (!targetUser) {
        throw new Error("Usuário avaliado não encontrado");
      }

      const nextCount = targetUser.rideCount + 1;
      const nextRating = Number(
        ((targetUser.rating * targetUser.rideCount + rating) / nextCount).toFixed(1)
      );

      const [updatedUser] = await tx.update(dbUsers)
        .set({ rating: nextRating, rideCount: nextCount })
        .where(eq(dbUsers.id, targetId))
        .returning();

      return { updatedRide, updatedUser };
    });

    if (!result) {
      res.status(409).json({ error: "Esta corrida já recebeu esta avaliação" });
      return;
    }

    const updatedRide = rideFromRecord(result.updatedRide);
    rides.set(updatedRide.id, updatedRide);
    users.set(result.updatedUser.id, userFromRecord(result.updatedUser));

    res.json(rideForViewer(updatedRide, req.authUser!));
  } catch (error) {
    console.error("[rides] Erro ao salvar avaliação no Neon:");
    res.status(500).json({ error: "Não foi possível salvar a avaliação" });
  }
});

// GET /rides – consulta o Neon e mantém as regras de visibilidade por perfil.
router.get("/rides", requireAuth, async (req: Request, res: Response) => {
  try {
    const viewer = req.authUser!;
    const scope = viewer.mode === 'client' ? eq(dbRides.clientId, viewer.id)
      : viewer.mode === 'driver' ? or(eq(dbRides.driverId, viewer.id),
        and(eq(dbRides.status, 'waiting'), eq(dbRides.vehicleType, driverVehicleType(viewer)),
          sql`${viewer.active && viewer.approvalStatus === 'approved'}`)) : undefined;
    const summary = viewer.mode === 'admin' && req.query.summary === '1';
    const columns = getTableColumns(dbRides);
    const query = db.select(summary ? { ...columns,
      clientPhoto: sql<string | null>`null`, driverPhoto: sql<string | null>`null`,
    } : columns).from(dbRides).where(scope).orderBy(desc(dbRides.createdAt), desc(dbRides.id));
    const records = summary ? await query.limit(6) : await query;
    const allRides = records.map(rideFromRecord);
    // A scoped read must not evict other users' active rides from the shared cache.
    if (!summary) for (const ride of allRides) rides.set(ride.id, ride);

    const visibleRides = req.authUser!.mode === "driver"
      ? allRides.filter((ride) =>
        ride.driverId === req.authUser!.id ||
        (ride.status === "waiting" && driverCanTakeRide(req.authUser!, ride))
      )
      : req.authUser!.mode === "client"
        ? allRides.filter((ride) => ride.clientId === req.authUser!.id)
        : allRides;

    visibleRides.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(visibleRides.map((ride) => rideForViewer(ride, req.authUser!)));
  } catch (error) {
    console.error("[rides] Erro ao consultar corridas no Neon:");
    res.status(500).json({ error: "Não foi possível consultar as corridas" });
  }
});

// GET /users/:id/rides – histórico persistido no Neon; self or admin only
router.get("/users/:id/rides", requireAuth, async (req: Request, res: Response) => {
  if (req.authUser!.id !== (req.params.id as string) && req.authUser!.mode !== "admin") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const userId = req.params.id as string;

  try {
    const records = await db.select().from(dbRides)
      .where(and(eq(dbRides.status, 'finished'), or(eq(dbRides.clientId, userId), eq(dbRides.driverId, userId))))
      .orderBy(desc(dbRides.createdAt), desc(dbRides.id));
    const userRides = records.map(rideFromRecord);

    res.json(userRides.map((ride) => rideForViewer(ride, req.authUser!)));
  } catch (error) {
    console.error("[rides] Erro ao consultar histórico no Neon:");
    res.status(500).json({ error: "Não foi possível consultar o histórico de corridas" });
  }
});

// Local nightly fares are independent of intercity destination rules.
router.get('/admin/night-fares', requireAdmin, async (_req: Request, res: Response) => {
  res.json(await getNightFares());
});
router.put('/admin/night-fares', requireAdmin, async (req: Request, res: Response) => {
  if (!validNightFares(req.body)) {
    res.status(400).json({ error: 'Confira os horários, o fuso e os valores da tarifa noturna.' }); return;
  }
  const { enabled, start, end, timeZone, carPrice, motorcyclePrice } = req.body;
  await saveNightFares({ enabled, start, end, timeZone, carPrice, motorcyclePrice }, req.authUser!.id);
  res.json(await getNightFares());
});

// GET /pricing – consulta as tarifas persistidas no Neon.
router.get("/pricing", requireAuth, async (_req: Request, res: Response) => {
  try {
    const records = await db.select().from(dbPricingRules)
      .orderBy(asc(dbPricingRules.destination));

    pricing.clear();
    const rules: PriceRule[] = records.map((record) => ({
      id: record.id,
      destination: record.destination,
      carPrice: record.carPrice,
      motorcyclePrice: record.motorcyclePrice,
      isLocal: record.isLocal,
      createdAt: record.createdAt.toISOString(),
    }));

    for (const rule of rules) pricing.set(rule.id, rule);
    res.json(rules);
  } catch (error) {
    console.error("[pricing] Erro ao consultar tarifas no Neon:");
    res.status(500).json({ error: "Não foi possível consultar as tarifas" });
  }
});

// POST /pricing – administrador cadastra ou atualiza tarifas no Neon.
router.post("/pricing", requireAdmin, async (req: Request, res: Response) => {
  const { destination, carPrice, motorcyclePrice, isLocal } = req.body as {
    destination: string;
    carPrice: number | null;
    motorcyclePrice: number | null;
    isLocal?: boolean;
  };

  const validPrice = (value: unknown) =>
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 99999999.99);

  if (
    typeof destination !== "string" ||
    !destination.trim() ||
    destination.trim().length > 200 ||
    !Object.prototype.hasOwnProperty.call(req.body, "carPrice") ||
    !Object.prototype.hasOwnProperty.call(req.body, "motorcyclePrice") ||
    !validPrice(carPrice) ||
    !validPrice(motorcyclePrice) ||
    (isLocal !== undefined && typeof isLocal !== "boolean")
  ) {
    res.status(400).json({ error: "Destino ou tarifas inválidas" });
    return;
  }

  const cleanDestination = destination.trim();
  const local = isLocal === true;

  try {
    const savedRecord = await db.transaction(async (tx) => {
      const existingRules = await tx.select().from(dbPricingRules);
      const existing = existingRules.find((rule) =>
        local
          ? rule.isLocal
          : !rule.isLocal &&
            rule.destination.toLowerCase() === cleanDestination.toLowerCase()
      );

      if (existing) {
        const [updated] = await tx.update(dbPricingRules)
          .set({
            destination: cleanDestination,
            carPrice,
            motorcyclePrice,
            isLocal: local,
          })
          .where(eq(dbPricingRules.id, existing.id))
          .returning();

        return updated;
      }

      const [created] = await tx.insert(dbPricingRules).values({
        id: local ? "local-price" : getId(),
        destination: cleanDestination,
        carPrice,
        motorcyclePrice,
        isLocal: local,
      }).returning();

      return created;
    });

    if (!savedRecord) {
      throw new Error("Não foi possível confirmar a gravação da tarifa");
    }

    const rule: PriceRule = {
      id: savedRecord.id,
      destination: savedRecord.destination,
      carPrice: savedRecord.carPrice,
      motorcyclePrice: savedRecord.motorcyclePrice,
      isLocal: savedRecord.isLocal,
      createdAt: savedRecord.createdAt.toISOString(),
    };

    pricing.set(rule.id, rule);
    res.json(rule);
  } catch (error) {
    console.error("[pricing] Erro ao salvar tarifa no Neon:");
    res.status(500).json({
      error: "Não foi possível salvar a tarifa. Verifique se o destino já está cadastrado."
    });
  }
});
// DELETE /pricing/:id – administrador exclui a tarifa do Neon.
router.delete("/pricing/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    await db.delete(dbPricingRules).where(eq(dbPricingRules.id, id));
    pricing.delete(id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[pricing] Erro ao excluir tarifa no Neon:");
    res.status(500).json({ error: "Não foi possível excluir a tarifa" });
  }
});

// GET /pricing/lookup?destination=xxx&vehicleType=car|motorcycle
router.get("/pricing/lookup", requireAuth, async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) ?? "";
  const vehicleType = (req.query.vehicleType as string) ?? "car";

  if (vehicleType !== "car" && vehicleType !== "motorcycle") {
    res.status(400).json({ error: "Tipo de veículo inválido" });
    return;
  }

  const result = await lookupPrice(destination, vehicleType);
  const settings = await getFeeSettings();
  const quote = result ? calculateCommission(result.price, settings.rateBps, settings.enabled) : undefined;
  res.set("Cache-Control", "no-store");
  res.json({
    price: quote?.total ?? null,
    basePrice: result?.price ?? null,
    platformFee: quote ? quote.feeCents / 100 : null,
    isLocal: result?.isLocal ?? false,
    farePeriod: result?.farePeriod ?? "day",
    vehicleType,
  });
});

addFinanceRoutes(router, requireAdmin);
addHistoryRoutes(router, requireAdmin);

export default router;
