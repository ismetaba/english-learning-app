#!/bin/sh
# Warm OS file cache + SQLite page cache so the first user request is fast.
# Runs once at container start, before/alongside `next start`.

DB="${DATABASE_PATH:-/data/admin.db}"

if [ ! -f "$DB" ]; then
  echo "[warmup] DB not found at $DB — skipping"
  exit 0
fi

echo "[warmup] reading $DB into OS cache..."
# Read all pages into the OS file cache. Cheap and effective.
cat "$DB" > /dev/null

# Also touch the indexes that the hot endpoints depend on
if command -v sqlite3 >/dev/null 2>&1; then
  echo "[warmup] priming SQLite indexes..."
  sqlite3 "$DB" "
    SELECT COUNT(*) FROM word_timestamps WHERE starter_word_id IS NOT NULL;
    SELECT COUNT(*) FROM clip_vocab;
    SELECT COUNT(*) FROM subtitle_lines WHERE structure IS NOT NULL;
    SELECT COUNT(*) FROM videos WHERE poc=1;
  " >/dev/null
fi

echo "[warmup] done"
