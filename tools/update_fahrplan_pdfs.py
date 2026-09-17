#!/usr/bin/env python3

from pathlib import Path
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from collections import defaultdict
import json
import re
import shutil

PAGE_URL = "https://www.vab-info.de/downloads"

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = BASE_DIR / "data/fahrplan_pdf_zuordnung.json"
BACKUP_DIR = BASE_DIR / "data/pdf_zuordnung_sicherungen"
LOG_DIR = BASE_DIR / "logs"

BACKUP_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current_href = None
        self.current_text = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return

        self.current_href = dict(attrs).get("href")
        self.current_text = []

    def handle_data(self, data):
        if self.current_href is not None:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() != "a":
            return

        if self.current_href:
            self.links.append({
                "url": urljoin(
                    PAGE_URL,
                    self.current_href
                ),
                "text": " ".join(
                    " ".join(self.current_text).split()
                )
            })

        self.current_href = None
        self.current_text = []


def normalize_line(value):
    value = str(value or "").strip().upper()

    value = re.sub(
        r"\s+",
        "",
        value
    )

    aliases = {
        "29S": "29 S",
        "20RMV": "20",
        "BG": "BG1"
    }

    return aliases.get(value, value)


def extract_line(text, url):
    combined = f"{text} {url}"

    patterns = [
        r"\bLinie\s+([A-Za-z0-9]+(?:\s*[A-Za-z])?)\b",
        r"/uploads/(?:Linie_)?([0-9]{1,3}[A-Za-z]?)_",
        r"/uploads/(BG_[123])_",
        r"/uploads/(GU_?2)_",
        r"/uploads/(OF[_-]?85)_"
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            combined,
            flags=re.IGNORECASE
        )

        if not match:
            continue

        raw = match.group(1)

        raw = raw.replace("_", "")
        raw = raw.replace("-", "")

        if raw.upper() == "OF85":
            return "OF-85"

        if raw.upper() == "GU2":
            return "GU2"

        if raw.upper() in {"BG1", "BG2", "BG3"}:
            return raw.upper()

        return normalize_line(raw)

    return None


def document_type(text, url):
    value = f"{text} {url}".casefold()

    if any(term in value for term in [
        "umleitung",
        "baustelle",
        "bau_",
        "bau-",
        "ersatzfahrplan"
    ]):
        return "Umleitungsfahrplan"

    if any(term in value for term in [
        "ast",
        "anrufsammeltaxi"
    ]):
        return "AST-Fahrplan"

    if any(term in value for term in [
        "nacht",
        "40n"
    ]):
        return "Nachtfahrplan"

    return "Regulärer Fahrplan"


def extract_date(text, url):
    combined = f"{text} {url}"

    patterns = [
        r"Stand\s+(\d{2})\.(\d{2})\.(\d{2,4})",
        r"\bab\s+(\d{2})\.(\d{2})\.(\d{2,4})",
        r"\b(\d{2})(\d{2})(\d{2})\b"
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            combined,
            flags=re.IGNORECASE
        )

        if not match:
            continue

        day, month, year = match.groups()

        year_number = int(year)

        if year_number < 100:
            year_number += 2000

        try:
            return (
                f"{year_number:04d}-"
                f"{int(month):02d}-"
                f"{int(day):02d}"
            )
        except ValueError:
            pass

    return ""


def natural_key(value):
    return [
        int(part)
        if part.isdigit()
        else part.casefold()
        for part in re.split(
            r"(\d+)",
            str(value)
        )
    ]


request = Request(
    PAGE_URL,
    headers={
        "User-Agent": (
            "Mozilla/5.0 "
            "VAB-Liniennetz-Fahrplan-Updater/1.0"
        )
    }
)

with urlopen(request, timeout=45) as response:
    html = response.read().decode(
        "utf-8",
        errors="replace"
    )

parser = LinkParser()
parser.feed(html)

documents_by_line = defaultdict(list)
seen_urls = set()

