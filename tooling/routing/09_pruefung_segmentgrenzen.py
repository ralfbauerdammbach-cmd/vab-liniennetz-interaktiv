import json
from pathlib import Path

CACHE_DIR = (
    Path.home()
    / 'vab-routing'
    / 'gesamtlauf'
    / 'cache'
)

same_index_segments = []
missing_leg_cases = []
total_segments = 0

for cache_file in sorted(CACHE_DIR.glob('*.json')):
    with open(cache_file, encoding='utf-8') as f:
        data = json.load(f)

    metadata = data.get('routing_metadata', {})
    pattern_id = metadata.get('pattern_id', cache_file.stem)
    line = metadata.get('line', '')

    routes = data.get('routes', [])
    waypoints = data.get('waypoints', [])

    if not routes:
        continue

    route = routes[0]
    coordinates = route.get('geometry', {}).get('coordinates', [])
    legs = route.get('legs', [])

    if len(legs) != max(0, len(waypoints) - 1):
        missing_leg_cases.append({
            'pattern_id': pattern_id,
            'line': line,
            'waypoints': len(waypoints),
            'legs': len(legs),
        })
        continue

    indices = []
    previous_index = 0

    for waypoint in waypoints:
        location = waypoint.get('location')

        found_index = None

        for index in range(previous_index, len(coordinates)):
            if coordinates[index] == location:
                found_index = index
                break

        if found_index is None:
            raise RuntimeError(
                f'Waypoint nicht gefunden: '
                f'{pattern_id} / Linie {line}'
            )

        indices.append(found_index)
        previous_index = found_index

    for segment_number, (
        start_index,
        end_index,
        leg,
    ) in enumerate(
        zip(indices, indices[1:], legs),
        start=1
    ):
        total_segments += 1

        if start_index == end_index:
            same_index_segments.append({
                'pattern_id': pattern_id,
                'line': line,
                'segment_number': segment_number,
                'geometry_index': start_index,
                'leg_distance_m': leg.get('distance', 0),
                'leg_duration_s': leg.get('duration', 0),
                'location': coordinates[start_index],
            })

report = {
    'cache_files': len(list(CACHE_DIR.glob('*.json'))),
    'total_segments': total_segments,
    'same_index_segment_count': len(same_index_segments),
    'missing_leg_case_count': len(missing_leg_cases),
    'same_index_segments': same_index_segments,
    'missing_leg_cases': missing_leg_cases,
}

report_file = (
    Path.home()
    / 'vab-routing'
    / 'gesamtlauf'
    / 'pruefung'
    / 'segmentgrenzen_pruefung.json'
)

with open(report_file, 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print('Prüfung der Segmentgrenzen abgeschlossen')
print('Segmente insgesamt:', total_segments)
print(
    'Segmente mit identischem Start-/Endindex:',
    len(same_index_segments)
)
print(
    'Fahrtmuster mit abweichender Leg-Anzahl:',
    len(missing_leg_cases)
)

if same_index_segments:
    print()
    print('Erste auffällige Fälle:')

    for row in same_index_segments[:20]:
        print(
            f'Linie {row["line"]} | '
            f'Muster {row["pattern_id"]} | '
            f'Segment {row["segment_number"]} | '
            f'Leg-Distanz {row["leg_distance_m"]} m'
        )

print('Bericht:', report_file)
