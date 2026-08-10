#!/usr/bin/env python3
"""Assemble capex-schema-only SQL from Supabase MCP execute_sql JSON exports."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HEADER = """\
-- CAPEX schema-only (no data) — generated from Supabase MCP catalog export
-- ponytail: fallback when pg_dump unreachable (IPv6-only Supabase, no DB password in env)
-- Prefer: SUPABASE_DB_PASSWORD=... ./export-capex-schema.sh

"""

EXTENSIONS = """\
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
"""


def load_rows(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8")
    m = re.search(r"<untrusted-data-[^>]+>\n(\[.*?\])\n</untrusted-data", raw, re.S)
    if not m:
        raise SystemExit(f"no JSON array in {path}")
    return json.loads(m.group(1))


def main() -> None:
    base = Path(__file__).parent / "artifacts" / "mcp"
    if len(sys.argv) > 1:
        base = Path(sys.argv[1])

    tables = load_rows(base / "tables.json")
    sequences = load_rows(base / "sequences.json")
    constraints = load_rows(base / "constraints.json")
    indexes = load_rows(base / "indexes.json")
    functions = load_rows(base / "functions.json")
    triggers = load_rows(base / "triggers.json")

    out = Path(__file__).parent / "artifacts" / "capex-schema-only-latest.sql"
    parts = [HEADER, "-- extensions\n", EXTENSIONS, "\n-- sequences\n"]
    parts.extend(row["ddl"] + "\n" for row in sequences)
    parts.append("\n-- tables\n")
    parts.extend(row["ddl"] + "\n" for row in tables)
    parts.append("\n-- constraints\n")
    parts.extend(row["ddl"] + "\n" for row in constraints)

    pkey_names = {row["ddl"].split(" CONSTRAINT ")[1].split(" ")[0] for row in constraints if " PRIMARY KEY" in row["ddl"]}
    unique_from_constraints = {
        row["ddl"].split(" CONSTRAINT ")[1].split(" ")[0]
        for row in constraints
        if " UNIQUE " in row["ddl"]
    }
    skip_indexes = pkey_names | unique_from_constraints

    parts.append("\n-- indexes (non-constraint duplicates skipped)\n")
    for row in indexes:
        name = row["ddl"].split(" INDEX ")[1].split(" ON ")[0]
        if name in skip_indexes:
            continue
        parts.append(row["ddl"] + "\n")

    parts.append("\n-- functions\n")
    for row in functions:
        parts.append(row["ddl"].rstrip() + ";\n")

    parts.append("\n-- triggers (power automate trigger omitted — needs pg_net on VM)\n")
    for row in triggers:
        if "send_asset_to_power_automate" in row["ddl"]:
            parts.append("-- SKIPPED: " + row["ddl"] + "\n")
            continue
        parts.append(row["ddl"] + "\n")

    out.write_text("".join(parts), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
