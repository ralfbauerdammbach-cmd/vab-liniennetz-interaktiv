import json
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

INPUT_GEOJSON = (
    BASE / 'segmente_normalisiert_routed.geojson'
)
GROUP_FILE = (
    REPORT_DIR / 'strenge_zusammenfuehrungsgruppen.json'
)

OUT_GEOJSON = (
    BASE / 'segmente_interaktiv_routed.geojson'
)
OUT_SUMMARY = (
    REPORT_DIR / 'segmente_interaktiv_routed_summary.json'
)

with open(INPUT_GEOJSON, encoding='utf-8') as f:
    collection = json.load(f)

with open(GROUP_FILE, encoding='utf-8') as f:
    group_data = json.load(f)

features_by_id = {}

for feature in collection.get('features', []):
    props = feature.get('properties', {})
    segment_id = props.get('grouped_segment_id', '')

    if segment_id:
        features_by_id[segment_id] = feature

output_features = []
missing_segment_ids = []
duplicate_assignments = []

assigned_segment_ids = set()

for number, group in enumerate(
    group_data.get('groups', []),
    start=1
):
    segment_ids = group.get('segment_ids', [])
    representative_id = group.get(
        'representative_segment_id',
        ''
    )

    group_features = []

    for segment_id in segment_ids:
        if segment_id in assigned_segment_ids:
            duplicate_assignments.append(segment_id)

        assigned_segment_ids.add(segment_id)

        feature = features_by_id.get(segment_id)

        if feature is None:
            missing_segment_ids.append(segment_id)
            continue

        group_features.append(feature)

    representative = features_by_id.get(
        representative_id
    )

    if representative is None or not group_features:
        continue

    lines = set()
    pattern_ids = set()
    route_ids = set()
    direction_ids = set()
    occurrence_ids = set()
    raw_stop_pairs = set()
    source_geometry_ids = set()

    occurrence_count = 0
    trip_count_sum = 0

    distance_values_min = []
    distance_values_max = []
    duration_values_min = []
    duration_values_max = []

    for feature in group_features:
        props = feature.get('properties', {})

        lines.update(props.get('lines', []))
        pattern_ids.update(props.get('pattern_ids', []))
        route_ids.update(props.get('route_ids', []))
        direction_ids.update(
            str(value)
            for value in props.get('direction_ids', [])
        )

        occurrence_ids.update(
            props.get('segment_occurrence_ids', [])
        )

        source_geometry_ids.add(
            props.get('grouped_segment_id', '')
        )

        for pair in props.get('raw_stop_pairs', []):
            raw_stop_pairs.add((
                pair.get('from_stop_id', ''),
                pair.get('to_stop_id', ''),
            ))

        occurrence_count += int(
            props.get('occurrence_count', 0) or 0
        )

        trip_count_sum += int(
            props.get('trip_count_sum', 0) or 0
        )

        distance_values_min.append(
            float(props.get('distance_m_min', 0) or 0)
        )
        distance_values_max.append(
            float(props.get('distance_m_max', 0) or 0)
        )
        duration_values_min.append(
            float(props.get('duration_s_min', 0) or 0)
        )
        duration_values_max.append(
            float(props.get('duration_s_max', 0) or 0)
        )

    representative_props = representative.get(
        'properties',
        {}
    )

    segment_id = f'iseg-{number:05d}'

    properties = {
        'interactive_segment_id': segment_id,
        'representative_segment_id': representative_id,
        'source_geometry_ids': sorted(
            value
            for value in source_geometry_ids
            if value
        ),
        'source_geometry_count': len(
            source_geometry_ids
        ),
        'geometry_merged': (
            len(source_geometry_ids) > 1
        ),
        'from_station_id': representative_props.get(
            'from_station_id',
            ''
        ),
        'from_station_name': representative_props.get(
            'from_station_name',
            ''
        ),
        'to_station_id': representative_props.get(
            'to_station_id',
            ''
        ),
        'to_station_name': representative_props.get(
            'to_station_name',
            ''
        ),
        'lines': sorted(
            value for value in lines if value
        ),
        'line_count': len([
            value for value in lines if value
        ]),
        'pattern_ids': sorted(
            value for value in pattern_ids if value
        ),
        'pattern_count': len([
            value for value in pattern_ids if value
        ]),
        'route_ids': sorted(
            value for value in route_ids if value
        ),
        'direction_ids': sorted(
            value for value in direction_ids
            if value != ''
        ),
        'occurrence_count': occurrence_count,
        'trip_count_sum': trip_count_sum,
        'segment_occurrence_ids': sorted(
            value for value in occurrence_ids
            if value
        ),
        'raw_stop_pairs': [
            {
                'from_stop_id': pair[0],
                'to_stop_id': pair[1],
            }
            for pair in sorted(raw_stop_pairs)
        ],
        'raw_stop_pair_count': len(raw_stop_pairs),
        'distance_m_min': round(
            min(distance_values_min),
            2
        ) if distance_values_min else 0,
        'distance_m_max': round(
            max(distance_values_max),
            2
        ) if distance_values_max else 0,
        'duration_s_min': round(
            min(duration_values_min),
            2
        ) if duration_values_min else 0,
        'duration_s_max': round(
            max(duration_values_max),
            2
        ) if duration_values_max else 0,
        'merge_rule': (
            'P95 ≤ 5 m; Maximum ≤ 20 m; '
            'Längendifferenz ≤ 3 %; '
            'Start/Ende ≤ 20 m'
            if len(source_geometry_ids) > 1
            else 'keine Zusammenführung'
        ),
    }

    output_features.append({
        'type': 'Feature',
        'properties': properties,
        'geometry': representative.get('geometry', {}),
    })

