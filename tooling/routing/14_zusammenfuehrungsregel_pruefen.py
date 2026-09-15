import json
from collections import defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

SIMILARITY_FILE = (
    REPORT_DIR / 'geometrieaehnlichkeit_analyse.json'
)
SEGMENT_FILE = (
    BASE / 'segmente_normalisiert_routed.geojson'
)
OUT_FILE = (
    REPORT_DIR / 'zusammenfuehrungsregel_pruefung.json'
)

P95_LIMIT = 5.0
MAX_LIMIT = 20.0
LENGTH_LIMIT = 3.0
START_LIMIT = 20.0
END_LIMIT = 20.0

with open(SIMILARITY_FILE, encoding='utf-8') as f:
    analysis = json.load(f)

with open(SEGMENT_FILE, encoding='utf-8') as f:
    segment_collection = json.load(f)

segment_info = {}

for feature in segment_collection.get('features', []):
    props = feature.get('properties', {})
    segment_id = props.get('grouped_segment_id', '')

    segment_info[segment_id] = {
        'segment_id': segment_id,
        'from_station_id': props.get('from_station_id', ''),
        'from_station_name': props.get('from_station_name', ''),
        'to_station_id': props.get('to_station_id', ''),
        'to_station_name': props.get('to_station_name', ''),
        'lines': props.get('lines', []),
        'occurrence_count': int(
            props.get('occurrence_count', 0)
        ),
    }


def accepted(row):
    return (
        float(row['p95_distance_m']) <= P95_LIMIT
        and float(row['maximum_distance_m']) <= MAX_LIMIT
        and float(
            row['length_difference_percent']
        ) <= LENGTH_LIMIT
        and float(row['start_distance_m']) <= START_LIMIT
        and float(row['end_distance_m']) <= END_LIMIT
    )


accepted_pairs = [
    row
    for row in analysis.get('comparisons', [])
    if accepted(row)
]

rejected_pairs = [
    row
    for row in analysis.get('comparisons', [])
    if not accepted(row)
]

# Ähnlichkeitsgraph je gerichtetem Stationspaar
graphs = defaultdict(lambda: defaultdict(set))

for row in accepted_pairs:
    station_pair = (
        row['from_station_id'],
        row['to_station_id'],
    )

    first = row['first_segment_id']
    second = row['second_segment_id']

    graphs[station_pair][first].add(second)
    graphs[station_pair][second].add(first)

# Alle Varianten aufnehmen, auch isolierte
for segment_id, info in segment_info.items():
    station_pair = (
        info['from_station_id'],
        info['to_station_id'],
    )

    graphs[station_pair][segment_id]

components = []

for station_pair, graph in graphs.items():
    visited = set()

    for start in graph:
        if start in visited:
            continue

        stack = [start]
        component = []

        while stack:
            current = stack.pop()

            if current in visited:
                continue

            visited.add(current)
            component.append(current)

            stack.extend(
                graph[current] - visited
            )

        components.append({
            'from_station_id': station_pair[0],
            'to_station_id': station_pair[1],
            'segment_ids': sorted(component),
        })

# Prüfen, ob innerhalb einer transitiv gebildeten Gruppe
# jedes Paar die Regel direkt erfüllt.
accepted_lookup = {
    frozenset({
        row['first_segment_id'],
        row['second_segment_id'],
    })
    for row in accepted_pairs
}

non_clique_components = []

for component in components:
    ids = component['segment_ids']

    if len(ids) < 3:
        continue

    missing_direct_pairs = []

    for index, first in enumerate(ids):
        for second in ids[index + 1:]:
            key = frozenset({first, second})

            if key not in accepted_lookup:
                missing_direct_pairs.append([
                    first,
                    second,
                ])

    if missing_direct_pairs:
        first_info = segment_info[ids[0]]

        non_clique_components.append({
            'from_station_id': component[
                'from_station_id'
            ],
            'from_station_name': first_info[
                'from_station_name'
            ],
            'to_station_id': component[
                'to_station_id'
            ],
            'to_station_name': first_info[
                'to_station_name'
            ],
            'segment_ids': ids,
            'lines': sorted({
                line
                for segment_id in ids
                for line in segment_info[
                    segment_id
                ]['lines']
            }),
            'missing_direct_pair_count': len(
                missing_direct_pairs
            ),
            'missing_direct_pairs': (
                missing_direct_pairs
            ),
        })

