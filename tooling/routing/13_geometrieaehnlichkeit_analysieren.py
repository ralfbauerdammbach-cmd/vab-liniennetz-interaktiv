import json
import math
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

INPUT_FILE = BASE / 'segmente_normalisiert_routed.geojson'
OUT_FILE = REPORT_DIR / 'geometrieaehnlichkeit_analyse.json'


def project_coordinates(coordinates, reference_lat):
    """
    Einfache lokale Projektion in Meter.
    Für die hier betrachteten Linienabschnitte ausreichend.
    """
    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = (
        111_320.0 * math.cos(math.radians(reference_lat))
    )

    return [
        (
            lon * meters_per_degree_lon,
            lat * meters_per_degree_lat,
        )
        for lon, lat in coordinates
    ]


def point_segment_distance(point, start, end):
    px, py = point
    ax, ay = start
    bx, by = end

    dx = bx - ax
    dy = by - ay

    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)

    factor = (
        ((px - ax) * dx + (py - ay) * dy)
        / (dx * dx + dy * dy)
    )

    factor = max(0.0, min(1.0, factor))

    nearest_x = ax + factor * dx
    nearest_y = ay + factor * dy

    return math.hypot(
        px - nearest_x,
        py - nearest_y,
    )


def point_polyline_distance(point, polyline):
    return min(
        point_segment_distance(point, start, end)
        for start, end in zip(polyline, polyline[1:])
    )


def sample_coordinates(coordinates, maximum=160):
    if len(coordinates) <= maximum:
        return coordinates

    indices = {
        round(
            index * (len(coordinates) - 1)
            / (maximum - 1)
        )
        for index in range(maximum)
    }

    return [
        coordinates[index]
        for index in sorted(indices)
    ]


def percentile(values, percent):
    if not values:
        return 0.0

    ordered = sorted(values)

    position = (
        (len(ordered) - 1)
        * percent
        / 100
    )

    lower = math.floor(position)
    upper = math.ceil(position)

    if lower == upper:
        return ordered[lower]

    fraction = position - lower

    return (
        ordered[lower] * (1 - fraction)
        + ordered[upper] * fraction
    )


def polyline_length(coordinates):
    return sum(
        math.hypot(
            end[0] - start[0],
            end[1] - start[1],
        )
        for start, end in zip(
            coordinates,
            coordinates[1:]
        )
    )


def compare_geometries(first, second):
    all_latitudes = [
        coordinate[1]
        for coordinate in first + second
    ]

    reference_lat = (
        sum(all_latitudes) / len(all_latitudes)
    )

    first_projected = project_coordinates(
        first,
        reference_lat
    )
    second_projected = project_coordinates(
        second,
        reference_lat
    )

    first_sample = sample_coordinates(
        first_projected
    )
    second_sample = sample_coordinates(
        second_projected
    )

    distances = []

    distances.extend(
        point_polyline_distance(
            point,
            second_projected
        )
        for point in first_sample
    )

    distances.extend(
        point_polyline_distance(
            point,
            first_projected
        )
        for point in second_sample
    )

    first_length = polyline_length(
        first_projected
    )
    second_length = polyline_length(
        second_projected
    )

    maximum_length = max(
        first_length,
        second_length,
        0.0001
    )

    length_difference_percent = (
        abs(first_length - second_length)
        / maximum_length
        * 100
    )

    start_distance = math.hypot(
        first_projected[0][0]
        - second_projected[0][0],
        first_projected[0][1]
        - second_projected[0][1],
    )

    end_distance = math.hypot(
        first_projected[-1][0]
        - second_projected[-1][0],
        first_projected[-1][1]
        - second_projected[-1][1],
    )

    return {
        'median_distance_m': percentile(
            distances,
            50
        ),
        'p95_distance_m': percentile(
            distances,
            95
        ),
        'maximum_distance_m': max(
            distances,
            default=0
        ),
        'length_difference_percent': (
            length_difference_percent
        ),
        'start_distance_m': start_distance,
        'end_distance_m': end_distance,
    }


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
        'lines': props.get('lines', []),
        'occurrence_count': props.get(
            'occurrence_count',
            0
        ),
        'coordinates': feature.get(
            'geometry',
            {}
        ).get('coordinates', []),
    })

comparisons = []

