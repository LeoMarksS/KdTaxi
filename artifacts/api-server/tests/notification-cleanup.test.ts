import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearSystemNotifications } from '../../kd-taxi/lib/notification-cleanup';
test('limpa alertas entregues antes de zerar contador do launcher', async () => {
 const calls: (string | number)[]=[];
 await clearSystemNotifications({dismissAllNotificationsAsync:async()=>{calls.push('dismiss');},setBadgeCountAsync:async n=>{calls.push(n);return true;}});
 assert.deepEqual(calls,['dismiss',0]);
});
test('a falha na bandeja não impede limpar o número do ícone', async () => {
 let count: number | null=null;
 await clearSystemNotifications({dismissAllNotificationsAsync:async()=>{throw new Error('unsupported');},setBadgeCountAsync:async n=>{count=n;return true;}});
 assert.equal(count,0);
});
test('launcher sem suporte ao contador não interrompe o aplicativo',async()=>{
 await assert.doesNotReject(clearSystemNotifications({dismissAllNotificationsAsync:async()=>{},setBadgeCountAsync:async()=>{throw new Error('unsupported');}}));
});
