import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.NODE_ENV = 'production';
const { default: app } = await import('../src/app');

test('API real bloqueia acesso anônimo e entradas malformadas sem consultar o banco', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    for (const path of ['/users', '/admin/stats', '/admin/finance', '/users/another-user', '/rides', '/rides/another-ride/chat', '/pricing']) {
      const res = await fetch(base + path, { headers: { Authorization: 'Bearer malformed' } });
      assert([401, 403].includes(res.status), path);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-powered-by'), null);
    }
    for (const [method, path] of [['POST', '/admin/reset-test-data'], ['PUT','/admin/finance/settings'], ['POST','/admin/finance/settlements'], ['POST','/admin/finance/settlements/00000000-0000-4000-8000-000000000001/void'], ['DELETE', '/admin/users/another-user'], ['DELETE', '/admin/rides'], ['POST', '/accept-ride'], ['POST', '/start-ride'], ['POST', '/finish-ride'], ['POST', '/cancel-ride'], ['PUT', '/users/another-user/vehicle'], ['POST', '/pricing']]) {
      const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert([401, 403].includes(res.status), `${method} ${path}`);
    }
    const invalid = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400); assert.deepEqual(await invalid.json(), { error: 'JSON inválido.' });
    const object = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: {}, password: 'test-password' }) });
    assert.equal(object.status, 400);
    const admin = await fetch(base + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: 'test-only', name: 'test', password: 'test-password', mode: 'admin' }) });
    assert.equal(admin.status, 400);
    const health = await fetch(base + '/healthz'); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