for pair, variants in pairs.items():
    all_lines = {
        line
        for variant in variants
        for line in variant['lines']
    }

    if len(variants) < 2 or len(all_lines) < 2:
        continue

    for first, second in combinations(variants, 2):
        # Varianten derselben Linie werden ebenfalls betrachtet,
        # aber separat gekennzeichnet.
        metrics = compare_geometries(
            first['coordinates'],
            second['coordinates']
        )

        comparisons.append({
            'from_station_id': pair[0],
            'from_station_name': first[
                'from_station_name'
            ],
            'to_station_id': pair[1],
            'to_station_name': first[
                'to_station_name'
            ],
            'first_segment_id': first[
                'grouped_segment_id'
            ],
            'second_segment_id': second[
                'grouped_segment_id'
            ],
            'first_lines': first['lines'],
            'second_lines': second['lines'],
            'different_line_sets': (
                set(first['lines'])
                != set(second['lines'])
            ),
            **{
                key: round(value, 3)
                for key, value in metrics.items()
            },
        })

thresholds = [
    (5, 3),
    (10, 5),
    (20, 10),
    (30, 15),
    (50, 20),
]

threshold_counts = {}

for distance_limit, length_limit in thresholds:
    label = (
        f'p95_bis_{distance_limit}m_'
        f'laenge_bis_{length_limit}prozent'
    )

    threshold_counts[label] = sum(
        1
        for row in comparisons
        if row['p95_distance_m'] <= distance_limit
        and row[
            'length_difference_percent'
        ] <= length_limit
    )

p95_distribution = Counter()

for row in comparisons:
    value = row['p95_distance_m']

    if value <= 2:
        category = 'bis 2 m'
    elif value <= 5:
        category = 'über 2 bis 5 m'
    elif value <= 10:
        category = 'über 5 bis 10 m'
    elif value <= 20:
        category = 'über 10 bis 20 m'
    elif value <= 30:
        category = 'über 20 bis 30 m'
    elif value <= 50:
        category = 'über 30 bis 50 m'
    elif value <= 100:
        category = 'über 50 bis 100 m'
    else:
        category = 'über 100 m'

    p95_distribution[category] += 1

closest = sorted(
    comparisons,
    key=lambda row: (
        row['p95_distance_m'],
        row['length_difference_percent'],
    )
)

most_different = sorted(
    comparisons,
    key=lambda row: (
        -row['p95_distance_m'],
        -row['length_difference_percent'],
    )
)

summary = {
    'station_pairs_with_comparisons': len({
        (
            row['from_station_id'],
            row['to_station_id'],
        )
        for row in comparisons
    }),
    'geometry_pair_comparisons': len(comparisons),
    'threshold_counts': threshold_counts,
    'p95_distance_distribution': dict(
        p95_distribution
    ),
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(
        {
            'summary': summary,
            'comparisons': comparisons,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

print('Analyse der Geometrieähnlichkeit abgeschlossen')
print(
    'Stationspaare untersucht:',
    summary['station_pairs_with_comparisons']
)
print(
    'Geometrievergleiche:',
    summary['geometry_pair_comparisons']
)

print()
print('Verteilung der räumlichen Abweichung P95:')

order = [
    'bis 2 m',
    'über 2 bis 5 m',
    'über 5 bis 10 m',
    'über 10 bis 20 m',
    'über 20 bis 30 m',
    'über 30 bis 50 m',
    'über 50 bis 100 m',
    'über 100 m',
]

for category in order:
    print(
        f'  {category}: '
        f'{p95_distribution.get(category, 0)}'
    )

print()
print('Kombinierte Schwellenwerte:')

for label, count in threshold_counts.items():
    print(f'  {label}: {count}')

print()
print('20 ähnlichste Varianten unterschiedlicher Linien:')
print()

shown = 0

for row in closest:
    if not row['different_line_sets']:
        continue

    shown += 1

    print(
        f'{shown:02d} | '
        f'{row["from_station_name"]} → '
        f'{row["to_station_name"]} | '
        f'Linien '
        f'{", ".join(row["first_lines"])} / '
        f'{", ".join(row["second_lines"])} | '
        f'P95 {row["p95_distance_m"]:.2f} m | '
        f'Max {row["maximum_distance_m"]:.2f} m | '
        f'Längendifferenz '
        f'{row["length_difference_percent"]:.2f} %'
    )

    if shown >= 20:
        break

print()
print('10 deutlich unterschiedliche Varianten:')
print()

for number, row in enumerate(
    most_different[:10],
    start=1
):
    print(
        f'{number:02d} | '
        f'{row["from_station_name"]} → '
        f'{row["to_station_name"]} | '
        f'Linien '
        f'{", ".join(row["first_lines"])} / '
        f'{", ".join(row["second_lines"])} | '
        f'P95 {row["p95_distance_m"]:.2f} m | '
        f'Max {row["maximum_distance_m"]:.2f} m | '
        f'Längendifferenz '
        f'{row["length_difference_percent"]:.2f} %'
    )

print()
print('Bericht:', OUT_FILE)
