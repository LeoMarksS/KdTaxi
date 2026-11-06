import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
test('sincronização preserva alterações locais e arquivo não versionado conflitante', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'kd-sync-test-'));
  const seed = resolve(dir, 'seed'), remote = resolve(dir, 'remote.git'), client = resolve(dir, 'client'), bin = resolve(dir, 'bin');
  const run = (cmd, args, cwd = seed, env = {}) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } }).trim();
  const git = (...args) => run('git', args);
  try {
    mkdirSync(seed); mkdirSync(bin);
    git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
    writeFileSync(resolve(seed, '.gitignore'), 'backups/\n'); writeFileSync(resolve(seed, 'app.txt'), 'base\n');
    git('add', '.'); git('commit', '-m', 'base'); const base = git('rev-parse', 'HEAD');
    mkdirSync(resolve(seed, 'scripts')); writeFileSync(resolve(seed, 'scripts/check-mobile-config.mjs'), 'console.log("config ok")');
    writeFileSync(resolve(seed, 'app.txt'), 'oficial\n'); writeFileSync(resolve(seed, 'config.txt'), 'oficial\n');
    git('add', '.'); git('commit', '-m', 'oficial'); const official = git('rev-parse', 'HEAD');
    run('git', ['clone', '--bare', seed, remote], dir);
    run('git', ['clone', remote, client], dir);
    run('git', ['config', 'user.email', 'test@example.invalid'], client); run('git', ['config', 'user.name', 'Test'], client);
    run('git', ['switch', '-c', 'anterior', base], client);
    writeFileSync(resolve(client, 'app.txt'), 'alteração local preservada\n'); writeFileSync(resolve(client, 'config.txt'), 'configuração local preservada\n');
    writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nif [ "$1" = install ] && [ "${CI:-}" != true ]; then exit 64; fi\nexit 0\n', { mode: 0o755 });
    run('bash', [resolve(import.meta.dirname, 'sync-replit.sh')], client, { REPL_ID: 'test', PATH: bin + ':' + process.env.PATH });
    assert.equal(run('git', ['rev-parse', 'HEAD'], client), official);
    assert.equal(readFileSync(resolve(client, 'app.txt'), 'utf8'), 'oficial\n');
    assert.match(run('git', ['stash', 'show', '-p'], client), /alteração local preservada/);
    const backup = resolve(client, 'backups', readdirSync(resolve(client, 'backups'))[0]);
    assert.equal(readFileSync(resolve(backup, 'arquivos-nao-versionados/config.txt'), 'utf8'), 'configuração local preservada\n');
    assert.match(run('tar', ['-tzf', resolve(backup, 'fontes.tar.gz')], client), /app.txt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
