import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRequestBody, safeErrorHandler } from '../src/lib/request-security';
import { parseChatInput, secureSocket } from '../src/lib/socket-security';

function validate(body: unknown) {
  let status = 200, next = false;
  validateRequestBody({ method: 'POST', body } as never, { status(code: number) { status = code; return this; }, json() {} } as never, () => { next = true; });
  return { status, next };
}
test('entrada rejeita tipos errados, excesso de texto e fotos executáveis, aceitando o formato do APK', () => {
  for (const body of [{ name: {} }, { password: 'a'.repeat(73) }, { newPassword: '🔑'.repeat(19) }, { phone: 42 }, { active: 'true' }, [], { origin: 'x'.repeat(1001) }, { photo: 'javascript:alert(1)' }, { photo: 'data:image/svg+xml;base64,PHN2Zz4=' }, { pushToken: 'not-a-token' }]) assert.equal(validate(body).status, 400);
  assert.equal(validate({ name: 'Motorista', photo: 'data:image/jpeg;base64,/9j/AA==', pushToken: 'ExponentPushToken[abc_123-DEF]', online: true }).next, true);
});
test('chat rejeita objetos coercíveis e identifica apenas texto e corrida', () => {
  for (const body of [null, { rideId: {}, text: 'oi' }, { rideId: 'ride', text: {} }, { rideId: 'ride', text: 'x'.repeat(1001) }]) assert.equal(parseChatInput(body), undefined);
  assert.deepEqual(parseChatInput({ rideId: 'ride', text: ' oi ', senderId: 'impersonation' }), { rideId: 'ride', text: 'oi' });
});
function socket(authenticate: () => Promise<{ id: string } | undefined>, now = () => 0) {
  let middleware: any, disconnected = false;
  secureSocket({ data: { user: { id: 'user' }, sessionToken: 'session' }, use(fn: any) { middleware = fn; }, disconnect() { disconnected = true; } } as never, authenticate, now);
  return { send: () => new Promise<Error | undefined>(resolve => void middleware(['mensagem_chat'], resolve)), disconnected: () => disconnected };
}
test('socket revalida sessão em cada mensagem e desconecta após revogação ou expiração', async () => {
  let valid = true, checks = 0;
  const s = socket(async () => { checks++; return valid ? { id: 'user' } : undefined; });
  assert.equal(await s.send(), undefined); valid = false;
  assert.equal((await s.send())?.message, 'unauthorized');
  assert.equal(checks, 2); assert(s.disconnected());
});
test('socket limita rajadas antes de consultar o banco e libera após a janela', async () => {
  let time = 0, checks = 0;
  const s = socket(async () => { checks++; return { id: 'user' }; }, () => time);
  for (let i = 0; i < 30; i++) assert.equal(await s.send(), undefined);
  assert.equal((await s.send())?.message, 'rate_limit'); assert.equal(checks, 30);
  time = 10_000; assert.equal(await s.send(), undefined);
});
test('falha de autenticação não deixa evento passar', async () => {
  const s = socket(async () => { throw new Error('database unavailable'); });
  assert.equal((await s.send())?.message, 'authentication_error'); assert(s.disconnected());
});
test('erros HTTP não expõem SQL nem detalhes internos', () => {
  for (const [error, expected] of [[{ message: 'password_hash SQL secret' }, 500], [{ type: 'entity.parse.failed' }, 400], [{ type: 'entity.too.large' }, 413]] as const) {
    let status = 0, response = '';
    safeErrorHandler(error, {} as never, { status(code: number) { status = code; return this; }, json(body: unknown) { response = JSON.stringify(body); } } as never, () => {});
    assert.equal(status, expected); assert(!/SQL|secret|password_hash/.test(response));
  }
});
