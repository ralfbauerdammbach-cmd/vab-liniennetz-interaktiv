import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

SEGMENT_FILE = BASE / 'segmente_interaktiv_routed.geojson'
INVENTORY_FILE = REPORT_DIR / 'fahrtmuster_inventur.json'

OUT_GEOJSON = BASE / 'gemeinsame_linienabschnitte.geojson'
OUT_SUMMARY = REPORT_DIR / 'gemeinsame_linienabschnitte_summary.json'


with open(SEGMENT_FILE, encoding='utf-8') as f:
    segment_collection = json.load(f)

with open(INVENTORY_FILE, encoding='utf-8') as f:
    inventory = json.load(f)


segments_by_id = {}
occurrence_to_segment = {}

for feature in segment_collection.get('features', []):
    props = feature.get('properties', {})
    segment_id = props.get('interactive_segment_id', '')

    if not segment_id:
        continue

    segments_by_id[segment_id] = feature

    for occurrence_id in props.get(
        'segment_occurrence_ids',
        []
    ):
        occurrence_to_segment[occurrence_id] = segment_id


def combine_coordinates(segment_ids):
    coordinates = []

    for segment_id in segment_ids:
        feature = segments_by_id[segment_id]

        part = feature.get(
            'geometry',
            {}
        ).get('coordinates', [])

        if not part:
            continue

        if not coordinates:
            coordinates.extend(part)
        elif coordinates[-1] == part[0]:
            coordinates.extend(part[1:])
        else:
            # Kleine Abweichungen durch zusammengeführte
            # Repräsentativgeometrien sind möglich.
            coordinates.extend(part)

    return coordinates


raw_sections = []

missing_occurrences = []
pattern_segment_count = 0

for pattern in inventory.get('patterns', []):
    pattern_id = pattern['pattern_id']
    stop_ids = pattern.get('stop_ids', [])
    line = str(pattern.get('line', ''))

    ordered_segments = []

    for sequence in range(1, len(stop_ids)):
        occurrence_id = f'{pattern_id}-{sequence:03d}'
        segment_id = occurrence_to_segment.get(occurrence_id)

        if not segment_id:
            missing_occurrences.append(occurrence_id)
            continue

        feature = segments_by_id[segment_id]
        props = feature.get('properties', {})

        ordered_segments.append({
            'sequence': sequence,
            'segment_id': segment_id,
            'lines': tuple(sorted(props.get('lines', []))),
        })

        pattern_segment_count += 1

    current = []

    for item in ordered_segments:
        is_shared = len(item['lines']) > 1

        if not is_shared:
            if current:
                raw_sections.append({
                    'pattern_id': pattern_id,
                    'line': line,
                    'segments': current,
                })
                current = []

            continue

        if (
            current
            and item['sequence']
            == current[-1]['sequence'] + 1
            and item['lines'] == current[-1]['lines']
        ):
            current.append(item)
        else:
            if current:
                raw_sections.append({
                    'pattern_id': pattern_id,
                    'line': line,
                    'segments': current,
                })

            current = [item]

    if current:
        raw_sections.append({
            'pattern_id': pattern_id,
            'line': line,
            'segments': current,
        })


# Identische gerichtete Abschnittsketten aus verschiedenen
# Fahrtmustern zusammenfassen.
grouped_sections = {}

for section in raw_sections:
    segment_ids = tuple(
        item['segment_id']
        for item in section['segments']
    )

    lines = section['segments'][0]['lines']

    key = (
        segment_ids,
        lines,
    )

    if key not in grouped_sections:
        grouped_sections[key] = {
            'segment_ids': segment_ids,
            'lines': lines,
            'pattern_ids': set(),
            'source_lines': set(),
            'occurrence_count': 0,
        }

    target = grouped_sections[key]

    target['pattern_ids'].add(section['pattern_id'])
    target['source_lines'].add(section['line'])
    target['occurrence_count'] += 1


features = []

