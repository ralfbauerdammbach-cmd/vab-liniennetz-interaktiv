from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "stammdaten.json"
HOST = "127.0.0.1"
PORT = 8000

def load_stammdaten():
    if not DATA_FILE.exists():
        return {"version": 1, "linienbuendel": [], "verkehrsunternehmen": [], "linienzuordnungen": []}
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_stammdaten(payload):
    if not isinstance(payload, dict):
        raise ValueError("Stammdaten muessen ein JSON-Objekt sein.")
    payload.setdefault("version", 1)
    payload.setdefault("linienbuendel", [])
    payload.setdefault("verkehrsunternehmen", [])
    payload.setdefault("linienzuordnungen", [])
    tmp = DATA_FILE.with_suffix(".json.tmp")
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, DATA_FILE)

class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Leerer Request.")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json({"ok": True, "service": "AMINA Dashboard Server"})
            return
        if path == "/api/stammdaten":
            try:
                self._send_json(load_stammdaten())
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/stammdaten":
            self._send_json({"ok": False, "error": "Unbekannter API-Endpunkt."}, status=HTTPStatus.NOT_FOUND)
            return
        try:
            payload = self._read_json_body()
            save_stammdaten(payload)
            self._send_json({"ok": True, "saved": True})
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def end_headers(self):
        if self.path.startswith("/dashboard/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    print(f"AMINA Dashboard Server: http://localhost:{PORT}/dashboard/")
    print(f"Stammdaten-API:        http://localhost:{PORT}/api/stammdaten")
    print("Zum Beenden: Strg+C")
    server = ThreadingHTTPServer((HOST, PORT), DashboardHandler)
    server.serve_forever()
