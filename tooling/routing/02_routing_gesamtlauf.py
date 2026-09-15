import csv
import json
import time
import urllib.request
from pathlib import Path

BASE = Path.home() / 'vab-routing'
GTFS = BASE / 'gtfs-regional'
RUN = BASE / 'gesamtlauf'

INVENTORY = RUN / 'pruefung' / 'fahrtmuster_inventur.json'
GEOMETRY_DIR = RUN / 'geometrien'
CACHE_DIR = RUN / 'cache'
REPORT_DIR = RUN / 'pruefung'
LOG_DIR = RUN / 'protokolle'

TEST_LIMIT = 1296

for folder in [GEOMETRY_DIR, CACHE_DIR, REPORT_DIR, LOG_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

with open(INVENTORY, encoding='utf-8') as f:
    inventory = json.load(f)

stops = {}

with open(GTFS / 'stops.txt', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        stops[row['stop_id']] = {
            'stop_id': row['stop_id'],
            'stop_name': row.get('stop_name', ''),
            'lon': float(row['stop_lon']),
            'lat': float(row['stop_lat']),
        }

results = []
successful = 0
failed = 0

patterns = inventory['patterns'][:TEST_LIMIT]

for number, pattern in enumerate(patterns, start=1):
    pattern_id = pattern['pattern_id']
    output_file = GEOMETRY_DIR / f'{pattern_id}.geojson'
    cache_file = CACHE_DIR / f'{pattern_id}.json'

    print(
        f'[{number}/{len(patterns)}] '
        f'Linie {pattern["line"]} – '
        f'{pattern["stop_count"]} Haltestellen'
    )

    try:
        stop_list = [
            stops[stop_id]
            for stop_id in pattern['stop_ids']
        ]

        coordinates = ';'.join(
            f'{stop["lon"]},{stop["lat"]}'
            for stop in stop_list
        )

        url = (
            'http://localhost:5000/route/v1/driving/'
            + coordinates
            + '?overview=full&geometries=geojson&steps=false'
        )

        with urllib.request.urlopen(url, timeout=180) as response:
            route_result = json.load(response)

        if route_result.get('code') != 'Ok':
            raise RuntimeError(
                f'OSRM-Code: {route_result.get("code")}'
            )

        route = route_result['routes'][0]
        waypoints = route_result.get('waypoints', [])

        max_snap_distance = max(
            (
                waypoint.get('distance', 0)
                for waypoint in waypoints
            ),
            default=0,
        )

        feature = {
            'type': 'Feature',
            'properties': {
                'pattern_id': pattern_id,
                'line': pattern['line'],
                'route_id': pattern['route_id'],
                'direction_id': pattern['direction_id'],
                'headsigns': pattern['headsigns'],
                'stop_count': pattern['stop_count'],
                'trip_count': pattern['trip_count'],
                'example_trip_id': pattern['example_trip_id'],
                'distance_m': route['distance'],
                'duration_s': route['duration'],
                'max_snap_distance_m': max_snap_distance,
                'stops': stop_list,
            },
            'geometry': route['geometry'],
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(
                feature,
                f,
                ensure_ascii=False,
                indent=2,
            )

        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(
                route_result,
                f,
                ensure_ascii=False,
            )

        status = 'OK'
        successful += 1

        print(
            f'  OK | '
            f'{route["distance"]/1000:.2f} km | '
            f'{route["duration"]/60:.1f} min | '
            f'Einrastung max. {max_snap_distance:.1f} m'
        )

    except Exception as exc:
        status = 'FEHLER'
        failed += 1
        print('  FEHLER:', exc)

    results.append({
        'pattern_id': pattern_id,
        'line': pattern['line'],
        'route_id': pattern['route_id'],
        'stop_count': pattern['stop_count'],
        'trip_count': pattern['trip_count'],
        'status': status,
        'error': '' if status == 'OK' else str(exc),
    })

    time.sleep(0.05)

report = {
    'test_limit': TEST_LIMIT,
    'successful': successful,
    'failed': failed,
    'results': results,
}

report_path = REPORT_DIR / 'routing_gesamtlauf_1296_muster.json'

with open(report_path, 'w', encoding='utf-8') as f:
    json.dump(
        report,
        f,
        ensure_ascii=False,
        indent=2,
    )

print()
print('Testlauf abgeschlossen')
print('Erfolgreich:', successful)
print('Fehler:', failed)
print('Bericht:', report_path)
