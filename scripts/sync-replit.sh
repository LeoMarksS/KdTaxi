#!/usr/bin/env bash
set -euo pipefail
[ -n "${REPL_ID:-}" ] || { echo 'Execute este sincronizador somente no Shell do Replit.'; exit 1; }
cd "$(git rev-parse --show-toplevel)"
git fetch origin main
kd_stamp=$(date +%Y%m%d-%H%M%S)
kd_backup="backups/antes-unificacao-$kd_stamp"
mkdir -p "$kd_backup"
git branch "backup/replit-$kd_stamp" HEAD
git diff --binary HEAD > "$kd_backup/alteracoes-locais.patch"
tar --exclude='./backups' --exclude='node_modules' --exclude='./.git' --exclude='./.cache' --exclude='./.config' --exclude='./.local' --exclude='.expo' --exclude='dist' --exclude='*.tsbuildinfo' -czf "$kd_backup/fontes.tar.gz" .
tar -tzf "$kd_backup/fontes.tar.gz" >/dev/null
if command -v sha256sum >/dev/null; then sha256sum "$kd_backup/fontes.tar.gz"; else shasum -a 256 "$kd_backup/fontes.tar.gz"; fi
# Preserve untracked files that would otherwise block checkout.
python3 - "$kd_backup" <<'PY'
from pathlib import Path
import subprocess, shutil, sys
backup=Path(sys.argv[1])/'arquivos-nao-versionados'
def paths(args): return set(x for x in subprocess.check_output(['git',*args]).decode().split('\0') if x)
untracked=paths(['ls-files','--others','--exclude-standard','-z'])
target=paths(['ls-tree','-r','--name-only','-z','origin/main'])
for name in sorted(untracked & target):
    src=Path(name); dst=backup/name
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(src,dst)
    if src.read_bytes()!=dst.read_bytes(): raise RuntimeError('Falha na cópia: '+name)
    src.unlink()
PY
git stash push -m "antes-unificacao-$kd_stamp"
git switch -C main origin/main
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/kd-taxi typecheck
pnpm --filter @workspace/api-server typecheck
node scripts/check-mobile-config.mjs
printf 'Replit sincronizado com a revisão oficial: '
git rev-parse --short HEAD
printf 'Cópia de segurança: %s\n' "$kd_backup"
printf 'Reinicie o workflow do aplicativo para carregar a revisão nova.\n'
