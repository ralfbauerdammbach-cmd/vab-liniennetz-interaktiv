import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

RULE_FILE = (
    REPORT_DIR / 'zusammenfuehrungsregel_pruefung.json'
)
SEGMENT_FILE = (
    BASE / 'segmente_normalisiert_routed.geojson'
)
OUT_FILE = (
    REPORT_DIR / 'strenge_zusammenfuehrungsgruppen.json'
)

with open(RULE_FILE, encoding='utf-8') as f:
    rule_data = json.load(f)

with open(SEGMENT_FILE, encoding='utf-8') as f:
    segment_collection = json.load(f)

segment_info = {}

for feature in segment_collection.get('features', []):
    props = feature.get('properties', {})
    segment_id = props.get('grouped_segment_id', '')

    segment_info[segment_id] = {
        'segment_id': segment_id,
        'from_station_id': props.get(
            'from_station_id',
            ''
        ),
        'from_station_name': props.get(
            'from_station_name',
            ''
        ),
        'to_station_id': props.get(
            'to_station_id',
            ''
        ),
        'to_station_name': props.get(
            'to_station_name',
            ''
        ),
        'lines': sorted(props.get('lines', [])),
        'line_count': int(
            props.get('line_count', 0)
        ),
        'pattern_count': int(
            props.get('pattern_count', 0)
        ),
        'occurrence_count': int(
            props.get('occurrence_count', 0)
        ),
        'trip_count_sum': int(
            props.get('trip_count_sum', 0)
        ),
        'coordinate_count': len(
            feature.get(
                'geometry',
                {}
            ).get('coordinates', [])
        ),
    }

accepted_lookup = set()

for row in rule_data.get('accepted_pairs', []):
    accepted_lookup.add(
        frozenset({
            row['first_segment_id'],
            row['second_segment_id'],
        })
    )

segments_by_station_pair = defaultdict(list)

for segment_id, info in segment_info.items():
    station_pair = (
        info['from_station_id'],
        info['to_station_id'],
    )

    segments_by_station_pair[station_pair].append(
        segment_id
    )


def directly_similar(first, second):
    if first == second:
        return True

    return (
        frozenset({first, second})
        in accepted_lookup
    )


strict_groups = []

for station_pair, segment_ids in sorted(
    segments_by_station_pair.items()
):
    # Zuerst die fachlich am stärksten belegte Variante.
    remaining = sorted(
        segment_ids,
        key=lambda segment_id: (
            -segment_info[segment_id][
                'occurrence_count'
            ],
            -segment_info[segment_id][
                'trip_count_sum'
            ],
            -segment_info[segment_id][
                'line_count'
            ],
            segment_id,
        )
    )

    while remaining:
        representative = remaining.pop(0)
        group = [representative]

        # Mehrfach durchlaufen, damit passende Kandidaten
        # nicht nur wegen der ursprünglichen Reihenfolge
        # übergangen werden.
        changed = True

        while changed:
            changed = False

            for candidate in list(remaining):
                if all(
                    directly_similar(candidate, member)
                    for member in group
                ):
                    group.append(candidate)
                    remaining.remove(candidate)
                    changed = True

        representative_info = segment_info[
            representative
        ]

        strict_groups.append({
            'from_station_id': station_pair[0],
            'from_station_name': representative_info[
                'from_station_name'
            ],
            'to_station_id': station_pair[1],
            'to_station_name': representative_info[
                'to_station_name'
            ],
            'representative_segment_id': representative,
            'segment_ids': sorted(group),
            'segment_count': len(group),
            'lines': sorted({
                line
                for segment_id in group
                for line in segment_info[
                    segment_id
                ]['lines']
            }),
            'occurrence_count_sum': sum(
                segment_info[segment_id][
                    'occurrence_count'
                ]
                for segment_id in group
            ),
            'trip_count_sum': sum(
                segment_info[segment_id][
                    'trip_count_sum'
                ]
                for segment_id in group
            ),
        })

# Sicherheitsprüfung: Innerhalb jeder Gruppe muss jedes
# mögliche Paar direkt akzeptiert sein.
invalid_groups = []

for group in strict_groups:
    segment_ids = group['segment_ids']
    missing_pairs = []

    for index, first in enumerate(segment_ids):
        for second in segment_ids[index + 1:]:
            if not directly_similar(first, second):
                missing_pairs.append([first, second])

    if missing_pairs:
        invalid_groups.append({
            **group,
            'missing_pairs': missing_pairs,
        })

merge_groups = [
    group
    for group in strict_groups
    if group['segment_count'] > 1
]

single_groups = [
    group
    for group in strict_groups
    if group['segment_count'] == 1
]

geometries_in_merge_groups = sum(
    group['segment_count']
    for group in merge_groups
)

resulting_geometry_count = len(strict_groups)

maximum_group_size = max(
    (
        group['segment_count']
        for group in strict_groups
    ),
    default=0,
)

groups_by_size = defaultdict(int)

for group in strict_groups:
    groups_by_size[group['segment_count']] += 1

summary = {
    'original_geometry_count': len(segment_info),
    'strict_group_count': len(strict_groups),
    'merge_group_count': len(merge_groups),
    'single_group_count': len(single_groups),
    'geometries_in_merge_groups': (
        geometries_in_merge_groups
    ),
    'resulting_geometry_count': (
        resulting_geometry_count
    ),
    'reduction_geometry_count': (
        len(segment_info) - resulting_geometry_count
    ),
    'maximum_group_size': maximum_group_size,
    'invalid_group_count': len(invalid_groups),
    'group_size_distribution': {
        str(size): count
        for size, count in sorted(
            groups_by_size.items()
        )
    },
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'groups': strict_groups,
            'invalid_groups': invalid_groups,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Strenge Zusammenführungsgruppen erzeugt')
print(
    'Geometrien vor Zusammenführung:',
    summary['original_geometry_count']
)
print(
    'Strenge Gruppen insgesamt:',
    summary['strict_group_count']
)
print(
    'Davon echte Zusammenführungsgruppen:',
    summary['merge_group_count']
)
print(
    'Davon Einzelvarianten:',
    summary['single_group_count']
)
print(
    'Geometrien in Zusammenführungsgruppen:',
    summary['geometries_in_merge_groups']
)
print(
    'Geometrien nach strenger Zusammenführung:',
    summary['resulting_geometry_count']
)
print(
    'Reduktion:',
    summary['reduction_geometry_count']
)
print(
    'Größte strenge Gruppe:',
    summary['maximum_group_size']
)
print(
    'Ungültige Gruppen:',
    summary['invalid_group_count']
)

print()
print('Verteilung der Gruppengrößen:')

for size, count in sorted(groups_by_size.items()):
    print(
        f'  {size} Geometrie(n): '
        f'{count} Gruppen'
    )

print()
print('Erste 15 Zusammenführungsgruppen:')
print()

for number, group in enumerate(
    sorted(
        merge_groups,
        key=lambda row: (
            -row['segment_count'],
            -len(row['lines']),
            row['from_station_name'],
            row['to_station_name'],
        )
    )[:15],
    start=1
):
    print(
        f'{number:02d} | '
        f'{group["from_station_name"]} → '
        f'{group["to_station_name"]} | '
        f'Varianten: {group["segment_count"]} | '
        f'Linien: {", ".join(group["lines"])} | '
        f'Repräsentant: '
        f'{group["representative_segment_id"]}'
    )

print()
print('Bericht:', OUT_FILE)
