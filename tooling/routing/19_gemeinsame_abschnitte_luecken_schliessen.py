import json
from pathlib import Path

BASE = Path.home() / 'vab-routing' / 'gesamtlauf'
REPORT_DIR = BASE / 'pruefung'

SECTION_FILE = BASE / 'gemeinsame_linienabschnitte.geojson'
SEGMENT_FILE = BASE / 'segmente_interaktiv_routed.geojson'

OUT_GEOJSON = (
    BASE / 'gemeinsame_linienabschnitte_final.geojson'
)
OUT_SUMMARY = (
    REPORT_DIR
    / 'gemeinsame_linienabschnitte_final_summary.json'
)

MAX_GAP_M = 20.0


def haversine_m(first, second):
    import math

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


output_features = []
corrected_connections = []
uncorrected_connections = []
missing_segments = []


for feature in sections.get('features', []):
    props = feature.get('properties', {})
    segment_ids = props.get('segment_ids', [])

    combined = []

    for position, segment_id in enumerate(
        segment_ids,
        start=1
    ):
        segment = segments_by_id.get(segment_id)

        if segment is None:
            missing_segments.append(segment_id)
            continue

        part = [
            list(coordinate)
            for coordinate in segment.get(
                'geometry',
                {}
            ).get('coordinates', [])
        ]

        if not part:
            continue

        if not combined:
            combined.extend(part)
            continue

        gap = haversine_m(
            combined[-1],
            part[0]
        )

        if gap == 0:
            combined.extend(part[1:])
        elif gap <= MAX_GAP_M:
            original_start = list(part[0])
            part[0] = list(combined[-1])

            corrected_connections.append({
                'shared_section_id': props.get(
                    'shared_section_id',
                    ''
                ),
                'segment_position': position,
                'segment_id': segment_id,
                'gap_m': round(gap, 3),
                'station_name': segment.get(
                    'properties',
                    {}
                ).get('from_station_name', ''),
                'original_start': original_start,
                'corrected_start': list(combined[-1]),
            })

            combined.extend(part[1:])
        else:
            uncorrected_connections.append({
                'shared_section_id': props.get(
                    'shared_section_id',
                    ''
                ),
                'segment_position': position,
                'segment_id': segment_id,
                'gap_m': round(gap, 3),
            })

            combined.extend(part)

    new_feature = {
        'type': 'Feature',
        'properties': {
            **props,
            'continuity_corrected': any(
                row['shared_section_id']
                == props.get('shared_section_id', '')
                for row in corrected_connections
            ),
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': combined,
        },
    }

    output_features.append(new_feature)


collection = {
    'type': 'FeatureCollection',
    'features': output_features,
}

with open(OUT_GEOJSON, 'w', encoding='utf-8') as f:
    json.dump(
        collection,
        f,
        ensure_ascii=False,
        separators=(',', ':'),
    )


summary = {
    'shared_section_count': len(output_features),
    'corrected_connection_count': len(
        corrected_connections
    ),
    'uncorrected_connection_count': len(
        uncorrected_connections
    ),
    'missing_segment_count': len(
        set(missing_segments)
    ),
    'maximum_corrected_gap_m': max(
        (
            row['gap_m']
            for row in corrected_connections
        ),
        default=0,
    ),
    'output_geojson': str(OUT_GEOJSON),
    'corrected_connections': corrected_connections,
    'uncorrected_connections': (
        uncorrected_connections
    ),
    'missing_segments': sorted(
        set(missing_segments)
    ),
}

with open(OUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(
        summary,
        f,
        ensure_ascii=False,
        indent=2,
    )


print('Gemeinsame Linienabschnitte korrigiert')
print(
    'Gemeinsame Abschnitte:',
    summary['shared_section_count']
)
print(
    'Korrigierte Übergänge:',
    summary['corrected_connection_count']
)
print(
    'Nicht korrigierte Übergänge:',
    summary['uncorrected_connection_count']
)
print(
    'Fehlende Segmente:',
    summary['missing_segment_count']
)
print(
    'Maximal korrigierte Lücke:',
    summary['maximum_corrected_gap_m'],
    'm'
)
print('Finales GeoJSON:', OUT_GEOJSON)
print('Zusammenfassung:', OUT_SUMMARY)