unassigned_segment_ids = sorted(
    set(features_by_id) - assigned_segment_ids
)

output_collection = {
    'type': 'FeatureCollection',
    'features': output_features,
}

with open(OUT_GEOJSON, 'w', encoding='utf-8') as f:
    json.dump(
        output_collection,
        f,
        ensure_ascii=False,
        separators=(',', ':'),
    )

merged_features = [
    feature
    for feature in output_features
    if feature['properties']['geometry_merged']
]

multi_line_features = [
    feature
    for feature in output_features
    if feature['properties']['line_count'] > 1
]

single_line_features = [
    feature
    for feature in output_features
    if feature['properties']['line_count'] == 1
]

empty_geometry_features = [
    feature
    for feature in output_features
    if len(
        feature.get('geometry', {}).get(
            'coordinates',
            []
        )
    ) < 2
]

summary = {
    'input_geometry_count': len(features_by_id),
    'strict_group_count': len(
        group_data.get('groups', [])
    ),
    'output_geometry_count': len(output_features),
    'merged_output_geometry_count': len(
        merged_features
    ),
    'multi_line_geometry_count': len(
        multi_line_features
    ),
    'single_line_geometry_count': len(
        single_line_features
    ),
    'missing_segment_id_count': len(
        missing_segment_ids
    ),
    'duplicate_assignment_count': len(
        duplicate_assignments
    ),
    'unassigned_segment_id_count': len(
        unassigned_segment_ids
    ),
    'empty_geometry_count': len(
        empty_geometry_features
    ),
    'maximum_lines_per_geometry': max(
        (
            feature['properties']['line_count']
            for feature in output_features
        ),
        default=0,
    ),
    'maximum_source_geometries_per_output': max(
        (
            feature['properties'][
                'source_geometry_count'
            ]
            for feature in output_features
        ),
        default=0,
    ),
    'output_geojson': str(OUT_GEOJSON),
    'missing_segment_ids': missing_segment_ids,
    'duplicate_assignments': duplicate_assignments,
    'unassigned_segment_ids': (
        unassigned_segment_ids
    ),
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Interaktive Segmentgeometrien erzeugt')
print(
    'Eingangsgeometrien:',
    summary['input_geometry_count']
)
print(
    'Ausgabegeometrien:',
    summary['output_geometry_count']
)
print(
    'Davon zusammengeführte Geometrien:',
    summary['merged_output_geometry_count']
)
print(
    'Davon Mehrlinien-Geometrien:',
    summary['multi_line_geometry_count']
)
print(
    'Davon Einlinien-Geometrien:',
    summary['single_line_geometry_count']
)
print(
    'Fehlende Segment-IDs:',
    summary['missing_segment_id_count']
)
print(
    'Doppelte Zuordnungen:',
    summary['duplicate_assignment_count']
)
print(
    'Nicht zugeordnete Segment-IDs:',
    summary['unassigned_segment_id_count']
)
print(
    'Leere oder ungültige Geometrien:',
    summary['empty_geometry_count']
)
print(
    'Maximale Linienzahl je Geometrie:',
    summary['maximum_lines_per_geometry']
)
print(
    'Maximale Quellgeometrien je Ausgabe:',
    summary[
        'maximum_source_geometries_per_output'
    ]
)
print('GeoJSON:', OUT_GEOJSON)
print('Zusammenfassung:', OUT_SUMMARY)
