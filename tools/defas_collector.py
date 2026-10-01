#!/usr/bin/env python3
"""DEFAS-AMINA Collector: historische Soll-/Ist-Beobachtungen als JSONL.

Einzelhalt:
  py tools/defas_collector.py --stop-id de:09661:5100 --line 3

Mehrere Seed-Haltestellen:
  py tools/defas_collector.py --stop-file data/defas/seed_stops.txt --line ""

Netzbetrieb aus produktivem Haltestellen-Suchindex:
  py tools/defas_collector.py --network --max-seeds 12 --max-trips 200

Der Collector archiviert Rohantworten und schreibt pro Lauf neue Beobachtungen.
Stabile Schluessel (trip_key, stop_event_key) erlauben die Zuordnung derselben
Fahrt/desselben Halts ueber mehrere Messzeitpunkte. observation_id ist je Messung
unterschiedlich. Doppelte Fahrten innerhalb desselben Laufs werden nur einmal
per TripStopTimes abgefragt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://bayfp.defas-fgi.de/AMINA"
SOURCE = "DEFAS_AMINA"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def safe_name(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in value).strip("_")


def sha_key(*parts: Any, length: int = 24) -> str:
    text = "|".join(str(x if x is not None else "") for x in parts)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]


def get_json(endpoint: str, params: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
    query = urlencode({k: str(v) for k, v in params.items() if v is not None})
    url = f"{BASE_URL}/{endpoint}?{query}"
    request = Request(url, headers={"User-Agent": "AMINA-OEPNV-Controlling/1.2"})
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def parse_iso(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def delay_seconds(planned: Any, estimated: Any) -> int | None:
    p = parse_iso(planned)
    e = parse_iso(estimated)
    if p is None or e is None:
        return None
    return round((e - p).total_seconds())


def first_value(obj: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = obj.get(key)
        if value not in (None, ""):
            return value
    return None


def stop_location(stop: dict[str, Any]) -> dict[str, Any]:
    for key in ("location", "stopPoint", "stop"):
        value = stop.get(key)
        if isinstance(value, dict):
            return value
    return stop


def stop_name(stop: dict[str, Any]) -> str | None:
    loc = stop_location(stop)
    return first_value(loc, "name", "disassembledName") or first_value(stop, "name", "disassembledName")


def stop_id_value(stop: dict[str, Any]) -> str | None:
    loc = stop_location(stop)
    props = loc.get("properties") if isinstance(loc.get("properties"), dict) else {}
    parent = loc.get("parent") if isinstance(loc.get("parent"), dict) else {}
    return first_value(loc, "id") or first_value(parent, "id") or first_value(props, "stopId") or first_value(stop, "id")


def extract_sequence(payload: dict[str, Any]) -> list[dict[str, Any]]:
    leg = payload.get("leg")
    if isinstance(leg, dict) and isinstance(leg.get("stopSequence"), list):
        return leg["stopSequence"]
    for candidate in payload.get("legs", []) if isinstance(payload.get("legs"), list) else []:
        if isinstance(candidate, dict) and isinstance(candidate.get("stopSequence"), list):
            return candidate["stopSequence"]
    return []


def event_matches(
    event: dict[str, Any],
    line_display: str | None,
    line_prefix: str,
    vab_only: bool = True,
) -> bool:
    transport = event.get("transportation") or {}
    tprops = transport.get("properties") or {}
    technical_id = str(transport.get("id") or "")
    global_id = str(tprops.get("globalId") or "")
    if vab_only and not global_id.startswith("de:vab:"):
        return False
    if line_prefix and not technical_id.startswith(line_prefix):
        return False
    if line_display:
        values = {
            str(transport.get("number") or ""),
            str(transport.get("disassembledName") or ""),
            str(transport.get("name") or ""),
        }
        if line_display not in values and f"Bus {line_display}" not in values:
            return False
    return True


def trip_request_from_event(event: dict[str, Any]) -> dict[str, Any] | None:
    transport = event.get("transportation") or {}
    tprops = transport.get("properties") or {}
    location = event.get("location") or {}
    lprops = location.get("properties") or {}
    line_id = transport.get("id")
    trip_code = tprops.get("tripCode")
    internal_stop_id = lprops.get("stopId") or location.get("id")
    departure = first_value(event, "departureTimePlanned", "departureTimeBaseTimetable", "departureTimeEstimated")
    dt = parse_iso(departure)
    if line_id in (None, "") or trip_code in (None, "") or not internal_stop_id or dt is None:
        return None
    return {
        "commonMacro": "tripstoptimes",
        "outputFormat": "rapidJSON",
        "line": line_id,
        "stopID": internal_stop_id,
        "tripCode": trip_code,
        "date": dt.strftime("%Y%m%d"),
        "time": dt.strftime("%H%M"),
        "tStOTType": "ALL",
        "useRealtime": "1",
    }


def event_identity(event: dict[str, Any]) -> tuple[str, str, str, str]:
    transport = event.get("transportation") or {}
    tprops = transport.get("properties") or {}
    eprops = event.get("properties") or {}
    departure = first_value(event, "departureTimePlanned", "departureTimeBaseTimetable", "departureTimeEstimated")
    dt = parse_iso(departure)
    operating_day = dt.date().isoformat() if dt else ""
    return (
        operating_day,
        str(transport.get("id") or ""),
        str(tprops.get("tripCode") or ""),
        str(eprops.get("AVMSTripID") or ""),
    )


def normalize_trip(event: dict[str, Any], trip_payload: dict[str, Any], observed_at: str, raw_file: str) -> list[dict[str, Any]]:
    transport = event.get("transportation") or {}
    tprops = transport.get("properties") or {}
    eprops = event.get("properties") or {}
    destination = transport.get("destination") or {}
    status = event.get("realtimeStatus") or []
    sequence = extract_sequence(trip_payload)
    operating_dt = parse_iso(first_value(event, "departureTimePlanned", "departureTimeBaseTimetable"))
    operating_day = operating_dt.date().isoformat() if operating_dt else None
    trip_key = sha_key(SOURCE, operating_day, transport.get("id"), tprops.get("tripCode"), eprops.get("AVMSTripID"))

    rows: list[dict[str, Any]] = []
    for index, stop in enumerate(sequence, start=1):
        planned_arrival = first_value(stop, "arrivalTimePlanned", "arrivalTimeBaseTimetable")
        estimated_arrival = first_value(stop, "arrivalTimeEstimated", "arrivalTimeActual")
        planned_departure = first_value(stop, "departureTimePlanned", "departureTimeBaseTimetable")
        estimated_departure = first_value(stop, "departureTimeEstimated", "departureTimeActual")
        sid = stop_id_value(stop)
        stop_event_key = sha_key(trip_key, sid, index)
        observation_id = sha_key(stop_event_key, observed_at)

        rows.append({
            "observation_id": observation_id,
            "trip_key": trip_key,
            "stop_event_key": stop_event_key,
            "observed_at": observed_at,
            "source": SOURCE,
            "operating_day": operating_day,
            "line_display": transport.get("disassembledName") or transport.get("number"),
            "line_id": transport.get("id"),
            "line_global_id": tprops.get("globalId"),
            "direction": transport.get("description"),
            "destination": destination.get("name"),
            "trip_code": tprops.get("tripCode"),
            "avms_trip_id": eprops.get("AVMSTripID"),
            "stop_id": sid,
            "stop_name": stop_name(stop),
            "stop_sequence": index,
            "planned_arrival": planned_arrival,
            "estimated_arrival": estimated_arrival,
            "planned_departure": planned_departure,
            "estimated_departure": estimated_departure,
            "delay_arrival_seconds": delay_seconds(planned_arrival, estimated_arrival),
            "delay_departure_seconds": delay_seconds(planned_departure, estimated_departure),
            "realtime_controlled": event.get("isRealtimeControlled"),
            "status": status,
            "raw_file": raw_file.replace("\\", "/"),
        })
    return rows


def load_stop_ids(cli_ids: list[str] | None, stop_file: str | None) -> list[str]:
    values: list[str] = []
    for value in cli_ids or []:
        value = value.strip()
        if value:
            values.append(value)
    if stop_file:
        path = Path(stop_file)
        text = path.read_text(encoding="utf-8-sig")
        if path.suffix.lower() == ".json":
            payload = json.loads(text)
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, str):
                        values.append(item.strip())
                    elif isinstance(item, dict) and item.get("id"):
                        values.append(str(item["id"]).strip())
            elif isinstance(payload, dict):
                for item in payload.get("stops", []):
                    if isinstance(item, str):
                        values.append(item.strip())
                    elif isinstance(item, dict) and item.get("id"):
                        values.append(str(item["id"]).strip())
        else:
            for line in text.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    values.append(line.split(";", 1)[0].strip())
    if not values:
        values = ["de:09661:5100"]
    return list(dict.fromkeys(values))



def load_search_index(path: str) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    stops = payload.get("stops", []) if isinstance(payload, dict) else []
    return [s for s in stops if isinstance(s, dict) and s.get("id")]


def plan_network_seeds(stops: list[dict[str, Any]], max_seeds: int) -> tuple[list[str], list[str], list[str]]:
    # Greedy Set Cover: wenige Seed-Haltestellen sollen moeglichst viele
    # produktive VAB-Linien aus dem bestehenden Suchindex abdecken.
    universe: set[str] = set()
    stop_lines: list[tuple[str, set[str]]] = []
    for stop in stops:
        lines = {str(x).strip() for x in (stop.get("lines") or []) if str(x).strip()}
        if not lines:
            continue
        universe.update(lines)
        stop_lines.append((str(stop["id"]), lines))

    uncovered = set(universe)
    selected: list[str] = []
    while uncovered and len(selected) < max(max_seeds, 0):
        best_id = None
        best_cover: set[str] = set()
        for stop_id, lines in stop_lines:
            if stop_id in selected:
                continue
            cover = lines & uncovered
            if len(cover) > len(best_cover):
                best_id = stop_id
                best_cover = cover
        if not best_id or not best_cover:
            break
        selected.append(best_id)
        uncovered -= best_cover

    covered = sorted(universe - uncovered)
    return selected, covered, sorted(uncovered)


def main() -> int:
    parser = argparse.ArgumentParser(description="DEFAS-AMINA Collector fuer historische Soll-/Ist-Beobachtungen")
    parser.add_argument("--stop-id", action="append", dest="stop_ids", help="Globale Haltestellen-ID; mehrfach moeglich")
    parser.add_argument("--stop-file", help="TXT/CSV-artige Liste oder JSON mit Seed-Haltestellen")
    parser.add_argument("--line", default="", help="Linienanzeige, z. B. 3; leer = alle VAB-Linien")
    parser.add_argument("--line-prefix", default="", help="Optionaler technischer Linienpraefix, z. B. abs:; leer = kein Praefixfilter")
    parser.add_argument("--all-networks", action="store_true", help="Nicht auf globalId de:vab:* begrenzen")
    parser.add_argument("--network", action="store_true", help="Seed-Haltestellen automatisch aus dem produktiven Suchindex planen")
    parser.add_argument("--search-index", default="data/haltestellen_suchindex.json", help="Produktiver Haltestellen-Suchindex")
    parser.add_argument("--max-seeds", type=int, default=12, help="Maximale automatisch geplante Seed-Haltestellen im Netzbetrieb")
    parser.add_argument("--limit", type=int, default=100, help="Maximale Zahl DM-Ereignisse je Seed-Haltestelle")
    parser.add_argument("--max-trips", type=int, default=50, help="Maximale eindeutige TripStopTimes-Aufrufe je Lauf")
    parser.add_argument("--pause", type=float, default=0.15, help="Pause zwischen DEFAS-Aufrufen in Sekunden")
    parser.add_argument("--data-dir", default="data/defas", help="Zielverzeichnis")
    args = parser.parse_args()

    started = utc_now()
    observed_at = started.isoformat().replace("+00:00", "Z")
    stamp = started.strftime("%H%M%S")
    day = started.date().isoformat()
    data_dir = Path(args.data_dir)
    raw_dir = data_dir / "raw" / day
    planned_lines: list[str] = []
    uncovered_lines: list[str] = []
    if args.network:
        index_stops = load_search_index(args.search_index)
        stop_ids, planned_lines, uncovered_lines = plan_network_seeds(index_stops, args.max_seeds)
        # Explizite Seeds zusaetzlich zulassen.
        extra_ids = load_stop_ids(args.stop_ids, args.stop_file) if (args.stop_ids or args.stop_file) else []
        stop_ids = list(dict.fromkeys(stop_ids + extra_ids))
    else:
        stop_ids = load_stop_ids(args.stop_ids, args.stop_file)

    all_rows: list[dict[str, Any]] = []
    seen_trips: set[tuple[str, str, str, str]] = set()
    dm_events_total = 0
    selected_events_total = 0
    imported_trips = 0
    dm_files: list[str] = []
    errors: list[dict[str, str]] = []

    for seed_stop_id in stop_ids:
        dm_params = {
            "outputFormat": "rapidJSON",
            "type_dm": "stop",
            "name_dm": seed_stop_id,
            "mode": "direct",
            "useRealtime": "1",
            "limit": args.limit,
            "locationServerActive": "1",
        }
        try:
            dm = get_json("XML_DM_REQUEST", dm_params)
        except Exception as exc:
            errors.append({"stage": "DM", "stop_id": seed_stop_id, "error": str(exc)})
            continue

        dm_path = raw_dir / f"{stamp}_dm_{safe_name(seed_stop_id)}.json"
        write_json(dm_path, dm)
        dm_files.append(str(dm_path).replace("\\", "/"))
        events = dm.get("stopEvents") if isinstance(dm.get("stopEvents"), list) else []
        dm_events_total += len(events)

        for event in events:
            if not isinstance(event, dict) or not event_matches(event, args.line or None, args.line_prefix, not args.all_networks):
                continue
            selected_events_total += 1
            identity = event_identity(event)
            if identity in seen_trips:
                continue
            if imported_trips >= max(args.max_trips, 0):
                continue
            trip_params = trip_request_from_event(event)
            if not trip_params:
                continue
            seen_trips.add(identity)
            try:
                trip = get_json("XML_TRIPSTOPTIMES_REQUEST", trip_params)
                if args.pause > 0:
                    time.sleep(args.pause)
            except Exception as exc:
                errors.append({"stage": "TripStopTimes", "trip": "|".join(identity), "error": str(exc)})
                continue

            trip_name = f"{stamp}_trip_{safe_name(str(trip_params['line']))}_{trip_params['tripCode']}.json"
            trip_path = raw_dir / trip_name
            write_json(trip_path, trip)
            rows = normalize_trip(event, trip, observed_at, str(trip_path))
            if rows:
                all_rows.extend(rows)
                imported_trips += 1

    normalized_path = data_dir / "normalized" / "realtime_observations.jsonl"
    append_jsonl(normalized_path, all_rows)

    run_log = {
        "observed_at": observed_at,
        "source": SOURCE,
        "seed_stops": stop_ids,
        "seed_stop_count": len(stop_ids),
        "line": args.line,
        "line_prefix": args.line_prefix,
        "vab_only": not args.all_networks,
        "network_mode": args.network,
        "planned_line_count": len(planned_lines),
        "planned_lines": planned_lines,
        "uncovered_lines": uncovered_lines,
        "dm_events": dm_events_total,
        "selected_events": selected_events_total,
        "unique_trips_seen": len(seen_trips),
        "imported_trips": imported_trips,
        "normalized_rows": len(all_rows),
        "errors": errors,
        "dm_raw_files": dm_files,
        "normalized_file": str(normalized_path).replace("\\", "/"),
    }
    write_json(data_dir / "last_run.json", run_log)
    append_jsonl(data_dir / "run_history.jsonl", [run_log])
    print(json.dumps(run_log, ensure_ascii=False, indent=2))

    if imported_trips == 0:
        print("Keine TripStopTimes-Daten normalisiert.", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


