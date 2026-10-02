from __future__ import annotations

import base64
import json
import mimetypes
import os
import shutil
import sys
import uuid
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
DATA = ROOT / "data"
STAMMDATEN = DATA / "stammdaten.json"
TMP = DATA / "import_tmp"

sys.path.insert(0, str(TOOLS))
from import_engine import analyze_file, commit_import, load_history
from contract_rules import bundle_for_line, load_contract_rules  # noqa: E402

TMP.mkdir(parents=True, exist_ok=True)
(DATA / "imports").mkdir(parents=True, exist_ok=True)

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/json", ".json")



def build_itcs_controlling_summary(root: Path) -> dict:
    """
    Liest ausschließlich verbindlich importierte, Controlling-fähige ITCS-Bestände.
    Wiederholte Importe desselben VU/Bündel/Datenzeitraums werden nicht doppelt gezählt:
    je fachlichem Zeitraum wird nur der jüngste Import verwendet.
    """
    imports_root = root / "data" / "imports"
    if not imports_root.exists():
        return {
            "ok": True,
            "available": False,
            "imports": 0,
            "row_count": 0,
            "trip_count": 0,
            "lines": [],
            "date_range": {"from": None, "to": None},
            "operators": [],
            "bundles": [],
        }

    selected = {}

    for import_dir in imports_root.iterdir():
        if not import_dir.is_dir():
            continue

        metadata_path = import_dir / "metadata.json"
        normalized_path = import_dir / "normalized.ndjson"
        if not metadata_path.exists() or not normalized_path.exists():
            continue

        try:
            meta = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue

        if str(meta.get("data_type", "")).upper() != "ITCS":
            continue
        if not bool(meta.get("controlling_ready")):
            continue

        operator = meta.get("operator") or {}
        bundle = meta.get("bundle") or {}
        date_range = meta.get("date_range") or {}

        operator_key = str(operator.get("id") or operator.get("name") or "")
        bundle_key = str(bundle.get("id") or bundle.get("name") or "")
        range_from = str(date_range.get("from") or "")
        range_to = str(date_range.get("to") or "")
        key = (operator_key, bundle_key, range_from, range_to)

        import_id = str(meta.get("import_id") or import_dir.name)
        current = selected.get(key)
        if current is None or import_id > current["import_id"]:
            selected[key] = {
                "import_id": import_id,
                "meta": meta,
                "normalized_path": normalized_path,
            }

    if not selected:
        return {
            "ok": True,
            "available": False,
            "imports": 0,
            "row_count": 0,
            "trip_count": 0,
            "lines": [],
            "date_range": {"from": None, "to": None},
            "operators": [],
            "bundles": [],
        }

    row_count = 0
    trips = set()
    lines = set()
    operators = set()
    bundles = set()
    dates_from = []
    dates_to = []
    import_ids = []

    for item in selected.values():
        meta = item["meta"]
        import_ids.append(item["import_id"])

        operator = meta.get("operator") or {}
        bundle = meta.get("bundle") or {}
        if operator.get("name"):
            operators.add(str(operator["name"]))
        if bundle.get("name"):
            bundles.add(str(bundle["name"]))

        date_range = meta.get("date_range") or {}
        if date_range.get("from"):
            dates_from.append(str(date_range["from"]))
        if date_range.get("to"):
            dates_to.append(str(date_range["to"]))

        with item["normalized_path"].open("r", encoding="utf-8-sig") as handle:
            for raw in handle:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except Exception:
                    continue

                row_count += 1

                trip_id = str(obj.get("trip_id") or "").strip()
                service_date = str(obj.get("service_date") or "").strip()
                operator_name = str(operator.get("name") or "").strip()
                if trip_id:
                    # Fahrt-IDs können sich an verschiedenen Betriebstagen wiederholen.
                    trips.add((operator_name, service_date, trip_id))

                line = str(obj.get("line") or "").strip()
                if line:
                    lines.add(line)

    def line_sort_key(value):
        digits = "".join(ch for ch in value if ch.isdigit())
        return (int(digits) if digits else 10**9, value)

    return {
        "ok": True,
        "available": True,
        "imports": len(selected),
        "row_count": row_count,
        "trip_count": len(trips),
        "lines": sorted(lines, key=line_sort_key),
        "date_range": {
            "from": min(dates_from) if dates_from else None,
            "to": max(dates_to) if dates_to else None,
        },
        "operators": sorted(operators),
        "bundles": sorted(bundles),
        "latest_import_id": max(import_ids) if import_ids else None,
    }

