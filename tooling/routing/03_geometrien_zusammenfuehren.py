import csv
import json
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
GEOMETRY_DIR = BASE / 'geometrien'
CACHE_DIR = BASE / 'cache'
REPORT_DIR = BASE / 'pruefung'

DECISION_FILE = REPORT_DIR / 'routing_qualitaetsentscheidung.csv'

features = []
quality_rows = []

quality_decisions = {}

if DECISION_FILE.exists():
    with open(
        DECISION_FILE,
        encoding='utf-8-sig',
        newline=''
    ) as f:
        for row in csv.DictReader(f, delimiter=';'):
            stop_id = row.get('stop_id', '').strip()

            if not stop_id:
                continue

            quality_decisions[stop_id] = {
                'stop_name': row.get('stop_name', '').strip(),
                'category': row.get('kategorie', '').strip(),
                'status': row.get('status', '').strip().lower(),
                'reason': row.get('begruendung', '').strip(),
            }

for path in sorted(GEOMETRY_DIR.glob('*.geojson')):
    with open(path, encoding='utf-8') as f:
        feature = json.load(f)

    features.append(feature)

    props = feature.get('properties', {})
    pattern_id = props.get('pattern_id', '')
    stops = props.get('stops', [])

    cache_file = CACHE_DIR / f'{pattern_id}.json'

    waypoints = []

    if cache_file.exists():
        with open(cache_file, encoding='utf-8') as f:
            cache = json.load(f)

        waypoints = cache.get('waypoints', [])

    max_stop_id = ''
    max_stop_name = ''
    max_snap_distance = 0.0

    for stop, waypoint in zip(stops, waypoints):
        snap_distance = float(waypoint.get('distance', 0))

        if snap_distance > max_snap_distance:
            max_snap_distance = snap_distance
            max_stop_id = stop.get('stop_id', '')
            max_stop_name = stop.get('stop_name', '')

    technical_warning = max_snap_distance > 25

    decision = quality_decisions.get(max_stop_id, {})

    decision_status = decision.get('status', '')
    decision_category = decision.get('category', '')
    decision_reason = decision.get('reason', '')

    if not technical_warning:
        quality_status = 'ohne Warnung'
    elif decision_status == 'akzeptiert':
        quality_status = 'fachlich akzeptiert'
    elif decision_status == 'offen':
        quality_status = 'fachlich offen'
    else:
        quality_status = 'nicht bewertet'

    quality_rows.append({
        'pattern_id': pattern_id,
        'line': props.get('line', ''),
        'route_id': props.get('route_id', ''),
        'direction_id': props.get('direction_id', ''),
        'stop_count': props.get('stop_count', 0),
        'trip_count': props.get('trip_count', 0),
        'distance_km': round(props.get('distance_m', 0) / 1000, 3),
        'duration_min': round(props.get('duration_s', 0) / 60, 2),
        'max_snap_distance_m': round(max_snap_distance, 2),
        'max_snap_stop_id': max_stop_id,
        'max_snap_stop_name': max_stop_name,
        'technical_warning_snap_over_25m': technical_warning,
        'quality_status': quality_status,
        'decision_category': decision_category,
        'decision_reason': decision_reason,
        'routing_anchor_count': len(
            props.get('routing_anchors', [])
        ),
    })

collection = {
    'type': 'FeatureCollection',
    'features': features,
}

geojson_path = BASE / 'routes_routed.geojson'

with open(geojson_path, 'w', encoding='utf-8') as f:
    json.dump(
        collection,
        f,
        ensure_ascii=False,
        separators=(',', ':'),
    )

csv_path = REPORT_DIR / 'routing_qualitaetsbericht.csv'

fieldnames = [
    'pattern_id',
    'line',
    'route_id',
    'direction_id',
    'stop_count',
    'trip_count',
    'distance_km',
    'duration_min',
    'max_snap_distance_m',
    'max_snap_stop_id',
    'max_snap_stop_name',
    'technical_warning_snap_over_25m',
    'quality_status',
    'decision_category',
    'decision_reason',
    'routing_anchor_count',
]

with open(
    csv_path,
    'w',
    encoding='utf-8-sig',
    newline=''
) as f:
    writer = csv.DictWriter(
        f,
        fieldnames=fieldnames,
        delimiter=';'
    )
    writer.writeheader()
    writer.writerows(quality_rows)

technical_warnings = [
    row for row in quality_rows
    if row['technical_warning_snap_over_25m']
]

accepted_warnings = [
    row for row in quality_rows
    if row['quality_status'] == 'fachlich akzeptiert'
]

open_warnings = [
    row for row in quality_rows
    if row['quality_status'] == 'fachlich offen'
]

unrated_warnings = [
    row for row in quality_rows
    if row['quality_status'] == 'nicht bewertet'
]

open_stop_ids = sorted({
    row['max_snap_stop_id']
    for row in open_warnings
    if row['max_snap_stop_id']
})

open_stop_names = sorted({
    row['max_snap_stop_name']
    for row in open_warnings
    if row['max_snap_stop_name']
})

summary = {
    'geometry_count': len(features),
    'technical_warning_count_snap_over_25m': len(
        technical_warnings
    ),
    'accepted_warning_count': len(accepted_warnings),
    'open_warning_count': len(open_warnings),
    'unrated_warning_count': len(unrated_warnings),
    'open_unique_stop_count': len(open_stop_ids),
    'open_stop_ids': open_stop_ids,
    'open_stop_names': open_stop_names,
    'max_snap_distance_m': max(
        (
            row['max_snap_distance_m']
            for row in quality_rows
        ),
        default=0,
    ),
    'routes_routed_geojson': str(geojson_path),
    'quality_report_csv': str(csv_path),
    'quality_decision_csv': str(DECISION_FILE),
}

summary_path = (
    REPORT_DIR
    / 'routing_qualitaetsbericht_summary.json'
)

with open(summary_path, 'w', encoding='utf-8') as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2
    )

print('Zusammenführung erfolgreich')
print('Geometrien:', len(features))
print(
    'Technische Warnungen Einrastdistanz > 25 m:',
    len(technical_warnings)
)
print(
    'Davon fachlich akzeptiert:',
    len(accepted_warnings)
)
print(
    'Davon fachlich offen:',
    len(open_warnings)
)
print(
    'Davon nicht bewertet:',
    len(unrated_warnings)
)
print(
    'Eindeutige offene Haltestellen:',
    len(open_stop_ids)
)

if open_stop_names:
    print(
        'Offene Haltestellen:',
        ', '.join(open_stop_names)
    )

print(
    'Maximale Einrastdistanz:',
    summary['max_snap_distance_m'],
    'm'
)
print('GeoJSON:', geojson_path)
print('Qualitätsbericht:', csv_path)
print('Zusammenfassung:', summary_path)
