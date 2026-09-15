import csv
import json
import math
from pathlib import Path

BASE = Path.home() / 'vab-routing'
RUN = BASE / 'gesamtlauf'
GTFS = BASE / 'gtfs-regional'
CACHE_DIR = RUN / 'cache'
REPORT_DIR = RUN / 'pruefung'

INVENTORY_FILE = REPORT_DIR / 'fahrtmuster_inventur.json'
NORMALIZATION_FILE = (
    REPORT_DIR / 'segmentinventur_normalisiert.json'
)

OUT_GEOJSON = RUN / 'segmentvorkommen_routed.geojson'
OUT_CSV = REPORT_DIR / 'segmentgeometrien_qualitaet.csv'
OUT_SUMMARY = REPORT_DIR / 'segmentgeometrien_summary.json'


def haversine_m(a, b):
    lon1, lat1 = a
    lon2, lat2 = b

    radius = 6371000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )

    return (
        2
        * radius
        * math.asin(min(1.0, math.sqrt(value)))
    )


def coordinate_equal(a, b):
    return (
        len(a) >= 2
        and len(b) >= 2
        and a[0] == b[0]
        and a[1] == b[1]
    )


def cumulative_distances(coordinates):
    cumulative = [0.0]

    for first, second in zip(
        coordinates,
        coordinates[1:]
    ):
        cumulative.append(
            cumulative[-1] + haversine_m(first, second)
        )

    return cumulative


with open(
    INVENTORY_FILE,
    encoding='utf-8'
) as f:
    inventory = json.load(f)

patterns = {
    row['pattern_id']: row
    for row in inventory['patterns']
}

with open(
    NORMALIZATION_FILE,
    encoding='utf-8'
) as f:
    normalization_data = json.load(f)

stop_normalization = normalization_data[
    'stop_normalization'
]

with open(
    GTFS / 'stops.txt',
    encoding='utf-8-sig'
) as f:
    stops = {
        row['stop_id']: row
        for row in csv.DictReader(f)
    }

features = []
quality_rows = []

missing_cache = []
invalid_cases = []

segment_occurrence_count = 0
maximum_distance_difference = 0.0
maximum_difference_case = None

