import json
import math
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

SECTION_FILE = BASE / 'gemeinsame_linienabschnitte.geojson'
SEGMENT_FILE = BASE / 'segmente_interaktiv_routed.geojson'

OUT_FILE = (
    REPORT_DIR
    / 'gemeinsame_abschnitte_kontinuitaet.json'
)


def haversine_m(first, second):
    lon1, lat1 = first
    lon2, lat2 = second

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


with open(SECTION_FILE, encoding='utf-8') as f:
    sections = json.load(f)

with open(SEGMENT_FILE, encoding='utf-8') as f:
    segments = json.load(f)

segments_by_id = {}

for feature in segments.get('features', []):
    props = feature.get('properties', {})
    segment_id = props.get('interactive_segment_id', '')

    if segment_id:
        segments_by_id[segment_id] = feature


connections = []
missing_segment_ids = []

for feature in sections.get('features', []):
    props = feature.get('properties', {})
    section_id = props.get('shared_section_id', '')
    segment_ids = props.get('segment_ids', [])

    if len(segment_ids) < 2:
        continue

    for position, (first_id, second_id) in enumerate(
        zip(segment_ids, segment_ids[1:]),
        start=1
    ):
        first = segments_by_id.get(first_id)
        second = segments_by_id.get(second_id)

        if first is None:
            missing_segment_ids.append(first_id)
            continue

        if second is None:
            missing_segment_ids.append(second_id)
            continue

        first_coordinates = (
            first.get('geometry', {})
            .get('coordinates', [])
        )

        second_coordinates = (
            second.get('geometry', {})
            .get('coordinates', [])
        )

        if not first_coordinates or not second_coordinates:
            continue

        first_end = first_coordinates[-1]
        second_start = second_coordinates[0]

        gap = haversine_m(
            first_end,
            second_start
        )

        connections.append({
            'shared_section_id': section_id,
            'position': position,
            'first_segment_id': first_id,
            'second_segment_id': second_id,
            'from_station_name': (
                first.get('properties', {})
                .get('to_station_name', '')
            ),
            'first_end': first_end,
            'second_start': second_start,
            'gap_m': round(gap, 3),
            'lines': props.get('lines', []),
        })


over_1m = [
    row for row in connections
    if row['gap_m'] > 1
]

over_5m = [
    row for row in connections
    if row['gap_m'] > 5
]

over_20m = [
    row for row in connections
    if row['gap_m'] > 20
]

largest = sorted(
    connections,
    key=lambda row: row['gap_m'],
    reverse=True
)

summary = {
    'shared_section_count': len(
        sections.get('features', [])
    ),
    'segment_connections_checked': len(connections),
    'exact_connections': sum(
        1 for row in connections
        if row['gap_m'] == 0
    ),
    'connections_over_1m': len(over_1m),
    'connections_over_5m': len(over_5m),
    'connections_over_20m': len(over_20m),
    'maximum_gap_m': max(
        (
            row['gap_m']
            for row in connections
        ),
        default=0,
    ),
    'missing_segment_id_count': len(
        set(missing_segment_ids)
    ),
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'largest_gaps': largest[:100],
        },
        f,
        ensure_ascii=False,
        indent=2,
    )


print('Kontinuitätsprüfung abgeschlossen')
print(
    'Gemeinsame Abschnitte:',
    summary['shared_section_count']
)
print(
    'Geprüfte Segmentverbindungen:',
    summary['segment_connections_checked']
)
print(
    'Exakt verbundene Übergänge:',
    summary['exact_connections']
)
print(
    'Übergänge mit Lücke über 1 m:',
    summary['connections_over_1m']
)
print(
    'Übergänge mit Lücke über 5 m:',
    summary['connections_over_5m']
)
print(
    'Übergänge mit Lücke über 20 m:',
    summary['connections_over_20m']
)
print(
    'Maximale Lücke:',
    summary['maximum_gap_m'],
    'm'
)
print(
    'Fehlende Segment-IDs:',
    summary['missing_segment_id_count']
)

if largest:
    print()
    print('Die 15 größten Übergangslücken:')
    print()

    for number, row in enumerate(
        largest[:15],
        start=1
    ):
        print(
            f'{number:02d} | '
            f'{row["gap_m"]:.3f} m | '
            f'{row["from_station_name"]} | '
            f'Linien: {", ".join(row["lines"])} | '
            f'{row["shared_section_id"]}'
        )

print()
print('Bericht:', OUT_FILE)
