import csv
import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing'
RUN = BASE / 'gesamtlauf'
GTFS = BASE / 'gtfs-regional'
REPORT_DIR = RUN / 'pruefung'

INVENTORY_FILE = REPORT_DIR / 'fahrtmuster_inventur.json'
ANCHOR_FILE = RUN / 'routing_anker.csv'

OUT_JSON = REPORT_DIR / 'segmentinventur.json'
OUT_CSV = REPORT_DIR / 'segmentinventur.csv'
OUT_SUMMARY = REPORT_DIR / 'segmentinventur_summary.json'

REPORT_DIR.mkdir(parents=True, exist_ok=True)

with open(GTFS / 'stops.txt', encoding='utf-8-sig') as f:
    stops = {
        row['stop_id']: {
            'stop_id': row['stop_id'],
            'stop_name': row.get('stop_name', ''),
            'lat': float(row['stop_lat']),
            'lon': float(row['stop_lon']),
        }
        for row in csv.DictReader(f)
    }

with open(INVENTORY_FILE, encoding='utf-8') as f:
    inventory = json.load(f)

routing_anchors = {}

if ANCHOR_FILE.exists():
    with open(
        ANCHOR_FILE,
        encoding='utf-8-sig',
        newline=''
    ) as f:
        for row in csv.DictReader(f, delimiter=';'):
            if row.get('status', '').strip().lower() != 'freigegeben':
                continue

            key = (
                row['stop_id'].strip(),
                row['line'].strip()
            )

            routing_anchors[key] = {
                'anchor_dhid': row['anchor_dhid'].strip(),
                'anchor_name': row['anchor_name'].strip(),
                'lat': float(row['anchor_lat']),
                'lon': float(row['anchor_lon']),
            }


def routing_point(stop_id, line):
    stop = stops[stop_id]
    anchor = routing_anchors.get((stop_id, str(line)))

    if anchor:
        return {
            'stop_id': stop_id,
            'stop_name': stop['stop_name'],
            'lat': anchor['lat'],
            'lon': anchor['lon'],
            'uses_anchor': True,
            'anchor_dhid': anchor['anchor_dhid'],
            'anchor_name': anchor['anchor_name'],
        }

    return {
        'stop_id': stop_id,
        'stop_name': stop['stop_name'],
        'lat': stop['lat'],
        'lon': stop['lon'],
        'uses_anchor': False,
        'anchor_dhid': '',
        'anchor_name': '',
    }


segments = {}
occurrence_count = 0

for pattern in inventory['patterns']:
    line = str(pattern['line'])
    stop_ids = pattern['stop_ids']

    for sequence, (from_id, to_id) in enumerate(
        zip(stop_ids, stop_ids[1:]),
        start=1
    ):
        occurrence_count += 1

        from_point = routing_point(from_id, line)
        to_point = routing_point(to_id, line)

        # Linienabhängige Anker müssen Bestandteil des Schlüssels sein.
        key = (
            from_id,
            to_id,
            round(from_point['lat'], 7),
            round(from_point['lon'], 7),
            round(to_point['lat'], 7),
            round(to_point['lon'], 7),
        )

        if key not in segments:
            segments[key] = {
                'segment_id': '',
                'from_stop_id': from_id,
                'from_stop_name': stops[from_id]['stop_name'],
                'to_stop_id': to_id,
                'to_stop_name': stops[to_id]['stop_name'],
                'from_routing_lat': from_point['lat'],
                'from_routing_lon': from_point['lon'],
                'to_routing_lat': to_point['lat'],
                'to_routing_lon': to_point['lon'],
                'from_uses_anchor': from_point['uses_anchor'],
                'to_uses_anchor': to_point['uses_anchor'],
                'from_anchor_dhid': from_point['anchor_dhid'],
                'to_anchor_dhid': to_point['anchor_dhid'],
                'lines': set(),
                'pattern_ids': set(),
                'route_ids': set(),
                'direction_ids': set(),
                'occurrences': 0,
                'examples': [],
            }

        segment = segments[key]

        segment['lines'].add(line)
        segment['pattern_ids'].add(pattern['pattern_id'])
        segment['route_ids'].add(pattern['route_id'])
        segment['direction_ids'].add(
            str(pattern.get('direction_id', ''))
        )
        segment['occurrences'] += 1

        if len(segment['examples']) < 5:
            segment['examples'].append({
                'pattern_id': pattern['pattern_id'],
                'line': line,
                'direction_id': pattern.get('direction_id', ''),
                'sequence': sequence,
            })