def _parse_dt_value(value):
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _seconds_diff(actual, scheduled):
    a = _parse_dt_value(actual)
    s = _parse_dt_value(scheduled)
    if not a or not s:
        return None
    return (a - s).total_seconds()


def _percentile(values, p):
    if not values:
        return None
    vals = sorted(values)
    if len(vals) == 1:
        return vals[0]
    pos = (len(vals) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(vals) - 1)
    frac = pos - lo
    return vals[lo] * (1 - frac) + vals[hi] * frac


def _latest_itcs_imports(root):
    history_path = root / "data" / "import_history.json"
    if not history_path.exists():
        return []
    try:
        history = json.loads(history_path.read_text(encoding="utf-8-sig"))
    except Exception:
        return []
    if not isinstance(history, list):
        return []

    items = []
    seen_ids = set()
    for item in history:
        if str(item.get("data_type", "")).upper() != "ITCS":
            continue
        if not item.get("controlling_ready"):
            continue
        import_id = str(item.get("import_id", "") or "")
        if not import_id or import_id in seen_ids:
            continue
        seen_ids.add(import_id)
        items.append(item)
    return items


def _delay_penalty(delay_sec):
    if delay_sec is None:
        return 0
    minutes = delay_sec / 60.0
    if 5 <= minutes <= 10:
        return 10
    if 10 < minutes <= 15:
        return 20
    if 15 < minutes <= 20:
        return 40
    if 20 < minutes <= 25:
        return 60
    return 0


def _new_bundle_stats(bundle):
    return {
        "key": bundle.get("key", ""),
        "name": bundle.get("name", ""),
        "contract_rule_id": bundle.get("contract_rule_id", ""),
        "contract_lines": [str(v) for v in bundle.get("lines", [])],
        "rows": 0,
        "trips": {},
        "lines": {},
        "dates": [],
    }


