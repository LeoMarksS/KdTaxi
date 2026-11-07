import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

const textLimits: Record<string, number> = {
  name: 150, phone: 30, password: 128, currentPassword: 128, newPassword: 128,
  clientId: 100, rideId: 100, origin: 1000, destination: 1000,
  vehicleBrand: 80, vehicleModel: 80, vehicleColor: 50, vehiclePlate: 10,
  mode: 20, vehicleType: 20, payment: 20, status: 30, raterMode: 20,
  scope: 10, confirmation: 30,
};

export function validateRequestBody(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  req.body ??= {};
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Envie um objeto com os campos da solicitação.' }); return;
  }
  for (const [field, limit] of Object.entries(textLimits)) {
    const value = req.body[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > limit || !value.trim())) {
      res.status(400).json({ error: `Campo inválido: ${field}.` }); return;
    }
  }
  // bcrypt only uses the first 72 bytes. Reject new passwords that would be silently truncated.
  if (req.path !== '/login') for (const field of ['password', 'newPassword']) {
    if (typeof req.body[field] === 'string' && Buffer.byteLength(req.body[field], 'utf8') > 72) {
      res.status(400).json({ error: 'A senha é muito longa. Use até 72 caracteres simples ou reduza a quantidade de acentos e emojis.' }); return;
    }
  }
  for (const field of ['active', 'online', 'clearPricing', 'isLocal']) {
    if (req.body[field] !== undefined && typeof req.body[field] !== 'boolean') {
      res.status(400).json({ error: `Campo inválido: ${field}.` }); return;
    }
  }
  const photo = req.body.photo;
  if (photo != null && (typeof photo !== 'string' || photo.length > 6 * 1024 * 1024 ||
      (photo !== '' && !/^https:\/\//i.test(photo) && !/^data:image\/(jpeg|jpg|png|webp|gif|heic|heif);base64,[a-z0-9+/=\r\n]+$/i.test(photo)))) {
    res.status(400).json({ error: 'Foto inválida ou muito grande.' }); return;
  }
  const push = req.body.pushToken;
  if (push != null && (typeof push !== 'string' || (push !== '' && !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(push)))) {
    res.status(400).json({ error: 'Registro de notificação inválido.' }); return;
  }
  next();
}

export const safeErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
  // Never send database queries, stack traces or request data to a caller.
  res.status(status).json({ error: status === 413 ? 'Solicitação muito grande.' : status === 400 ? 'JSON inválido.' : 'Não foi possível concluir a solicitação.' });
};
