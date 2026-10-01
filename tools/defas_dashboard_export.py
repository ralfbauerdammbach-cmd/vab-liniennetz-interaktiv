#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any

INPUT = Path("data/defas/normalized/realtime_observations.jsonl")
OUTPUT = Path("dashboard/realtime-summary.json")
IGNORED_LINES = {"40N"}

def read_rows(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                row = json.loads(text)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"Ungueltiges JSON in {path}, Zeile {number}: {exc}") from exc
            if isinstance(row, dict):
                rows.append(row)
    return rows

def delay_value(row: dict[str, Any]) -> int | None:
    for key in ("delay_departure_seconds", "delay_arrival_seconds"):
        value = row.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None

def main() -> int:
    if not INPUT.exists():
        raise SystemExit(f"DEFAS-Datei nicht gefunden: {INPUT}")

    rows = read_rows(INPUT)
    if not rows:
        raise SystemExit("Keine DEFAS-Beobachtungen vorhanden.")

    latest = max(str(row.get("observed_at") or "") for row in rows)
    snapshot = [
        row for row in rows
        if str(row.get("observed_at") or "") == latest
        and str(row.get("line_display") or "").strip() not in IGNORED_LINES
    ]

    if not snapshot:
        raise SystemExit("Im neuesten DEFAS-Lauf sind keine auswertbaren Daten vorhanden.")

    trip_keys = {str(row.get("trip_key")) for row in snapshot if row.get("trip_key")}
    lines = {str(row.get("line_display")).strip() for row in snapshot if row.get("line_display")}
    stops = {str(row.get("stop_id")).strip() for row in snapshot if row.get("stop_id")}
    controlled_trips = {
        str(row.get("trip_key"))
        for row in snapshot
        if row.get("trip_key") and row.get("realtime_controlled") is True
    }

    delays = [v for row in snapshot if (v := delay_value(row)) is not None]

    line_stats = defaultdict(lambda: {"trip_keys": set(), "rows": 0, "delays": []})
    for row in snapshot:
        line = str(row.get("line_display") or "").strip()
        if not line:
            continue
        item = line_stats[line]
        if row.get("trip_key"):
            item["trip_keys"].add(str(row["trip_key"]))
        item["rows"] += 1
        value = delay_value(row)
        if value is not None:
            item["delays"].append(value)

    lines_out = []
    for line, item in line_stats.items():
        values = item["delays"]
        lines_out.append({
            "line": line,
            "trips": len(item["trip_keys"]),
            "observations": item["rows"],
            "median_delay_seconds": round(median(values)) if values else None,
            "delayed_over_5min": sum(1 for value in values if value > 300),
        })

    lines_out.sort(key=lambda x: (-x["delayed_over_5min"], -x["trips"], str(x["line"])))

    payload = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "snapshot_observed_at": latest,
        "ignored_lines": sorted(IGNORED_LINES),
        "trips": len(trip_keys),
        "lines": len(lines),
        "stops": len(stops),
        "observations": len(snapshot),
        "realtime_controlled_trips": len(controlled_trips),
        "delay_observations": len(delays),
        "median_delay_seconds": round(median(delays)) if delays else None,
        "delayed_over_5min": sum(1 for value in delays if value > 300),
        "early_over_1min": sum(1 for value in delays if value < -60),
        "line_stats": lines_out,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\nDashboard-Datei geschrieben: {OUTPUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
