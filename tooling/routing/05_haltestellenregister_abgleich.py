import csv
import json
import math
from pathlib import Path

BASE = Path.home() / 'vab-routing'
GTFS_STOPS = BASE / 'gtfs-regional/stops.txt'
INVENTORY = BASE / 'gesamtlauf/pruefung/fahrtmuster_inventur.json'
CACHE_DIR = BASE / 'gesamtlauf/cache'

REGISTER = Path(
    '/mnt/f/AMINA neu/11-Marketing/VAB/vab-routing/'
    'Haltestellen Deutschland.csv'
)

OUT_CSV = BASE / 'gesamtlauf/pruefung/haltestellenregister_abgleich.csv'
OUT_JSON = BASE / 'gesamtlauf/pruefung/haltestellenregister_abgleich_summary.json'

LIMIT_M = 25.0


def distance_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


with open(GTFS_STOPS, encoding='utf-8-sig') as f:
    gtfs_stops = {
        row['stop_id']: row
        for row in csv.DictReader(f)
    }

with open(INVENTORY, encoding='utf-8') as f:
    inventory = json.load(f)

patterns = {
    p['pattern_id']: p
    for p in inventory['patterns']
}

# Auffällige GTFS-Haltestellen deduplizieren.
findings = {}

for pattern_id, pattern in patterns.items():
    cache_file = CACHE_DIR / f'{pattern_id}.json'

    with open(cache_file, encoding='utf-8') as f:
        result = json.load(f)

    for stop_id, waypoint in zip(
        pattern['stop_ids'],
        result.get('waypoints', [])
    ):
        snap_distance = float(waypoint.get('distance', 0))

        if snap_distance <= LIMIT_M:
            continue

        current = findings.get(stop_id)

        if current is None or snap_distance > current['snap_distance_m']:
            stop = gtfs_stops[stop_id]

            findings[stop_id] = {
                'stop_id': stop_id,
                'stop_name': stop.get('stop_name', ''),
                'gtfs_lat': float(stop['stop_lat']),
                'gtfs_lon': float(stop['stop_lon']),
                'snap_distance_m': snap_distance,
                'line': pattern.get('line', ''),
                'pattern_id': pattern_id,
                'osrm_road': waypoint.get('name', ''),
            }

# Nur benötigte DHIDs aus der großen Deutschlanddatei laden.
wanted_ids = set()

for stop_id in findings:
    wanted_ids.add(stop_id)

    if stop_id.endswith('_G'):
        wanted_ids.add(stop_id[:-2])

register_rows = {}

with open(
    REGISTER,
    encoding='utf-8-sig',
    errors='replace',
    newline=''
) as f:
    reader = csv.DictReader(f, delimiter=';')

    for row in reader:
        dhid = row.get('DHID', '').strip()

        if dhid in wanted_ids:
            register_rows.setdefault(dhid, []).append(row)

results = []

for stop_id, finding in findings.items():
    candidates = list(register_rows.get(stop_id, []))
    match_type = 'exakte DHID'

    if not candidates and stop_id.endswith('_G'):
        base_id = stop_id[:-2]
        candidates = list(register_rows.get(base_id, []))
        match_type = 'Basis-DHID ohne _G'

    if not candidates:
        results.append({
            **finding,
            'register_found': 'NEIN',
            'match_type': '',
            'register_dhid': '',
            'register_type': '',
            'register_parent': '',
            'register_name': '',
            'register_lat': '',
            'register_lon': '',
            'coordinate_difference_m': '',
            'last_operation_date': '',
            'assessment': 'kein Registertreffer'
        })
        continue

    scored = []

    for row in candidates:
        try:
            lat = float(row['Latitude'].replace(',', '.'))
            lon = float(row['Longitude'].replace(',', '.'))
        except (ValueError, KeyError):
            continue

        diff = distance_m(
            finding['gtfs_lat'],
            finding['gtfs_lon'],
            lat,
            lon
        )

        scored.append((diff, row, lat, lon))

    if not scored:
        results.append({
            **finding,
            'register_found': 'JA',
            'match_type': match_type,
            'register_dhid': '',
            'register_type': '',
            'register_parent': '',
            'register_name': '',
            'register_lat': '',
            'register_lon': '',
            'coordinate_difference_m': '',
            'last_operation_date': '',
            'assessment': 'Treffer ohne verwertbare Koordinate'
        })
        continue

    diff, row, lat, lon = min(scored, key=lambda x: x[0])

    if diff <= 5:
        assessment = 'Koordinate bestätigt'
    elif diff <= 25:
        assessment = 'geringe Abweichung'
    elif diff <= 75:
        assessment = 'deutliche Abweichung'
    else:
        assessment = 'starke Abweichung'

    results.append({
        **finding,
        'register_found': 'JA',
        'match_type': match_type,
        'register_dhid': row.get('DHID', ''),
        'register_type': row.get('Type', ''),
        'register_parent': row.get('Parent', ''),
        'register_name': row.get('Name', ''),
        'register_lat': lat,
        'register_lon': lon,
        'coordinate_difference_m': round(diff, 2),
        'last_operation_date': row.get('LastOperationDate', ''),
        'assessment': assessment
    })

results.sort(
    key=lambda x: x['snap_distance_m'],
    reverse=True
)

fieldnames = [
    'stop_id',
    'stop_name',
    'line',
    'pattern_id',
    'snap_distance_m',
    'osrm_road',
    'gtfs_lat',
    'gtfs_lon',
    'register_found',
    'match_type',
    'register_dhid',
    'register_type',
    'register_parent',
    'register_name',
    'register_lat',
    'register_lon',
    'coordinate_difference_m',
    'last_operation_date',
    'assessment'
]

with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
    writer.writeheader()
    writer.writerows(results)

summary = {
    'auffaellige_haltestellen': len(results),
    'registertreffer': sum(
        1 for row in results
        if row['register_found'] == 'JA'
    ),
    'kein_registertreffer': sum(
        1 for row in results
        if row['register_found'] == 'NEIN'
    ),
    'koordinate_bestaetigt_bis_5m': sum(
        1 for row in results
        if isinstance(row['coordinate_difference_m'], (int, float))
        and row['coordinate_difference_m'] <= 5
    ),
    'abweichung_ueber_25m': sum(
        1 for row in results
        if isinstance(row['coordinate_difference_m'], (int, float))
        and row['coordinate_difference_m'] > 25
    )
}

with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print('Abgleich erfolgreich')
print('Auffällige Haltestellen:', summary['auffaellige_haltestellen'])
print('Registertreffer:', summary['registertreffer'])
print('Kein Registertreffer:', summary['kein_registertreffer'])
print(
    'Koordinate bestätigt bis 5 m:',
    summary['koordinate_bestaetigt_bis_5m']
)
print(
    'Registerabweichung über 25 m:',
    summary['abweichung_ueber_25m']
)
print('CSV:', OUT_CSV)
print('Zusammenfassung:', OUT_JSON)

print()
print('Einzelergebnisse:')
print()

for row in results:
    diff = row['coordinate_difference_m']

    if isinstance(diff, (int, float)):
        diff_text = f'{diff:.2f} m'
    else:
        diff_text = '-'

    print(
        f'{row["snap_distance_m"]:6.2f} m OSRM | '
        f'{diff_text:>9} Register | '
        f'{row["stop_name"]} | '
        f'{row["assessment"]}'
    )
