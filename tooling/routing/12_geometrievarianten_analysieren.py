import json
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

INPUT_FILE = BASE / 'segmente_normalisiert_routed.geojson'
OUT_FILE = REPORT_DIR / 'geometrievarianten_analyse.json'

with open(INPUT_FILE, encoding='utf-8') as f:
    collection = json.load(f)

pairs = defaultdict(list)

for feature in collection.get('features', []):
    props = feature.get('properties', {})

    key = (
        props.get('from_station_id', ''),
        props.get('to_station_id', ''),
    )

    pairs[key].append({
        'grouped_segment_id': props.get(
            'grouped_segment_id',
            ''
        ),
        'from_station_name': props.get(
            'from_station_name',
            ''
        ),
        'to_station_name': props.get(
            'to_station_name',
            ''
        ),
        'geometry_hash': props.get(
            'geometry_hash',
            ''
        ),
        'lines': props.get('lines', []),
        'line_count': int(
            props.get('line_count', 0)
        ),
        'pattern_count': int(
            props.get('pattern_count', 0)
        ),
        'occurrence_count': int(
            props.get('occurrence_count', 0)
        ),
        'distance_m_min': float(
            props.get('distance_m_min', 0)
        ),
        'distance_m_max': float(
            props.get('distance_m_max', 0)
        ),
        'coordinate_count': len(
            feature.get(
                'geometry',
                {}
            ).get('coordinates', [])
        ),
    })

variant_distribution = Counter()

multi_line_pair_count = 0
multi_line_pair_one_geometry = 0
multi_line_pair_multiple_geometries = 0

multiple_geometries_with_shared_variant = 0
multiple_geometries_without_shared_variant = 0

split_pairs = []

for pair, variants in pairs.items():
    variant_count = len(variants)
    variant_distribution[variant_count] += 1

    all_lines = sorted({
        line
        for variant in variants
        for line in variant['lines']
    })

    if len(all_lines) <= 1:
        continue

    multi_line_pair_count += 1

    if variant_count == 1:
        multi_line_pair_one_geometry += 1
        continue

    multi_line_pair_multiple_geometries += 1

    shared_variants = [
        variant
        for variant in variants
        if len(variant['lines']) > 1
    ]

    if shared_variants:
        multiple_geometries_with_shared_variant += 1
    else:
        multiple_geometries_without_shared_variant += 1

    split_pairs.append({
        'from_station_id': pair[0],
        'from_station_name': variants[0][
            'from_station_name'
        ],
        'to_station_id': pair[1],
        'to_station_name': variants[0][
            'to_station_name'
        ],
        'all_lines': all_lines,
        'line_count': len(all_lines),
        'geometry_variant_count': variant_count,
        'shared_geometry_variant_count': len(
            shared_variants
        ),
        'variants': sorted(
            variants,
            key=lambda row: (
                -row['line_count'],
                -row['occurrence_count'],
                row['grouped_segment_id'],
            )
        ),
    })

split_pairs.sort(
    key=lambda row: (
        row['shared_geometry_variant_count'] > 0,
        -row['geometry_variant_count'],
        -row['line_count'],
        row['from_station_name'],
        row['to_station_name'],
    )
)

summary = {
    'station_pair_count': len(pairs),
    'multi_line_station_pair_count': (
        multi_line_pair_count
    ),
    'multi_line_pairs_with_one_geometry': (
        multi_line_pair_one_geometry
    ),
    'multi_line_pairs_with_multiple_geometries': (
        multi_line_pair_multiple_geometries
    ),
    'multiple_geometry_pairs_with_shared_variant': (
        multiple_geometries_with_shared_variant
    ),
    'multiple_geometry_pairs_without_shared_variant': (
        multiple_geometries_without_shared_variant
    ),
    'geometry_variant_distribution': {
        str(count): pair_count
        for count, pair_count
        in sorted(variant_distribution.items())
    },
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'split_pairs': split_pairs,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Analyse der Geometrievarianten abgeschlossen')
print('Stationspaare insgesamt:', len(pairs))
print(
    'Stationspaare mit mehreren Linien:',
    multi_line_pair_count
)
print(
    'Mehrlinienpaare mit genau einer Geometrie:',
    multi_line_pair_one_geometry
)
print(
    'Mehrlinienpaare mit mehreren Geometrien:',
    multi_line_pair_multiple_geometries
)
print(
    'Davon mit mindestens einer gemeinsam '
    'genutzten Geometrie:',
    multiple_geometries_with_shared_variant
)
print(
    'Davon ohne gemeinsam genutzte Geometrie:',
    multiple_geometries_without_shared_variant
)

print()
print('Verteilung der Geometrievarianten:')

for variant_count, pair_count in sorted(
    variant_distribution.items()
):
    print(
        f'  {variant_count} Variante(n): '
        f'{pair_count} Stationspaare'
    )

print()
print(
    'Erste 20 Mehrlinienpaare mit '
    'getrennten Geometrien:'
)
print()

for number, row in enumerate(
    split_pairs[:20],
    start=1
):
    print(
        f'{number:02d} | '
        f'{row["from_station_name"]} → '
        f'{row["to_station_name"]} | '
        f'Linien: {", ".join(row["all_lines"])} | '
        f'Varianten: '
        f'{row["geometry_variant_count"]} | '
        f'gemeinsame Varianten: '
        f'{row["shared_geometry_variant_count"]}'
    )

    for variant in row['variants']:
        print(
            '     - '
            f'{variant["grouped_segment_id"]} | '
            f'Linien: {", ".join(variant["lines"])} | '
            f'Vorkommen: '
            f'{variant["occurrence_count"]} | '
            f'Distanz: '
            f'{variant["distance_m_min"]:.1f}'
            f'–{variant["distance_m_max"]:.1f} m'
        )

print()
print('Bericht:', OUT_FILE)