for pattern_id in sorted(patterns):
    pattern = patterns[pattern_id]
    cache_file = CACHE_DIR / f'{pattern_id}.json'

    if not cache_file.exists():
        missing_cache.append(pattern_id)
        continue

    with open(cache_file, encoding='utf-8') as f:
        cache = json.load(f)

    routes = cache.get('routes', [])
    waypoints = cache.get('waypoints', [])

    if not routes:
        invalid_cases.append({
            'pattern_id': pattern_id,
            'reason': 'Keine Route im Cache',
        })
        continue

    route = routes[0]
    geometry = route.get('geometry', {})
    coordinates = geometry.get('coordinates', [])
    legs = route.get('legs', [])
    stop_ids = pattern.get('stop_ids', [])

    if len(waypoints) != len(stop_ids):
        invalid_cases.append({
            'pattern_id': pattern_id,
            'reason': (
                f'Waypoints {len(waypoints)} '
                f'ungleich Stops {len(stop_ids)}'
            ),
        })
        continue

    if len(legs) != max(0, len(stop_ids) - 1):
        invalid_cases.append({
            'pattern_id': pattern_id,
            'reason': (
                f'Legs {len(legs)} '
                f'ungleich Segmente '
                f'{max(0, len(stop_ids) - 1)}'
            ),
        })
        continue

    if not coordinates:
        invalid_cases.append({
            'pattern_id': pattern_id,
            'reason': 'Keine Geometriekoordinaten',
        })
        continue

    cumulative = cumulative_distances(coordinates)

    first_location = waypoints[0].get('location')

    start_candidates = [
        index
        for index, coordinate in enumerate(coordinates)
        if coordinate_equal(coordinate, first_location)
    ]

    if not start_candidates:
        invalid_cases.append({
            'pattern_id': pattern_id,
            'reason': 'Erster Waypoint nicht gefunden',
        })
        continue

    current_index = start_candidates[0]
    pattern_failed = False
    pattern_features = []
    pattern_quality_rows = []

    for sequence, leg in enumerate(legs, start=1):
        from_stop_id = stop_ids[sequence - 1]
        to_stop_id = stop_ids[sequence]

        target_location = waypoints[sequence].get(
            'location'
        )

        candidates = [
            index
            for index in range(
                current_index + 1,
                len(coordinates)
            )
            if coordinate_equal(
                coordinates[index],
                target_location
            )
        ]

        if not candidates:
            invalid_cases.append({
                'pattern_id': pattern_id,
                'sequence': sequence,
                'reason': (
                    'Ziel-Waypoint nicht vorwärts '
                    'in Geometrie gefunden'
                ),
            })
            pattern_failed = True
            break

        osrm_distance = float(
            leg.get('distance', 0)
        )

        end_index = min(
            candidates,
            key=lambda candidate: abs(
                (
                    cumulative[candidate]
                    - cumulative[current_index]
                )
                - osrm_distance
            )
        )

        segment_coordinates = coordinates[
            current_index:end_index + 1
        ]

        geometry_distance = (
            cumulative[end_index]
            - cumulative[current_index]
        )

        distance_difference = abs(
            geometry_distance - osrm_distance
        )

        if (
            distance_difference
            > maximum_distance_difference
        ):
            maximum_distance_difference = (
                distance_difference
            )
            maximum_difference_case = {
                'pattern_id': pattern_id,
                'line': str(pattern.get('line', '')),
                'sequence': sequence,
                'from_stop_id': from_stop_id,
                'to_stop_id': to_stop_id,
                'osrm_distance_m': osrm_distance,
                'geometry_distance_m': (
                    geometry_distance
                ),
                'difference_m': distance_difference,
            }

        from_stop = stops.get(from_stop_id, {})
        to_stop = stops.get(to_stop_id, {})

        from_normalized = stop_normalization.get(
            from_stop_id,
            {
                'station_id': from_stop_id,
                'station_name': (
                    from_stop.get('stop_name', '')
                ),
                'method': 'unbekannt',
            }
        )

        to_normalized = stop_normalization.get(
            to_stop_id,
            {
                'station_id': to_stop_id,
                'station_name': (
                    to_stop.get('stop_name', '')
                ),
                'method': 'unbekannt',
            }
        )

        segment_occurrence_count += 1

        occurrence_id = (
            f'{pattern_id}-{sequence:03d}'
        )

        properties = {
            'segment_occurrence_id': occurrence_id,
            'pattern_id': pattern_id,
            'sequence': sequence,
            'line': str(pattern.get('line', '')),
            'route_id': pattern.get('route_id', ''),
            'direction_id': pattern.get(
                'direction_id',
                ''
            ),
            'trip_count': pattern.get(
                'trip_count',
                0
            ),
            'from_stop_id': from_stop_id,
            'from_stop_name': from_stop.get(
                'stop_name',
                ''
            ),
            'to_stop_id': to_stop_id,
            'to_stop_name': to_stop.get(
                'stop_name',
                ''
            ),
            'from_station_id': from_normalized.get(
                'station_id',
                from_stop_id
            ),
            'from_station_name': (
                from_normalized.get(
                    'station_name',
                    ''
                )
                or from_stop.get('stop_name', '')
            ),
            'to_station_id': to_normalized.get(
                'station_id',
                to_stop_id
            ),
            'to_station_name': (
                to_normalized.get(
                    'station_name',
                    ''
                )
                or to_stop.get('stop_name', '')
            ),
            'from_normalization_method': (
                from_normalized.get(
                    'method',
                    ''
                )
            ),
            'to_normalization_method': (
                to_normalized.get(
                    'method',
                    ''
                )
            ),
            'distance_m': round(
                osrm_distance,
                2
            ),
            'duration_s': round(
                float(leg.get('duration', 0)),
                2
            ),
            'geometry_distance_m': round(
                geometry_distance,
                2
            ),
            'distance_difference_m': round(
                distance_difference,
                3
            ),
            'geometry_coordinate_count': len(
                segment_coordinates
            ),
            'start_geometry_index': current_index,
            'end_geometry_index': end_index,
        }

        pattern_features.append({
            'type': 'Feature',
            'properties': properties,
            'geometry': {
                'type': 'LineString',
                'coordinates': segment_coordinates,
            },
        })

        pattern_quality_rows.append(properties)

        current_index = end_index

    if pattern_failed:
        segment_occurrence_count -= len(
            pattern_features
        )
        continue

    features.extend(pattern_features)
    quality_rows.extend(pattern_quality_rows)

