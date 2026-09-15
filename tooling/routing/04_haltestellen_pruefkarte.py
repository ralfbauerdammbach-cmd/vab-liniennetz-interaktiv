import csv
import json
import urllib.request
from pathlib import Path

BASE = Path.home() / 'vab-routing'
GTFS = BASE / 'gtfs-regional'
OUT = BASE / 'gesamtlauf' / 'pruefung'

stops = {}

with open(GTFS / 'stops.txt', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        stops[row['stop_id']] = row

wanted = [
    'de:09676:51202:0:1',
    'de:09676:51202:0:2',
    'de:06435:26920:1:1',
    'de:09671:51109:0:6',
    'de:09671:1055',
    'de:09661:5100:0:13',
    'de:09671:99156:0:1',
    'de:09671:51109:0:7',
    'de:09671:51109:0:5_G',
    'de:09671:51109:0:5',
    'de:09661:5100:0:8',
    'de:09661:5100:0:10',
    'de:09661:5100:0:9',
    'de:09676:1085',
    'de:09671:51109:0:9',
    'de:09661:5100',
    'de:09661:50700:0:4',
    'de:06438:4690:3:3',
    'de:09661:5100:0:14',
    'de:09661:50700:0:5_G',
    'de:09661:50700:0:5',
    'de:09661:50700:0:14',
]

features = []

for stop_id in wanted:
    stop = stops[stop_id]
    lon = float(stop['stop_lon'])
    lat = float(stop['stop_lat'])

    url = (
        'http://localhost:5000/nearest/v1/driving/'
        f'{lon},{lat}?number=1'
    )

    with urllib.request.urlopen(url, timeout=30) as response:
        result = json.load(response)

    waypoint = result['waypoints'][0]
    snapped_lon, snapped_lat = waypoint['location']
    distance = waypoint['distance']
    road = waypoint.get('name', '')

    common = {
        'stop_id': stop_id,
        'stop_name': stop.get('stop_name', ''),
        'snap_distance_m': round(distance, 2),
        'osrm_road': road,
    }

    features.append({
        'type': 'Feature',
        'properties': {
            **common,
            'point_type': 'GTFS-Haltestelle',
        },
        'geometry': {
            'type': 'Point',
            'coordinates': [lon, lat],
        },
    })

    features.append({
        'type': 'Feature',
        'properties': {
            **common,
            'point_type': 'OSRM-Einrastpunkt',
        },
        'geometry': {
            'type': 'Point',
            'coordinates': [snapped_lon, snapped_lat],
        },
    })

    features.append({
        'type': 'Feature',
        'properties': {
            **common,
            'point_type': 'Abweichung',
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': [
                [lon, lat],
                [snapped_lon, snapped_lat],
            ],
        },
    })

output = OUT / 'auffaellige_haltestellen_pruefung.geojson'

with open(output, 'w', encoding='utf-8') as f:
    json.dump({
        'type': 'FeatureCollection',
        'features': features,
    }, f, ensure_ascii=False, indent=2)

print('Prüfdatei erstellt:', output)
print('Haltestellen:', len(wanted))
print('Objekte:', len(features))
