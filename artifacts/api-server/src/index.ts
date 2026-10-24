import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { initDb } from "./lib/db";
import {
  authenticateSocketToken,
  getRideParticipants,
  isRideParticipant,
  recordChatMessage,
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

// Inicializa Neon antes de subir o servidor
await initDb();

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  path: "/api/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const user = authenticateSocketToken(token);
  if (!user) {
    next(new Error("unauthorized"));
    return;
  }
  socket.data.user = user;
  next();
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

  socket.join(`user:${user.id}`);
  socket.join(`role:${user.mode}`);
  if (user.mode === "driver") {
    socket.join(`driver-vehicle:${user.vehicleType === "motorcycle" ? "motorcycle" : "car"}`);
  }

  socket.on("mensagem_chat", (msg: Partial<ChatMessage>) => {
    const rideId = msg?.rideId;
    const text = (msg?.text ?? "").toString().trim();
    if (!rideId || !text) return;
    if (!isRideParticipant(rideId, user.id)) return;

    const fullMsg: ChatMessage = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`,
      rideId,
      senderId: user.id,
      senderName: user.name,
      senderPhoto: user.photo,
      text,
      timestamp: new Date().toISOString(),
    };
    recordChatMessage(fullMsg);

    const { clientId, driverId } = getRideParticipants(rideId);
    if (clientId) io.to(`user:${clientId}`).emit("mensagem_chat", fullMsg);
    if (driverId) io.to(`user:${driverId}`).emit("mensagem_chat", fullMsg);
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id, userId: user.id }, "Socket disconnected");
  });
});

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening with Socket.io");
});
