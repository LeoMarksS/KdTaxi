import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, users as dbUsers, sessions as dbSessions, rides as dbRides, chatMessages as dbChatMessages, pricingRules as dbPricingRules } from "@workspace/db";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Server as SocketIOServer } from "socket.io";

const router = Router();

let socketServer: SocketIOServer | undefined;

// Disponibilidade do motorista depende do botão Online e de uma sessão conectada.
const driverAvailability = new Set<string>();
const driverSockets = new Map<string, Set<string>>();

export function registerDriverSocket(userId: string, socketId: string): void {
  const sockets = driverSockets.get(userId) ?? new Set<string>();
  sockets.add(socketId);
  driverSockets.set(userId, sockets);
}

export function unregisterDriverSocket(userId: string, socketId: string): void {
  const sockets = driverSockets.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) driverSockets.delete(userId);
}

export function setDriverAvailability(userId: string, online: boolean): void {
  if (online) driverAvailability.add(userId);
  else driverAvailability.delete(userId);
}

export function isDriverOnline(userId: string): boolean {
  return driverAvailability.has(userId) && (driverSockets.get(userId)?.size ?? 0) > 0;
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
    active: record.active,
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

    if (initialPassword.length < 12 || initialPassword.length > 128) {
      throw new Error("ADMIN_INITIAL_PASSWORD deve ter entre 12 e 128 caracteres.");
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
  for (const record of userRecords) {
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

async function getUserByToken(token: string | undefined): Promise<User | undefined> {
  if (!token) return undefined;

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

  let user = users.get(session.userId);
  if (!user) {
    const [record] = await db.select().from(dbUsers)
      .where(eq(dbUsers.id, session.userId)).limit(1);
    if (!record) return undefined;
    user = userFromRecord(record);
    users.set(user.id, user);
  }

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
  return getUserByToken(auth.slice(7));
}

export async function authenticateSocketToken(token: string | undefined) {
  const user = await getUserByToken(token);
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
    { channelId: "ride_alerts_v1", sound: "default" },
  );
}

async function lookupPrice(
  destination: string,
  vehicleType: "car" | "motorcycle",
): Promise<{ price: number; isLocal: boolean } | undefined> {
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

  const price = vehiclePrice(localRule);
  return typeof price === "number" && Number.isFinite(price)
    ? { price, isLocal: true }
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

  const normalizedPhone = phone.trim();
  const existing = Array.from(users.values()).find((u) => u.phone === normalizedPhone);
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
  try {
    await db.insert(dbUsers).values({
      id: user.id,
      name: user.name,
      phone: user.phone,
      passwordHash: user.passwordHash,
      mode: user.mode,
      vehicleType: user.vehicleType ?? null,
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
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
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

    if (!record.active) {
      res.status(403).json({ error: "Esta conta está desativada" });
      return;
    }

    const user = userFromRecord(record);
    users.set(user.id, user);

    const token = await createSession(user.id);
    res.json({ user: safeUser(user), token });
  } catch (error) {
    console.error("[auth] Erro ao realizar login:", error);
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
      res.status(400).json({ error: "A nova senha deve ter entre 8 e 128 caracteres." });
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
    console.error("[auth] Erro ao alterar senha:", error);
    res.status(500).json({ error: "Não foi possível alterar a senha." });
  }
});

router.post("/logout", requireAuth, async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  const token = auth?.slice(7);
  if (token) {
    await db.delete(dbSessions).where(eq(dbSessions.token, token));
    sessions.delete(token);
  }
  res.json({ ok: true });
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

  try {
    await db.update(dbUsers)
      .set({
        name: updatedName,
        ...(photo !== undefined ? { photo } : {}),
        ...(pushToken !== undefined ? { pushToken } : {}),
      })
      .where(eq(dbUsers.id, id));

    user.name = updatedName;
    if (photo !== undefined) user.photo = photo;
    if (pushToken !== undefined) user.pushToken = pushToken;

    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao atualizar perfil:", error);
    res.status(500).json({ error: "Não foi possível atualizar o perfil" });
  }
});

// GET /users – admin only, list of clients/drivers without passwords or push tokens
router.get("/users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const records = await db.select().from(dbUsers);

    for (const record of records) {
      const user = userFromRecord(record);
      users.set(user.id, user);
    }

    res.json(records
      .map(userFromRecord)
      .filter((u) => u.mode !== "admin")
      .map(safeUserList));
  } catch (error) {
    console.error("[admin] Erro ao listar usuários:", error);
    res.status(500).json({ error: "Não foi possível listar os usuários" });
  }
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

    if (!record) {
      users.delete(id);
      res.status(404).json({ error: "Not found" });
      return;
    }

    const user = userFromRecord(record);
    users.set(user.id, user);
    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao consultar usuário:", error);
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

  setDriverAvailability(id, req.body.online === true);
  res.json({ isOnline: isDriverOnline(id) });
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
      .set({ active })
      .where(eq(dbUsers.id, id));

    user.active = active;
    if (!active) await revokeOtherUserSessions(id);
    res.json(safeUser(user));
  } catch (error) {
    console.error("[profile] Erro ao alterar status da conta:", error);
    res.status(500).json({ error: "Não foi possível alterar o status da conta" });
  }
});

