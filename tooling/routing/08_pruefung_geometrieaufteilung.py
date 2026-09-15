import json
import math
from pathlib import Path

CACHE_DIR = (
    Path.home()
    / 'vab-routing'
    / 'gesamtlauf'
    / 'cache'
)

REPORT_FILE = (
    Path.home()
    / 'vab-routing'
    / 'gesamtlauf'
    / 'pruefung'
    / 'geometrieaufteilung_pruefung.json'
)


def haversine_m(a, b):
    lon1, lat1 = a
    lon2, lat2 = b

    r = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    h = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(d_lambda / 2) ** 2
    )

    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


results = []
total_waypoints = 0
exact_waypoints = 0
within_001m = 0
within_01m = 0
within_1m = 0
over_1m = 0
non_monotonic_patterns = 0
max_distance = 0.0
max_case = None

for cache_file in sorted(CACHE_DIR.glob('*.json')):
    with open(cache_file, encoding='utf-8') as f:
        data = json.load(f)

    metadata = data.get('routing_metadata', {})
    pattern_id = metadata.get(
        'pattern_id',
        cache_file.stem
    )
    line = metadata.get('line', '')

    routes = data.get('routes', [])
    waypoints = data.get('waypoints', [])

    if not routes:
        continue

    geometry = routes[0].get('geometry', {})
    coordinates = geometry.get('coordinates', [])

    previous_index = 0
    monotonic = True
    waypoint_results = []

    for waypoint_number, waypoint in enumerate(
        waypoints,
        start=1
    ):
        total_waypoints += 1
        location = waypoint.get('location')

        if not location or not coordinates:
            monotonic = False
            waypoint_results.append({
                'waypoint_number': waypoint_number,
                'matched': False,
                'reason': 'Koordinaten fehlen',
            })
            continue

        best_index = None
        best_distance = float('inf')

        # Nur vorwärts suchen. Dadurch bleibt die Reihenfolge
        # auch bei Schleifen und mehrfach befahrenen Straßen erhalten.
        for index in range(previous_index, len(coordinates)):
            distance = haversine_m(
                location,
                coordinates[index]
            )

            if distance < best_distance:
                best_distance = distance
                best_index = index

                if distance < 0.0001:
                    break

        if best_index is None:
            monotonic = False
            waypoint_results.append({
                'waypoint_number': waypoint_number,
                'matched': False,
                'reason': 'Kein Geometriepunkt gefunden',
            })
            continue

        if best_index < previous_index:
            monotonic = False

        previous_index = best_index

        max_distance = max(max_distance, best_distance)

        if (
            max_case is None
            or best_distance > max_case['distance_m']
        ):
            max_case = {
                'pattern_id': pattern_id,
                'line': line,
                'waypoint_number': waypoint_number,
                'distance_m': best_distance,
                'waypoint_location': location,
                'geometry_coordinate': coordinates[best_index],
                'geometry_index': best_index,
            }

        if best_distance < 0.0001:
            exact_waypoints += 1
            category = 'exakt'
        elif best_distance <= 0.01:
            within_001m += 1
            category = 'bis_0_01m'
        elif best_distance <= 0.1:
            within_01m += 1
            category = 'bis_0_1m'
        elif best_distance <= 1.0:
            within_1m += 1
            category = 'bis_1m'
        else:
            over_1m += 1
            category = 'ueber_1m'

        waypoint_results.append({
            'waypoint_number': waypoint_number,
            'matched': True,
            'geometry_index': best_index,
            'distance_m': round(best_distance, 6),
            'category': category,
        })

    if not monotonic:
        non_monotonic_patterns += 1

    results.append({
        'pattern_id': pattern_id,
        'line': line,
        'waypoint_count': len(waypoints),
        'geometry_coordinate_count': len(coordinates),
        'monotonic': monotonic,
        'max_match_distance_m': round(
            max(
                (
                    row.get('distance_m', 0)
                    for row in waypoint_results
                    if row.get('matched')
                ),
                default=0,
            ),
            6,
        ),
        'waypoints': waypoint_results,
    })

summary = {
    'cache_files_checked': len(results),
    'total_waypoints': total_waypoints,
    'exact_waypoints': exact_waypoints,
    'within_0_01m': within_001m,
    'within_0_1m': within_01m,
    'within_1m': within_1m,
    'over_1m': over_1m,
    'non_monotonic_patterns': non_monotonic_patterns,
    'maximum_match_distance_m': round(max_distance, 6),
    'maximum_case': max_case,
}

with open(REPORT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'patterns': results,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Prüfung der Geometrieaufteilung abgeschlossen')
print('Cachedateien geprüft:', summary['cache_files_checked'])
print('Waypoints insgesamt:', summary['total_waypoints'])
print('Exakt getroffen:', summary['exact_waypoints'])
print('Abweichung bis 0,01 m:', summary['within_0_01m'])
print('Abweichung bis 0,1 m:', summary['within_0_1m'])
print('Abweichung bis 1 m:', summary['within_1m'])
print('Abweichung über 1 m:', summary['over_1m'])
print(
    'Fahrtmuster ohne monotone Zuordnung:',
    summary['non_monotonic_patterns']
)
print(
    'Maximale Abweichung zur Geometrie:',
    summary['maximum_match_distance_m'],
    'm'
)

if max_case:
    print(
        'Größter Fall:',
        f'Linie {max_case["line"]},',
        f'Muster {max_case["pattern_id"]},',
        f'Waypoint {max_case["waypoint_number"]}'
    )

print('Bericht:', REPORT_FILE)
