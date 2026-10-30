#!/bin/bash
# Creates Trag's tables in the `trag` and `trag_test` databases on first start, by applying the
# Drizzle migrations in api/drizzle (mounted at /migrations) as the `trag` role. Each one is
# recorded in drizzle.__drizzle_migrations the way Drizzle's migrator does (sha256 of the file,
# created_at = the journal's "when"), so the API skips them on startup.
set -euo pipefail

JOURNAL=/migrations/meta/_journal.json

for db in trag trag_test; do
  psql -v ON_ERROR_STOP=1 -U trag -d "$db" -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
SQL
  # Journal entries in order: pair each "when" with its "tag".
  paste -d ' ' \
    <(grep -o '"when": *[0-9]*' "$JOURNAL" | grep -o '[0-9]*$') \
    <(grep -o '"tag": *"[^"]*"' "$JOURNAL" | sed 's/.*"\([^"]*\)"$/\1/') |
    while read -r when tag; do
      file="/migrations/$tag.sql"
      hash=$(sha256sum "$file" | cut -d ' ' -f 1)
      echo "[$db] applying $tag"
      psql -v ON_ERROR_STOP=1 -U trag -d "$db" -q -1 \
        -f "$file" \
        -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', $when)"
    done
done
