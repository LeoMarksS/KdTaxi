import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

interface User {
  id: string;
  name: string;
  phone: string;
  mode: "client" | "driver" | "admin";
  active: boolean;
  createdAt: string;
}

interface Ride {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  driverId?: string;
  driverName?: string;
  origin: string;
  destination: string;
  status: "waiting" | "accepted" | "in_progress" | "finished" | "cancelled";
  createdAt: string;
  acceptedAt?: string;
  finishedAt?: string;
}

interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

// In-memory store (simple, no DB required for first build)
const users: Map<string, User> = new Map();
const rides: Map<string, Ride> = new Map();
const messages: Map<string, ChatMessage[]> = new Map();

function getId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// POST /login
router.post("/login", (req: Request, res: Response) => {
  const { name, phone, mode } = req.body as { name: string; phone: string; mode: string };
  if (!name || !phone || !mode) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Find existing user with same phone + mode or create new
  let user = Array.from(users.values()).find(
    (u) => u.phone === phone && u.mode === mode
  );

  if (!user) {
    user = {
      id: getId(),
      name,
      phone,
      mode: mode as User["mode"],
      active: true,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
  } else {
    user.name = name;
  }

  res.json(user);
});

// POST /request-ride
router.post("/request-ride", (req: Request, res: Response) => {
  const { clientId, clientName, clientPhone, origin, destination } = req.body as {
    clientId: string;
    clientName: string;
    clientPhone: string;
    origin: string;
    destination: string;
  };

  if (!clientId || !origin || !destination) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const ride: Ride = {
    id: getId(),
    clientId,
    clientName,
    clientPhone,
    origin,
    destination,
    status: "waiting",
    createdAt: new Date().toISOString(),
  };

  rides.set(ride.id, ride);

  // Emit to all connected drivers
  const io = req.app.get("io");
  if (io) {
    io.emit("nova_corrida", ride);
  }

  res.json(ride);
});

// POST /accept-ride
router.post("/accept-ride", (req: Request, res: Response) => {
  const { rideId, driverId, driverName } = req.body as {
    rideId: string;
    driverId: string;
    driverName: string;
  };

  const ride = rides.get(rideId);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }
  if (ride.status !== "waiting") {
    res.status(409).json({ error: "Ride already taken" });
    return;
  }

  ride.driverId = driverId;
  ride.driverName = driverName;
  ride.status = "accepted";
  ride.acceptedAt = new Date().toISOString();

  const io = req.app.get("io");
  if (io) {
    io.emit("corrida_aceita", ride);
  }

  res.json(ride);
});

// POST /finish-ride
router.post("/finish-ride", (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };

  const ride = rides.get(rideId);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }

  ride.status = "finished";
  ride.finishedAt = new Date().toISOString();

  const io = req.app.get("io");
  if (io) {
    io.emit("corrida_finalizada", ride);
  }

  res.json(ride);
});

// POST /cancel-ride
router.post("/cancel-ride", (req: Request, res: Response) => {
  const { rideId } = req.body as { rideId: string };

  const ride = rides.get(rideId);
  if (!ride) {
    res.status(404).json({ error: "Ride not found" });
    return;
  }

  ride.status = "cancelled";

  const io = req.app.get("io");
  if (io) {
    io.emit("corrida_cancelada", rideId);
  }

  res.json(ride);
});

// GET /rides
router.get("/rides", (_req: Request, res: Response) => {
  res.json(Array.from(rides.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ));
});

// GET /users
router.get("/users", (_req: Request, res: Response) => {
  res.json(Array.from(users.values()));
});

// POST /users/:id/active
router.post("/users/:id/active", (req: Request, res: Response) => {
  const { id } = req.params;
  const { active } = req.body as { active: boolean };

  const user = users.get(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  user.active = active;
  res.json(user);
});

export default router;
