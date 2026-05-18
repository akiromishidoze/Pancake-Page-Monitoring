#!/bin/bash
# Backup the PostgreSQL database via pg_dump.
# Usage: ./scripts/backup.sh [output-dir]
# Default output dir: ./backups
# Reads DATABASE_URL from environment or .env.local

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

OUTPUT_DIR="${1:-$PROJECT_DIR/backups}"

if [ -z "$DATABASE_URL" ] && [ -f "$PROJECT_DIR/.env.local" ]; then
  source "$PROJECT_DIR/.env.local"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set and not found in .env.local"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$OUTPUT_DIR/monitor_$TIMESTAMP.sql.gz"

pg_dump --dbname="$DATABASE_URL" --no-owner --no-acl | gzip > "$BACKUP_FILE"

echo "Backup saved: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 30 backups
find "$OUTPUT_DIR" -name "monitor_*.sql.gz" -type f | sort | head -n -30 | while read OLD; do
  rm "$OLD"
  echo "Removed old backup: $OLD"
done
