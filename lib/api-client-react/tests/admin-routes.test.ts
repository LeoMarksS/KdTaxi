import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAdminUser, updateDriverVehicle, decideDriverApproval } from '../src/generated/api';
import { setBaseUrl, setAuthTokenGetter, ApiError } from '../src/custom-fetch';

test('cliente usa os endereços distintos de exclusão, veículo e aprovação', async () => {
  const original = globalThis.fetch;
  const seen: Array<[string, string]> = [];
  setBaseUrl('https://api.example.invalid');
  setAuthTokenGetter(() => 'token-de-teste');
  globalThis.fetch = async (input, init) => {
    seen.push([String(input), init?.method ?? 'GET']);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-de-teste');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await deleteAdminUser('test-user');
    await updateDriverVehicle('test-user', { vehicleType: 'car', vehicleBrand: 'Teste', vehicleModel: 'Teste', vehicleColor: 'Branco', vehiclePlate: 'ABC1D23' });
    await decideDriverApproval('test-user', { status: 'approved' });
    assert.deepEqual(seen, [
      ['https://api.example.invalid/api/admin/users/test-user', 'DELETE'],
      ['https://api.example.invalid/api/users/test-user/vehicle', 'PUT'],
      ['https://api.example.invalid/api/admin/drivers/test-user/approval', 'POST'],
    ]);
  } finally { globalThis.fetch = original; setBaseUrl(null); setAuthTokenGetter(null); }
});

test('exclusão preserva a mensagem do servidor para conta com corrida ativa', async () => {
  const original = globalThis.fetch;
  setBaseUrl('https://api.example.invalid');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Finalize ou cancele as corridas ativas desta conta antes de excluí-la.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  try {
    await assert.rejects(deleteAdminUser('test-user'), (error: unknown) => error instanceof ApiError && error.status === 409 && (error.data as { error?: string })?.error?.startsWith('Finalize ou cancele') === true);
  } finally { globalThis.fetch = original; setBaseUrl(null); }
});
