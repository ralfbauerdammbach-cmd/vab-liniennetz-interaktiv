import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

GTFS = Path.home() / 'vab-routing' / 'gtfs-regional'
OUT = Path.home() / 'vab-routing' / 'gesamtlauf' / 'pruefung'

OUT.mkdir(parents=True, exist_ok=True)

routes = {}
with open(GTFS / 'routes.txt', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        routes[row['route_id']] = {
            'line': row.get('route_short_name', '').strip(),
            'route_type': row.get('route_type', ''),
        }

trips = {}
with open(GTFS / 'trips.txt', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        trips[row['trip_id']] = {
            'route_id': row['route_id'],
            'direction_id': row.get('direction_id', ''),
            'headsign': row.get('trip_headsign', ''),
        }

trip_stops = defaultdict(list)

with open(GTFS / 'stop_times.txt', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        trip_id = row['trip_id']

        if trip_id in trips:
            trip_stops[trip_id].append(
                (int(row['stop_sequence']), row['stop_id'])
            )

patterns = {}

for trip_id, items in trip_stops.items():
    items.sort()
    stop_ids = tuple(stop_id for _, stop_id in items)

    if len(stop_ids) < 2:
        continue

    trip = trips[trip_id]
    route = routes.get(trip['route_id'], {})

    fingerprint_source = '|'.join([
        route.get('line', ''),
        trip['route_id'],
        trip['direction_id'],
        *stop_ids,
    ])

    pattern_id = hashlib.sha256(
        fingerprint_source.encode('utf-8')
    ).hexdigest()[:20]

    if pattern_id not in patterns:
        patterns[pattern_id] = {
            'pattern_id': pattern_id,
            'line': route.get('line', ''),
            'route_id': trip['route_id'],
            'route_type': route.get('route_type', ''),
            'direction_id': trip['direction_id'],
            'headsigns': set(),
            'stop_ids': list(stop_ids),
            'stop_count': len(stop_ids),
            'trip_ids': [],
        }

    patterns[pattern_id]['trip_ids'].append(trip_id)

    if trip['headsign']:
        patterns[pattern_id]['headsigns'].add(trip['headsign'])

result = []

for pattern in patterns.values():
    result.append({
        'pattern_id': pattern['pattern_id'],
        'line': pattern['line'],
        'route_id': pattern['route_id'],
        'route_type': pattern['route_type'],
        'direction_id': pattern['direction_id'],
        'headsigns': sorted(pattern['headsigns']),
        'stop_ids': pattern['stop_ids'],
        'stop_count': pattern['stop_count'],
        'trip_count': len(pattern['trip_ids']),
        'example_trip_id': pattern['trip_ids'][0],
    })

result.sort(
    key=lambda x: (
        x['line'],
        x['route_id'],
        x['direction_id'],
        -x['trip_count'],
        x['pattern_id'],
    )
)

json_path = OUT / 'fahrtmuster_inventur.json'
csv_path = OUT / 'fahrtmuster_inventur.csv'

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'pattern_count': len(result),
            'patterns': result,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    fieldnames = [
        'pattern_id',
        'line',
        'route_id',
        'route_type',
        'direction_id',
        'headsigns',
        'stop_count',
        'trip_count',
        'example_trip_id',
    ]

    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()

    for pattern in result:
        writer.writerow({
            'pattern_id': pattern['pattern_id'],
            'line': pattern['line'],
            'route_id': pattern['route_id'],
            'route_type': pattern['route_type'],
            'direction_id': pattern['direction_id'],
            'headsigns': ' | '.join(pattern['headsigns']),
            'stop_count': pattern['stop_count'],
            'trip_count': pattern['trip_count'],
            'example_trip_id': pattern['example_trip_id'],
        })

lines = sorted({
    pattern['line']
    for pattern in result
    if pattern['line']
})

print('Inventur erfolgreich erstellt')
print('Eindeutige Fahrtmuster:', len(result))
print('Liniennummern:', len(lines))
print('JSON:', json_path)
print('CSV:', csv_path)