// ─── ADMIN ENDPOINTS ───────────────────────────────────────────────────────

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
        passwordHash: updatedPasswordHash,
      })
      .where(eq(dbUsers.id, id));

    user.name = updatedName;
    user.phone = updatedPhone;
    user.mode = updatedMode;
    if (vehicleType !== undefined) user.vehicleType = updatedVehicleType;
    user.active = updatedActive;
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
    console.error("[admin] Erro ao atualizar usuário:", error);
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
    await db.delete(dbSessions).where(eq(dbSessions.userId, id));
    await db.delete(dbUsers).where(eq(dbUsers.id, id));

    for (const [token, session] of sessions.entries()) {
      if (session.userId === id) {
        sessions.delete(token);
      }
    }

    users.delete(id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin] Erro ao excluir usuário:", error);
    res.status(500).json({ error: "Não foi possível excluir o usuário" });
  }
});

// DELETE /admin/rides – exclui todas as corridas do Neon.
router.delete("/admin/rides", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await db.delete(dbRides);
    rides.clear();
    chatByRide.clear();
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin] Erro ao excluir corridas:", error);
    res.status(500).json({ error: "Não foi possível excluir as corridas" });
  }
});

// GET /admin/stats – estatísticas calculadas diretamente do Neon.
router.get("/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rideRecords, userRecords] = await Promise.all([
      db.select().from(dbRides),
      db.select().from(dbUsers),
    ]);

    const allRideList = rideRecords.map(rideFromRecord);
    const allUserList = userRecords.map(userFromRecord);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const finishedRides = allRideList.filter((r) => r.status === "finished");
    const todayRides = allRideList.filter((r) => new Date(r.createdAt) >= todayStart);
    const todayFinished = todayRides.filter((r) => r.status === "finished");
    const totalRevenue = finishedRides.reduce((s, r) => s + (r.price ?? 0), 0);
    const todayRevenue = todayFinished.reduce((s, r) => s + (r.price ?? 0), 0);
    const ratedUsers = allUserList.filter((u) => u.rideCount > 0);

    res.json({
      totalUsers: allUserList.filter((u) => u.mode !== "admin").length,
      totalClients: allUserList.filter((u) => u.mode === "client").length,
      totalDrivers: allUserList.filter((u) => u.mode === "driver").length,
      onlineDrivers: allUserList.filter((u) => u.mode === "driver" && isDriverOnline(u.id)).length,
      onlineCarDrivers: allUserList.filter((u) => u.mode === "driver" && isDriverOnline(u.id) && driverVehicleType(u) === "car").length,
      onlineMotorcycleDrivers: allUserList.filter((u) => u.mode === "driver" && isDriverOnline(u.id) && driverVehicleType(u) === "motorcycle").length,
      totalRides: allRideList.length,
      finishedRides: finishedRides.length,
      cancelledRides: allRideList.filter((r) => r.status === "cancelled").length,
      activeRides: allRideList.filter((r) => ["waiting", "accepted", "in_progress"].includes(r.status)).length,
      totalRevenue,
      todayRides: todayRides.length,
      todayRevenue,
      avgRating: ratedUsers.reduce((s, u) => s + u.rating, 0) /
        Math.max(1, ratedUsers.length),
    });
  } catch (error) {
    console.error("[admin] Erro ao consultar estatísticas:", error);
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
    passwordHash: bcrypt.hashSync(password, 10),
    mode: resolvedMode,
    ...(resolvedMode === "driver"
      ? { vehicleType: (vehicleType as User["vehicleType"]) ?? "car" }
      : {}),
    active: resolvedMode !== "driver",
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

    console.error("[admin] Erro ao criar usuário:", error);
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

  const priceResult = await lookupPrice(destination, selectedVehicle);

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
    createdAt: new Date().toISOString(),
  };

  try {
    await db.insert(dbRides).values({
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
  } catch (error) {
    console.error("[rides] Erro ao salvar nova corrida:", error);
    res.status(500).json({ error: "Não foi possível registrar a corrida" });
    return;
  }

  rides.set(ride.id, ride);

  const io = req.app.get("io");
  if (io) io.to(`driver-vehicle:${ride.vehicleType}`).emit("nova_corrida", ride);

  for (const u of users.values()) {
    if (u.mode === "driver" && u.active && u.pushToken &&
      isDriverOnline(u.id) && driverCanTakeRide(u, ride)) {
      // Em primeiro plano, o Socket.IO já toca o alerta local do aplicativo.
      // Em segundo plano, enviamos o push com o canal de som personalizado.
      if (await isUserForeground(u.id)) continue;
      sendPushNotification(
        u.pushToken,
        "Nova corrida!",
        `${ride.clientName}: ${origin} → ${destination} · ${ride.vehicleType === "motorcycle" ? "KD MOTO" : "KD CARRO"}`,
        { type: "new_ride", rideId: ride.id },
        { channelId: "ride_alerts_v2", sound: "ride-alert.wav" },
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

  const ride = rides.get(rideId);
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (ride.status !== "waiting") { res.status(409).json({ error: "Ride already taken" }); return; }

  if (!driverCanTakeRide(driver, ride)) {
    res.status(403).json({ error: "Esta corrida é de outra categoria de veículo" });
    return;
  }

  const acceptedAt = new Date();
  try {
    const [updatedRide] = await db.update(dbRides)
      .set({
        driverId: driver.id,
        driverName: driver.name,
        driverPhoto: driver.photo ?? null,
        driverAvgRating: driver.rating,
        driverRideCount: driver.rideCount,
        status: "accepted",
        acceptedAt,
      })
      .where(and(eq(dbRides.id, rideId), eq(dbRides.status, "waiting")))
      .returning({ id: dbRides.id });

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

    console.error("[rides] Erro ao aceitar corrida:", error);
    res.status(500).json({ error: "Não foi possível aceitar a corrida" });
    return;
  }

  ride.driverId = driver.id;
  ride.driverName = driver.name;
  ride.driverPhoto = driver.photo;
  ride.driverAvgRating = driver.rating;
  ride.driverRideCount = driver.rideCount;
  ride.status = "accepted";
  ride.acceptedAt = acceptedAt.toISOString();

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_aceita", ride);
    io.to(`user:${driver.id}`).emit("corrida_aceita", ride);
    io.to(`driver-vehicle:${ride.vehicleType}`).emit("corrida_indisponivel", ride.id);
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Motorista encontrado!", `${driver.name} está a caminho`, { rideId });
  }

  res.json(ride);
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
    console.error("[rides] Erro ao iniciar corrida:", error);
    res.status(500).json({ error: "Não foi possível iniciar a corrida" });
    return;
  }

  ride.status = "in_progress";

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_iniciada", ride);
    if (ride.driverId) {
      io.to(`user:${ride.driverId}`).emit("corrida_iniciada", ride);
    }
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida iniciada!", "Sua corrida está em andamento", { rideId });
  }

  res.json(ride);
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
    console.error("[rides] Erro ao finalizar corrida:", error);
    res.status(500).json({ error: "Não foi possível finalizar a corrida" });
    return;
  }

  ride.status = "finished";
  ride.finishedAt = finishedAt.toISOString();

  const io = req.app.get("io");
  if (io) {
    io.to(`user:${ride.clientId}`).emit("corrida_finalizada", ride);
    if (ride.driverId) {
      io.to(`user:${ride.driverId}`).emit("corrida_finalizada", ride);
    }
  }

  const client = users.get(ride.clientId);
  if (client?.pushToken) {
    sendPushNotification(client.pushToken, "Corrida finalizada!", "Avalie sua experiência", { rideId });
  }

  res.json(ride);
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
    console.error("[rides] Erro ao cancelar corrida:", error);
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
  res.json(ride);
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
    console.error("[chat] Erro ao buscar histórico no Neon:", error);
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
        .where(eq(dbUsers.id, targetId)).limit(1);

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

    res.json(updatedRide);
  } catch (error) {
    console.error("[rides] Erro ao salvar avaliação no Neon:", error);
    res.status(500).json({ error: "Não foi possível salvar a avaliação" });
  }
});

