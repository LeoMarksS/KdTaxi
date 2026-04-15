import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";

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
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store io on the app for use in routes
app.set("io", io);

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Socket connected");

  socket.on("mensagem_chat", (msg) => {
    // Broadcast to all except sender
    socket.broadcast.emit("mensagem_chat", msg);
  });

  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "Socket disconnected");
  });
});

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening with Socket.io");
});
