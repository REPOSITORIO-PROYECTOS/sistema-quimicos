#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-quimex-db}"
DB_NAME="${DB_NAME:-quimex_db}"
DB_ROOT_USER="${DB_ROOT_USER:-root}"
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-root}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_SQL="$BACKUP_DIR/backup_${DB_NAME}_${TS}.sql"
OUT_GZ="$OUT_SQL.gz"

cd "$ROOT_DIR"

echo "[backup] Generando dump de $DB_NAME en $OUT_SQL"
docker-compose exec -T "$DB_CONTAINER" \
  mysqldump -u"$DB_ROOT_USER" -p"$DB_ROOT_PASSWORD" \
  --single-transaction --routines --triggers "$DB_NAME" > "$OUT_SQL"

# Validaciones basicas del archivo.
if ! grep -q "CREATE TABLE .*ventas" "$OUT_SQL"; then
  echo "[backup] ERROR: El dump no contiene CREATE TABLE de ventas." >&2
  exit 1
fi

SQL_SIZE="$(du -h "$OUT_SQL" | awk '{print $1}')"
INSERT_COUNT="$(grep -c '^INSERT INTO' "$OUT_SQL" || true)"

gzip -f "$OUT_SQL"
GZ_SIZE="$(du -h "$OUT_GZ" | awk '{print $1}')"

echo "[backup] OK: $OUT_GZ"
echo "[backup] Tamaño SQL: $SQL_SIZE | Tamaño comprimido: $GZ_SIZE | INSERTs: $INSERT_COUNT"

# Retencion automatica.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "backup_${DB_NAME}_*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete || true