// GET /rides – consulta o Neon e mantém as regras de visibilidade por perfil.
router.get("/rides", requireAuth, async (req: Request, res: Response) => {
  try {
    const records = await db.select().from(dbRides);
    const allRides = records.map(rideFromRecord);

    rides.clear();
    for (const ride of allRides) {
      rides.set(ride.id, ride);
    }

    const visibleRides = req.authUser!.mode === "driver"
      ? allRides.filter((ride) =>
        ride.driverId === req.authUser!.id ||
        (ride.status === "waiting" && driverCanTakeRide(req.authUser!, ride))
      )
      : allRides;

    visibleRides.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(visibleRides);
  } catch (error) {
    console.error("[rides] Erro ao consultar corridas no Neon:", error);
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
    const records = await db.select().from(dbRides);
    const userRides = records
      .filter((record) =>
        (record.clientId === userId || record.driverId === userId) &&
        record.status === "finished"
      )
      .map(rideFromRecord)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(userRides);
  } catch (error) {
    console.error("[rides] Erro ao consultar histórico no Neon:", error);
    res.status(500).json({ error: "Não foi possível consultar o histórico de corridas" });
  }
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
    console.error("[pricing] Erro ao consultar tarifas no Neon:", error);
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
    (typeof value === "number" && Number.isFinite(value) && value >= 0);

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
    console.error("[pricing] Erro ao salvar tarifa no Neon:", error);
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
    console.error("[pricing] Erro ao excluir tarifa no Neon:", error);
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
  res.set("Cache-Control", "no-store");
  res.json({
    price: result?.price ?? null,
    isLocal: result?.isLocal ?? false,
    vehicleType,
  });
});

export default router;
