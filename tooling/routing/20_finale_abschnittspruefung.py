import json
from collections import Counter
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

INPUT_FILE = (
    BASE / 'gemeinsame_linienabschnitte_final.geojson'
)

OUT_FILE = (
    REPORT_DIR
    / 'gemeinsame_linienabschnitte_final_pruefung.json'
)

with open(INPUT_FILE, encoding='utf-8') as f:
    collection = json.load(f)

features = collection.get('features', [])

section_ids = []
invalid_geometry = []
missing_properties = []
single_line_sections = []
duplicate_ids = []

line_count_distribution = Counter()
segment_count_distribution = Counter()

required_properties = [
    'shared_section_id',
    'from_station_id',
    'from_station_name',
    'to_station_id',
    'to_station_name',
    'lines',
    'line_count',
    'segment_ids',
    'segment_count',
    'direction_label',
]

for feature_number, feature in enumerate(
    features,
    start=1
):
    props = feature.get('properties', {})
    geometry = feature.get('geometry', {})

    section_id = props.get('shared_section_id', '')
    section_ids.append(section_id)

    coordinates = geometry.get('coordinates', [])

    if (
        geometry.get('type') != 'LineString'
        or len(coordinates) < 2
    ):
        invalid_geometry.append({
            'feature_number': feature_number,
            'shared_section_id': section_id,
            'geometry_type': geometry.get('type', ''),
            'coordinate_count': len(coordinates),
        })

    missing = [
        name
        for name in required_properties
        if name not in props
        or props.get(name) in (None, '')
    ]

    if missing:
        missing_properties.append({
            'feature_number': feature_number,
            'shared_section_id': section_id,
            'missing_properties': missing,
        })

    lines = props.get('lines', [])
    line_count = int(props.get('line_count', 0) or 0)
    segment_count = int(
        props.get('segment_count', 0) or 0
    )

    line_count_distribution[line_count] += 1
    segment_count_distribution[segment_count] += 1

    if len(lines) < 2 or line_count < 2:
        single_line_sections.append({
            'shared_section_id': section_id,
            'lines': lines,
            'line_count': line_count,
        })

id_counts = Counter(section_ids)

duplicate_ids = sorted(
    section_id
    for section_id, count in id_counts.items()
    if section_id and count > 1
)

empty_ids = sum(
    1 for section_id in section_ids
    if not section_id
)

continuity_corrected_count = sum(
    1
    for feature in features
    if feature.get('properties', {}).get(
        'continuity_corrected',
        False
    )
)

summary = {
    'geojson_type': collection.get('type', ''),
    'feature_count': len(features),
    'unique_section_id_count': len({
        section_id
        for section_id in section_ids
        if section_id
    }),
    'duplicate_section_id_count': len(duplicate_ids),
    'empty_section_id_count': empty_ids,
    'invalid_geometry_count': len(invalid_geometry),
    'missing_property_case_count': len(
        missing_properties
    ),
    'single_line_section_count': len(
        single_line_sections
    ),
    'continuity_corrected_section_count': (
        continuity_corrected_count
    ),
    'maximum_line_count': max(
        line_count_distribution,
        default=0
    ),
    'maximum_segment_count': max(
        segment_count_distribution,
        default=0
    ),
    'line_count_distribution': {
        str(key): value
        for key, value in sorted(
            line_count_distribution.items()
        )
    },
    'segment_count_distribution': {
        str(key): value
        for key, value in sorted(
            segment_count_distribution.items()
        )
    },
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'duplicate_section_ids': duplicate_ids,
            'invalid_geometries': invalid_geometry,
            'missing_properties': missing_properties,
            'single_line_sections': single_line_sections,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Finale Abschnittsprüfung abgeschlossen')
print('GeoJSON-Typ:', summary['geojson_type'])
print('Gemeinsame Abschnitte:', summary['feature_count'])
print(
    'Eindeutige Abschnitts-IDs:',
    summary['unique_section_id_count']
)
print(
    'Doppelte Abschnitts-IDs:',
    summary['duplicate_section_id_count']
)
print(
    'Leere Abschnitts-IDs:',
    summary['empty_section_id_count']
)
print(
    'Ungültige Geometrien:',
    summary['invalid_geometry_count']
)
print(
    'Fälle mit fehlenden Eigenschaften:',
    summary['missing_property_case_count']
)
print(
    'Abschnitte mit weniger als zwei Linien:',
    summary['single_line_section_count']
)
print(
    'Abschnitte mit Kontinuitätskorrektur:',
    summary['continuity_corrected_section_count']
)
print(
    'Maximale Linienzahl:',
    summary['maximum_line_count']
)
print(
    'Maximale Segmentzahl:',
    summary['maximum_segment_count']
)
print('Bericht:', OUT_FILE)
