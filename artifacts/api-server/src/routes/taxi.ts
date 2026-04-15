import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

interface User {
  id: string;
  name: string;
  phone: string;
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
  driverId?: string;
  driverName?: string;
  driverPhoto?: string;
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
  createdAt: string;
}

const users: Map<string, User> = new Map();
const rides: Map<string, Ride> = new Map();
const pricing: Map<string, PriceRule> = new Map();

function getId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function sendPushNotification(token: string, title: string, body: string, data?: object) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default", data: data ?? {} }),
    });
  } catch (_) {}
}

function lookupPrice(destination: string): number | undefined {
  const dest = destination.toLowerCase().trim();
  for (const rule of pricing.values()) {
    if (dest.includes(rule.destination.toLowerCase().trim()) ||
        rule.destination.toLowerCase().trim().includes(dest)) {
      return rule.price;
    }
  }
  return undefined;
}

// POST /login
router.post("/login", (req: Request, res: Response) => {
  const { name, phone, mode, photo, pushToken } = req.body as {
    name: string; phone: string; mode: string; photo?: string; pushToken?: string;
  };
  if (!name || !phone || !mode) { res.status(400).json({ error: "Missing required fields" }); return; }

  let user = Array.from(users.values()).find((u) => u.phone === phone && u.mode === mode);
  if (!user) {
    user = { id: getId(), name, phone, mode: mode as User["mode"], active: true, rating: 0, rideCount: 0, createdAt: new Date().toISOString() };
    users.set(user.id, user);
  } else {
    user.name = name;
  }
  if (photo) user.photo = photo;
  if (pushToken) user.pushToken = pushToken;
  res.json(user);
});

// PUT /users/:id
router.put("/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { name, photo, pushToken } = req.body as { name?: string; photo?: string; pushToken?: string };
  if (name) user.name = name;
  if (photo !== undefined) user.photo = photo;
  if (pushToken !== undefined) user.pushToken = pushToken;
  res.json(user);
});

// GET /users
router.get("/users", (_req: Request, res: Response) => {
  res.json(Array.from(users.values()).map((u) => ({ ...u, photo: u.photo ? "[photo]" : undefined })));
});

// GET /users/:id
router.get("/users/:id", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(user);
});

// POST /users/:id/active
router.post("/users/:id/active", (req: Request, res: Response) => {
  const user = users.get(req.params.id!);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  user.active = req.body.active;
  res.json(user);
});

// POST /request-ride
router.post("/request-ride", async (req: Request, res: Response) => {
  const { clientId, clientName, clientPhone, clientPhoto, origin, destination, payment } = req.body as {
    clientId: string; clientName: string; clientPhone: string; clientPhoto?: string;
    origin: string; destination: string; payment?: string;
  };
  if (!clientId || !origin || !destination) { res.status(400).json({ error: "Missing required fields" }); return; }

  const price = lookupPrice(destination);
  const ride: Ride = {
    id: getId(), clientId, clientName, clientPhone, clientPhoto, origin, destination,
    price, payment: (payment as Ride["payment"]) ?? "dinheiro",
    status: "waiting", createdAt: new Date().toISOString(),
  };
  rides.set(ride.id, ride);

  const io = req.app.get("io");
  if (io) io.emit("nova_corrida", ride);

  // Push notification to all online drivers
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

  ride.driverId = driverId;
  ride.driverName = driverName;
  ride.driverPhoto = driverPhoto;
  ride.status = "accepted";
  ride.acceptedAt = new Date().toISOString();

  const io = req.app.get("io");
  if (io) io.emit("corrida_aceita", ride);

  // Push notification to client
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

  // Push to client
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

  // Update user average rating
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

// GET /pricing
router.get("/pricing", (_req: Request, res: Response) => {
  res.json(Array.from(pricing.values()).sort((a, b) => a.destination.localeCompare(b.destination)));
});

// POST /pricing
router.post("/pricing", (req: Request, res: Response) => {
  const { destination, price } = req.body as { destination: string; price: number };
  if (!destination || price === undefined) { res.status(400).json({ error: "Missing fields" }); return; }

  // Check if already exists
  const existing = Array.from(pricing.values()).find(
    (p) => p.destination.toLowerCase() === destination.toLowerCase()
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
  const price = lookupPrice(destination);
  res.json({ price: price ?? null });
});

export default router;
