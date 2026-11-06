import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
function fixture(change) {
  const dir = mkdtempSync(resolve(tmpdir(), 'kd-config-test-'));
  const app = resolve(dir, 'artifacts/kd-taxi');
  mkdirSync(resolve(dir, 'scripts'), { recursive: true });
  mkdirSync(app, { recursive: true });
  cpSync(resolve(root, 'scripts/check-mobile-config.mjs'), resolve(dir, 'scripts/check-mobile-config.mjs'));
  for (const file of ['app.json', 'eas.json', 'package.json', 'google-services.json', 'assets/sounds']) cpSync(resolve(root, 'artifacts/kd-taxi', file), resolve(app, file), { recursive: true });
  const edit = (file, fn) => { const p = resolve(app, file); const value = JSON.parse(readFileSync(p)); fn(value); writeFileSync(p, JSON.stringify(value)); };
  try { change?.(edit, app); return () => { try { return execFileSync(process.execPath, [resolve(dir, 'scripts/check-mobile-config.mjs')], { stdio: 'pipe' }).toString(); } finally { rmSync(dir, { recursive: true, force: true }); } }; }
  catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
}
test('aceita a configuração unificada', () => assert.match(fixture()(), /conferidos/));
test('bloqueia projeto Expo antigo', () => assert.throws(fixture(edit => edit('app.json', o => o.expo.extra.eas.projectId = 'antigo')), /projeto Expo divergente/));
test('bloqueia SDK antigo', () => assert.throws(fixture(edit => edit('package.json', o => o.devDependencies.expo = '~57.0.24')), /Expo 58/));
test('bloqueia API divergente', () => assert.throws(fixture(edit => edit('eas.json', o => o.build.preview.env.EXPO_PUBLIC_DOMAIN = 'localhost')), /API divergente/));
test('bloqueia som ausente no arquivo enviado', () => assert.throws(fixture((edit, app) => unlinkSync(resolve(app, 'assets/sounds/chat_message.wav'))), /som ausente/));