for number, group in enumerate(
    sorted(
        grouped_sections.values(),
        key=lambda row: (
            row['lines'],
            row['segment_ids'],
        )
    ),
    start=1
):
    segment_ids = list(group['segment_ids'])

    first_props = segments_by_id[
        segment_ids[0]
    ]['properties']

    last_props = segments_by_id[
        segment_ids[-1]
    ]['properties']

    coordinates = combine_coordinates(segment_ids)

    features.append({
        'type': 'Feature',
        'properties': {
            'shared_section_id': f'shared-{number:05d}',
            'from_station_id': first_props.get(
                'from_station_id',
                ''
            ),
            'from_station_name': first_props.get(
                'from_station_name',
                ''
            ),
            'to_station_id': last_props.get(
                'to_station_id',
                ''
            ),
            'to_station_name': last_props.get(
                'to_station_name',
                ''
            ),
            'lines': list(group['lines']),
            'line_count': len(group['lines']),
            'segment_ids': segment_ids,
            'segment_count': len(segment_ids),
            'pattern_ids': sorted(group['pattern_ids']),
            'pattern_count': len(group['pattern_ids']),
            'source_lines': sorted(group['source_lines']),
            'occurrence_count': group['occurrence_count'],
            'direction_label': (
                f'{first_props.get("from_station_name", "")}'
                f' → '
                f'{last_props.get("to_station_name", "")}'
            ),
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': coordinates,
        },
    })


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


empty_geometries = [
    feature
    for feature in features
    if len(
        feature.get('geometry', {}).get(
            'coordinates',
            []
        )
    ) < 2
]

line_count_distribution = defaultdict(int)
segment_count_distribution = defaultdict(int)

for feature in features:
    props = feature['properties']

    line_count_distribution[
        props['line_count']
    ] += 1

    segment_count_distribution[
        props['segment_count']
    ] += 1


summary = {
    'pattern_segments_processed': pattern_segment_count,
    'raw_shared_section_occurrences': len(raw_sections),
    'unique_directed_shared_sections': len(features),
    'single_segment_shared_sections': sum(
        1
        for feature in features
        if feature['properties']['segment_count'] == 1
    ),
    'multi_segment_shared_sections': sum(
        1
        for feature in features
        if feature['properties']['segment_count'] > 1
    ),
    'maximum_segments_per_shared_section': max(
        (
            feature['properties']['segment_count']
            for feature in features
        ),
        default=0,
    ),
    'maximum_lines_per_shared_section': max(
        (
            feature['properties']['line_count']
            for feature in features
        ),
        default=0,
    ),
    'missing_occurrence_count': len(missing_occurrences),
    'empty_geometry_count': len(empty_geometries),
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
    'output_geojson': str(OUT_GEOJSON),
    'missing_occurrences': missing_occurrences,
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2,
    )


print('Gemeinsame Linienabschnitte erzeugt')
print(
    'Verarbeitete Segmentvorkommen:',
    summary['pattern_segments_processed']
)
print(
    'Gemeinsame Abschnittsvorkommen:',
    summary['raw_shared_section_occurrences']
)
print(
    'Eindeutige gerichtete gemeinsame Abschnitte:',
    summary['unique_directed_shared_sections']
)
print(
    'Davon einzelne Haltestellensegmente:',
    summary['single_segment_shared_sections']
)
print(
    'Davon zusammenhängende Mehrfachsegmente:',
    summary['multi_segment_shared_sections']
)
print(
    'Maximale Segmente je gemeinsamem Abschnitt:',
    summary['maximum_segments_per_shared_section']
)
print(
    'Maximale Linienzahl je gemeinsamem Abschnitt:',
    summary['maximum_lines_per_shared_section']
)
print(
    'Fehlende Segmentvorkommen:',
    summary['missing_occurrence_count']
)
print(
    'Leere oder ungültige Geometrien:',
    summary['empty_geometry_count']
)
print('GeoJSON:', OUT_GEOJSON)
print('Zusammenfassung:', OUT_SUMMARY)