collection = {
    'type': 'FeatureCollection',
    'features': features,
}

with open(
    OUT_GEOJSON,
    'w',
    encoding='utf-8'
) as f:
    json.dump(
        collection,
        f,
        ensure_ascii=False,
        separators=(',', ':'),
    )

csv_fields = [
    'segment_occurrence_id',
    'pattern_id',
    'sequence',
    'line',
    'route_id',
    'direction_id',
    'trip_count',
    'from_stop_id',
    'from_stop_name',
    'to_stop_id',
    'to_stop_name',
    'from_station_id',
    'from_station_name',
    'to_station_id',
    'to_station_name',
    'distance_m',
    'duration_s',
    'geometry_distance_m',
    'distance_difference_m',
    'geometry_coordinate_count',
    'start_geometry_index',
    'end_geometry_index',
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
        delimiter=';',
        extrasaction='ignore',
    )
    writer.writeheader()
    writer.writerows(quality_rows)

differences_over_1m = [
    row for row in quality_rows
    if row['distance_difference_m'] > 1
]

differences_over_5m = [
    row for row in quality_rows
    if row['distance_difference_m'] > 5
]

short_geometries = [
    row for row in quality_rows
    if row['geometry_coordinate_count'] < 2
]

summary = {
    'pattern_count_expected': len(patterns),
    'segment_occurrence_count_expected': sum(
        max(0, len(row.get('stop_ids', [])) - 1)
        for row in patterns.values()
    ),
    'segment_occurrence_count_created': len(features),
    'missing_cache_count': len(missing_cache),
    'invalid_case_count': len(invalid_cases),
    'segments_with_less_than_two_coordinates': len(
        short_geometries
    ),
    'distance_difference_over_1m_count': len(
        differences_over_1m
    ),
    'distance_difference_over_5m_count': len(
        differences_over_5m
    ),
    'maximum_distance_difference_m': round(
        maximum_distance_difference,
        3
    ),
    'maximum_difference_case': maximum_difference_case,
    'output_geojson': str(OUT_GEOJSON),
    'quality_csv': str(OUT_CSV),
    'missing_cache_patterns': missing_cache,
    'invalid_cases': invalid_cases,
}

with open(
    OUT_SUMMARY,
    'w',
    encoding='utf-8'
) as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Segmentgeometrien erfolgreich erzeugt')
print(
    'Erwartete Segmentvorkommen:',
    summary['segment_occurrence_count_expected']
)
print(
    'Erzeugte Segmentvorkommen:',
    summary['segment_occurrence_count_created']
)
print(
    'Fehlende Cachedateien:',
    summary['missing_cache_count']
)
print(
    'Ungültige Fälle:',
    summary['invalid_case_count']
)
print(
    'Segmente mit weniger als 2 Koordinaten:',
    summary[
        'segments_with_less_than_two_coordinates'
    ]
)
print(
    'Distanzabweichung über 1 m:',
    summary['distance_difference_over_1m_count']
)
print(
    'Distanzabweichung über 5 m:',
    summary['distance_difference_over_5m_count']
)
print(
    'Maximale Distanzabweichung:',
    summary['maximum_distance_difference_m'],
    'm'
)
print('GeoJSON:', OUT_GEOJSON)
print('Qualitätsbericht:', OUT_CSV)
print('Zusammenfassung:', OUT_SUMMARY)
