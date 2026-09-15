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
ROUTING_ANCHOR_FILE = RUN / 'routing_anker.csv'

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

routing_anchors = {}

if ROUTING_ANCHOR_FILE.exists():
    with open(
        ROUTING_ANCHOR_FILE,
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
                'stop_id': row['stop_id'].strip(),
                'line': row['line'].strip(),
                'anchor_dhid': row['anchor_dhid'].strip(),
                'anchor_name': row['anchor_name'].strip(),
                'lat': float(row['anchor_lat']),
                'lon': float(row['anchor_lon']),
                'status': row['status'].strip(),
                'reason': row.get('reason', '').strip(),
            }

print('Freigegebene Routing-Anker:', len(routing_anchors))

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
        # Originale GTFS-Haltestellen bleiben für Anzeige und Datenexport
        # unverändert erhalten.
        stop_list = [
            dict(stops[stop_id])
            for stop_id in pattern['stop_ids']
        ]

        # Nur für die OSRM-Routenberechnung werden freigegebene,
        # linienabhängige Routing-Anker eingesetzt.
        routing_stop_list = []
        applied_anchors = []

        for stop in stop_list:
            routing_stop = dict(stop)
            anchor_key = (
                stop['stop_id'],
                str(pattern['line'])
            )
            anchor = routing_anchors.get(anchor_key)

            if anchor:
                routing_stop['lon'] = anchor['lon']
                routing_stop['lat'] = anchor['lat']

                applied_anchors.append({
                    'stop_id': stop['stop_id'],
                    'stop_name': stop['stop_name'],
                    'line': str(pattern['line']),
                    'original_lat': stop['lat'],
                    'original_lon': stop['lon'],
                    'anchor_dhid': anchor['anchor_dhid'],
                    'anchor_name': anchor['anchor_name'],
                    'anchor_lat': anchor['lat'],
                    'anchor_lon': anchor['lon'],
                    'reason': anchor['reason'],
                })

            routing_stop_list.append(routing_stop)

        coordinates = ';'.join(
            f'{stop["lon"]},{stop["lat"]}'
            for stop in routing_stop_list
        )

        url = (
            'http://localhost:5001/route/v1/driving/'
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
                'routing_anchors': applied_anchors,
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

        cache_payload = dict(route_result)
        cache_payload['routing_metadata'] = {
            'pattern_id': pattern_id,
            'line': str(pattern['line']),
            'routing_anchors': applied_anchors,
        }

        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(
                cache_payload,
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
