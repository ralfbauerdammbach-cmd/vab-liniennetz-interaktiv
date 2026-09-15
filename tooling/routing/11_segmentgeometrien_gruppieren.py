import hashlib
import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

INPUT_GEOJSON = BASE / 'segmentvorkommen_routed.geojson'

OUT_GEOJSON = BASE / 'segmente_normalisiert_routed.geojson'
OUT_SUMMARY = REPORT_DIR / 'segmente_normalisiert_routed_summary.json'


def geometry_hash(coordinates):
    """
    Exakte Geometrieerkennung auf Basis der ausgegebenen
    OSRM-Koordinaten. Die Richtung bleibt erhalten.
    """
    serialized = json.dumps(
        coordinates,
        ensure_ascii=False,
        separators=(',', ':'),
    )

    return hashlib.sha1(
        serialized.encode('utf-8')
    ).hexdigest()


with open(INPUT_GEOJSON, encoding='utf-8') as f:
    source = json.load(f)

groups = {}

for feature in source.get('features', []):
    props = feature.get('properties', {})
    geometry = feature.get('geometry', {})
    coordinates = geometry.get('coordinates', [])

    from_station_id = props.get('from_station_id', '')
    to_station_id = props.get('to_station_id', '')

    geom_hash = geometry_hash(coordinates)

    key = (
        from_station_id,
        to_station_id,
        geom_hash,
    )

    if key not in groups:
        groups[key] = {
            'from_station_id': from_station_id,
            'from_station_name': props.get(
                'from_station_name',
                ''
            ),
            'to_station_id': to_station_id,
            'to_station_name': props.get(
                'to_station_name',
                ''
            ),
            'geometry_hash': geom_hash,
            'coordinates': coordinates,
            'lines': set(),
            'pattern_ids': set(),
            'route_ids': set(),
            'direction_ids': set(),
            'segment_occurrence_ids': set(),
            'raw_stop_pairs': set(),
            'occurrence_count': 0,
            'trip_count_sum': 0,
            'distance_values': [],
            'duration_values': [],
        }

    group = groups[key]

    group['lines'].add(str(props.get('line', '')))
    group['pattern_ids'].add(props.get('pattern_id', ''))
    group['route_ids'].add(props.get('route_id', ''))
    group['direction_ids'].add(
        str(props.get('direction_id', ''))
    )
    group['segment_occurrence_ids'].add(
        props.get('segment_occurrence_id', '')
    )
    group['raw_stop_pairs'].add((
        props.get('from_stop_id', ''),
        props.get('to_stop_id', ''),
    ))

    group['occurrence_count'] += 1
    group['trip_count_sum'] += int(
        props.get('trip_count', 0) or 0
    )

    group['distance_values'].append(
        float(props.get('distance_m', 0) or 0)
    )
    group['duration_values'].append(
        float(props.get('duration_s', 0) or 0)
    )

sorted_groups = sorted(
    groups.values(),
    key=lambda row: (
        row['from_station_name'],
        row['to_station_name'],
        row['from_station_id'],
        row['to_station_id'],
        row['geometry_hash'],
    )
)

features = []