for link in parser.links:
    url = link["url"]
    text = link["text"]

    if ".pdf" not in url.casefold():
        continue

    if url in seen_urls:
        continue

    line = extract_line(text, url)

    if not line:
        continue

    seen_urls.add(url)

    documents_by_line[line].append({
        "type": document_type(text, url),
        "title": text or f"Fahrplan Linie {line}",
        "valid_from": extract_date(text, url),
        "url": url
    })


# Einige im GTFS verwendete Aliasnamen ergänzen.
if "20" in documents_by_line:
    documents_by_line["20RMV"] = list(
        documents_by_line["20"]
    )

if "29 S" in documents_by_line:
    documents_by_line["29S"] = list(
        documents_by_line["29 S"]
    )

# BG-Gesamtdatei notfalls allen drei BG-Linien zuordnen.
if "BG1" in documents_by_line:
    for alias in ["BG2", "BG3"]:
        if alias not in documents_by_line:
            documents_by_line[alias] = list(
                documents_by_line["BG1"]
            )


for line, documents in documents_by_line.items():
    documents.sort(
        key=lambda item: (
            0 if item["type"] == "Umleitungsfahrplan" else 1,
            item["valid_from"],
            item["title"].casefold()
        ),
        reverse=False
    )


output = {
    "generated_at": datetime.now(
        timezone.utc
    ).replace(microsecond=0).isoformat(),
    "source": PAGE_URL,
    "lines": {
        line: documents_by_line[line]
        for line in sorted(
            documents_by_line,
            key=natural_key
        )
    }
}


old_data = None

if OUTPUT_PATH.exists():
    try:
        old_data = json.loads(
            OUTPUT_PATH.read_text(
                encoding="utf-8"
            )
        )
    except Exception:
        old_data = None


if OUTPUT_PATH.exists():
    backup_path = BACKUP_DIR / (
        "fahrplan_pdf_zuordnung_"
        + datetime.now().strftime("%Y%m%d-%H%M%S")
        + ".json"
    )

    shutil.copyfile(
        OUTPUT_PATH,
        backup_path
    )


OUTPUT_PATH.write_text(
    json.dumps(
        output,
        ensure_ascii=False,
        indent=2
    ),
    encoding="utf-8"
)


def flatten(data):
    result = {}

    for line, documents in (
        data or {}
    ).get("lines", {}).items():
        result[line] = {
            item["url"]: item
            for item in documents
        }

    return result


old_flat = flatten(old_data)
new_flat = flatten(output)

changes = []

all_lines = sorted(
    set(old_flat) | set(new_flat),
    key=natural_key
)

for line in all_lines:
    old_urls = old_flat.get(line, {})
    new_urls = new_flat.get(line, {})

    for url in sorted(
        set(new_urls) - set(old_urls)
    ):
        item = new_urls[url]

        changes.append(
            f"NEU | Linie {line} | "
            f"{item['type']} | "
            f"{item['valid_from'] or 'ohne Datum'} | "
            f"{url}"
        )

    for url in sorted(
        set(old_urls) - set(new_urls)
    ):
        item = old_urls[url]

        changes.append(
            f"ENTFERNT | Linie {line} | "
            f"{item['type']} | "
            f"{item['valid_from'] or 'ohne Datum'} | "
            f"{url}"
        )


log_path = LOG_DIR / (
    "fahrplan_pdf_update_"
    + datetime.now().strftime("%Y%m%d")
    + ".log"
)

with log_path.open(
    "a",
    encoding="utf-8"
) as log:
    log.write(
        "\n"
        + datetime.now().isoformat()
        + "\n"
    )

    if changes:
        for change in changes:
            log.write(change + "\n")
    else:
        log.write("Keine Änderungen.\n")


print("VAB-Fahrplan-PDFs aktualisiert")
print("==============================")
print()
print("Linien mit Dokumenten:", len(output["lines"]))
print(
    "Dokumente insgesamt:",
    sum(
        len(items)
        for items in output["lines"].values()
    )
)
print("Änderungen:", len(changes))
print()

for change in changes[:50]:
    print(change)

if len(changes) > 50:
    print(
        f"... und {len(changes) - 50} weitere Änderungen"
    )

print()
print("Ausgabedatei:")
print(OUTPUT_PATH)

print()
print("Protokoll:")
print(log_path)