def build_itcs_summary(root):
    imports = _latest_itcs_imports(root)
    if not imports:
        return {"ok": True, "available": False}

    config = load_contract_rules(root)
    bundle_stats = {
        b.get("key"): _new_bundle_stats(b)
        for b in config.get("bundles", [])
        if b.get("key")
    }
    unassigned_rows = 0

    for item in imports:
        import_id = item.get("import_id")
        ndjson = root / "data" / "imports" / str(import_id) / "normalized.ndjson"
        if not ndjson.exists():
            continue

        with ndjson.open("r", encoding="utf-8-sig") as f:
            for row_index, raw in enumerate(f):
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    row = json.loads(raw)
                except Exception:
                    continue

                line = str(row.get("line", "") or "").strip()
                bundle = bundle_for_line(root, line)
                if not bundle:
                    unassigned_rows += 1
                    continue

                b = bundle_stats[bundle["key"]]
                b["rows"] += 1

                service_date = str(row.get("service_date", "") or "").strip()
                if service_date:
                    b["dates"].append(service_date[:10])

                line_bucket = b["lines"].setdefault(line, {"rows": 0, "trip_keys": set()})
                line_bucket["rows"] += 1

                trip_key = (
                    service_date[:10],
                    line,
                    str(row.get("trip_id", "") or ""),
                    str(row.get("direction", "") or ""),
                )
                line_bucket["trip_keys"].add(trip_key)

                trip = b["trips"].setdefault(trip_key, {
                    "line": line,
                    "service_date": service_date[:10],
                    "trip_id": str(row.get("trip_id", "") or ""),
                    "direction": str(row.get("direction", "") or ""),
                    "early_departure": False,
                    "end_sort": None,
                    "end_stop_name": "",
                    "end_arrival_delay_sec": None,
                })

                dep_diff = _seconds_diff(row.get("actual_departure"), row.get("scheduled_departure"))
                if dep_diff is not None and dep_diff < 0:
                    trip["early_departure"] = True

                sched_end = _parse_dt_value(row.get("scheduled_arrival")) or _parse_dt_value(row.get("scheduled_departure"))
                if sched_end is not None:
                    sort_value = sched_end.timestamp()
                    if trip["end_sort"] is None or sort_value >= trip["end_sort"]:
                        trip["end_sort"] = sort_value
                        trip["end_stop_name"] = str(row.get("stop_name", "") or "")
                        trip["end_arrival_delay_sec"] = _seconds_diff(
                            row.get("actual_arrival"),
                            row.get("scheduled_arrival"),
                        )

    output = []
    overall_rows = 0
    overall_trips = 0

    for bundle in config.get("bundles", []):
        key = bundle.get("key")
        if key not in bundle_stats:
            continue
        b = bundle_stats[key]
        trips = list(b["trips"].values())

        end_evaluable = [t for t in trips if t["end_arrival_delay_sec"] is not None]
        early = [t for t in trips if t["early_departure"]]
        over25 = [t for t in trips if t["end_arrival_delay_sec"] is not None and t["end_arrival_delay_sec"] > 25 * 60]
        potential_failure_keys = {
            (t["service_date"], t["line"], t["trip_id"], t["direction"])
            for t in early + over25
        }

        penalty_counts = {"5_10": 0, "10_15": 0, "15_20": 0, "20_25": 0}
        theoretical_delay_penalty = 0
        under5 = 0
        for t in end_evaluable:
            sec = t["end_arrival_delay_sec"]
            minutes = sec / 60.0
            if minutes < 5:
                under5 += 1
            elif 5 <= minutes <= 10:
                penalty_counts["5_10"] += 1
            elif 10 < minutes <= 15:
                penalty_counts["10_15"] += 1
            elif 15 < minutes <= 20:
                penalty_counts["15_20"] += 1
            elif 20 < minutes <= 25:
                penalty_counts["20_25"] += 1
            theoretical_delay_penalty += _delay_penalty(sec)

        line_output = []
        for line, lb in b["lines"].items():
            line_trips = [t for t in trips if t["line"] == line]
            eval_trips = [t for t in line_trips if t["end_arrival_delay_sec"] is not None]
            line_output.append({
                "line": line,
                "rows": lb["rows"],
                "trips": len(lb["trip_keys"]),
                "end_arrival_evaluable": len(eval_trips),
                "early_departure_trips": sum(1 for t in line_trips if t["early_departure"]),
                "end_over_25_trips": sum(
                    1 for t in eval_trips if t["end_arrival_delay_sec"] > 25 * 60
                ),
                "delay_5_10": sum(1 for t in eval_trips if 5 <= t["end_arrival_delay_sec"] / 60.0 <= 10),
                "delay_10_15": sum(1 for t in eval_trips if 10 < t["end_arrival_delay_sec"] / 60.0 <= 15),
                "delay_15_20": sum(1 for t in eval_trips if 15 < t["end_arrival_delay_sec"] / 60.0 <= 20),
                "delay_20_25": sum(1 for t in eval_trips if 20 < t["end_arrival_delay_sec"] / 60.0 <= 25),
            })

        line_output.sort(key=lambda x: int(x["line"]) if str(x["line"]).isdigit() else 999999)

        overall_rows += b["rows"]
        overall_trips += len(trips)
        output.append({
            "key": b["key"],
            "name": b["name"],
            "contract_rule_id": b["contract_rule_id"],
            "contract_lines": b["contract_lines"],
            "rows": b["rows"],
            "trips": len(trips),
            "date_range": {
                "from": min(b["dates"]) if b["dates"] else None,
                "to": max(b["dates"]) if b["dates"] else None,
            },
            "end_arrival_evaluable": len(end_evaluable),
            "under_5_minutes_descriptive": under5,
            "early_departure_trips": len(early),
            "end_over_25_trips": len(over25),
            "potential_failure_trips": len(potential_failure_keys),
            "delay_penalty_counts": penalty_counts,
            "theoretical_delay_penalty_eur": theoretical_delay_penalty,
            "punctuality_target_percent": 95,
            "punctuality_value_percent": None,
            "line_stats": line_output,
        })

    first_import = imports[0]
    return {
        "ok": True,
        "available": True,
        "imports": len(imports),
        "operator_name": first_import.get("operator_name", ""),
        "rows": overall_rows,
        "trips": overall_trips,
        "bundles": output,
        "unassigned_rows": unassigned_rows,
        "contract_source": "Leistungsbeschreibung, Stand 17.02.2023",
        "contract_note": (
            "Vertragsindikatoren werden liniengenau je Bündel ermittelt. "
            "Die 95-%-Pünktlichkeitskennzahl bleibt offen, bis die Definition "
            "einer pünktlichen Endhaltestellen-Ankunft eindeutig hinterlegt ist."
        ),
    }