rows = []

sorted_segments = sorted(
    segments.values(),
    key=lambda row: (
        row['from_stop_name'],
        row['to_stop_name'],
        row['from_stop_id'],
        row['to_stop_id'],
    )
)

for number, segment in enumerate(sorted_segments, start=1):
    segment_id = f'seg-{number:05d}'
    segment['segment_id'] = segment_id

    reverse_exists = any(
        candidate['from_stop_id'] == segment['to_stop_id']
        and candidate['to_stop_id'] == segment['from_stop_id']
        for candidate in sorted_segments
    )

    row = {
        **segment,
        'lines': sorted(segment['lines']),
        'pattern_ids': sorted(segment['pattern_ids']),
        'route_ids': sorted(segment['route_ids']),
        'direction_ids': sorted(segment['direction_ids']),
        'reverse_segment_exists': reverse_exists,
    }

    rows.append(row)

with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'segments': rows
        },
        f,
        ensure_ascii=False,
        indent=2
    )

csv_fields = [
    'segment_id',
    'from_stop_id',
    'from_stop_name',
    'to_stop_id',
    'to_stop_name',
    'lines',
    'pattern_count',
    'occurrences',
    'reverse_segment_exists',
    'from_uses_anchor',
    'to_uses_anchor',
    'from_anchor_dhid',
    'to_anchor_dhid',
    'from_routing_lat',
    'from_routing_lon',
    'to_routing_lat',
    'to_routing_lon',
]

with open(
    OUT_CSV,
    'w',
    encoding='utf-8-sig',
    newline=''
) as f:
    writer = csv.DictWriter(
        f,
        fieldnames=csv_fields,
        delimiter=';'
    )
    writer.writeheader()

    for row in rows:
        writer.writerow({
            'segment_id': row['segment_id'],
            'from_stop_id': row['from_stop_id'],
            'from_stop_name': row['from_stop_name'],
            'to_stop_id': row['to_stop_id'],
            'to_stop_name': row['to_stop_name'],
            'lines': ', '.join(row['lines']),
            'pattern_count': len(row['pattern_ids']),
            'occurrences': row['occurrences'],
            'reverse_segment_exists': (
                'JA' if row['reverse_segment_exists'] else 'NEIN'
            ),
            'from_uses_anchor': (
                'JA' if row['from_uses_anchor'] else 'NEIN'
            ),
            'to_uses_anchor': (
                'JA' if row['to_uses_anchor'] else 'NEIN'
            ),
            'from_anchor_dhid': row['from_anchor_dhid'],
            'to_anchor_dhid': row['to_anchor_dhid'],
            'from_routing_lat': row['from_routing_lat'],
            'from_routing_lon': row['from_routing_lon'],
            'to_routing_lat': row['to_routing_lat'],
            'to_routing_lon': row['to_routing_lon'],
        })

shared_raw_segments = [
    row for row in rows
    if len(row['lines']) > 1
]

summary = {
    'pattern_count': len(inventory['patterns']),
    'segment_occurrences': occurrence_count,
    'unique_directed_segments': len(rows),
    'unique_segments_with_reverse_direction': sum(
        1 for row in rows
        if row['reverse_segment_exists']
    ),
    'raw_segments_used_by_multiple_lines': len(
        shared_raw_segments
    ),
    'segments_using_routing_anchor': sum(
        1 for row in rows
        if row['from_uses_anchor'] or row['to_uses_anchor']
    ),
    'segment_inventory_json': str(OUT_JSON),
    'segment_inventory_csv': str(OUT_CSV),
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('Segmentinventur erfolgreich')
print('Fahrtmuster:', summary['pattern_count'])
print('Segmentvorkommen:', summary['segment_occurrences'])
print(
    'Eindeutige gerichtete Segmente:',
    summary['unique_directed_segments']
)
print(
    'Segmente mit vorhandener Gegenrichtung:',
    summary['unique_segments_with_reverse_direction']
)
print(
    'Rohsegmente mit mehreren Linien:',
    summary['raw_segments_used_by_multiple_lines']
)
print(
    'Segmente mit Routing-Anker:',
    summary['segments_using_routing_anchor']
)
print('JSON:', OUT_JSON)
print('CSV:', OUT_CSV)
print('Zusammenfassung:', OUT_SUMMARY)