merge_components = [
    component
    for component in components
    if len(component['segment_ids']) > 1
]

merged_segment_count = sum(
    len(component['segment_ids'])
    for component in merge_components
)

resulting_geometry_count = (
    len(segment_info)
    - merged_segment_count
    + len(merge_components)
)

accepted_different_line_pairs = [
    row
    for row in accepted_pairs
    if set(row.get('first_lines', []))
    != set(row.get('second_lines', []))
]

summary = {
    'rule': {
        'p95_distance_m_max': P95_LIMIT,
        'maximum_distance_m_max': MAX_LIMIT,
        'length_difference_percent_max': LENGTH_LIMIT,
        'start_distance_m_max': START_LIMIT,
        'end_distance_m_max': END_LIMIT,
    },
    'geometry_comparisons_total': len(
        analysis.get('comparisons', [])
    ),
    'accepted_geometry_pairs': len(accepted_pairs),
    'accepted_pairs_with_different_line_sets': len(
        accepted_different_line_pairs
    ),
    'rejected_geometry_pairs': len(rejected_pairs),
    'merge_component_count': len(merge_components),
    'geometries_in_merge_components': (
        merged_segment_count
    ),
    'maximum_merge_component_size': max(
        (
            len(component['segment_ids'])
            for component in merge_components
        ),
        default=1,
    ),
    'non_clique_component_count': len(
        non_clique_components
    ),
    'original_grouped_geometry_count': len(
        segment_info
    ),
    'resulting_geometry_count_if_merged': (
        resulting_geometry_count
    ),
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'accepted_pairs': accepted_pairs,
            'merge_components': merge_components,
            'non_clique_components': (
                non_clique_components
            ),
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Prüfung der Zusammenführungsregel abgeschlossen')
print(
    'Geometrievergleiche insgesamt:',
    summary['geometry_comparisons_total']
)
print(
    'Akzeptierte Geometriepaare:',
    summary['accepted_geometry_pairs']
)
print(
    'Davon unterschiedliche Linienmengen:',
    summary[
        'accepted_pairs_with_different_line_sets'
    ]
)
print(
    'Abgelehnte Geometriepaare:',
    summary['rejected_geometry_pairs']
)
print(
    'Zusammenführungsgruppen:',
    summary['merge_component_count']
)
print(
    'Geometrien in Zusammenführungsgruppen:',
    summary['geometries_in_merge_components']
)
print(
    'Größte Zusammenführungsgruppe:',
    summary['maximum_merge_component_size']
)
print(
    'Transitive, nicht vollständig ähnliche Gruppen:',
    summary['non_clique_component_count']
)
print(
    'Geometrien vor Zusammenführung:',
    summary['original_grouped_geometry_count']
)
print(
    'Geometrien nach rechnerischer Zusammenführung:',
    summary['resulting_geometry_count_if_merged']
)

if non_clique_components:
    print()
    print('Erste problematische transitive Gruppen:')

    for number, row in enumerate(
        non_clique_components[:10],
        start=1
    ):
        print(
            f'{number:02d} | '
            f'{row["from_station_name"]} → '
            f'{row["to_station_name"]} | '
            f'Linien: {", ".join(row["lines"])} | '
            f'Varianten: {len(row["segment_ids"])} | '
            f'nicht direkt ähnliche Paare: '
            f'{row["missing_direct_pair_count"]}'
        )

print('Bericht:', OUT_FILE)
