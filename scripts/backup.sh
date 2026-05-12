#!/bin/bash
# Backup the SQLite database.
# Usage: ./scripts/backup.sh [output-dir]
# Default output dir: ./backups

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DATA_DIR="$PROJECT_DIR/data"
OUTPUT_DIR="${1:-$PROJECT_DIR/backups}"

mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$OUTPUT_DIR/monitor_$TIMESTAMP.sqlite.gz"

DB_FILE="$DATA_DIR/monitor.sqlite"

if [ ! -f "$DB_FILE" ]; then
  echo "Error: Database file not found at $DB_FILE"
  exit 1
fi

sqlite3 "$DB_FILE" ".backup /dev/stdout" | gzip > "$BACKUP_FILE"

echo "Backup saved: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Keep only last 30 backups
find "$OUTPUT_DIR" -name "monitor_*.sqlite.gz" -type f | sort | head -n -30 | while read OLD; do
  rm "$OLD"
  echo "Removed old backup: $OLD"
done
