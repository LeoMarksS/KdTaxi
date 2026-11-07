import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { Server } from 'socket.io';
import { secureSocket, parseChatInput } from '../src/lib/socket-security';
const mobileRequire = createRequire(new URL('../../kd-taxi/package.json', import.meta.url));
const { io: connect } = mobileRequire('socket.io-client');

test('Socket.IO atualizado entrega chat autorizado e encerra conexão revogada', { timeout: 10_000 }, async () => {
  const http = createServer();
  const io = new Server(http, { path: '/api/socket.io', maxHttpBufferSize: 16 * 1024 });
  let valid = true, delivered = 0;
  io.on('connection', socket => {
    socket.data.user = { id: 'test-user' }; socket.data.sessionToken = 'test';
    socket.on('error', () => {});
    secureSocket(socket, async () => valid ? { id: 'test-user' } : undefined);
    socket.on('mensagem_chat', (input, ack) => { if (parseChatInput(input)) { delivered++; ack({ ok: true }); } });
  });
  http.listen(0, '127.0.0.1'); await new Promise<void>(resolve => http.once('listening', resolve));
  const address = http.address(); assert(address && typeof address !== 'string');
  const client = connect(`http://127.0.0.1:${address.port}`, { path: '/api/socket.io', transports: ['websocket'], reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    const ack = await client.emitWithAck('mensagem_chat', { rideId: 'test-ride', text: 'Teste local' });
    assert.deepEqual(ack, { ok: true }); assert.equal(delivered, 1);
    valid = false;
    const disconnected = new Promise<void>(resolve => client.once('disconnect', resolve));
    client.emit('mensagem_chat', { rideId: 'test-ride', text: 'Não pode entregar' });
    await disconnected; assert.equal(delivered, 1);
  } finally { client.disconnect(); await new Promise<void>(resolve => io.close(() => resolve())); }
});
