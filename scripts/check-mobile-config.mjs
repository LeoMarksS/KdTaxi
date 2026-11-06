import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(root, 'artifacts/kd-taxi');
const read = (p) => JSON.parse(readFileSync(resolve(app, p), 'utf8'));
const config = read('app.json').expo;
const eas = read('eas.json');
const firebase = read('google-services.json');
const pkg = read('package.json');
const fail = (message) => { throw new Error(`Compilação bloqueada: ${message}`); };
if (config.extra.eas.projectId !== '5fb3cb5d-d1c2-4bf7-b2a7-aef44055f44a') fail('projeto Expo divergente');
if (config.android.package !== 'com.kdtaxi.app' || config.android.googleServicesFile !== './google-services.json') fail('configuração Android divergente');
if (firebase.project_info.project_id !== 'kd-taxi-9c295' || !firebase.client.some(c => c.client_info.android_client_info.package_name === config.android.package)) fail('Firebase divergente');
if (pkg.devDependencies.expo !== '~58.0.22') fail('a base aprovada usa Expo 58.0.22');
for (const profile of ['preview', 'production']) if (eas.build[profile].env.EXPO_PUBLIC_DOMAIN !== 'api.kdtaxi.com.br') fail('API divergente');
if (!pkg.scripts.dev.includes('EXPO_PUBLIC_DOMAIN=api.kdtaxi.com.br')) fail('API do preview divergente');
const sounds = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-notifications')?.[1]?.sounds ?? [];
for (const sound of ['ride_alert.wav', 'chat_message.wav']) {
  if (!sounds.some(p => p.endsWith('/' + sound)) || !existsSync(resolve(app, 'assets/sounds', sound))) fail(`som ausente: ${sound}`);
}
console.log('Projeto Expo, API, Firebase e sons conferidos.');
