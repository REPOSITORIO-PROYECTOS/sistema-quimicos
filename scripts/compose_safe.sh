#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="$ROOT_DIR/scripts/backup_mysql.sh"

if [[ $# -eq 0 ]]; then
  echo "Uso: $0 <comando docker-compose>"
  echo "Ejemplo: $0 up -d --build"
  echo "Ejemplo: $0 down"
  echo "Ejemplo: ALLOW_VOLUME_DELETE=YES_I_KNOW $0 down -v"
  exit 1
fi

cd "$ROOT_DIR"

CMD=("$@")
CMD_STR=" ${CMD[*]} "

# Siempre respalda antes de bajar/recrear servicios.
if [[ "$CMD_STR" == *" down "* ]] || [[ "$CMD_STR" == *" up "*" --build "* ]]; then
  echo "[safe] Ejecutando backup preventivo..."
  "$BACKUP_SCRIPT"
fi

# Bloqueo de down -v sin confirmacion explicita.
if [[ "$CMD_STR" == *" down "* ]] && [[ "$CMD_STR" == *" -v "* ]]; then
  if [[ "${ALLOW_VOLUME_DELETE:-}" != "YES_I_KNOW" ]]; then
    echo "[safe] ABORTADO: down -v puede borrar datos permanentes."
    echo "[safe] Si realmente lo necesitas: ALLOW_VOLUME_DELETE=YES_I_KNOW $0 ${CMD[*]}"
    exit 2
  fi
fi

echo "[safe] Ejecutando: docker-compose ${CMD[*]}"
docker-compose "${CMD[@]}"