class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _load_stammdaten(self):
        if not STAMMDATEN.exists():
            return {
                "linienbuendel": [],
                "verkehrsunternehmen": [],
                "zuordnungen": [],
            }
        return json.loads(STAMMDATEN.read_text(encoding="utf-8-sig"))

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/stammdaten":
            try:
                self._send_json(self._load_stammdaten())
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 500)
            return


        if path == "/api/controlling/itcs-summary":
            try:
                self._send_json(build_itcs_controlling_summary(ROOT))
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 500)
            return
        if path == "/api/import/history":
            self._send_json({"ok": True, "items": load_history(ROOT)})
            return

        if path == "/api/itcs/summary":
            try:
                cache_path = DATA / "itcs-summary-cache.json"
                if not cache_path.exists():
                    self._send_json({
                        "ok": True,
                        "available": False,
                        "error": "ITCS-Auswertungscache fehlt."
                    })
                else:
                    payload = json.loads(cache_path.read_text(encoding="utf-8-sig"))
                    self._send_json(payload)
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 500)
            return

        if path == "/api/health":
            self._send_json({
                "ok": True,
                "service": "AMINA Dashboard Server",
                "root": str(ROOT),
            })
            return

        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/stammdaten":
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Ungültige Stammdaten.")
                STAMMDATEN.write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                self._send_json({"ok": True})
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
            return

        if path == "/api/import/preview":
            try:
                payload = self._read_json()
                filename = os.path.basename(str(payload.get("filename", "")).strip())
                encoded = payload.get("content_base64", "")
                if not filename or not encoded:
                    raise ValueError("Datei fehlt.")

                suffix = Path(filename).suffix.lower()
                if suffix not in {".csv", ".xlsx", ".xlsm"}:
                    raise ValueError("Unterstützt werden CSV, XLSX und XLSM.")

                token = uuid.uuid4().hex
                temp_path = TMP / f"{token}{suffix}"
                temp_path.write_bytes(base64.b64decode(encoded))

                result = analyze_file(
                    ROOT,
                    temp_path,
                    selected_bundle_id=str(payload.get("linienbuendel_id", "")),
                    selected_operator_id=str(payload.get("verkehrsunternehmen_id", "")),
                    data_type=str(payload.get("datenart", "")),
                    delivery_period=str(payload.get("lieferperiode", payload.get("liefermonat", ""))),
                )
                result["upload_token"] = token
                result["original_filename"] = filename
                self._send_json(result)
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
            return

        if path == "/api/import/commit":
            try:
                payload = self._read_json()
                token = str(payload.get("upload_token", "")).strip()
                if not token or not token.isalnum():
                    raise ValueError("Ungültiger Import-Token.")

                matches = list(TMP.glob(f"{token}.*"))
                if len(matches) != 1:
                    raise ValueError("Temporäre Importdatei wurde nicht gefunden. Bitte Datei erneut prüfen.")

                result = commit_import(
                    ROOT,
                    matches[0],
                    original_filename=os.path.basename(str(payload.get("filename", "import"))),
                    mapping=payload.get("mapping", {}) if isinstance(payload.get("mapping"), dict) else {},
                    selected_bundle_id=str(payload.get("linienbuendel_id", "")),
                    selected_operator_id=str(payload.get("verkehrsunternehmen_id", "")),
                    data_type=str(payload.get("datenart", "")),
                    delivery_period=str(payload.get("lieferperiode", "")),
                )
                self._send_json(result)
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
            return

        self._send_json({"ok": False, "error": "Unbekannter API-Endpunkt."}, 404)


def main():
    os.chdir(ROOT)
    port = 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    print(f"AMINA Dashboard Server: http://localhost:{port}/dashboard/")
    print(f"Stammdaten-API:        http://localhost:{port}/api/stammdaten")
    print(f"Import-API:            http://localhost:{port}/api/import/preview")
    print("Zum Beenden: Strg+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()