for number, group in enumerate(sorted_groups, start=1):
    segment_id = f'gseg-{number:05d}'

    lines = sorted(
        value
        for value in group['lines']
        if value
    )

    pattern_ids = sorted(
        value
        for value in group['pattern_ids']
        if value
    )

    route_ids = sorted(
        value
        for value in group['route_ids']
        if value
    )

    direction_ids = sorted(
        value
        for value in group['direction_ids']
        if value != ''
    )

    raw_stop_pairs = [
        {
            'from_stop_id': pair[0],
            'to_stop_id': pair[1],
        }
        for pair in sorted(group['raw_stop_pairs'])
    ]

    properties = {
        'grouped_segment_id': segment_id,
        'from_station_id': group['from_station_id'],
        'from_station_name': group['from_station_name'],
        'to_station_id': group['to_station_id'],
        'to_station_name': group['to_station_name'],
        'geometry_hash': group['geometry_hash'],
        'lines': lines,
        'line_count': len(lines),
        'pattern_ids': pattern_ids,
        'pattern_count': len(pattern_ids),
        'route_ids': route_ids,
        'direction_ids': direction_ids,
        'occurrence_count': group['occurrence_count'],
        'trip_count_sum': group['trip_count_sum'],
        'segment_occurrence_ids': sorted(
            value
            for value in group['segment_occurrence_ids']
            if value
        ),
        'raw_stop_pairs': raw_stop_pairs,
        'raw_stop_pair_count': len(raw_stop_pairs),
        'distance_m_min': round(
            min(group['distance_values']),
            2
        ),
        'distance_m_max': round(
            max(group['distance_values']),
            2
        ),
        'duration_s_min': round(
            min(group['duration_values']),
            2
        ),
        'duration_s_max': round(
            max(group['duration_values']),
            2
        ),
    }

    features.append({
        'type': 'Feature',
        'properties': properties,
        'geometry': {
            'type': 'LineString',
            'coordinates': group['coordinates'],
        },
    })

pair_to_geometries = defaultdict(set)
pair_to_lines = defaultdict(set)

for feature in features:
    props = feature['properties']

    pair = (
        props['from_station_id'],
        props['to_station_id'],
    )

    pair_to_geometries[pair].add(
        props['geometry_hash']
    )

    pair_to_lines[pair].update(
        props['lines']
    )

shared_features = [
    feature
    for feature in features
    if feature['properties']['line_count'] > 1
]

pairs_with_multiple_geometries = {
    pair: hashes
    for pair, hashes in pair_to_geometries.items()
    if len(hashes) > 1
}

pairs_used_by_multiple_lines = {
    pair: lines
    for pair, lines in pair_to_lines.items()
    if len(lines) > 1
}

collection = {
    'type': 'FeatureCollection',
    'features': features,
}

with open(OUT_GEOJSON, 'w', encoding='utf-8') as f:
    json.dump(
        collection,
        f,
        ensure_ascii=False,
        separators=(',', ':'),
    )

summary = {
    'source_segment_occurrences': len(
        source.get('features', [])
    ),
    'grouped_directed_segment_geometries': len(features),
    'grouped_geometries_used_by_multiple_lines': len(
        shared_features
    ),
    'normalized_station_pairs': len(pair_to_geometries),
    'station_pairs_used_by_multiple_lines': len(
        pairs_used_by_multiple_lines
    ),
    'station_pairs_with_multiple_geometries': len(
        pairs_with_multiple_geometries
    ),
    'maximum_geometry_variants_per_station_pair': max(
        (
            len(hashes)
            for hashes in pair_to_geometries.values()
        ),
        default=0,
    ),
    'output_geojson': str(OUT_GEOJSON),
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Segmentgeometrien erfolgreich gruppiert')
print(
    'Segmentvorkommen:',
    summary['source_segment_occurrences']
)
print(
    'Gruppierte gerichtete Segmentgeometrien:',
    summary['grouped_directed_segment_geometries']
)
print(
    'Geometrien mit mehreren Linien:',
    summary[
        'grouped_geometries_used_by_multiple_lines'
    ]
)
print(
    'Normalisierte Stationspaare:',
    summary['normalized_station_pairs']
)
print(
    'Stationspaare mit mehreren Linien:',
    summary['station_pairs_used_by_multiple_lines']
)
print(
    'Stationspaare mit mehreren Fahrweggeometrien:',
    summary[
        'station_pairs_with_multiple_geometries'
    ]
)
print(
    'Maximale Geometrievarianten je Stationspaar:',
    summary[
        'maximum_geometry_variants_per_station_pair'
    ]
)
print('GeoJSON:', OUT_GEOJSON)
print('Zusammenfassung:', OUT_SUMMARY)
