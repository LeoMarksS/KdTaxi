import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import {
  initializeAuthStore,
  authenticateSocketToken,
  setSocketServer,
  getRideParticipants,
  isRideParticipant,
  recordChatMessage,
  registerDriverSocket,
  unregisterDriverSocket,
  isUserForeground,
  sendChatPushNotification,
  type ChatMessage,
} from "./routes/taxi";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  path: "/api/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store io on the app for use in routes
app.set("io", io);
setSocketServer(io);

// Authenticate every socket connection against the same session tokens used
// by the REST API, instead of trusting whatever identity the client claims
// in its query params. This also lets us join per-user rooms so events can
// be targeted reliably rather than broadcast to every connected device.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    const user = await authenticateSocketToken(token);
    if (!user) {
      next(new Error("unauthorized"));
      return;
    }
    socket.data.user = user;
    socket.data.sessionToken = token;
    next();
  } catch (error) {
    logger.error({ err: error }, "Falha ao validar sessão do Socket.IO");
    next(new Error("authentication_error"));
  }
});

io.on("connection", (socket) => {
  const user = socket.data.user as {
    id: string;
    mode: string;
    name: string;
    photo?: string;
    vehicleType?: "car" | "motorcycle";
  };
  logger.info({ socketId: socket.id, userId: user.id, mode: user.mode }, "Socket connected");

  // Personal room: lets the server target this exact user across all of
  // their connected devices/tabs, and reconnects automatically re-join it.
  socket.join(`user:${user.id}`);
  // Role room: lets driver-only broadcasts (e.g. new ride requests) reach
  // every driver without needing every handler to enumerate connected sockets.
  socket.join(`role:${user.mode}`);
  if (user.mode === "driver") {
    socket.join(`driver-vehicle:${user.vehicleType === "motorcycle" ? "motorcycle" : "car"}`);
    registerDriverSocket(user.id, socket.id);
  }

  socket.data.appState = "active";
  socket.on("app_state", (state: unknown) => {
    if (state === "active" || state === "background" || state === "inactive") {
      socket.data.appState = state;
    }
  });

  socket.on("mensagem_chat", async (msg: Partial<ChatMessage>) => {
    const rideId = msg?.rideId;
    const text = (msg?.text ?? "").toString().trim();
    if (!rideId || !text || text.length > 1000) return;
    if (!isRideParticipant(rideId, user.id)) return;

    // A identidade vem do socket autenticado, nunca dos dados enviados pelo aplicativo.
    const fullMsg: ChatMessage = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`,
      rideId,
      senderId: user.id,
      senderName: user.name,
      senderPhoto: user.photo,
      text,
      timestamp: new Date().toISOString(),
    };

    try {
      await recordChatMessage(fullMsg);
    } catch (error) {
      logger.error({ error, rideId }, "Failed to persist chat message");
      return;
    }

    const { clientId, driverId } = getRideParticipants(rideId);
    if (clientId) io.to(`user:${clientId}`).emit("mensagem_chat", fullMsg);
    if (driverId) io.to(`user:${driverId}`).emit("mensagem_chat", fullMsg);

    const recipientId = user.id === clientId ? driverId : clientId;
    if (recipientId && !(await isUserForeground(recipientId))) {
      sendChatPushNotification(recipientId, fullMsg.senderName, rideId);
    }
  });

  socket.on("disconnect", () => {
    if (user.mode === "driver") unregisterDriverSocket(user.id, socket.id);
    logger.info({ socketId: socket.id, userId: user.id }, "Socket disconnected");
  });
});

initializeAuthStore()
  .then(() => {
    httpServer.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening with Socket.io");
    });
  })
  .catch((error) => {
    logger.error({ err: error }, "Falha ao inicializar autenticação no Neon");
    process.exit(1);
  });
